---
name: bull-board
description: >-
  Monitor background job queues with Bull Board. Use when a user asks to add a
  dashboard for BullMQ jobs, monitor queue health, view failed jobs, retry
  failed tasks, or visualize job processing metrics.
license: Apache-2.0
compatibility: 'Node.js, Express, Fastify, Next.js'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: developer-tools
  tags:
    - bull-board
    - bullmq
    - queue
    - monitoring
    - dashboard
---

# Bull Board

## Overview

Bull Board provides a web dashboard for monitoring BullMQ and Bull job queues. View active, completed, failed, and delayed jobs. Retry failed jobs, view logs, and monitor queue health — all from a browser UI.

## Instructions

### Step 1: Express Integration

```bash
npm install @bull-board/express @bull-board/api bullmq
```

```typescript
// server.ts — Bull Board dashboard with Express
import express from 'express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { Queue } from 'bullmq'

const emailQueue = new Queue('emails', { connection: { host: 'localhost', port: 6379 } })
const reportQueue = new Queue('reports', { connection: { host: 'localhost', port: 6379 } })

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(reportQueue),
  ],
  serverAdapter,
})

const app = express()
app.use('/admin/queues', serverAdapter.getRouter())
app.listen(3000, () => console.log('Bull Board: http://localhost:3000/admin/queues'))
```

### Step 2: Next.js Integration

```typescript
// app/api/queues/[...slug]/route.ts — Bull Board in Next.js
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { NextAdapter } from '@bull-board/next'
import { Queue } from 'bullmq'

const emailQueue = new Queue('emails', { connection: { host: 'localhost', port: 6379 } })

const adapter = new NextAdapter()
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: adapter })

export const GET = adapter.getHandler()
export const POST = adapter.getHandler()
```

## Guidelines

- Protect the dashboard with authentication — it exposes job data and allows retries/deletions.
- Bull Board auto-refreshes — shows real-time queue status.
- Use for development and staging; for production monitoring at scale, consider dedicated observability.
