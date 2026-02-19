---
name: square
description: >-
  Accept payments and manage commerce with Square. Use when a user asks to
  accept in-person and online payments, process credit cards, manage inventory,
  handle subscriptions, or build a POS integration.
license: Apache-2.0
compatibility: 'Any platform via REST API, mobile SDKs'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: payments
  tags:
    - square
    - payments
    - pos
    - ecommerce
    - subscriptions
---

# Square

## Overview

Square handles both online and in-person payments — credit cards, Apple Pay, Google Pay, and POS hardware. APIs cover payments, subscriptions, invoices, catalog, inventory, and customers. Popular for businesses that sell both online and in stores.

## Instructions

### Step 1: Online Payment

```typescript
// lib/square.ts — Process a payment
import { Client, Environment } from 'square'

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: Environment.Production,
})

export async function createPayment(amount: number, currency: string, sourceId: string) {
  const { result } = await client.paymentsApi.createPayment({
    sourceId,         // payment token from Web Payments SDK
    idempotencyKey: crypto.randomUUID(),
    amountMoney: {
      amount: BigInt(amount),    // in smallest currency unit (cents)
      currency,
    },
  })
  return result.payment
}
```

### Step 2: Web Payments SDK (Frontend)

```typescript
// components/SquarePayment.tsx — Payment form
const payments = Square.payments(appId, locationId)
const card = await payments.card()
await card.attach('#card-container')

document.getElementById('pay-btn').addEventListener('click', async () => {
  const result = await card.tokenize()
  if (result.status === 'OK') {
    // Send result.token to your server
    await fetch('/api/pay', {
      method: 'POST',
      body: JSON.stringify({ sourceId: result.token, amount: 2999 }),
    })
  }
})
```

### Step 3: Catalog and Inventory

```typescript
// Manage products and inventory
const { result } = await client.catalogApi.upsertCatalogObject({
  idempotencyKey: crypto.randomUUID(),
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

## Guidelines

- Square charges 2.9% + $0.30 per online transaction. In-person: 2.6% + $0.10.
- No monthly fees for basic processing. Subscriptions start at $0/month.
- Square is strongest for omnichannel (online + physical store) — synced inventory and customers.
- For online-only SaaS billing, Stripe or Paddle are usually better choices.
