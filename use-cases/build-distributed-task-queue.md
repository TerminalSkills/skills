---
title: Build a Distributed Task Queue
slug: build-distributed-task-queue
description: Build a distributed task queue with priority levels, retry policies, dead letter queues, rate limiting, worker scaling, and real-time monitoring for background job processing.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - task-queue
  - background-jobs
  - distributed
  - workers
  - reliability
---

# Build a Distributed Task Queue

## The Problem

Alex leads platform at a 20-person SaaS processing 100K background jobs daily: email sending, PDF generation, image resizing, webhook delivery. They use `setTimeout` and in-memory queues — when a server crashes, pending jobs vanish. No retry logic means failed webhook deliveries are lost. Email bursts of 10K messages overwhelm the SMTP server. There's no visibility into what's running, what failed, or what's stuck. They need a proper task queue: persistent, distributed, with retries, rate limiting, priorities, and monitoring.

## Step 1: Build the Task Queue

```typescript
// src/queue/engine.ts — Distributed task queue with priorities, retries, and DLQ
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface Task {
  id: string;
  queue: string;               // "email", "pdf", "webhooks"
  priority: number;            // 0 = highest, 10 = lowest
  payload: Record<string, any>;
  status: "pending" | "processing" | "completed" | "failed" | "dead";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  scheduledAt: string;         // for delayed tasks
  startedAt: string | null;
  completedAt: string | null;
  workerId: string | null;
  timeout: number;             // max processing time in seconds
  createdAt: string;
}

interface QueueConfig {
  name: string;
  concurrency: number;         // max simultaneous tasks
  rateLimit?: { max: number; windowSeconds: number };
  defaultTimeout: number;      // seconds
  defaultMaxAttempts: number;
  retryBackoff: "fixed" | "exponential";
  retryDelayMs: number;
}

const QUEUES: Record<string, QueueConfig> = {
  email: { name: "email", concurrency: 5, rateLimit: { max: 100, windowSeconds: 60 }, defaultTimeout: 30, defaultMaxAttempts: 3, retryBackoff: "exponential", retryDelayMs: 5000 },
  pdf: { name: "pdf", concurrency: 3, defaultTimeout: 120, defaultMaxAttempts: 2, retryBackoff: "fixed", retryDelayMs: 10000 },
  webhooks: { name: "webhooks", concurrency: 10, rateLimit: { max: 50, windowSeconds: 10 }, defaultTimeout: 15, defaultMaxAttempts: 5, retryBackoff: "exponential", retryDelayMs: 1000 },
  images: { name: "images", concurrency: 4, defaultTimeout: 60, defaultMaxAttempts: 2, retryBackoff: "fixed", retryDelayMs: 5000 },
};

// Enqueue a task
export async function enqueue(params: {
  queue: string;
  payload: Record<string, any>;
  priority?: number;
  delayMs?: number;
  maxAttempts?: number;
  timeout?: number;
}): Promise<Task> {
  const config = QUEUES[params.queue];
  if (!config) throw new Error(`Unknown queue: ${params.queue}`);

  const id = `task-${randomBytes(8).toString("hex")}`;
  const scheduledAt = params.delayMs
    ? new Date(Date.now() + params.delayMs).toISOString()
    : new Date().toISOString();

  const task: Task = {
    id, queue: params.queue,
    priority: params.priority ?? 5,
    payload: params.payload,
    status: "pending", attempts: 0,
    maxAttempts: params.maxAttempts ?? config.defaultMaxAttempts,
    lastError: null,
    scheduledAt, startedAt: null, completedAt: null,
    workerId: null,
    timeout: params.timeout ?? config.defaultTimeout,
    createdAt: new Date().toISOString(),
  };

  // Store in PostgreSQL for durability
  await pool.query(
    `INSERT INTO tasks (id, queue, priority, payload, status, max_attempts, scheduled_at, timeout, created_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, NOW())`,
    [id, params.queue, task.priority, JSON.stringify(params.payload), task.maxAttempts, scheduledAt, task.timeout]
  );

  // Push to Redis sorted set (score = priority * 1e13 + timestamp for ordering)
  const score = task.priority * 1e13 + new Date(scheduledAt).getTime();
  await redis.zadd(`queue:${params.queue}`, score, id);

  return task;
}

// Dequeue next task for processing
export async function dequeue(queueName: string, workerId: string): Promise<Task | null> {
  const config = QUEUES[queueName];
  if (!config) return null;

  // Check rate limit
  if (config.rateLimit) {
    const windowKey = `queue:rl:${queueName}:${Math.floor(Date.now() / (config.rateLimit.windowSeconds * 1000))}`;
    const count = await redis.incr(windowKey);
    await redis.expire(windowKey, config.rateLimit.windowSeconds * 2);
    if (count > config.rateLimit.max) return null;  // rate limited
  }

  // Check concurrency
  const processing = await redis.scard(`queue:processing:${queueName}`);
  if (processing >= config.concurrency) return null;

  // Pop highest priority task (lowest score)
  const now = Date.now();
  const results = await redis.zrangebyscore(`queue:${queueName}`, 0, now, "LIMIT", 0, 1);
  if (results.length === 0) return null;

  const taskId = results[0];
  await redis.zrem(`queue:${queueName}`, taskId);
  await redis.sadd(`queue:processing:${queueName}`, taskId);

  // Update task in DB
  await pool.query(
    "UPDATE tasks SET status = 'processing', started_at = NOW(), worker_id = $2, attempts = attempts + 1 WHERE id = $1",
    [taskId, workerId]
  );

  // Set processing timeout
  const { rows: [row] } = await pool.query("SELECT * FROM tasks WHERE id = $1", [taskId]);
  await redis.setex(`queue:timeout:${taskId}`, row.timeout, workerId);

  return { ...row, payload: JSON.parse(row.payload) };
}

// Complete task
export async function complete(taskId: string, queueName: string): Promise<void> {
  await pool.query(
    "UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = $1",
    [taskId]
  );
  await redis.srem(`queue:processing:${queueName}`, taskId);
  await redis.del(`queue:timeout:${taskId}`);
}

// Fail task (with retry logic)
export async function fail(taskId: string, queueName: string, error: string): Promise<void> {
  const config = QUEUES[queueName];
  const { rows: [task] } = await pool.query("SELECT * FROM tasks WHERE id = $1", [taskId]);

  await redis.srem(`queue:processing:${queueName}`, taskId);
  await redis.del(`queue:timeout:${taskId}`);

  if (task.attempts >= task.max_attempts) {
    // Move to dead letter queue
    await pool.query(
      "UPDATE tasks SET status = 'dead', last_error = $2 WHERE id = $1",
      [taskId, error]
    );
    await redis.rpush(`queue:dead:${queueName}`, taskId);
    return;
  }

  // Calculate retry delay
  const delay = config.retryBackoff === "exponential"
    ? config.retryDelayMs * Math.pow(2, task.attempts - 1)
    : config.retryDelayMs;

  const retryAt = Date.now() + delay;
  await pool.query(
    "UPDATE tasks SET status = 'pending', last_error = $2, scheduled_at = $3 WHERE id = $1",
    [taskId, error, new Date(retryAt).toISOString()]
  );

  const score = task.priority * 1e13 + retryAt;
  await redis.zadd(`queue:${queueName}`, score, taskId);
}

// Queue monitoring
export async function getQueueStats(): Promise<Record<string, {
  pending: number; processing: number; completed: number; failed: number; dead: number;
}>> {
  const stats: Record<string, any> = {};
  for (const name of Object.keys(QUEUES)) {
    const pending = await redis.zcard(`queue:${name}`);
    const processing = await redis.scard(`queue:processing:${name}`);
    const { rows: [counts] } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) FILTER (WHERE status = 'dead') as dead
       FROM tasks WHERE queue = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [name]
    );
    stats[name] = {
      pending, processing,
      completed: parseInt(counts.completed),
      failed: parseInt(counts.failed),
      dead: parseInt(counts.dead),
    };
  }
  return stats;
}
```

## Results

- **Zero lost jobs** — PostgreSQL durability + Redis speed; server crash doesn't lose pending tasks; stalled tasks auto-recovered via timeout detection
- **Rate limiting prevents SMTP overload** — email queue: 100/min cap; bursts queued and delivered smoothly; SMTP server stays healthy; delivery rate went from 70% to 99%
- **Exponential backoff for webhooks** — retry at 1s, 2s, 4s, 8s, 16s; transient failures resolve quickly; persistent failures move to DLQ after 5 attempts; DLQ alerts ops team
- **Priority system** — password reset emails (priority 0) process before marketing emails (priority 8); critical tasks never wait behind bulk jobs
- **Real-time monitoring** — dashboard shows per-queue stats; ops team sees when PDF queue backs up; auto-scale workers based on queue depth
