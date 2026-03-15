---
title: Build a Background Job Monitoring Dashboard
slug: build-background-job-monitoring-dashboard
description: Build a dashboard for monitoring background job queues — real-time status, failure rates, retry management, job inspection, and alerting for stuck or failing jobs.
skills:
  - typescript
  - redis
  - hono
  - nextjs
  - tailwindcss
category: development
tags:
  - job-queue
  - monitoring
  - dashboard
  - bullmq
  - observability
---

# Build a Background Job Monitoring Dashboard

## The Problem

Kai runs infrastructure at a 30-person e-commerce company. Background jobs handle critical work: sending emails, processing payments, generating invoices, syncing inventory. When jobs fail, nobody knows until a customer complains. The Redis-based queue has 3,000 stuck jobs from a deployment gone wrong, but there's no way to see them without running CLI commands. They need a dashboard showing queue health, failed job details, retry controls, and alerts when failure rates spike.

## Step 1: Build the Queue Monitoring Service

```typescript
// src/jobs/monitor.ts — Queue monitoring with metrics and alerting
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  throughput: number;       // jobs/minute
  avgDurationMs: number;
  failureRate: number;      // percentage
  oldestWaitingAge: number; // seconds
}

interface FailedJob {
  id: string;
  name: string;
  data: Record<string, any>;
  error: string;
  stacktrace: string[];
  attemptsMade: number;
  maxAttempts: number;
  failedAt: number;
  queue: string;
}

const QUEUES = ["email", "payment", "invoice", "inventory", "analytics"];
const queueInstances = new Map<string, Queue>();

// Initialize queue connections
for (const name of QUEUES) {
  queueInstances.set(name, new Queue(name, { connection: { host: process.env.REDIS_HOST, port: 6379 } }));
}

// Get stats for all queues
export async function getAllQueueStats(): Promise<QueueStats[]> {
  const stats: QueueStats[] = [];

  for (const [name, queue] of queueInstances) {
    const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    const isPaused = await queue.isPaused();

    // Calculate throughput (completed jobs in last 5 minutes)
    const completedRecent = parseInt(await redis.get(`queue:${name}:completed:5min`) || "0");
    const failedRecent = parseInt(await redis.get(`queue:${name}:failed:5min`) || "0");
    const totalRecent = completedRecent + failedRecent;

    // Get oldest waiting job age
    const waiting = await queue.getWaiting(0, 0);
    const oldestAge = waiting.length > 0 ? (Date.now() - waiting[0].timestamp) / 1000 : 0;

    // Average duration from recent completed jobs
    const avgDuration = parseFloat(await redis.get(`queue:${name}:avg_duration`) || "0");

    stats.push({
      name,
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      paused: isPaused,
      throughput: Math.round(completedRecent / 5),
      avgDurationMs: Math.round(avgDuration),
      failureRate: totalRecent > 0 ? Math.round((failedRecent / totalRecent) * 100) : 0,
      oldestWaitingAge: Math.round(oldestAge),
    });
  }

  return stats;
}

// Get failed jobs with details
export async function getFailedJobs(queueName: string, page: number = 0, pageSize: number = 20): Promise<{
  jobs: FailedJob[];
  total: number;
}> {
  const queue = queueInstances.get(queueName);
  if (!queue) throw new Error(`Unknown queue: ${queueName}`);

  const start = page * pageSize;
  const failed = await queue.getFailed(start, start + pageSize - 1);
  const total = await queue.getFailedCount();

  const jobs: FailedJob[] = failed.map((job) => ({
    id: job.id || "",
    name: job.name,
    data: job.data,
    error: job.failedReason || "Unknown error",
    stacktrace: job.stacktrace || [],
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts || 1,
    failedAt: job.finishedOn || job.processedOn || 0,
    queue: queueName,
  }));

  return { jobs, total };
}

// Retry a failed job
export async function retryJob(queueName: string, jobId: string): Promise<void> {
  const queue = queueInstances.get(queueName);
  if (!queue) throw new Error(`Unknown queue: ${queueName}`);

  const job = await queue.getJob(jobId);
  if (!job) throw new Error("Job not found");

  await job.retry();
}

// Retry all failed jobs in a queue
export async function retryAllFailed(queueName: string): Promise<number> {
  const queue = queueInstances.get(queueName);
  if (!queue) throw new Error(`Unknown queue: ${queueName}`);

  const failed = await queue.getFailed(0, 10000);
  let retried = 0;

  for (const job of failed) {
    await job.retry();
    retried++;
  }

  return retried;
}

// Delete a failed job
export async function deleteJob(queueName: string, jobId: string): Promise<void> {
  const queue = queueInstances.get(queueName);
  if (!queue) throw new Error(`Unknown queue: ${queueName}`);

  const job = await queue.getJob(jobId);
  if (job) await job.remove();
}

// Track metrics in real-time using QueueEvents
export function startMetricsTracking(): void {
  for (const [name] of queueInstances) {
    const events = new QueueEvents(name, { connection: { host: process.env.REDIS_HOST, port: 6379 } });

    events.on("completed", async ({ jobId, returnvalue }) => {
      const pipeline = redis.pipeline();
      pipeline.incr(`queue:${name}:completed:5min`);
      pipeline.expire(`queue:${name}:completed:5min`, 300);
      await pipeline.exec();
    });

    events.on("failed", async ({ jobId, failedReason }) => {
      const pipeline = redis.pipeline();
      pipeline.incr(`queue:${name}:failed:5min`);
      pipeline.expire(`queue:${name}:failed:5min`, 300);
      await pipeline.exec();

      // Alert if failure rate is high
      const failed5min = parseInt(await redis.get(`queue:${name}:failed:5min`) || "0");
      if (failed5min > 10) {
        console.error(`[ALERT] Queue ${name}: ${failed5min} failures in 5 minutes`);
      }
    });
  }
}
```

## Results

- **3,000 stuck jobs found and retried in 30 seconds** — dashboard showed all failed jobs grouped by error; "Retry All" cleared the backlog instantly
- **Failure rate alerts catch issues in 2 minutes** — when a deployment broke the invoice generator, the dashboard showed 95% failure rate within 2 minutes; previously took 6 hours via customer complaints
- **Queue saturation visible before impact** — waiting job count and oldest job age show when queues are backing up; the team scales workers before customers notice delays
- **Job inspection eliminates guesswork** — clicking a failed job shows the exact error, stack trace, and input data; debugging time dropped from 30 minutes to 2 minutes
- **Pause/resume for safe maintenance** — pausing a queue before database maintenance prevents job failures; resume after migration completes
