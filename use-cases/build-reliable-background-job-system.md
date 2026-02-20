---
title: Build a Reliable Background Job System
slug: build-reliable-background-job-system
description: >-
  Build a production background job system with BullMQ, scheduled cron jobs,
  rate-limited API calls, job dependencies, and monitoring.
skills:
  - bullmq-advanced
  - cron-jobs
  - rate-limiting-advanced
  - redis
  - pino
category: backend
tags:
  - background-jobs
  - queue
  - scheduling
  - reliability
---

# Build a Reliable Background Job System

Felix runs a project management SaaS that sends 200,000 notifications per day, syncs data with 15 integrations, generates PDF reports, and processes file uploads. Everything runs inline in API handlers — causing timeouts, lost jobs on restarts, and rate limit errors from third-party APIs. He rebuilds it with BullMQ.

## Step 1: Queue Architecture

Different job types need different guarantees — separate queues with tailored settings.

```typescript
// queues/index.ts — Queue definitions
import { Queue } from 'bullmq'
const connection = { host: process.env.REDIS_HOST, port: 6379 }

// Notifications: high throughput, fast retries
export const notificationQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 5000 },
  },
})

// Integrations: rate-limited, longer retries for flaky APIs
export const integrationQueue = new Queue('integrations', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 60000 },
  },
})

// Reports: CPU-heavy, limited concurrency
export const reportQueue = new Queue('reports', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30000 },
  },
})
```

## Step 2: Rate-Limited Integration Worker

Third-party APIs have limits. GitHub: 5,000/hour. Jira: 100/minute. BullMQ's built-in limiter handles this.

```typescript
// workers/integration.ts — Rate-limited worker
import { Worker } from 'bullmq'
import { logger } from '../lib/logger'

const worker = new Worker('integrations', async (job) => {
  const log = logger.child({ jobId: job.id, provider: job.data.provider })
  log.info('Syncing integration')

  switch (job.data.provider) {
    case 'github': await syncGitHub(job.data); break
    case 'jira': await syncJira(job.data); break
    case 'figma': await syncFigma(job.data); break
  }

  log.info('Sync completed')
}, {
  connection: { host: process.env.REDIS_HOST, port: 6379 },
  concurrency: 5,
  limiter: { max: 50, duration: 60000 },    // 50 jobs/minute max
})

worker.on('failed', (job, err) => {
  if (job?.attemptsMade === job?.opts.attempts) {
    alertOpsTeam(`Integration sync permanently failed: ${job.data.provider}`)
  }
})
```

## Step 3: Scheduled Jobs

```typescript
// scheduler.ts — Recurring jobs
await notificationQueue.add('daily-digest', {}, {
  repeat: { pattern: '0 13 * * *' },    // 8 AM EST daily
  jobId: 'daily-digest',
})

await integrationQueue.add('sync-all', {}, {
  repeat: { every: 900000 },             // every 15 min
  jobId: 'sync-all',
})

await reportQueue.add('weekly-usage', {}, {
  repeat: { pattern: '0 14 * * 1' },    // Monday 9 AM EST
  jobId: 'weekly-usage',
})
```

## Step 4: Graceful Shutdown

```typescript
// server.ts — Drain workers on shutdown
const workers = [notificationWorker, integrationWorker, reportWorker]

async function shutdown(signal: string) {
  logger.info({ signal }, 'Draining workers...')
  await Promise.allSettled(workers.map(w => w.close()))
  logger.info('Workers drained, exiting')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
```

## Results

API response times drop from 2-8 seconds to under 100ms. Zero lost jobs during deploys — graceful shutdown drains in-flight work, Redis persists the queue. Third-party rate limit errors: from 200/day to zero. Failed jobs retry automatically — 99.7% eventual success rate (up from 91%). Bull Board dashboard monitors 200K jobs/day with 1.2s average processing time.
