---
name: inngest
description: >-
  Build reliable background jobs and workflows with Inngest. Use when a user
  asks to run background tasks, create event-driven workflows, build reliable
  job queues, set up step functions for long-running processes, schedule
  recurring jobs, handle webhook processing, build multi-step async workflows,
  add retries and error handling to background jobs, or replace BullMQ/Celery
  with a serverless-friendly alternative. Covers event sending, function
  definition, step orchestration, retries, scheduling, and fan-out patterns.
license: Apache-2.0
compatibility: 'Node.js 18+, Python 3.8+ (any deployment platform)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - inngest
    - background-jobs
    - workflows
    - events
    - queues
    - serverless
---

# Inngest

## Overview

Inngest is a developer platform for building reliable background jobs, workflows, and event-driven functions. Unlike traditional job queues (BullMQ, Celery), Inngest doesn't require infrastructure — no Redis, no workers, no queue management. You define functions as code, Inngest handles execution, retries, rate limiting, and orchestration. Functions run in your existing serverless deployment (Vercel, Netlify, AWS Lambda) or any Node.js/Python server.

## Instructions

### Step 1: Installation

```bash
# Node.js
npm install inngest

# Python
pip install inngest

# Dev server (local development)
npx inngest-cli@latest dev
# Opens dashboard at http://localhost:8288
```

### Step 2: Define Functions

```typescript
// inngest/functions.ts — Define background functions triggered by events
import { inngest } from './client'

// Simple event-triggered function
export const sendWelcomeEmail = inngest.createFunction(
  { id: 'send-welcome-email', retries: 3 },
  { event: 'user/signed.up' },
  async ({ event, step }) => {
    /**
     * Triggered when a new user signs up.
     * Sends welcome email, then waits 3 days and sends onboarding tips.
     */
    // Step 1: Send welcome email immediately
    await step.run('send-welcome', async () => {
      await sendEmail({
        to: event.data.email,
        subject: 'Welcome!',
        template: 'welcome',
        data: { name: event.data.name },
      })
    })

    // Step 2: Wait 3 days
    await step.sleep('wait-for-onboarding', '3 days')

    // Step 3: Send onboarding tips
    await step.run('send-onboarding', async () => {
      await sendEmail({
        to: event.data.email,
        subject: 'Getting started tips',
        template: 'onboarding-tips',
      })
    })
  }
)

// Scheduled function (cron)
export const dailyReport = inngest.createFunction(
  { id: 'daily-report' },
  { cron: '0 9 * * 1-5' },    // 9 AM weekdays
  async ({ step }) => {
    const stats = await step.run('fetch-stats', async () => {
      return await db.query('SELECT count(*) as signups FROM users WHERE created_at > now() - interval 1 day')
    })

    await step.run('send-report', async () => {
      await slack.post('#metrics', `Yesterday: ${stats.signups} new signups`)
    })
  }
)
```

### Step 3: Send Events

```typescript
// lib/inngest-client.ts — Inngest client and event sending
import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'my-app' })

// Send event from your API routes, webhooks, or anywhere
await inngest.send({
  name: 'user/signed.up',
  data: {
    userId: 'usr_123',
    email: 'new@user.com',
    name: 'Alex',
    plan: 'pro',
  },
})

// Send multiple events
await inngest.send([
  { name: 'order/placed', data: { orderId: 'ord_456', total: 99.99 } },
  { name: 'inventory/check', data: { productId: 'prod_789' } },
])
```

### Step 4: Multi-Step Workflows

