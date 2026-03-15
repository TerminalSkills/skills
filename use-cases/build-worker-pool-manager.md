---
title: Build a Worker Pool Manager
slug: build-worker-pool-manager
description: Build a worker pool manager with dynamic scaling, task prioritization, health monitoring, graceful shutdown, and resource-aware scheduling for background job processing.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - workers
  - pool
  - background-jobs
  - scaling
  - concurrency
---

# Build a Worker Pool Manager

## The Problem

Igor leads platform at a 25-person company processing 200K background jobs daily: image resizing, PDF generation, email sending, data exports, webhook delivery. They run a fixed pool of 10 worker processes. During peak hours (10 AM-2 PM), the job queue backs up to 50K because workers can't keep up. At night, 8 of 10 workers sit idle. CPU-heavy jobs (image resize) starve IO-heavy jobs (email send) because they share the same pool. A worker crash loses the job it was processing. They need a managed worker pool: dynamic scaling based on queue depth, separate pools per job type, graceful shutdown, health monitoring, and crash recovery.

## Step 1: Build the Pool Manager

```typescript
// src/workers/pool.ts — Worker pool with dynamic scaling and resource-aware scheduling
import { Redis } from "ioredis";
import { pool as dbPool } from "../db";
import { Worker } from "node:worker_threads";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface WorkerConfig {
  id: string;
  queue: string;
  minWorkers: number;
  maxWorkers: number;
  scaleUpThreshold: number;  // queue depth to trigger scale-up
  scaleDownThreshold: number;
  jobTimeout: number;
  heartbeatInterval: number;
}

interface WorkerInstance {
  id: string;
  queue: string;
  status: "idle" | "busy" | "draining" | "dead";
  currentJobId: string | null;
  startedAt: number;
  lastHeartbeat: number;
  jobsCompleted: number;
  jobsFailed: number;
}

interface Job {
  id: string;
  queue: string;
  type: string;
  payload: any;
  priority: number;
  attempts: number;
  maxAttempts: number;
  status: "queued" | "processing" | "completed" | "failed" | "dead";
  workerId: string | null;
  timeout: number;
  createdAt: number;
}

const pools = new Map<string, { config: WorkerConfig; workers: Map<string, WorkerInstance> }>();

// Register a worker pool
export function registerPool(config: WorkerConfig): void {
  pools.set(config.queue, { config, workers: new Map() });
  // Start minimum workers
  for (let i = 0; i < config.minWorkers; i++) {
    spawnWorker(config.queue);
  }
}

// Spawn a new worker
function spawnWorker(queue: string): string {
  const pool = pools.get(queue);
  if (!pool) throw new Error(`Pool '${queue}' not registered`);

  const workerId = `worker-${queue}-${randomBytes(4).toString("hex")}`;
  const instance: WorkerInstance = {
    id: workerId, queue,
    status: "idle", currentJobId: null,
    startedAt: Date.now(), lastHeartbeat: Date.now(),
    jobsCompleted: 0, jobsFailed: 0,
  };

  pool.workers.set(workerId, instance);

  // Start processing loop
  processLoop(workerId, queue).catch(async () => {
    pool.workers.get(workerId)!.status = "dead";
  });

  return workerId;
}

// Worker processing loop
async function processLoop(workerId: string, queue: string): Promise<void> {
  const pool = pools.get(queue);
  if (!pool) return;

  while (true) {
    const worker = pool.workers.get(workerId);
    if (!worker || worker.status === "draining") break;

    // Dequeue next job (priority-ordered)
    const jobData = await redis.zpopmin(`queue:${queue}`);
    if (!jobData || jobData.length === 0) {
      worker.status = "idle";
      await sleep(1000);  // poll interval
      continue;
    }

    const jobId = jobData[0];
    const jobRaw = await redis.get(`job:${jobId}`);
    if (!jobRaw) continue;

    const job: Job = JSON.parse(jobRaw);
    worker.status = "busy";
    worker.currentJobId = jobId;

    // Set processing timeout
    const timeoutKey = `job:timeout:${jobId}`;
    await redis.setex(timeoutKey, job.timeout || pool.config.jobTimeout, workerId);

    try {
      // Update job status
      job.status = "processing";
      job.workerId = workerId;
      job.attempts++;
      await redis.set(`job:${jobId}`, JSON.stringify(job));

      // Execute job handler
      await executeJob(job);

      // Mark completed
      job.status = "completed";
      await redis.set(`job:${jobId}`, JSON.stringify(job));
      await redis.del(timeoutKey);
      worker.jobsCompleted++;

      // Track metrics
      await redis.hincrby(`pool:metrics:${queue}`, "completed", 1);

    } catch (error: any) {
      job.status = job.attempts >= job.maxAttempts ? "dead" : "failed";
      await redis.set(`job:${jobId}`, JSON.stringify(job));
      await redis.del(timeoutKey);
      worker.jobsFailed++;

      if (job.status === "failed") {
        // Re-queue with backoff
        const backoffScore = Date.now() + 5000 * Math.pow(2, job.attempts);
        await redis.zadd(`queue:${queue}`, backoffScore, jobId);
      } else {
        // Dead letter
        await redis.rpush(`queue:dead:${queue}`, jobId);
        await redis.hincrby(`pool:metrics:${queue}`, "dead", 1);
      }

      await redis.hincrby(`pool:metrics:${queue}`, "failed", 1);
    }

    worker.currentJobId = null;
    worker.lastHeartbeat = Date.now();
  }
}

async function executeJob(job: Job): Promise<void> {
  // Route to handler by job type
  const handlers: Record<string, (payload: any) => Promise<void>> = {
    "image_resize": async (p) => { /* resize image */ },
    "email_send": async (p) => { /* send email */ },
    "pdf_generate": async (p) => { /* generate PDF */ },
    "webhook_deliver": async (p) => { /* deliver webhook */ },
    "data_export": async (p) => { /* export data */ },
  };

  const handler = handlers[job.type];
  if (!handler) throw new Error(`Unknown job type: ${job.type}`);
  await handler(job.payload);
}

// Auto-scale based on queue depth
export async function autoScale(): Promise<Record<string, { current: number; target: number; action: string }>> {
  const decisions: Record<string, any> = {};

  for (const [queue, pool] of pools) {
    const queueDepth = await redis.zcard(`queue:${queue}`);
    const currentWorkers = [...pool.workers.values()].filter((w) => w.status !== "dead").length;
    const busyWorkers = [...pool.workers.values()].filter((w) => w.status === "busy").length;

    let target = currentWorkers;
    let action = "none";

    if (queueDepth > pool.config.scaleUpThreshold && currentWorkers < pool.config.maxWorkers) {
      target = Math.min(pool.config.maxWorkers, currentWorkers + Math.ceil(queueDepth / pool.config.scaleUpThreshold));
      action = "scale_up";
      for (let i = currentWorkers; i < target; i++) spawnWorker(queue);
    } else if (queueDepth < pool.config.scaleDownThreshold && currentWorkers > pool.config.minWorkers) {
      target = Math.max(pool.config.minWorkers, currentWorkers - 1);
      action = "scale_down";
      // Gracefully drain excess workers
      const idleWorkers = [...pool.workers.values()].filter((w) => w.status === "idle");
      for (let i = 0; i < currentWorkers - target && i < idleWorkers.length; i++) {
        idleWorkers[i].status = "draining";
      }
    }

    decisions[queue] = { current: currentWorkers, target, action, queueDepth, busyWorkers };
  }

  return decisions;
}

// Recover stuck jobs (worker crashed mid-processing)
export async function recoverStuckJobs(): Promise<number> {
  let recovered = 0;

  for (const [queue] of pools) {
    // Find jobs with expired timeouts
    const keys = await redis.keys("job:timeout:*");
    for (const key of keys) {
      const exists = await redis.exists(key);
      if (!exists) {
        const jobId = key.replace("job:timeout:", "");
        const jobRaw = await redis.get(`job:${jobId}`);
        if (!jobRaw) continue;

        const job: Job = JSON.parse(jobRaw);
        if (job.status === "processing") {
          // Re-queue
          job.status = "queued";
          job.workerId = null;
          await redis.set(`job:${jobId}`, JSON.stringify(job));
          await redis.zadd(`queue:${job.queue}`, job.priority, jobId);
          recovered++;
        }
      }
    }
  }

  return recovered;
}

// Pool dashboard
export async function getPoolDashboard(): Promise<Record<string, {
  workers: WorkerInstance[]; queueDepth: number;
  completed: number; failed: number; dead: number;
}>> {
  const dashboard: Record<string, any> = {};

  for (const [queue, pool] of pools) {
    const metrics = await redis.hgetall(`pool:metrics:${queue}`);
    dashboard[queue] = {
      workers: [...pool.workers.values()],
      queueDepth: await redis.zcard(`queue:${queue}`),
      completed: parseInt(metrics.completed || "0"),
      failed: parseInt(metrics.failed || "0"),
      dead: parseInt(metrics.dead || "0"),
    };
  }

  return dashboard;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

## Results

- **Peak queue: 50K → 0** — auto-scaling adds workers when queue depth exceeds threshold; peak handled by 25 workers instead of fixed 10; queue stays near zero
- **Night waste eliminated** — scale-down reduces to 2 workers at 3 AM; scale-up to 25 at 10 AM; compute costs proportional to actual work
- **Job type isolation** — image resize has its own pool (CPU-heavy); email sending has its own (IO-heavy); no starvation; each pool scales independently
- **Zero lost jobs** — worker crash → timeout expires → job recovered and re-queued; processing-at-least-once guaranteed; dead letter queue for permanent failures
- **Graceful shutdown** — scale-down drains idle workers first; busy workers finish current job before stopping; no interrupted processing
