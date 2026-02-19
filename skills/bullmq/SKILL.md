---
name: bullmq
description: >-
  Build job queues and background workers with BullMQ. Use when a user asks to
  set up a job queue, process tasks in the background, build a worker system,
  handle async processing, schedule recurring jobs, rate-limit API calls,
  process webhooks in a queue, or add reliable background processing to a
  Node.js app. Covers queues, workers, job scheduling, retries, rate limiting,
  priorities, events, and dashboard monitoring with Bull Board.
license: Apache-2.0
compatibility: 'Node.js 16+ with Redis'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - bullmq
    - queue
    - jobs
    - workers
    - background
    - redis
    - async
---

# BullMQ

## Overview

BullMQ is the most popular job queue for Node.js, built on Redis. It provides reliable background job processing with retries, scheduling, rate limiting, priorities, concurrency control, and real-time events. Use it for email sending, image processing, webhook handling, data imports, PDF generation, and any task that shouldn't block your API response.

## Instructions

### Step 1: Installation

```bash
npm install bullmq
# Redis is required — BullMQ uses it for job storage and coordination
# Docker: docker run -d --name redis -p 6379:6379 redis:alpine
```

### Step 2: Define a Queue and Producer

```typescript
// lib/queues.ts — Define queues and add jobs
import { Queue } from 'bullmq'

// Redis connection (shared across queues)
const connection = { host: 'localhost', port: 6379 }

// Define queues by purpose
export const emailQueue = new Queue('email', { connection })
export const imageQueue = new Queue('image-processing', { connection })
export const reportQueue = new Queue('reports', { connection })

// Add a job to the email queue
export async function queueWelcomeEmail(userId: string, email: string) {
  await emailQueue.add('welcome', {
    userId,
    email,
    template: 'welcome',
  }, {
    attempts: 3,                    // retry 3 times on failure
    backoff: { type: 'exponential', delay: 5000 },    // 5s, 10s, 20s
    removeOnComplete: 1000,         // keep last 1000 completed jobs
    removeOnFail: 5000,             // keep last 5000 failed for debugging
  })
}

// Delayed job (send in 1 hour)
export async function queueFollowUpEmail(userId: string, email: string) {
  await emailQueue.add('follow-up', { userId, email }, {
    delay: 60 * 60 * 1000,         // 1 hour in milliseconds
  })
}

// Priority job (lower number = higher priority)
export async function queueUrgentEmail(userId: string, email: string) {
  await emailQueue.add('urgent-alert', { userId, email }, {
    priority: 1,                    // processed before normal jobs
  })
}
```

### Step 3: Create Workers

```typescript
// workers/email-worker.ts — Process email jobs
import { Worker, Job } from 'bullmq'

const connection = { host: 'localhost', port: 6379 }

const emailWorker = new Worker('email', async (job: Job) => {
  /**
   * Process email jobs from the queue.
   * BullMQ calls this function for each job, with automatic retries on failure.
   */
  const { userId, email, template } = job.data

  console.log(`Processing email job ${job.id}: ${template} → ${email}`)

  // Update progress (visible in dashboards and events)
  await job.updateProgress(10)

  // Fetch user data
  const user = await db.users.findById(userId)
  await job.updateProgress(30)

  // Render email template
  const html = await renderTemplate(template, { name: user.name })
  await job.updateProgress(60)

  // Send via email provider
  const result = await sendEmail({ to: email, subject: getSubject(template), html })
  await job.updateProgress(100)

  // Return value is stored as job result
  return { messageId: result.messageId, sentAt: new Date().toISOString() }
}, {
  connection,
  concurrency: 5,                 // process 5 emails simultaneously
  limiter: {
    max: 100,                     // max 100 jobs
    duration: 60000,              // per 60 seconds (email provider rate limit)
  },
})

// Event listeners
emailWorker.on('completed', (job) => {
  console.log(`Email sent: ${job.id} → ${job.data.email}`)
})

emailWorker.on('failed', (job, err) => {
  console.error(`Email failed: ${job?.id} — ${err.message}`)
})
```

### Step 4: Scheduled/Recurring Jobs

```typescript
// lib/scheduled-jobs.ts — Cron-like recurring jobs
import { Queue } from 'bullmq'

const reportQueue = new Queue('reports', { connection: { host: 'localhost', port: 6379 } })

// Repeatable job: daily report at 9 AM
await reportQueue.add('daily-summary', {}, {
  repeat: {
    pattern: '0 9 * * *',         // cron expression: 9:00 AM daily
    tz: 'America/New_York',
  },
})

// Every 5 minutes
await reportQueue.add('health-check', {}, {
  repeat: { every: 5 * 60 * 1000 },
})

// List active repeatable jobs
const repeatableJobs = await reportQueue.getRepeatableJobs()
console.log(repeatableJobs)

// Remove a repeatable job
await reportQueue.removeRepeatableByKey(repeatableJobs[0].key)
```

### Step 5: Job Events and Progress

```typescript
// Monitor jobs in real-time from API routes
import { QueueEvents } from 'bullmq'

const queueEvents = new QueueEvents('email', { connection })

// Wait for a specific job to complete
const result = await emailQueue.add('welcome', { email: 'test@example.com' })

// Listen for completion
queueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed:`, returnvalue)
})

// Listen for failures
queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed: ${failedReason}`)
})

// Progress updates
queueEvents.on('progress', ({ jobId, data }) => {
  console.log(`Job ${jobId} progress: ${data}%`)
})
```

### Step 6: Bull Board Dashboard

```typescript
// dashboard.ts — Visual job monitoring dashboard
import express from 'express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(imageQueue),
    new BullMQAdapter(reportQueue),
  ],
  serverAdapter,
})

const app = express()
app.use('/admin/queues', serverAdapter.getRouter())
app.listen(3001, () => console.log('Dashboard: http://localhost:3001/admin/queues'))
```

## Examples

### Example 1: Process file uploads in the background
**User prompt:** "Users upload images to our API. I need to resize them into 3 sizes, optimize for web, and upload to S3. This shouldn't block the API response."

The agent will:
1. Create an image-processing queue with BullMQ.
2. API route adds a job with the file URL and returns immediately.
3. Worker downloads, resizes (sharp), and uploads to S3.
4. Job progress updates track each resize variant.
5. Set concurrency to 3 (limited by CPU for image processing).

### Example 2: Rate-limited webhook processing
**User prompt:** "We receive 1000+ Stripe webhooks per minute during peak hours but our downstream service can only handle 50/min. Queue and rate-limit the processing."

The agent will:
1. API route receives webhooks, verifies signatures, and queues them.
2. Worker processes each webhook event with rate limiter (max 50 per 60s).
3. Automatic retries on downstream failures with exponential backoff.
4. Failed jobs retained for manual inspection via Bull Board.

## Guidelines

- Redis is mandatory and must be persistent (not ephemeral) in production. Use Redis with AOF persistence to avoid losing jobs on restart.
- Set `removeOnComplete` and `removeOnFail` to prevent Redis from growing unbounded. Keep enough completed/failed jobs for debugging but not all of them.
- Use `concurrency` on workers to control parallelism. For CPU-bound work (image processing), match to CPU cores. For I/O-bound work (API calls), use higher values.
- Use `limiter` when calling rate-limited external APIs — it prevents 429 errors by controlling the rate jobs are processed.
- Always handle the `failed` event on workers for alerting. Jobs that exhaust all retry attempts need human attention.
- BullMQ requires Redis — if you need a queue without Redis, consider Inngest or Trigger.dev (cloud-based alternatives).
