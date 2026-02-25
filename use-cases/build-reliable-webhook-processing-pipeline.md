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
  - bullmq
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

Sam runs the backend for a fintech startup processing payments. Their Stripe integration receives 5,000+ webhooks daily — payment succeeded, subscription updated, invoice created, dispute opened. The current webhook handler is a single API route that processes each event synchronously. When their accounting service is slow, Stripe retries the webhook, causing duplicate processing. When the server crashes during processing, events are lost entirely.

Sam needs a pipeline that: (1) acknowledges webhooks immediately so Stripe never retries, (2) processes events reliably with retries and deduplication, (3) rate-limits calls to the accounting service, and (4) provides visibility into failures.

## Step 1: Accept Webhooks and Queue Immediately

The webhook endpoint does the minimum: verify the Stripe signature and push the event onto a BullMQ queue. No business logic here — just fast acknowledgment.

```typescript
// app/api/webhooks/stripe/route.ts — Accept webhooks and queue for processing
// This endpoint must respond within 5 seconds to avoid Stripe retries

import { NextRequest, NextResponse } from 'next/server'
import { Queue } from 'bullmq'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const webhookQueue = new Queue('stripe-webhooks', {
  connection: { host: process.env.REDIS_HOST, port: 6379 },
})

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  // Verify webhook signature (rejects forged events)
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Queue the event for processing — use event ID as job ID for deduplication
  // If the same event arrives twice (Stripe retry), BullMQ ignores the duplicate
  await webhookQueue.add(event.type, {
    eventId: event.id,
    type: event.type,
    data: event.data.object,
    created: event.created,
  }, {
    jobId: event.id,               // deduplication key — same event ID = same job
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 },    // 10s, 20s, 40s, 80s, 160s
    removeOnComplete: { age: 7 * 24 * 3600 },          // keep 7 days
    removeOnFail: { age: 30 * 24 * 3600 },             // keep 30 days for debugging
  })

  // Respond immediately — Stripe sees 200 and won't retry
  return NextResponse.json({ received: true })
}
```

Using the Stripe event ID as the BullMQ job ID is the key to deduplication. If Stripe sends the same event twice (network glitch, their retry logic), BullMQ silently ignores the second add because a job with that ID already exists.

## Step 2: Process Events by Type

```typescript
// workers/stripe-worker.ts — Process different webhook event types
// Each event type has its own handler function for clean separation

import { Worker, Job } from 'bullmq'

const connection = { host: process.env.REDIS_HOST, port: 6379 }

type WebhookPayload = {
  eventId: string
  type: string
  data: Record<string, any>
  created: number
}

const handlers: Record<string, (data: Record<string, any>) => Promise<void>> = {
  'payment_intent.succeeded': handlePaymentSucceeded,
  'payment_intent.payment_failed': handlePaymentFailed,
  'customer.subscription.created': handleSubscriptionCreated,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'invoice.paid': handleInvoicePaid,
  'invoice.payment_failed': handleInvoicePaymentFailed,
  'charge.dispute.created': handleDisputeCreated,
}

const worker = new Worker<WebhookPayload>('stripe-webhooks', async (job: Job<WebhookPayload>) => {
  const { type, data, eventId } = job.data
  console.log(`Processing ${type} (${eventId})`)

  const handler = handlers[type]
  if (!handler) {
    console.log(`No handler for ${type}, skipping`)
    return { skipped: true, type }
  }

  await handler(data)
  return { processed: true, type }
}, {
  connection,
  concurrency: 10,               // process 10 events simultaneously
  limiter: {
    max: 50,                     // max 50 jobs per minute
    duration: 60000,             // (accounting service rate limit)
  },
})

// Handler implementations
async function handlePaymentSucceeded(data: Record<string, any>) {
  /**
   * Payment succeeded: update order status, send receipt, notify accounting.
   * Each step is idempotent — safe to run multiple times for the same event.
   */
  const paymentIntent = data as Stripe.PaymentIntent

  // Update order status (idempotent: SET status = 'paid' WHERE id = ?)
  await db.orders.update(
    { stripePaymentIntentId: paymentIntent.id },
    { status: 'paid', paidAt: new Date() }
  )

  // Send receipt email (check if already sent to avoid duplicates)
  const order = await db.orders.findOne({ stripePaymentIntentId: paymentIntent.id })
  if (!order.receiptSentAt) {
    await emailService.sendReceipt(order)
    await db.orders.update({ id: order.id }, { receiptSentAt: new Date() })
  }

  // Sync to accounting service
  await accountingService.recordPayment({
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    reference: paymentIntent.id,
  })
}

async function handleSubscriptionDeleted(data: Record<string, any>) {
  const subscription = data as Stripe.Subscription
  await db.subscriptions.update(
    { stripeSubscriptionId: subscription.id },
    { status: 'canceled', canceledAt: new Date() }
  )
  await emailService.sendCancellationConfirmation(subscription.customer as string)
}

async function handleDisputeCreated(data: Record<string, any>) {
  /**
   * Dispute opened: high priority — notify the team immediately.
   * Disputes have strict deadlines for evidence submission.
   */
  const dispute = data as Stripe.Dispute
  await slackService.sendUrgent('#billing-alerts', {
    text: `🚨 New dispute: ${dispute.id}, amount: $${dispute.amount / 100}, reason: ${dispute.reason}`,
  })
  await db.disputes.create({
    stripeDisputeId: dispute.id,
    amount: dispute.amount,
    reason: dispute.reason,
    evidenceDueBy: new Date(dispute.evidence_details.due_by * 1000),
  })
}

// ... other handlers follow the same pattern

worker.on('failed', (job, err) => {
  console.error(`Webhook processing failed: ${job?.data.type} (${job?.data.eventId}): ${err.message}`)
  // Alert on repeated failures
  if (job && job.attemptsMade >= 3) {
    slackService.send('#engineering-alerts', `⚠️ Webhook failing repeatedly: ${job.data.type} — ${err.message}`)
  }
})
```

