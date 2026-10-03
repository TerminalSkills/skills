---
name: bull-mq
description: >-
  Runs background jobs in Node.js with BullMQ, a job queue library backed by Redis (or PostgreSQL since v6): delayed and prioritized jobs, retries with backoff, rate limiting, cron-style job schedulers, parent-child flows and concurrency control. Use when a user asks to add a background worker, queue emails or webhooks, schedule recurring jobs, retry failed jobs, rate limit an API client, or migrate from Bull or from BullMQ 5 repeatable jobs.
license: Apache-2.0
compatibility: "Node.js 14.17 or newer (BullMQ 6.x), TypeScript recommended. Needs a Redis server (or Valkey, Dragonfly) with maxmemory-policy noeviction, or PostgreSQL 13+ with the pg package. The ioredis package must be installed separately since BullMQ 6."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - queue
    - redis
    - background-jobs
    - worker
    - node
  repository: https://github.com/taskforcesh/bullmq
---

# BullMQ — Redis-Based Job Queue for Node.js

## Overview

BullMQ moves slow or unreliable work out of the request path. A **Queue** adds jobs, one or more **Workers** (usually separate processes) take them, and **QueueEvents** observes what happened. Jobs survive restarts because they live in Redis. Features: delays, priorities, retries with backoff, global rate limits, deduplication, job schedulers for recurring work, and **FlowProducer** for trees of dependent jobs.

Version notes (checked October 2026, bullmq 6.3.x):

- **BullMQ 6** (July 2026) adds pluggable backends: Redis stays the default, PostgreSQL is optional via `createPostgresBackend`.
- `ioredis` is no longer a dependency. Install it yourself: `npm install bullmq ioredis`. The `redis` package (node-redis) and Bun's built-in Redis client also work through adapters, but ioredis is what BullMQ creates by default.
- Legacy repeatable jobs are gone. `add(name, data, { repeat })`, `getRepeatableJobs()` and `removeRepeatable()` were replaced by **job schedulers** (`upsertJobScheduler`). In a test against 6.3.11 a leftover `repeat` option was accepted without error but created no schedule; the job simply ran once.
- `QueueScheduler` was removed in BullMQ 2; delayed jobs, retries and stalled-job recovery work without it. Old code that imports it will not compile.
- `Queue#client`, `Worker#blockingClient` and the `debounce` option are removed (use `deduplication`), and `queue.resume()` must be awaited.

## Instructions

### Queue, worker and retries

```typescript
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

// Workers need maxRetriesPerRequest: null so Redis hiccups do not crash blocking commands
const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", { maxRetriesPerRequest: null });

export const emailQueue = new Queue("email", { connection });

await emailQueue.add(
  "welcome",
  { to: "maria.lopez@shopmail.test", template: "welcome" },
  {
    priority: 1,                                  // lower number = higher priority
    attempts: 5,                                  // total tries, including the first
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 1000 },            // keep the last 1000 finished jobs
    removeOnFail: { age: 7 * 24 * 3600 },         // keep failures for 7 days
  },
);

await emailQueue.add("reminder", { userId: 42 }, { delay: 24 * 60 * 60 * 1000 });   // run in 24 h

const worker = new Worker(
  "email",
  async (job) => {
    if (job.name === "welcome") await sendEmail(job.data.to, job.data.template);
    if (job.name === "reminder") await sendReminder(job.data.userId);
    await job.updateProgress(100);
    return { sent: true };                        // stored as job.returnvalue
  },
  { connection, concurrency: 5, limiter: { max: 100, duration: 60_000 } },   // 100 jobs/min across all workers
);

worker.on("completed", (job) => console.log(`${job.name} ${job.id} done`));
worker.on("failed", (job, err) => console.error(`${job?.name} ${job?.id} failed: ${err.message}`));
worker.on("error", (err) => console.error("worker error", err));   // without a listener errors only reach stderr
```

Throw `new UnrecoverableError("invalid address")` (exported by bullmq) to fail a job without further retries.

### Recurring jobs: job schedulers

```typescript
// Idempotent: call on every deploy; the same id updates the scheduler instead of duplicating it
await emailQueue.upsertJobScheduler(
  "weekly-digest",
  { pattern: "0 9 * * 1", tz: "Europe/Berlin" },     // cron; or { every: 60_000 } for a fixed interval
  { name: "digest", data: { kind: "weekly" }, opts: { attempts: 3 } },
);
console.log(await emailQueue.getJobSchedulers());     // list
await emailQueue.removeJobScheduler("weekly-digest"); // remove
```

A scheduler keeps exactly one delayed job; the next one is created when the current one starts, so a saturated queue can run it less often than the interval. Use `tz: "UTC"` for UTC (the old `utc: true` is gone). You cannot choose the generated job ids; distinguish jobs by `name`.

### Flows (parent waits for children)

```typescript
import { FlowProducer } from "bullmq";
const flow = new FlowProducer({ connection });

await flow.add({
  name: "generate-report", queueName: "reports", data: { reportId: "monthly-2026-09" },
  children: [
    { name: "fetch-sales",   queueName: "data", data: { source: "sales" } },
    { name: "fetch-users",   queueName: "data", data: { source: "users" }, opts: { failParentOnFailure: true } },
  ],
});
// In the "reports" worker: const results = await job.getChildrenValues();
```

