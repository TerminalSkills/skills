---
name: paddle
description: >-
  Accept payments with Paddle as merchant of record. Use when a user asks to
  add subscription billing without handling tax compliance, accept international
  payments, implement a payment system where Paddle handles VAT/sales tax, or
  build a SaaS billing system.
license: Apache-2.0
compatibility: 'Any web framework via API'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: business
  tags:
    - paddle
    - payments
    - subscriptions
    - billing
    - saas
---

# Paddle

## Overview

Paddle is a merchant of record — it handles payments, tax compliance (VAT, sales tax), invoicing, and fraud protection. Unlike Stripe, you don't need to register for tax in every country. Paddle sells on your behalf and remits taxes globally.

## Instructions

### Step 1: Checkout Integration

```typescript
// components/Checkout.tsx — Paddle.js overlay checkout
declare global { interface Window { Paddle: any } }

export function PricingButton({ priceId }: { priceId: string }) {
  const handleCheckout = () => {
    window.Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: { email: 'user@example.com' },
      customData: { userId: 'usr_123' },
    })
  }

  return <button onClick={handleCheckout}>Subscribe</button>
}

// Add to layout:
// <script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
// Paddle.Initialize({ token: 'live_xxx' })
```

### Step 2: Webhook Handler

```typescript
// api/paddle/webhook.ts — Process Paddle events
import { Paddle } from '@paddle/paddle-node-sdk'

const paddle = new Paddle(process.env.PADDLE_API_KEY!)

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('paddle-signature')!

  const event = paddle.webhooks.unmarshal(body, process.env.PADDLE_WEBHOOK_SECRET!, signature)

  switch (event.eventType) {
    case 'subscription.created':
      await db.user.update({
        where: { paddleCustomerId: event.data.customerId },
        data: { plan: 'pro', subscriptionId: event.data.id },
      })
      break
    case 'subscription.canceled':
      await db.user.update({
        where: { subscriptionId: event.data.id },
        data: { plan: 'free', canceledAt: new Date() },
      })
      break
    case 'transaction.completed':
      // Payment received — update invoice records
      break
  }

  return new Response('OK')
}
```

### Step 3: API Usage

```typescript
// lib/paddle.ts — Manage subscriptions server-side
import { Paddle } from '@paddle/paddle-node-sdk'
const paddle = new Paddle(process.env.PADDLE_API_KEY!)

// Create a customer
const customer = await paddle.customers.create({
  email: 'user@example.com',
  name: 'John Doe',
})

// List subscriptions
const subscriptions = await paddle.subscriptions.list({
  customerId: [customer.id],
})

// Cancel subscription
await paddle.subscriptions.cancel(subscriptionId, {
  effectiveFrom: 'next_billing_period',
})
```

## Guidelines

- Paddle is a merchant of record — it handles VAT, sales tax, invoices. You receive net payouts.
- Paddle takes ~5% + payment processing fees. Higher than Stripe, but includes tax compliance.
- Use Paddle Billing for subscriptions, Paddle Checkout for one-time purchases.
- Best for indie devs and small teams who don't want to deal with global tax registration.
