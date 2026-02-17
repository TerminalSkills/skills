---
title: "Build a Job Queue and Background Worker System"
slug: build-job-queue-worker-system
description: "Set up a production-grade background job processing system with priorities, retries, scheduled tasks, and progress tracking."
skills: [job-queue, docker-helper, batch-processor]
category: development
tags: [job-queue, background-workers, async, redis, backend]
---

# Build a Job Queue and Background Worker System

## The Problem

Your web application does too much work inside HTTP request handlers. A user uploads a CSV for import — the request hangs for 45 seconds while rows are processed. Someone requests a PDF report — the server ties up a connection for 30 seconds while it renders. Password reset emails are sent inline, adding 2 seconds to the response time. When traffic spikes, these long-running handlers exhaust the connection pool and the entire application slows down. Worse, if the server restarts mid-task, the work is lost — no retry, no recovery, and an angry user wondering why their export never arrived. The team knows they need background processing but aren't sure how to structure queues, handle failures, or monitor job health.

## The Solution

Use the **job-queue** skill to build a BullMQ-based background processing system with typed jobs, priority queues, and retry logic. Use **docker-helper** to set up Redis for local queue infrastructure and **batch-processor** for handling high-volume bulk operations. The pattern: API handlers enqueue jobs and return immediately, dedicated workers process jobs asynchronously with progress tracking, and failed jobs retry automatically.

```bash
npx terminal-skills install job-queue
npx terminal-skills install docker-helper
npx terminal-skills install batch-processor
```

## Step-by-Step Walkthrough

### 1. Set up queue infrastructure and define job types

```
Set up BullMQ with Redis for my Express API. I need four job queues: email
sending (high throughput, low latency), PDF report generation (CPU-intensive,
medium priority), CSV data export (large payloads, can be slow), and image
resizing (CPU-bound). Create typed job definitions and queue instances.
```

The agent creates `docker-compose.yml` with Redis 7 and persistent volume, `src/jobs/types.ts` with TypeScript interfaces for each job type, and `src/jobs/queues.ts` with four named queues configured with appropriate default retry settings — emails retry 3 times with 5-second backoff, PDFs retry 2 times with 30-second backoff.

### 2. Implement workers with concurrency and rate limiting

```
Create workers for each queue. Email worker should handle 10 concurrent jobs
with a rate limit of 100 per minute (provider limit). PDF worker should run
2 concurrent jobs (CPU-bound). CSV export should run 1 at a time to avoid
memory spikes. All workers need graceful shutdown on SIGTERM.
```

The agent creates four worker files under `src/workers/`, each with tuned concurrency settings. The email worker uses BullMQ's built-in rate limiter. The PDF worker uses sandboxed processors to avoid blocking the event loop. All workers are registered in `src/workers/index.ts` with a shared graceful shutdown handler that waits for active jobs to complete before exiting.

### 3. Add job scheduling and progress tracking

```
Add these scheduled jobs: daily digest email at 8 AM UTC, weekly report generation
every Monday at 6 AM. Also add progress tracking to the PDF and CSV workers so
users can poll a status endpoint and see percentage complete.
```

The agent adds recurring jobs using BullMQ's `repeat` option with cron patterns, creates `src/routes/jobs.ts` with `GET /api/jobs/:id/status` that returns `{ state, progress, result, failedReason }`, and updates the PDF and CSV workers to call `job.updateProgress()` at each processing stage — query (20%), format (50%), render (80%), upload (100%).

### 4. Add monitoring dashboard and failure alerting

```
Add a Bull Board dashboard at /admin/queues so I can monitor all queues from
a web UI. Also set up alerts: notify when any queue's backlog exceeds 100 jobs,
when the dead letter count increases, or when a job type's failure rate goes
above 5%.
```

The agent installs `@bull-board/express`, creates `src/admin/queue-dashboard.ts` mounting the UI at `/admin/queues` with basic auth protection, and creates `src/monitoring/queue-alerts.ts` that runs health checks every 60 seconds — checking queue depth, completed-vs-failed ratios, and dead letter queue growth. Alerts are sent via a configurable webhook.

## Real-World Example

David, a full-stack developer at a growing project management platform, gets a support ticket: "My 5,000-row CSV import has been stuck for 10 minutes." He checks the logs — the import request timed out after 30 seconds, the browser retried, and now there are three partial imports running simultaneously, each consuming memory and database connections. The application server's event loop is blocked, and other users are seeing slow responses across the board.

1. David asks the agent to scaffold a job queue system with BullMQ, separating the CSV import into a background worker
2. The agent generates the queue setup, a CSV import worker with progress tracking, and a status polling endpoint
3. David asks the agent to add the email and PDF workers too — both currently run inline in request handlers
4. The agent creates workers for each with appropriate concurrency settings and shared graceful shutdown
5. He asks the agent to add Bull Board for monitoring and failure alerting
6. After deploying: CSV imports return a job ID in 50ms, users see a progress bar updating in real-time, and the import worker processes rows in batches of 500 without blocking anything else. The three simultaneous import bug is impossible now — the idempotent job ID prevents duplicate enqueues.

API response times drop from an average of 1.2 seconds to 80ms. The server handles 3x more concurrent users on the same hardware.

## Related Skills

- [job-queue](../skills/job-queue/) — Core queue patterns, worker configuration, and scheduling
- [docker-helper](../skills/docker-helper/) — Run Redis and the worker infrastructure locally
- [batch-processor](../skills/batch-processor/) — Process large datasets in configurable batch sizes within workers
