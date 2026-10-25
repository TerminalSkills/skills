---
name: job-queue
description: >-
  Build job queues and background worker systems using BullMQ, Celery, or
  Sidekiq. Use when you need to offload slow tasks from request handlers —
  email sending, PDF generation, image processing, data exports, or any work
  that takes more than a few hundred milliseconds. Covers job priorities,
  concurrency control, scheduled jobs, progress tracking, and graceful shutdown.
  Trigger words: background job, worker, queue, async task, BullMQ, Celery,
  cron job, scheduled task, job retry.
license: Apache-2.0
compatibility: "BullMQ 6 needs Redis 6.2+ (Sidekiq: Redis; Celery: RabbitMQ or Redis). Node.js 18+ or Python 3.10+."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "job-queue, background-workers, async, BullMQ"
  repository: "https://github.com/taskforcesh/bullmq"
---

# Job Queue

## Overview
This skill helps you build production-grade background job processing systems. It covers queue architecture, worker concurrency, job priorities, retry strategies, scheduled/recurring jobs, progress reporting, and graceful shutdown. The patterns work across BullMQ (Node.js), Celery (Python), and Sidekiq (Ruby).

## Instructions

### 1. Set up the queue and define job types
Create typed job definitions and a queue instance:

```typescript
// src/jobs/types.ts
export interface JobMap {
  "email:send": { to: string; template: string; data: Record<string, string> };
  "pdf:generate": { reportId: string; format: "a4" | "letter" };
  "export:csv": { userId: string; query: string; columns: string[] };
  "image:resize": { sourceUrl: string; widths: number[] };
}

// src/jobs/queues.ts
import { Queue } from "bullmq";
import { JobMap } from "./types";

const connection = { host: "localhost", port: 6379 };

// BullMQ keeps finished jobs in Redis by default; cap them here or memory grows forever.
const defaultJobOptions = {
  removeOnComplete: { age: 24 * 3600, count: 1000 }, // seconds / count
  removeOnFail: { age: 7 * 24 * 3600 },
};

export const emailQueue = new Queue<JobMap["email:send"]>("email", { connection, defaultJobOptions });
export const pdfQueue = new Queue<JobMap["pdf:generate"]>("pdf", { connection, defaultJobOptions });
export const exportQueue = new Queue<JobMap["export:csv"]>("export", { connection, defaultJobOptions });
export const imageQueue = new Queue<JobMap["image:resize"]>("image", { connection, defaultJobOptions });
```

### 2. Implement workers with concurrency control

```typescript
// src/workers/email-worker.ts
import { Worker, Job } from "bullmq";
import { JobMap } from "../jobs/types";

const emailWorker = new Worker<JobMap["email:send"]>(
  "email",
  async (job: Job) => {
    const { to, template, data } = job.data;
    await job.updateProgress(10);
    const html = await renderTemplate(template, data);
    await job.updateProgress(50);
    await sendEmail(to, html);
    await job.updateProgress(100);
    return { sentAt: new Date().toISOString() };
  },
  {
    connection: { host: "localhost", port: 6379 },
    concurrency: 10,        // Process 10 emails in parallel
    limiter: { max: 100, duration: 60000 }, // Rate limit: 100/minute
  }
);

emailWorker.on("completed", (job) => {
  console.log(`Email sent: job ${job.id} → ${job.data.to}`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`Email failed: job ${job?.id} — ${err.message}`);
});
```

### 3. Add job scheduling and priorities

```typescript
// Delayed job — send welcome email 30 minutes after signup
await emailQueue.add("email:send", {
  to: "jun.park@northwind.io",
  template: "welcome",
  data: { name: "Alex" },
}, { delay: 30 * 60 * 1000 });

// Priority jobs — password resets jump the queue
await emailQueue.add("email:send", {
  to: "maria.lopez@northwind.io",
  template: "password-reset",
  data: { resetLink: "https://app.northwind.io/reset/7f3c9e2a" },
}, { priority: 1 }); // Lower number = higher priority

// Recurring job — daily digest at 8:00 AM UTC, as a Job Scheduler.
// BullMQ 6 removed queue.add(..., { repeat }); upsertJobScheduler replaces it.
// Calling it again with the same ID updates the schedule instead of adding a duplicate.
await emailQueue.upsertJobScheduler(
  "daily-digest",
  { pattern: "0 8 * * *", tz: "UTC" },
  {
    name: "email:send",
    data: { to: "digest", template: "daily-digest", data: {} },
    opts: { attempts: 3, removeOnFail: 1000 },
  }
);

// Remove the schedule when the feature is retired
await emailQueue.removeJobScheduler("daily-digest");
```

Each run produces a normal job, so retries, priorities and removal rules apply. You cannot set a custom `jobId` on the jobs a scheduler creates.

### 4. Implement graceful shutdown

```typescript
// src/workers/shutdown.ts
const workers = [emailWorker, pdfWorker, exportWorker, imageWorker];

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}. Closing workers gracefully...`);
  await Promise.all(workers.map((w) => w.close()));
  console.log("All workers closed. Exiting.");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

## Examples

### Example 1: PDF report generation queue
**Prompt:** "Build a background job system for generating PDF reports. Users request a report, get a job ID back immediately, and can poll for progress. Reports take 10-30 seconds to generate."

**Agent output:**
- Creates `src/jobs/pdf-queue.ts` with typed job definitions
- Creates `src/workers/pdf-worker.ts` with progress updates at each stage (query data → format → render → upload)
- Creates `src/routes/reports.ts` with `POST /reports` (enqueue, return job ID) and `GET /reports/:jobId/status` (return progress percentage and download URL when complete)
- Adds retry logic: 3 attempts with 10-second backoff

### Example 2: Image processing pipeline
**Prompt:** "I need to process uploaded images: resize to 3 widths (200, 800, 1600px), convert to WebP, and upload to cloud storage. Handle up to 500 images per hour."

**Agent output:**
- Creates `src/workers/image-worker.ts` with sharp-based resize and conversion pipeline
- Sets concurrency to 4 (CPU-bound work, matches core count)
- Adds per-image progress tracking (useful for batch uploads)
- Creates `src/jobs/image-pipeline.ts` with a flow: resize → convert → upload as chained jobs

## Guidelines

- **Keep jobs serializable** — job data must survive JSON round-trips. Pass IDs and URLs, not buffers or streams.
- **Set appropriate concurrency** — CPU-bound work (image processing): match core count. I/O-bound (email, API calls): 10-50 concurrent.
- **Always implement graceful shutdown** — `SIGTERM` should let running jobs finish before the process exits. `worker.close()` stops taking new jobs and waits for active ones, with no timeout of its own, so keep job runtimes bounded. Workers default to `concurrency: 1`; set it explicitly as above.
- **Use job IDs for idempotency** — set a deterministic `jobId` to prevent the same job from being enqueued twice.
- **Monitor queue depth** — a growing queue means workers can't keep up. Alert when backlog exceeds 5 minutes of processing time.
- **Separate queues by workload type** — don't let a slow PDF generation block fast email sends.
- **Store results externally** — finished jobs are kept in Redis by default, but `removeOnComplete` and `removeOnFail` trim them (see the queue setup above). Persist important results in your database, not in job return values.
