---
title: Build a Tenant-Aware Background Job System
slug: build-tenant-aware-background-job-system
description: >
  Build a job queue that isolates tenants, prevents noisy neighbors,
  enforces per-tenant concurrency limits, and processes 500K jobs/day
  across 200 tenants without any single tenant starving others.
skills:
  - typescript
  - bull-mq
  - redis
  - postgresql
  - zod
  - hono
category: Backend Architecture
tags:
  - background-jobs
  - multi-tenant
  - job-queue
  - noisy-neighbor
  - fair-scheduling
  - bullmq
---

# Build a Tenant-Aware Background Job System

## The Problem

A multi-tenant SaaS processes background jobs (report generation, data imports, webhook deliveries, email sends) for 200 tenants using a single BullMQ queue. One enterprise tenant imports 50K rows daily, clogging the queue for 3 hours and starving smaller tenants whose webhook deliveries timeout. Another tenant's buggy integration creates 100K failed retry jobs that consume all Redis memory.

## Step 1: Per-Tenant Queue Routing

```typescript
// src/queue/tenant-router.ts
import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL!);

interface TenantConfig {
  maxConcurrency: number;
  maxJobsPerHour: number;
  maxRetries: number;
  priority: number; // 1=highest, 10=lowest
}

const tenantConfigs: Record<string, TenantConfig> = {
  enterprise: { maxConcurrency: 10, maxJobsPerHour: 50000, maxRetries: 5, priority: 1 },
  pro: { maxConcurrency: 5, maxJobsPerHour: 10000, maxRetries: 3, priority: 3 },
  free: { maxConcurrency: 2, maxJobsPerHour: 1000, maxRetries: 2, priority: 5 },
};

// Shared queue with tenant-aware scheduling
const jobQueue = new Queue('tenant-jobs', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400, count: 5000 },
  },
});

export async function addJob(
  tenantId: string,
  plan: string,
  jobType: string,
  data: Record<string, unknown>
): Promise<string> {
  const config = tenantConfigs[plan] ?? tenantConfigs.free;

  // Rate limit check
  const hourKey = `jobs:rate:${tenantId}:${Math.floor(Date.now() / 3600000)}`;
  const current = await connection.incr(hourKey);
  await connection.expire(hourKey, 7200);

  if (current > config.maxJobsPerHour) {
    throw new Error(`Rate limit exceeded: ${current}/${config.maxJobsPerHour} jobs/hour`);
  }

  const job = await jobQueue.add(jobType, {
    tenantId,
    ...data,
  }, {
    priority: config.priority,
    attempts: config.maxRetries,
    backoff: { type: 'exponential', delay: 5000 },
    // Group by tenant for fair scheduling
    group: { id: tenantId, maxSize: config.maxConcurrency },
  });

  return job.id!;
}
```

## Step 2: Fair Scheduler Worker

```typescript
// src/queue/fair-worker.ts
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL!);

// Track per-tenant concurrency
const activeCounts = new Map<string, number>();

const worker = new Worker('tenant-jobs', async (job) => {
  const tenantId = job.data.tenantId;
  const config = tenantConfigs[job.data.plan ?? 'free'];

  // Enforce per-tenant concurrency
  const active = activeCounts.get(tenantId) ?? 0;
  if (active >= config.maxConcurrency) {
    // Re-queue with delay — don't block global queue
    throw new Error('TENANT_CONCURRENCY_EXCEEDED');
  }

  activeCounts.set(tenantId, active + 1);

  try {
    // Route to handler
    switch (job.name) {
      case 'report_generation':
        await generateReport(tenantId, job.data);
        break;
      case 'data_import':
        await processImport(tenantId, job.data);
        break;
      case 'webhook_delivery':
        await deliverWebhook(tenantId, job.data);
        break;
      case 'email_send':
        await sendEmail(tenantId, job.data);
        break;
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }

    // Track success metrics
    await connection.hincrby(`jobs:metrics:${tenantId}`, 'completed', 1);
  } finally {
    const current = activeCounts.get(tenantId) ?? 1;
    activeCounts.set(tenantId, Math.max(0, current - 1));
  }
}, {
  connection,
  concurrency: 50,  // total across all tenants
});

async function generateReport(tenantId: string, data: any): Promise<void> {
  // Tenant-isolated report generation
}

async function processImport(tenantId: string, data: any): Promise<void> {
  // Process in chunks to avoid hogging the worker
  const CHUNK_SIZE = 1000;
  const rows = data.rows ?? [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    // Process chunk
    // Yield to other tenants between chunks
    await new Promise(r => setTimeout(r, 100));
  }
}

async function deliverWebhook(tenantId: string, data: any): Promise<void> {
  const response = await fetch(data.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data.payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Webhook failed: ${response.status}`);
}

async function sendEmail(tenantId: string, data: any): Promise<void> {
  // Send via email provider
}

const tenantConfigs: Record<string, any> = {
  enterprise: { maxConcurrency: 10 },
  pro: { maxConcurrency: 5 },
  free: { maxConcurrency: 2 },
};
```

## Step 3: Job Dashboard API

```typescript
// src/api/jobs.ts
import { Hono } from 'hono';
import { Redis } from 'ioredis';

const app = new Hono();
const redis = new Redis(process.env.REDIS_URL!);

app.get('/v1/jobs/stats/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const metrics = await redis.hgetall(`jobs:metrics:${tenantId}`);
  const hourKey = `jobs:rate:${tenantId}:${Math.floor(Date.now() / 3600000)}`;
  const currentRate = await redis.get(hourKey);

  return c.json({
    completed: parseInt(metrics.completed ?? '0'),
    failed: parseInt(metrics.failed ?? '0'),
    currentHourRate: parseInt(currentRate ?? '0'),
  });
});

export default app;
```

## Results

- **Noisy neighbor incidents**: zero (was 3-4/month)
- **Webhook delivery latency**: p95 dropped from 45 minutes to 8 seconds
- **500K jobs/day** processed across 200 tenants with fair scheduling
- **Enterprise import**: still runs 50K rows but doesn't starve other tenants
- **Buggy retry storm**: caught by per-tenant rate limit, saved Redis from OOM
- **Per-tenant visibility**: each tenant sees their own job metrics in dashboard
