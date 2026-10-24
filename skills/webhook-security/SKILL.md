---
name: webhook-security
description: >-
  Verifies webhook signatures, blocks replayed requests and deduplicates
  retries on a webhook receiver. Use when a user asks to verify webhook
  signatures, prevent replay attacks, handle webhook retries, or build a secure
  webhook endpoint for Stripe, GitHub, Slack, or any HMAC-signing provider.
license: Apache-2.0
compatibility: 'Any language/framework'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/stripe/stripe-node
  tags:
    - webhooks
    - security
    - signatures
    - hmac
    - api
---

# Webhook Security

## Overview

Webhooks deliver real-time data to your app, but an open endpoint is an attack surface. Without verification, anyone can POST fake events to your webhook URL. This skill covers signature verification, replay protection, idempotency, and reliable processing patterns.

## Instructions

### Step 1: Signature Verification

Every major provider signs webhook payloads with HMAC. Verify before processing.

```typescript
// lib/webhooks/verify.ts — Generic HMAC verification
import crypto from 'crypto'

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  // timingSafeEqual THROWS (ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH) when lengths differ
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export function verifyHmacSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: string = 'sha256'
): boolean {
  const expected = crypto
    .createHmac(algorithm, secret)
    .update(payload)
    .digest('hex')
  return safeEqual(signature, expected)
}
```

Providers differ in header name, prefix (`sha256=`), encoding (hex or base64) and what is signed (body only, or timestamp + body). Read the provider's docs for each, and keep the secret in an environment variable.

### Step 2: Stripe Webhook Verification

```typescript
// routes/webhooks/stripe.ts — Stripe webhook handler
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!) // current stripe-node: 23.x

export async function handleStripeWebhook(req: Request) {
  const body = await req.text()                    // raw body, NOT parsed JSON
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', (err as Error).message)
    return new Response('Invalid signature', { status: 400 })
  }

  // Process event idempotently (see Step 3)
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object)
      break
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object)
      break
    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(event.data.object)
      break
  }

  return new Response('OK', { status: 200 })
}
```

`constructEvent` checks the `t=` timestamp in the header against a 5-minute tolerance by default. Never pass a tolerance of `0`: that disables the recency check. On runtimes without Node's `crypto` sync API (Cloudflare Workers, Deno, browsers) use `await stripe.webhooks.constructEventAsync(body, sig, secret)`. Each Stripe endpoint has its own `whsec_` secret; the Stripe CLI prints a different one for `stripe listen`.

### Step 3: Replay Protection and Idempotency

```typescript
// lib/webhooks/idempotency.ts — Prevent duplicate processing
import { redis } from '../redis'

export async function processOnce(
  eventId: string,
  handler: () => Promise<void>
): Promise<boolean> {
  // Set with NX (only if not exists) and a 3-day expiry (Stripe retries for up to 3 days)
  const isNew = await redis.set(`webhook:${eventId}`, '1', 'NX', 'EX', 259200)

  if (!isNew) {
    console.log(`Duplicate webhook ${eventId}, skipping`)
    return false
  }

  try {
    await handler()
    return true
  } catch (err) {
    // Remove key so retry can work
    await redis.del(`webhook:${eventId}`)
    throw err
  }
}

// Usage: Stripe retries for up to three days, so the key must outlive a retry
// window you care about. Better still, make the handler itself idempotent.
await processOnce(event.id, async () => {
  await db.order.update({ where: { stripeSessionId: session.id }, data: { status: 'paid' } })
})
```

### Step 4: GitHub Webhook Verification

```typescript
// routes/webhooks/github.ts — GitHub webhook handler
import crypto from 'crypto'
import { safeEqual } from '../../lib/webhooks/verify'

function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  return safeEqual(signature, expected) // from lib/webhooks/verify.ts
}

export async function handleGitHubWebhook(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('x-hub-signature-256') ?? ''
  const deliveryId = req.headers.get('x-github-delivery') // unique per delivery; use as the dedup key

  if (!verifyGitHubSignature(body, sig, process.env.GITHUB_WEBHOOK_SECRET!)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const event = req.headers.get('x-github-event')
  const payload = JSON.parse(body)

  switch (event) {
    case 'push':
      await handlePush(payload)
      break
    case 'pull_request':
      await handlePR(payload)
      break
  }

  return new Response('OK', { status: 200 })
}
```