The parent moves to waiting only after all children succeed. Without `failParentOnFailure` (or `ignoreDependencyOnFailure`) a failed child leaves the parent waiting. Children cannot use `deduplication`; flow nodes without `opts.jobId` get UUID ids in v6.

### Deduplication, rate limits, concurrency

```typescript
await emailQueue.add("invoice", { orderId: "A-1042" }, { deduplication: { id: "invoice-A-1042", ttl: 5000 } });  // throttle mode
await emailQueue.setGlobalConcurrency(4);                  // cap across all workers of this queue
await emailQueue.setGlobalRateLimit(10, 1000);             // 10 jobs per second for the whole queue
```

Without `ttl` the deduplication id holds until the job completes or fails. Duplicates are dropped and a `deduplicated` event is emitted on QueueEvents. Inside a worker, `worker.rateLimit(ms)` followed by `throw Worker.RateLimitError()` honors a 429 from an upstream API.

### Shutdown and production

- On SIGTERM call `await worker.close()`; it stops taking jobs and waits for active ones. Close queues and finally the connection (`await connection.quit()`).
- Set Redis `maxmemory-policy noeviction` and enable AOF persistence; eviction silently corrupts queues.
- Producers should fail fast when Redis is down (`enableOfflineQueue: false` on the Queue's connection); workers should keep retrying.
- Optional PostgreSQL backend: `npm install pg`, then `new Queue("email", { connection: process.env.DATABASE_URL }, createPostgresBackend)` and the same for Worker (import `createPostgresBackend` from `bullmq`). Since 6.1 the schema is not created on connect: run `runMigrations(client)` (exported by bullmq, takes a `pg` client) once per deploy.
- Inspecting queues: Bull Board (`@bull-board/api`) or Taskforce.sh; BullMQ also emits Prometheus-style metrics via `queue.exportPrometheusMetrics()`.

### Upgrading from BullMQ 5

On v5 first: recreate each `getRepeatableJobs()` entry as `upsertJobScheduler`, verify with `getJobSchedulers()`, remove the old ones with `removeRepeatableByKey`, then upgrade. v6 raises an error when it finds legacy repeat metadata. Also: add `ioredis` to package.json, rename `debounce` to `deduplication`, `await queue.resume()`, drop `job.discard()` in favor of `UnrecoverableError`.

## Examples

### Example 1: Send signup emails without blocking the API

Request: "Our /signup endpoint takes 3 seconds because it sends the welcome email inline. Move it to a queue."

API process:

```typescript
// routes/signup.ts
import { emailQueue } from "../queues/email";
app.post("/signup", async (req, res) => {
  const user = await createUser(req.body);
  await emailQueue.add("welcome", { to: user.email, template: "welcome" }, { jobId: `welcome-${user.id}`, attempts: 5, backoff: { type: "exponential", delay: 2000 } });
  res.status(201).json({ id: user.id });
});
```

Worker process (`node dist/email-worker.js`, a separate container) uses the Worker from the Instructions with `concurrency: 5`. The endpoint returns in milliseconds; a provider outage leads to retries after about 2, 4, 8 and 16 seconds, and the fixed `jobId` prevents a double email when the client retries the request.

### Example 2: Weekly report from three data sources

Request: "Every Monday at 08:00 Berlin time build the sales report after fetching sales, users and metrics."

```typescript
await reportsQueue.upsertJobScheduler(
  "monday-report", { pattern: "0 8 * * 1", tz: "Europe/Berlin" },
  { name: "kickoff", data: {} },
);

// worker for "reports" on the kickoff job:
const kickoff = new Worker("reports", async (job) => {
  if (job.name === "kickoff") {
    await new FlowProducer({ connection }).add({
      name: "build-report", queueName: "reports-final",
      children: ["sales", "users", "metrics"].map((source) => ({ name: `fetch-${source}`, queueName: "data", data: { source }, opts: { failParentOnFailure: true } })),
    });
  }
}, { connection });
```

The scheduler fires on Monday, the kickoff job creates the flow, and `build-report` runs once all three fetch jobs have completed; if one fails after its retries, the report job fails instead of waiting forever.

## Guidelines

- Run workers as separate processes from the web server and scale them independently; a CPU-heavy processor can stall lock renewal, so use sandboxed processors (a file path as the processor) for heavy work.
- Make jobs idempotent: a job can run more than once (retries, stalled recovery). Use `jobId` or `deduplication` to avoid duplicates.
- Always attach `worker.on("error")` and `worker.on("failed")` handlers, and set `removeOnComplete`/`removeOnFail`; otherwise Redis fills with finished jobs.
- Job data must be JSON-serializable and small; store large payloads elsewhere and pass an id.
- Do not use BullMQ for exactly-once guarantees or strict ordering across workers; use concurrency 1 on a queue for ordering.
- Never share one Redis with an eviction policy other than `noeviction`; managed Redis offerings often default to `volatile-lru`.
- Old Bull (the `bull` package) is in maintenance; the Bull-to-BullMQ guide covers moving over.