Every handler is written to be idempotent — running it twice with the same data produces the same result. The receipt check (`if (!order.receiptSentAt)`) prevents duplicate emails. The database update uses the Stripe ID as the key, so updating an already-paid order is a no-op.

## Step 3: Add Monitoring Dashboard

```typescript
// admin/dashboard.ts — Bull Board for visual monitoring
// Shows queue health, job status, and lets you retry failed jobs

import express from 'express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { Queue } from 'bullmq'

const connection = { host: process.env.REDIS_HOST, port: 6379 }

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

const webhookQueue = new Queue('stripe-webhooks', { connection })

createBullBoard({
  queues: [new BullMQAdapter(webhookQueue)],
  serverAdapter,
})

const app = express()

// Basic auth protection for the dashboard
app.use('/admin/queues', (req, res, next) => {
  const auth = req.headers.authorization
  if (!auth || auth !== `Basic ${Buffer.from('admin:' + process.env.ADMIN_PASSWORD).toString('base64')}`) {
    res.setHeader('WWW-Authenticate', 'Basic')
    return res.status(401).send('Unauthorized')
  }
  next()
})

app.use('/admin/queues', serverAdapter.getRouter())
app.listen(3001, () => console.log('Queue dashboard: http://localhost:3001/admin/queues'))
```

Bull Board shows job counts by status (waiting, active, completed, failed, delayed), lets you inspect individual job data and error messages, and provides one-click retry for failed jobs. Sam's team uses it to monitor webhook processing in real-time and quickly identify issues.

## Step 4: Health Monitoring

```typescript
// lib/queue-health.ts — Health check endpoint for monitoring
import { Queue } from 'bullmq'

const webhookQueue = new Queue('stripe-webhooks', { connection })

export async function getQueueHealth() {
  /**
   * Returns queue health metrics for monitoring dashboards.
   * Alert when failed jobs exceed threshold or queue depth is too high.
   */
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    webhookQueue.getWaitingCount(),
    webhookQueue.getActiveCount(),
    webhookQueue.getCompletedCount(),
    webhookQueue.getFailedCount(),
    webhookQueue.getDelayedCount(),
  ])

  return {
    queue: 'stripe-webhooks',
    counts: { waiting, active, completed, failed, delayed },
    healthy: failed < 100 && waiting < 1000,    // alert thresholds
    timestamp: new Date().toISOString(),
  }
}
```

The result: webhook events are acknowledged in under 100ms (Stripe never retries), processing is reliable with 5 automatic retries, the accounting service is protected by rate limiting, duplicate events are silently ignored, and Sam's team has full visibility into the pipeline through Bull Board. Failed jobs from last month are still available for investigation, while old completed jobs are automatically cleaned up after 7 days.