GitHub expects a 2XX within 10 seconds on github.com, otherwise the delivery counts as failed. `X-GitHub-Delivery` is the dedup key for `processOnce`. Treat the payload as UTF-8.

### Step 5: Slack Request Verification

Slack signs `v0:{timestamp}:{raw body}` with the signing secret and sends `X-Slack-Signature` (`v0=` + hex) and `X-Slack-Request-Timestamp`. Reject timestamps older than five minutes yourself, because the signature alone does not stop a replay.

```typescript
// routes/webhooks/slack.ts
import crypto from 'crypto'
import { safeEqual } from '../../lib/webhooks/verify'

export async function handleSlackRequest(req: Request) {
  const body = await req.text()
  const ts = req.headers.get('x-slack-request-timestamp') ?? ''
  const sig = req.headers.get('x-slack-signature') ?? ''

  if (!/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return new Response('Stale request', { status: 400 })
  }
  const expected = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET!)
    .update(`v0:${ts}:${body}`)
    .digest('hex')

  if (!safeEqual(sig, expected)) return new Response('Invalid signature', { status: 401 })
  return new Response('OK', { status: 200 })
}
```

### Step 6: Keep the Raw Body (Express)

`express.json()` re-serializes the body and breaks the signature. Mount the raw parser on the webhook route before any global JSON middleware:

```typescript
import express from 'express'
const app = express()

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  // req.body is a Buffer here
  const event = stripe.webhooks.constructEvent(
    req.body, req.headers['stripe-signature']!, process.env.STRIPE_WEBHOOK_SECRET!)
  res.sendStatus(200)
})
app.use(express.json()) // after the webhook routes
```

## Examples

### Example 1: Stripe handler returns 400 on every real event

A user says: "Stripe webhooks work with `stripe trigger` but fail in production with `No signatures found matching the expected signature for payload`." The usual causes, in order: the body was parsed by `express.json()` (Step 6), the production endpoint uses the CLI's `whsec_` secret instead of the dashboard endpoint's, or a proxy rewrote the body. Fix: raw-body route, secret from `STRIPE_WEBHOOK_SECRET` for that endpoint. Result: `constructEvent` returns the event and the endpoint answers 200.

### Example 2: Retried GitHub delivery created two orders

A user says: "My GitHub app opened two deployments for one push." GitHub does not redeliver failed deliveries automatically, but a person or a redelivery script can resend one, and a slow handler (over 10 seconds) is counted as failed. Dedupe on `X-GitHub-Delivery`. Wrap the handler in `processOnce(deliveryId, ...)`, return 202 immediately and do the work on a queue. Result: a repeated delivery with the same ID logs `Duplicate webhook ... skipping` and nothing runs twice.

## Guidelines

- ALWAYS verify signatures before processing. Never trust unverified webhooks.
- Use `crypto.timingSafeEqual` through a helper that checks lengths first; it throws on unequal lengths, which would turn a forged short header into a 500. Regular `===` leaks timing information.
- Check a timestamp window (Stripe: built in, 5 min; Slack: do it yourself) in addition to deduplicating event IDs.
- Respond 4xx for bad signatures and 2xx once the event is safely stored; a 5xx makes the provider retry.
- Rotate secrets on leak; never log the secret or the full signature header.
- Parse the raw body for verification, not JSON-parsed data (parsing may alter the payload).
- Implement idempotency — webhooks are at-least-once delivery; you WILL receive duplicates.
- Return 200 quickly and process asynchronously (queue) to avoid timeout retries.
- Store webhook event IDs for at least as long as the provider retries (Stripe: up to three days, so 48h is too short for it) to detect replays.
