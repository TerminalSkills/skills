---
name: cron-jobs
description: >-
  Schedule background jobs with cron patterns in Node.js. Use when a user
  asks to run scheduled tasks, set up recurring jobs, implement cron-based
  automation, or schedule data processing at specific times.
license: Apache-2.0
compatibility: 'Node.js 16+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - cron
    - scheduling
    - background-jobs
    - automation
    - nodejs
---

# Cron Jobs in Node.js

## Overview

Schedule recurring tasks in Node.js applications using cron expressions. Use `node-cron` for in-process scheduling, BullMQ repeatable jobs for distributed scheduling, or platform-specific schedulers (Vercel Cron, Railway Cron) for serverless.

## Instructions

### Step 1: In-Process Scheduling

```typescript
// scheduler.ts — Cron scheduling with node-cron
import cron from 'node-cron'
import { logger } from './lib/logger'

// ┌───── minute (0-59)
// │ ┌───── hour (0-23)
// │ │ ┌───── day of month (1-31)
// │ │ │ ┌───── month (1-12)
// │ │ │ │ ┌───── day of week (0-7, 0 and 7 = Sunday)
// │ │ │ │ │

// Every day at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  logger.info('Running daily report generation')
  await generateDailyReports()
}, { timezone: 'America/New_York' })

// Every Monday at 8:00 AM
cron.schedule('0 8 * * 1', async () => {
  logger.info('Running weekly digest')
  await sendWeeklyDigests()
})

// Every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await checkExternalApiHealth()
})

// First day of every month at midnight
cron.schedule('0 0 1 * *', async () => {
  await generateMonthlyInvoices()
})
```

### Step 2: Distributed Scheduling with BullMQ

```typescript
// For multi-instance deployments, use BullMQ repeatable jobs
// Only ONE instance processes each job (Redis-based locking)
import { Queue, Worker } from 'bullmq'

const scheduledQueue = new Queue('scheduled', { connection: { host: 'redis' } })

// Add repeatable jobs (idempotent — safe to call on every startup)
await scheduledQueue.add('daily-cleanup', {}, {
  repeat: { pattern: '0 3 * * *' },        // 3:00 AM daily
  jobId: 'daily-cleanup',                    // prevents duplicates
})

await scheduledQueue.add('sync-analytics', {}, {
  repeat: { every: 300000 },                 // every 5 minutes
  jobId: 'sync-analytics',
})

// Worker handles all scheduled jobs
new Worker('scheduled', async (job) => {
  switch (job.name) {
    case 'daily-cleanup':
      await cleanupExpiredSessions()
      await purgeOldLogs()
      break
    case 'sync-analytics':
      await syncToAnalyticsPlatform()
      break
  }
}, { connection: { host: 'redis' } })
```

### Step 3: Serverless Cron (Vercel / Next.js)

```typescript
// app/api/cron/daily-report/route.ts — Vercel Cron function
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await generateAndEmailDailyReports()
  return NextResponse.json({ ok: true })
}
```

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/daily-report", "schedule": "0 9 * * *" }
  ]
}
```

## Guidelines

- `node-cron` runs in-process — if the process crashes, the schedule stops. Use BullMQ for production.
- BullMQ repeatable jobs use Redis locking — only one instance executes, safe for horizontal scaling.
- Always set `jobId` for BullMQ repeatables — prevents duplicate schedules on restart.
- Set timezone explicitly — default is server timezone, which varies across environments.
- Wrap cron handlers in try/catch — an unhandled error can crash the process.
- For serverless, verify cron requests with a secret — public endpoints can be called by anyone.
