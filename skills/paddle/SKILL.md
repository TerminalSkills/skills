---
name: paddle
description: >-
  Paddle is a merchant-of-record payments platform that sells software on a
  company's behalf and handles checkout, subscriptions, sales tax, VAT and
  invoicing. Use when a user asks to add subscription billing without handling
  tax compliance, accept international payments, integrate Paddle Checkout or
  Paddle webhooks, build a SaaS billing system on Paddle Billing, or let
  customers manage and cancel subscriptions.
license: Apache-2.0
compatibility: 'Paddle Billing API v1 over HTTPS from any backend; official SDKs for Node.js 20+, Python, Go and PHP; Paddle.js v2 in the browser'
metadata:
  author: terminal-skills
  version: "1.1.0"
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

This skill covers **Paddle Billing**, the current product (every account created after 2023-08-08). Paddle Classic is a separate legacy product with a different API (`vendors.paddle.com/api`, Paddle.js v1, `Paddle.Setup()`); do not mix the two. Much older material on the web describes Classic.

An integration has three parts: Paddle.js opens the checkout in the browser, a webhook endpoint keeps your database in sync, and the server-side API changes subscriptions.

## Instructions

### Step 1: Accounts, keys and catalog

Sandbox and live are separate accounts with separate data, credentials and dashboards. Build against sandbox first.

| | Sandbox | Live |
|---|---|---|
| Dashboard | `sandbox-vendors.paddle.com` | `vendors.paddle.com` |
| API base URL | `https://sandbox-api.paddle.com` | `https://api.paddle.com` |
| API key (server only) | `pdl_sdbx_apikey_…` | `pdl_live_apikey_…` |
| Client-side token (browser) | `test_…` | `live_…` |

Create both credentials in **Paddle > Developer tools > Authentication**. Give the API key only the permissions the app needs and an expiry date. Create products and prices in the dashboard or the API; a price ID looks like `pri_01gsz8x8sawmvhz1pv30nge1ke`.

```bash
npm install @paddle/paddle-node-sdk @paddle/paddle-js
```

```bash
# .env.local
PADDLE_API_KEY=                    # pdl_sdbx_apikey_… — never sent to the browser
PADDLE_WEBHOOK_SECRET=             # pdl_ntfset_… — one per notification destination
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=   # test_… — safe to publish
```

### Step 2: Checkout Integration

```tsx
// components/SubscribeButton.tsx — Paddle.js overlay checkout
'use client'
import { useEffect, useState } from 'react'
import { initializePaddle, type Paddle } from '@paddle/paddle-js'

export function SubscribeButton({ priceId, userId, email }: { priceId: string; userId: string; email: string }) {
  const [paddle, setPaddle] = useState<Paddle>()

  useEffect(() => {
    initializePaddle({
      environment: 'sandbox',                               // omit for live
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,  // test_… in sandbox, live_… in production
    }).then(setPaddle)
  }, [])

  const openCheckout = () =>
    paddle?.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: { email },
      customData: { userId },   // copied to the subscription and to every later transaction
      settings: { displayMode: 'overlay', successUrl: 'https://app.fieldnote.io/billing/success' },
    })

  return <button onClick={openCheckout} disabled={!paddle}>Subscribe</button>
}
```

Without a bundler, load the script from Paddle's CDN (never self-host it) and call the same methods on the global:

```html
<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
<script>
  Paddle.Environment.set('sandbox')   // sandbox only; remove for live
  Paddle.Initialize({ token: 'test_7d279f61a3499fed520f7cd8c08' })
</script>
```

`Paddle.Initialize()` may be called once per page; use `Paddle.Update()` afterwards. Pass an `eventCallback` to it to react to `checkout.completed` or `checkout.closed` in the page.

### Step 3: Webhook Handler

Create a notification destination in **Paddle > Developer tools > Notifications**, choose its events and copy its secret key.

```typescript
// app/api/paddle/webhook/route.ts — Process Paddle events
import { Paddle, Environment, EventName } from '@paddle/paddle-node-sdk'

const paddle = new Paddle(process.env.PADDLE_API_KEY!, {
  environment: Environment.sandbox,   // omit for live
})

export async function POST(req: Request) {
  const rawBody = await req.text()    // the raw body, never a re-serialized JSON object
  const signature = req.headers.get('paddle-signature') ?? ''

  let event
  try {
    // unmarshal() is async: it verifies the signature, then returns a typed event
    event = await paddle.webhooks.unmarshal(rawBody, process.env.PADDLE_WEBHOOK_SECRET!, signature)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:   // renewals, upgrades, pauses, past_due, scheduled cancels
    case EventName.SubscriptionCanceled: {
      const sub = event.data
      await db.subscription.upsert({
        where: { paddleSubscriptionId: sub.id },
        create: { paddleSubscriptionId: sub.id, paddleCustomerId: sub.customerId,
                  userId: (sub.customData as { userId?: string } | null)?.userId,
                  status: sub.status, priceId: sub.items[0]?.price?.id, updatedAt: event.occurredAt },
        update: { status: sub.status, priceId: sub.items[0]?.price?.id, updatedAt: event.occurredAt },
      })
      break
    }
    case EventName.TransactionCompleted:
      // one-time purchases and renewals: record event.data.id for receipts or fulfilment
      break
  }

  return new Response('OK')
}
```

Grant access from `status`: `trialing`, `active` and `past_due` keep access (show a payment warning for `past_due`); `paused` and `canceled` do not. A subscription with a `scheduledChange` to cancel stays `active` until the period ends.

### Step 4: API Usage

