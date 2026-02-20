---
name: cron-jobs
description: >-
  Schedule recurring tasks with cron in Node.js. Use when a user asks to
  run scheduled jobs, set up recurring tasks, implement cron-based automation,
  or schedule data processing at specific times.
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
---

# Cron Jobs in Node.js

## Overview

Schedule recurring tasks using cron expressions. Use node-cron for in-process, BullMQ repeatable jobs for distributed, or platform cron (Vercel, Railway) for serverless.

## Instructions

### Step 1: In-Process

```typescript
// scheduler.ts — node-cron scheduling
import cron from 'node-cron'

// Daily at 9:00 AM EST
cron.schedule('0 9 * * *', async () => {
  await generateDailyReports()
}, { timezone: 'America/New_York' })

// Every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await checkApiHealth()
})

// Weekly Monday 8 AM
cron.schedule('0 8 * * 1', async () => {
  await sendWeeklyDigests()
})
```

### Step 2: Distributed with BullMQ

```typescript
import { Queue, Worker } from 'bullmq'
const queue = new Queue('scheduled', { connection: { host: 'redis' } })

await queue.add('daily-cleanup', {}, {
  repeat: { pattern: '0 3 * * *' },
  jobId: 'daily-cleanup',     // prevents duplicates on restart
})

new Worker('scheduled', async (job) => {
  if (job.name === 'daily-cleanup') await cleanupExpiredSessions()
}, { connection: { host: 'redis' } })
```

### Step 3: Serverless (Vercel)

```typescript
// app/api/cron/report/route.ts
export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await generateReports()
  return Response.json({ ok: true })
}
```

## Guidelines

- node-cron is in-process — dies with the process. Use BullMQ for production.
- BullMQ repeatables use Redis locking — safe for horizontal scaling.
- Always set jobId for BullMQ repeatables to prevent duplicate schedules.
- Set timezone explicitly — server timezone varies across environments.
- Wrap handlers in try/catch — unhandled errors crash the process.
