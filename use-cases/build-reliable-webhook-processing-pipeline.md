---
title: Build a Reliable Webhook Processing Pipeline
slug: build-reliable-webhook-processing-pipeline
description: >-
  A fintech startup receives thousands of payment webhooks from Stripe daily.
  They need reliable processing with retries, rate limiting for downstream
  services, and a dashboard for monitoring failures. They build a BullMQ
  pipeline with Redis, add Bull Board for observability, and document the
  system with Docusaurus.
skills:
  - job-queue
  - redis
  - docusaurus
category: development
tags:
  - webhooks
  - queues
  - reliability
  - stripe
  - background-jobs
  - monitoring
---

# Build a Reliable Webhook Processing Pipeline

Sam runs the backend for a fintech startup processing payments. Their Stripe integration receives about 5,000 webhooks a day: payment succeeded, subscription updated, invoice created, dispute opened. The current handler is a single API route that processes each event synchronously. When the accounting service is slow, the request times out, Stripe retries, and the work runs twice. When the server crashes mid-processing, the event is lost.

Sam needs a pipeline that (1) verifies the signature and acknowledges immediately, (2) processes events with retries and deduplication, (3) rate-limits calls to the accounting service, and (4) shows failures.

Install: `npm install bullmq ioredis stripe @bull-board/api @bull-board/express express`. Since BullMQ 6, `ioredis` is a separate install.

## Step 1: Configure Redis and the Shared Connection

BullMQ keeps jobs only in Redis, so Redis must not evict them or lose them on restart. Run it private, with a password, AOF persistence and `noeviction` (the `redis` skill covers the reasoning):

```bash
docker run -d --name webhook-redis -p 127.0.0.1:6379:6379 redis:8 \
  redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy noeviction \
  --requirepass "$REDIS_PASSWORD"
```

```typescript
// lib/redis.ts: one connection factory for the API route, the worker and the dashboard
import IORedis from 'ioredis'

// REDIS_URL must carry the password, e.g. redis://:$REDIS_PASSWORD@127.0.0.1:6379
// BullMQ workers need maxRetriesPerRequest: null so a Redis hiccup does not crash blocking commands
export const makeConnection = () =>
  new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null })
```

## Step 2: Verify, Deduplicate and Queue

The endpoint does the minimum: verify the signature over the raw body, enqueue, return 200. No business logic.

```typescript
// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Queue } from 'bullmq'
import Stripe from 'stripe'
import { makeConnection } from '@/lib/redis'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
export const webhookQueue = new Queue('stripe-webhooks', { connection: makeConnection() })

export async function POST(req: NextRequest) {
  const body = await req.text()                       // raw body: parsing JSON first breaks the signature
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // The event ID is the job ID: adding an ID that already exists in Redis is ignored.
  await webhookQueue.add(event.type, {
    eventId: event.id,
    type: event.type,
    data: event.data.object,
    created: event.created,
  }, {
    jobId: event.id,
    attempts: 5,                                      // total tries, including the first
    backoff: { type: 'exponential', delay: 10_000 },  // waits 10s, 20s, 40s, 80s between tries
    removeOnComplete: { age: 7 * 24 * 3600 },         // keep 7 days: longer than Stripe retries
    removeOnFail: { age: 30 * 24 * 3600 },
  })

  return NextResponse.json({ received: true })
}
```

What this gives you, and where it stops:

- **Signature and constant-time compare.** `constructEvent` computes the HMAC-SHA256 of `timestamp.payload` and compares it with Node's timing-safe comparison (`secureCompare` in stripe-node's `NodePlatformFunctions`). Do not replace it with your own `===` on the signature.
- **Replay protection.** `constructEvent` rejects a signature whose timestamp is more than 300 seconds old (its default tolerance). Keep the default; do not pass `0`, which disables the check. Keep server clocks synced with NTP.
- **Deduplication is bounded.** A repeated `jobId` is dropped only while the job still exists in Redis. Stripe retries a failed delivery for up to three days in live mode, so retention must exceed that (7 days above). If Redis is flushed, duplicates get through, so the handlers must be idempotent too.

## Step 3: Process Events Idempotently

The worker runs as its own process. Each event is also recorded in the database under a unique key, so a duplicate that slips past the queue cannot repeat a side effect.

