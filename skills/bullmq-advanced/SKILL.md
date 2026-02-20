---
name: bullmq-advanced
description: >-
  Build background job systems with BullMQ. Use when a user asks to process
  background tasks, implement job queues with retries, schedule recurring
  jobs, handle rate-limited APIs, or build reliable async workflows.
license: Apache-2.0
compatibility: 'Node.js 16+, Redis'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - bullmq
    - queue
    - background-jobs
    - redis
    - async
---

# BullMQ (Advanced)

## Overview

BullMQ is the leading Node.js job queue built on Redis. It handles background processing, delayed jobs, rate limiting, priorities, repeatable schedules, and flow dependencies. Production-ready with automatic retries and dead-letter queues.

## Instructions

### Step 1: Queue and Workers

```typescript
// queues/email.ts — Email processing queue
import { Queue, Worker } from 'bullmq'

const connection = { host: process.env.REDIS_HOST, port: 6379 }

export const emailQueue = new Queue('email', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
})

const worker = new Worker('email', async (job) => {
  const { to, subject, html } = job.data
  await job.updateProgress(10)
  const result = await sendEmail({ to, subject, html })
  await job.updateProgress(100)
  return { messageId: result.id }
}, {
  connection,
  concurrency: 20,
  limiter: { max: 100, duration: 60000 },
})
```

### Step 2: Priorities and Delays

```typescript
// Critical: password reset
await emailQueue.add('password-reset', data, { priority: 1 })

// Normal: welcome email
await emailQueue.add('welcome', data)

// Low priority: weekly digest
await emailQueue.add('digest', data, { priority: 10 })

// Delayed: send in 1 hour
await emailQueue.add('reminder', data, { delay: 3600000 })

// Repeatable: every Monday 9am
await emailQueue.add('weekly-report', data, {
  repeat: { pattern: '0 9 * * 1' },
})
```

### Step 3: Flow Dependencies

```typescript
// Multi-step workflow — parent runs after all children
import { FlowProducer } from 'bullmq'

const flow = new FlowProducer({ connection })

await flow.add({
  name: 'onboarding-complete',
  queueName: 'onboarding',
  data: { userId },
  children: [
    { name: 'send-welcome', queueName: 'email', data: { to: user.email } },
    { name: 'create-project', queueName: 'setup', data: { userId } },
    { name: 'sync-crm', queueName: 'integrations', data: { userId } },
  ],
})
```

### Step 4: Monitoring

```typescript
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'

const serverAdapter = new ExpressAdapter()
createBullBoard({
  queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(reportQueue)],
  serverAdapter,
})
app.use('/admin/queues', serverAdapter.getRouter())
```

## Guidelines

- BullMQ requires Redis 5.0+ — use a separate instance from your cache.
- Use exponential backoff — prevents hammering failed services.
- Set concurrency based on workload — I/O-bound jobs can be 10-50, CPU-bound should be 1-4.
- Use FlowProducer for multi-step workflows with dependencies.
- Always set `jobId` for repeatable jobs to prevent duplicates on restart.
- Implement graceful shutdown: `await worker.close()` drains in-flight jobs.
