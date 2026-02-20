---
title: Build a Reliable Background Job System
slug: build-reliable-background-job-system
description: >-
  Build a production background job system with BullMQ, scheduled cron jobs,
  rate-limited API calls, job dependencies, and monitoring. Handle retries,
  dead-letter queues, and graceful shutdown.
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
  - production
---

# Build a Reliable Background Job System

Felix runs a project management SaaS that sends 200,000 notifications per day (email, Slack, push), syncs data with 15 third-party integrations (Jira, GitHub, Figma), generates PDF reports on demand, and processes file uploads (thumbnails, OCR). All of this runs inline in API request handlers. Result: timeouts, lost jobs when servers restart, and rate limit errors from third-party APIs. He rebuilds the entire async processing layer with BullMQ.

## Step 1: Queue Architecture

Different job types need different guarantees. Felix creates separate queues with tailored settings.

```typescript
// queues/index.ts — Queue definitions with distinct configurations
import { Queue } from 'bullmq'

const connection = { host: process.env.REDIS_HOST, port: 6379, maxRetriesPerRequest: null }

// Notifications: high throughput, fast retries
export const notificationQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },       // 5s, 10s, 20s
    removeOnComplete: { count: 5000 },
    removeOnFail: { age: 7 * 86400 },                     // keep failures 7 days
  },
})

// Integrations: rate-limited, longer retries
export const integrationQueue = new Queue('integrations', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 60000 },       // 1min, 2min, 4min, 8min, 16min
    removeOnComplete: { count: 2000 },
    removeOnFail: { age: 14 * 86400 },                    // keep failures 14 days
  },
})

// Reports: CPU-heavy, limited concurrency
export const reportQueue = new Queue('reports', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30000 },
    removeOnComplete: { age: 86400 },
  },
})

// File processing: large payloads, medium priority
export const fileQueue = new Queue('files', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 1000 },
  },
})
```

## Step 2: Workers with Rate Limiting

Third-party APIs have rate limits. The GitHub API allows 5,000 requests per hour, Jira allows 100 requests per minute. BullMQ's built-in rate limiter handles this.

```typescript
// workers/integration.ts — Rate-limited integration worker
import { Worker } from 'bullmq'
import { logger } from '../lib/logger'

const integrationWorker = new Worker('integrations', async (job) => {
  const log = logger.child({ jobId: job.id, integration: job.data.provider })

  log.info('Processing integration sync')

  switch (job.data.provider) {
    case 'github':
      await syncGitHubIssues(job.data)
      break
    case 'jira':
      await syncJiraTickets(job.data)
      break
    case 'figma':
      await syncFigmaFiles(job.data)
      break
    case 'slack':
      await syncSlackMessages(job.data)
      break
    default:
      throw new Error(`Unknown provider: ${job.data.provider}`)
  }

  log.info('Integration sync completed')
}, {
  connection: { host: process.env.REDIS_HOST, port: 6379 },
  concurrency: 5,                                          // 5 simultaneous syncs
  limiter: {
    max: 50,                                                // max 50 jobs
    duration: 60000,                                        // per minute
  },
})

integrationWorker.on('failed', (job, err) => {
  logger.error({
    jobId: job?.id,
    provider: job?.data.provider,
    attempt: job?.attemptsMade,
    error: err.message,
  }, 'Integration sync failed')

  // Alert on final failure
  if (job?.attemptsMade === job?.opts.attempts) {
    alertOpsTeam(`Integration sync permanently failed: ${job.data.provider}`)
  }
})
```

## Step 3: Scheduled Jobs

```typescript
// scheduler.ts — Cron-based recurring jobs
import { notificationQueue, integrationQueue, reportQueue } from './queues'

async function setupScheduledJobs() {
  // Daily digest at 8:00 AM EST
  await notificationQueue.add('daily-digest', {}, {
    repeat: { pattern: '0 13 * * *' },    // 13:00 UTC = 8:00 AM EST
    jobId: 'daily-digest',
  })

  // Sync all integrations every 15 minutes
  await integrationQueue.add('sync-all', {}, {
    repeat: { every: 900000 },             // 15 minutes
    jobId: 'sync-all-integrations',
  })

  // Weekly usage report every Monday at 9:00 AM
  await reportQueue.add('weekly-usage', {}, {
    repeat: { pattern: '0 14 * * 1' },    // Monday 14:00 UTC
    jobId: 'weekly-usage-report',
  })

  // Cleanup expired sessions every hour
  await integrationQueue.add('cleanup-sessions', {}, {
    repeat: { every: 3600000 },
    jobId: 'cleanup-sessions',
  })
}
```

## Step 4: Graceful Shutdown

```typescript
// server.ts — Clean shutdown without losing jobs
import { notificationWorker, integrationWorker, reportWorker, fileWorker } from './workers'

const workers = [notificationWorker, integrationWorker, reportWorker, fileWorker]

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received, draining workers...')

  // Close workers — they finish current jobs but don't pick up new ones
  await Promise.allSettled(workers.map(w => w.close()))

  logger.info('All workers drained, exiting')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
```

## Results

API response times drop from 2-8 seconds (inline processing) to under 100ms (queue and return). Zero lost jobs during deploys — graceful shutdown drains in-flight work, and Redis persists the queue. Third-party rate limit errors drop from 200/day to zero — BullMQ's limiter keeps requests within API quotas. Failed jobs retry automatically with exponential backoff — 99.7% eventual success rate (up from 91% with inline retries). The ops team only gets alerted on permanent failures (after all retries exhausted), reducing alert fatigue by 80%. Bull Board dashboard shows real-time queue health: notification queue processes 200K jobs/day with average latency of 1.2 seconds.