```typescript
// workers/stripe-worker.ts
import { Worker, Job } from 'bullmq'
import type Stripe from 'stripe'
import { makeConnection } from '../lib/redis'
// db, emailService, accountingService, slackService: your own modules

type WebhookPayload = { eventId: string; type: string; data: Record<string, any>; created: number }

const handlers: Record<string, (data: any) => Promise<void>> = {
  'payment_intent.succeeded': handlePaymentSucceeded,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'charge.dispute.created': handleDisputeCreated,
  // ...one entry per event type you subscribed to in the Stripe dashboard
}

const worker = new Worker<WebhookPayload>('stripe-webhooks', async (job: Job<WebhookPayload>) => {
  const { type, data, eventId } = job.data
  const handler = handlers[type]
  if (!handler) return { skipped: true, type }

  // Unique index on processed_events.event_id: the second insert for the same event fails.
  const first = await db.processedEvents.insertIfAbsent({ eventId, receivedAt: new Date() })
  if (!first && (await db.processedEvents.isDone(eventId))) return { duplicate: true }

  await handler(data)
  await db.processedEvents.markDone(eventId)   // set only after the handler finished
  return { processed: true, type }
}, {
  connection: makeConnection(),
  concurrency: 10,
  limiter: { max: 50, duration: 60_000 },       // at most 50 jobs per minute, across all workers
})

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  // Same result when run twice: the update is keyed on the Stripe ID.
  await db.orders.update({ stripePaymentIntentId: paymentIntent.id }, { status: 'paid', paidAt: new Date() })

  const order = await db.orders.findOne({ stripePaymentIntentId: paymentIntent.id })
  if (!order.receiptSentAt) {
    await emailService.sendReceipt(order)
    await db.orders.update({ id: order.id }, { receiptSentAt: new Date() })
  }

  // The accounting call carries a stable reference, so the accounting side can reject a repeat.
  await accountingService.recordPayment({
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    reference: paymentIntent.id,
  })
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await db.subscriptions.update(
    { stripeSubscriptionId: subscription.id },
    { status: 'canceled', canceledAt: new Date() },
  )
  await emailService.sendCancellationConfirmation(subscription.customer as string)
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
  // Disputes have evidence deadlines, so notify the team immediately.
  await slackService.sendUrgent('#billing-alerts', {
    text: `New dispute ${dispute.id}: ${dispute.amount / 100} ${dispute.currency.toUpperCase()}, reason ${dispute.reason}`,
  })
  await db.disputes.upsert({
    stripeDisputeId: dispute.id,
    amount: dispute.amount,
    reason: dispute.reason,
    evidenceDueBy: new Date(dispute.evidence_details!.due_by! * 1000),
  })
}

worker.on('failed', (job, err) => {
  console.error(`Webhook failed: ${job?.data.type} (${job?.data.eventId}): ${err.message}`)
  if (job && job.attemptsMade >= 3) {
    void slackService.send('#engineering-alerts', `Webhook failing repeatedly: ${job.data.type}: ${err.message}`)
  }
})
```

Two things to know about this design:

- The receipt-sent flag and the processed-events row make a retry skip work that already happened. There is still a small window between sending the email and writing `receiptSentAt`; if exactly-once matters for a side effect, pass the event ID as an idempotency key to that service.
- Stripe does not guarantee event order. A handler for `customer.subscription.updated` should fetch the current object from the Stripe API, or compare `created`, rather than trust the order of arrival.

## Step 4: Dashboard and Health Check

Bull Board shows job counts by state, job data and errors, and retries failed jobs. It can retry and delete jobs, so protect it and bind it to localhost, behind your VPN or reverse proxy:

```typescript
// admin/dashboard.ts
import { timingSafeEqual } from 'node:crypto'
import express from 'express'
import { Queue } from 'bullmq'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { makeConnection } from '../lib/redis'

const webhookQueue = new Queue('stripe-webhooks', { connection: makeConnection() })
const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')
createBullBoard({ queues: [new BullMQAdapter(webhookQueue)], serverAdapter })

const expected = Buffer.from(`Basic ${Buffer.from(`admin:${process.env.ADMIN_PASSWORD}`).toString('base64')}`)

function basicAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const given = Buffer.from(req.headers.authorization ?? '')
  // timingSafeEqual throws on different lengths, so check the length first
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    res.setHeader('WWW-Authenticate', 'Basic')
    return res.status(401).send('Unauthorized')
  }
  next()
}

const app = express()
app.use('/admin/queues', basicAuth, serverAdapter.getRouter())
app.get('/health/queue', basicAuth, async (_req, res) => {
  const counts = await webhookQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
  res.json({ queue: 'stripe-webhooks', counts, healthy: counts.failed < 100 && counts.waiting < 1000 })
})
app.listen(3001, '127.0.0.1', () => console.log('Queue dashboard: http://127.0.0.1:3001/admin/queues'))
```

The thresholds (100 failed, 1,000 waiting) are examples; set them from your own traffic and alert from your monitoring system.

## Step 5: Document the Runbook with Docusaurus

The pipeline is only as reliable as the team's ability to operate it, so Sam writes the runbook (how to replay a failed event, what each alert means, how to rotate `STRIPE_WEBHOOK_SECRET`) as a Docusaurus site, following the `docusaurus` skill:

```bash
npx create-docusaurus@latest webhook-docs classic --typescript
cd webhook-docs && npm start      # dev server on http://localhost:3000
```

Pages go in `docs/` as Markdown with `sidebar_position` front matter; `npm run build` produces the static site.

## Real-World Example

Sam's team runs this for a month. Stripe's dashboard shows deliveries to the endpoint succeeding on the first attempt, because the route only verifies and enqueues. When the accounting service has an outage, the rate-limited worker retries each event with backoff instead of failing the whole request, and Bull Board lists the exhausted jobs. After the service recovers, Sam retries them in bulk from the dashboard, and the processed-events table keeps the replay from double-sending receipts. Failed jobs stay for 30 days for investigation; completed ones are cleaned up after 7.

## Related Skills

- **job-queue**: BullMQ queues, workers, retry and backoff, rate limiter and retention settings
- **redis**: persistence, `noeviction` and access control for the Redis that holds the jobs
- **docusaurus**: the operations runbook site for the pipeline