```typescript
// lib/paddle.ts — Manage subscriptions server-side
import { Paddle, Environment } from '@paddle/paddle-node-sdk'
const paddle = new Paddle(process.env.PADDLE_API_KEY!, { environment: Environment.sandbox })

// Create a customer
const customer = await paddle.customers.create({
  email: 'maya.okafor@fieldnote.io',
  name: 'Maya Okafor',
})

// list() returns a paginated collection, not a promise — iterate it
for await (const sub of paddle.subscriptions.list({ customerId: [customer.id], status: ['active', 'past_due'] })) {
  console.log(sub.id, sub.status, sub.nextBilledAt)
}

// Cancel at the end of the billing period (the default); 'immediately' cancels right away
await paddle.subscriptions.cancel('sub_01h04vsc0qhwtsbsxh3422wjs4', {
  effectiveFrom: 'next_billing_period',
})

// Upgrade or downgrade: send the full new items list and say how to bill the difference
await paddle.subscriptions.update('sub_01h04vsc0qhwtsbsxh3422wjs4', {
  items: [{ priceId: 'pri_01gsz8x8sawmvhz1pv30nge1ke', quantity: 1 }],
  prorationBillingMode: 'prorated_immediately',
})
```

The SDK uses camelCase (`customData`, `effectiveFrom`); the HTTP API uses snake_case (`custom_data`, `effective_from`). Raw requests send `Authorization: Bearer $PADDLE_API_KEY` and JSON bodies.

## Examples

### Example 1: Sell a Pro plan in a Next.js app and test it in sandbox

**User request:** "Add a $29/month Pro subscription to our Next.js app with Paddle and unlock the plan when the payment goes through."

1. In the sandbox dashboard create the product "Fieldnote Pro" with a monthly price and copy the `pri_…` ID. Set a default payment link under **Paddle > Checkout > Checkout settings** (sandbox accepts any URL, such as `https://localhost/`); without one the checkout fails with `transaction_default_checkout_url_not_set`.
2. Add the three variables from Step 1, the `SubscribeButton` from Step 2 and the webhook route from Step 3.
3. Expose the local route through a tunnel and register `https://fieldnote-dev.ngrok-free.dev/api/paddle/webhook` as a notification destination for `subscription.created`, `subscription.updated`, `subscription.canceled` and `transaction.completed`.
4. Render the button with the signed-in user:

```tsx
<SubscribeButton priceId="pri_01gsz8x8sawmvhz1pv30nge1ke" userId={session.user.id} email={session.user.email} />
```

5. Pay in the overlay with the sandbox test card `4242 4242 4242 4242`, any name, any future expiry (`4000 0000 0000 0002` is declined).

Result: the overlay shows the success page and redirects to `successUrl`. Paddle delivers `subscription.created` with `status: "active"` and your `customData.userId`, followed by `transaction.completed`; the handler writes the subscription row and the app unlocks Pro from `status`. The webhook simulator in the dashboard can replay the same scenario without a checkout.

### Example 2: "Manage billing" link through the customer portal

**User request:** "Customers email us to change their card or cancel. Give them a self-service billing page."

```typescript
// app/api/billing/portal/route.ts
import { Paddle, Environment } from '@paddle/paddle-node-sdk'
const paddle = new Paddle(process.env.PADDLE_API_KEY!, { environment: Environment.sandbox })   // omit the option for live

export async function POST() {
  const { paddleCustomerId, paddleSubscriptionId } = await getBillingForCurrentUser()
  const session = await paddle.customerPortalSessions.create(paddleCustomerId, [paddleSubscriptionId])
  return Response.json({ url: session.urls.general.overview })
}
```

The response is a link such as `https://customer-portal.paddle.com/cpl_01j7zbyqs3vah3aafp4jf62qaw?action=overview&token=pga_…`. Redirect the browser to it: the customer can update the payment method, download invoices and cancel. `session.urls.subscriptions[0]` holds deep links for one subscription (`cancelSubscription`, `updateSubscriptionPaymentMethod`). The token is temporary — create a session per click, do not store the URL and do not embed the portal in an iframe. A cancellation arrives at the webhook as `subscription.updated` with a scheduled change, then `subscription.canceled` at period end.

## Guidelines

- Paddle is a merchant of record — it handles VAT, sales tax, invoices. You receive net payouts.
- Pay-as-you-go pricing is 5% + 50¢ per checkout transaction. Higher than Stripe, but includes tax compliance.
- Paddle Billing handles both subscriptions and one-time purchases: a price without a billing cycle is a one-time item.
- Best for indie devs and small teams who don't want to deal with global tax registration.
- **Verify every webhook** with `unmarshal()` or `isSignatureValid()` on the raw request body. Parsing and re-serializing the JSON changes the signed payload and verification fails. The SDK rejects events whose timestamp is more than five seconds old.
- **Answer webhooks with 200 within five seconds** and do slow work afterwards. Paddle retries failed deliveries (3 times in 15 minutes in sandbox, 60 times over 3 days in live), so handlers must be idempotent.
- **Delivery order is not guaranteed.** Compare `occurredAt` with the stored value before overwriting a row.
- **Never put an API key in frontend code.** The browser gets the client-side token only; the API also blocks direct browser calls. Paddle scans public GitHub repositories and revokes exposed keys.
- **Default payment link and going live:** every account needs a default payment link before a checkout or transaction can be created. Sandbox accepts any URL; the live account needs website approval first, and the link must be a page on an approved domain that loads Paddle.js. Sandbox credentials against the live API, or the reverse, return `forbidden`.
- **Rate limits:** most operations allow 240 requests per minute per IP; a 429 carries a `Retry-After` header.
- Keys created before 2025-05-06 are legacy 50-character keys without permissions; replace them with `pdl_` keys.