```typescript
// inngest/order-workflow.ts — Complex multi-step order processing
export const processOrder = inngest.createFunction(
  { id: 'process-order', retries: 5 },
  { event: 'order/placed' },
  async ({ event, step }) => {
    /**
     * Multi-step order processing:
     * 1. Validate payment
     * 2. Reserve inventory
     * 3. Send confirmation
     * 4. Wait for shipping
     * If any step fails, Inngest retries that specific step.
     */
    const payment = await step.run('validate-payment', async () => {
      return await stripe.paymentIntents.confirm(event.data.paymentIntentId)
    })

    const inventory = await step.run('reserve-inventory', async () => {
      return await warehouse.reserve(event.data.items)
    })

    await step.run('send-confirmation', async () => {
      await sendEmail({
        to: event.data.customerEmail,
        template: 'order-confirmed',
        data: { orderId: event.data.orderId, items: event.data.items },
      })
    })

    // Wait for external event (shipping label created)
    const shipment = await step.waitForEvent('wait-for-shipment', {
      event: 'shipment/label.created',
      match: 'data.orderId',         // match on orderId field
      timeout: '7 days',
    })

    if (shipment) {
      await step.run('notify-shipped', async () => {
        await sendEmail({
          to: event.data.customerEmail,
          template: 'order-shipped',
          data: { trackingNumber: shipment.data.trackingNumber },
        })
      })
    }
  }
)
```

### Step 5: Fan-Out and Parallel Execution

```typescript
// inngest/batch-processor.ts — Process items in parallel
export const processBatch = inngest.createFunction(
  { id: 'process-batch' },
  { event: 'batch/started' },
  async ({ event, step }) => {
    const items = event.data.items    // array of items to process

    // Fan-out: send an event for each item (processed in parallel)
    await step.run('fan-out', async () => {
      const events = items.map(item => ({
        name: 'batch/item.process',
        data: { batchId: event.data.batchId, item },
      }))
      await inngest.send(events)
    })
  }
)

export const processItem = inngest.createFunction(
  { id: 'process-batch-item', concurrency: { limit: 10 } },    // max 10 concurrent
  { event: 'batch/item.process' },
  async ({ event, step }) => {
    await step.run('process', async () => {
      return await heavyComputation(event.data.item)
    })
  }
)
```

### Step 6: Serve with Next.js / Express

```typescript
// app/api/inngest/route.ts — Next.js App Router integration
import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { sendWelcomeEmail, processOrder, dailyReport } from '@/inngest/functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendWelcomeEmail, processOrder, dailyReport],
})
```

```typescript
// Express integration
import express from 'express'
import { serve } from 'inngest/express'

const app = express()
app.use('/api/inngest', serve({ client: inngest, functions: [/* ... */] }))
```

## Examples

### Example 1: Build an onboarding drip email sequence
**User prompt:** "When a user signs up, send them a welcome email immediately, then tips on day 3, a check-in on day 7, and an upgrade offer on day 14."

The agent will:
1. Create an Inngest function triggered by `user/signed.up`.
2. Use `step.run` for each email and `step.sleep` for delays between them.
3. Each step is independently retriable — if the day 7 email fails, it retries without re-sending previous emails.
4. Add a step to check if the user has already upgraded before sending the offer.

### Example 2: Process webhook events reliably
**User prompt:** "We receive Stripe webhooks but sometimes our server is slow and Stripe retries cause duplicate processing. Make webhook handling idempotent and reliable."

The agent will:
1. Receive webhooks in an API route, verify the Stripe signature, then send an Inngest event.
2. Inngest deduplicates events using the event ID.
3. Create functions for each webhook type (payment_succeeded, subscription_updated, etc.).
4. Each function uses steps so partial failures don't reprocess completed work.

## Guidelines

- Inngest functions are durable — each `step.run()` result is persisted. If a function fails at step 3, it resumes from step 3 on retry, not from the beginning. Structure your code around steps.
- Use `step.sleep()` for delays instead of setTimeout — Inngest handles the scheduling and your function doesn't consume resources while waiting.
- Set `concurrency` limits on functions that call external APIs with rate limits. This prevents overwhelming third-party services during traffic spikes.
- For local development, always run `npx inngest-cli dev` alongside your app. It provides a dashboard for monitoring events, function runs, and debugging failures.
- Inngest Cloud handles execution; self-hosting is also available. Start with Cloud for simplicity, self-host when you need data residency.
- Events are the integration point — any service can send events, any function can react. Use this for decoupling: your API route sends an event, background functions handle the rest.
