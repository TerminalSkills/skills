---
name: square
description: >-
  Square is a payments and commerce platform with REST APIs and SDKs for online
  card payments, in-person POS, catalog, inventory, subscriptions, invoices and
  customers. Use when a user asks to accept in-person and online payments,
  process credit cards, manage inventory, handle subscriptions, verify Square
  webhooks, or build a POS integration.
license: Apache-2.0
compatibility: 'Any platform via REST API, mobile SDKs; Node.js 18+ for the TypeScript SDK'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  tags:
    - square
    - payments
    - pos
    - ecommerce
    - subscriptions
  repository: https://github.com/square/square-nodejs-sdk
---

# Square

## Overview

Square handles online and in-person payments (cards, Apple Pay, Google Pay, POS hardware). The APIs cover payments, orders, subscriptions, invoices, catalog, inventory, customers and webhooks. It is popular for businesses that sell both online and in a store.

The Node.js package `square` was rewritten in v40: the client is `SquareClient` (not `Client`), the token option is `token`, the environment is `SquareEnvironment`, and resources are flat properties such as `client.payments.create(...)` (not `client.paymentsApi.createPayment`). Older tutorials, and the previous version of this skill, use the removed API. Old code can keep working through `import { Client } from "square/legacy"` while you migrate. Current package version: 46.x (September 2026). Money amounts are `BigInt` in the smallest currency unit.

## Instructions

### Step 1: Install and create a client

```bash
npm install square
```

Use a sandbox access token while developing (Developer Dashboard, your application, Sandbox). Keep tokens in environment variables.

```typescript
// lib/square.ts
import { SquareClient, SquareEnvironment } from 'square'

export const square = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN!,
  environment:
    process.env.SQUARE_ENV === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
})
```

### Step 2: Take a card payment

Frontend: load the Web Payments SDK (`https://sandbox.web.squarecdn.com/v1/square.js` for sandbox, `https://web.squarecdn.com/v1/square.js` for production), tokenize the card, and send only the token to your server.

```typescript
// components/SquarePayment.ts
const payments = window.Square.payments(appId, locationId)
const card = await payments.card()
await card.attach('#card-container')

document.getElementById('pay-btn')!.addEventListener('click', async () => {
  const result = await card.tokenize()
  if (result.status === 'OK') {
    await fetch('/api/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: result.token, amount: 2999 }),
    })
  } else {
    console.error(result.errors)
  }
})
```

Backend:

```typescript
// app/api/pay/route.ts
import { randomUUID } from 'crypto'
import { SquareError } from 'square'
import { square } from '@/lib/square'

export async function POST(req: Request) {
  const { sourceId, amount } = await req.json()
  try {
    const { payment } = await square.payments.create({
      sourceId,                          // token from the Web Payments SDK
      idempotencyKey: randomUUID(),      // reuse the same key when retrying the same charge
      locationId: process.env.SQUARE_LOCATION_ID!,
      amountMoney: { amount: BigInt(amount), currency: 'USD' },
    })
    return Response.json({ id: payment?.id, status: payment?.status })
  } catch (err) {
    if (err instanceof SquareError) {
      return Response.json({ errors: err.body }, { status: err.statusCode })
    }
    throw err
  }
}
```

`BigInt` does not serialize with `JSON.stringify`; never return the raw payment object, return the fields you need.

### Step 3: Catalog and inventory

```typescript
const { catalogObject } = await square.catalog.object.upsert({
  idempotencyKey: randomUUID(),
  object: {
    type: 'ITEM',
    id: '#coffee-mug',
    itemData: {
      name: 'Coffee Mug',
      variations: [{
        type: 'ITEM_VARIATION',
        id: '#coffee-mug-regular',
        itemVariationData: {
          name: 'Regular',
          pricingType: 'FIXED_PRICING',
          priceMoney: { amount: BigInt(1499), currency: 'USD' },
        },
      }],
    },
  },
})
```

Temporary ids starting with `#` are replaced by real ids in the response; use the returned ids for inventory counts and orders. If a method name differs in your installed version, check `reference.md` in the SDK repository.

### Step 4: Webhooks

Verify every webhook against the raw request body before acting on it:

```typescript
import { WebhooksHelper } from 'square'

const valid = await WebhooksHelper.verifySignature({
  requestBody: rawBody,                                   // the unparsed string
  signatureHeader: request.headers.get('x-square-hmacsha256-signature') ?? '',
  signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!,
  notificationUrl: 'https://shop.bluefinbikes.com/api/square/webhook',
})
if (!valid) return new Response('invalid signature', { status: 401 })
```

`verifySignature` is async and returns a `Promise<boolean>`: without `await`, `!valid` is never true and every request passes. `notificationUrl` must be exactly the URL registered in the Developer Dashboard.

## Examples

**"Charge a customer $29.99 with a card on my checkout page."** Add the Web Payments SDK card form, tokenize, POST the token and `2999` to `/api/pay` as in Step 2. A successful response is `{"id":"…","status":"COMPLETED"}`; declined cards throw a `SquareError` with the reason in `err.body.errors`. Test with the sandbox card number 4111 1111 1111 1111 any future expiry and CVV 111.

**"Add a coffee mug at $14.99 to the catalog."** Run the Step 3 upsert with the sandbox token. The item then shows in the Square Dashboard under Items, with the real ids in `catalogObject.id`.

**"Migrate my old Square code to the new SDK."** Upgrade to `square@^40`, then rename `new Client({ accessToken, environment: Environment.Production })` to `new SquareClient({ token, environment: SquareEnvironment.Production })`, and `client.paymentsApi.createPayment({...})` to `client.payments.create({...})`. The result is the payload itself (`const { payment } = ...`), not `{ result }`. Until done, `import { Client } from 'square/legacy'` keeps old calls running.

## Guidelines

- Card processing fees (US, standard rates): 2.9% + 30 cents for payments made through the API, 2.6% + 15 cents for in-person tap, dip or swipe on the free plan. Rates differ by country and plan; check squareup.com/pricing.
- Always send a unique `idempotencyKey` per logical operation and reuse it on retries, so a network failure cannot double charge.
- Never handle raw card numbers on your server; use the tokens from the Web Payments SDK.
- Sandbox and production use different tokens, application ids and script URLs; do not mix them.
- Square is strongest for omnichannel (online plus a physical store) with synced inventory and customers. For online-only SaaS billing, Stripe or Paddle are usually better fits.
