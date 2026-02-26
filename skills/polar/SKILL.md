---
name: polar
description: >-
  Monetize open-source and digital products with Polar — payment and billing
  platform for developers. Use when someone asks to "monetize open source",
  "Polar", "sell API access", "developer billing", "GitHub Sponsors alternative",
  "sell digital products as a developer", or "subscription billing for SaaS".
  Covers products, subscriptions, checkout, license keys, webhooks, and
  usage-based billing.
license: Apache-2.0
compatibility: "REST API. TypeScript/Python SDKs. Stripe-powered payments."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: backend
  tags: ["monetization", "payments", "polar", "billing", "open-source", "subscriptions"]
---

# Polar

## Overview

Polar is a payment and billing platform built for developers — monetize APIs, SaaS products, digital downloads, and open-source projects. Unlike Stripe (which is a payment primitive), Polar handles the full billing stack: product catalog, checkout, subscriptions, license keys, usage metering, and customer portal. Designed specifically for indie hackers and developer-focused businesses.

## When to Use

- Selling API access with usage-based billing
- Monetizing an open-source project (paid features, support tiers)
- Selling digital products (courses, templates, ebooks)
- Subscription billing for a SaaS product
- Need a merchant of record (Polar handles tax/VAT)

## Instructions

### Setup

```bash
npm install @polar-sh/sdk
```

### Create Products and Checkout

```typescript
// billing.ts — Set up products and generate checkout links
import { Polar } from "@polar-sh/sdk";

const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN });

// Create a product
const product = await polar.products.create({
  name: "Pro Plan",
  description: "Unlimited API calls, priority support",
  prices: [
    { type: "recurring", amount: 2900, currency: "usd", interval: "month" },
    { type: "recurring", amount: 29000, currency: "usd", interval: "year" },
  ],
});

// Generate checkout URL
const checkout = await polar.checkouts.create({
  productId: product.id,
  successUrl: "https://myapp.com/success?session_id={CHECKOUT_SESSION_ID}",
  customerEmail: "customer@example.com",
  metadata: { userId: "user_123" },
});

console.log(checkout.url); // Send customer here to pay
```

### Webhooks

```typescript
// webhooks.ts — Handle billing events
import { validateEvent } from "@polar-sh/sdk/webhooks";

export async function handleWebhook(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("webhook-signature")!;

  const event = validateEvent(body, signature, process.env.POLAR_WEBHOOK_SECRET!);

  switch (event.type) {
    case "subscription.created":
      await activateSubscription(event.data.customer.email, event.data.product.id);
      break;

    case "subscription.canceled":
      await deactivateSubscription(event.data.customer.email);
      break;

    case "order.created":
      // One-time purchase
      await deliverProduct(event.data.customer.email, event.data.product.id);
      break;
  }

  return new Response("OK");
}
```

### License Keys

```typescript
// license.ts — Generate and validate license keys
const license = await polar.licenseKeys.create({
  productId: product.id,
  customerId: "cust_xxx",
  activations: { limit: 3 },  // Max 3 devices
  expiresAt: new Date("2027-01-01"),
});

// Validate in your app
const validation = await polar.licenseKeys.validate({
  key: "POLAR-XXXX-XXXX-XXXX",
  organizationId: "org_xxx",
});

if (validation.valid) {
  console.log(`License active until ${validation.expiresAt}`);
}
```

### Usage-Based Billing

```typescript
// usage.ts — Meter API usage for billing
// Report usage events
await polar.meters.record({
  customerId: "cust_xxx",
  meterId: "api-calls",
  value: 1,
  timestamp: new Date(),
});

// Customer sees usage on their portal
// Billing happens automatically based on usage tiers
```

## Examples

### Example 1: Monetize an API

**User prompt:** "I built a public API and want to charge for it — free tier (100 calls/day) and paid tier ($29/mo unlimited)."

The agent will set up Polar products with free/paid tiers, integrate API key validation, meter usage, and handle subscription lifecycle.

### Example 2: Sell a developer tool

**User prompt:** "I have a CLI tool. Sell it with license keys and a 14-day trial."

The agent will create a Polar product, generate checkout, issue license keys on purchase, and add license validation to the CLI.

## Guidelines

- **Merchant of record** — Polar handles VAT/tax, you get payouts
- **Checkout links** — generate and redirect, Polar handles the payment UI
- **Webhooks for events** — subscription created/canceled, order completed
- **License keys for software** — activation limits, expiry, validation API
- **Usage metering** — record events, Polar calculates billing
- **Customer portal** — customers manage their own subscriptions
- **GitHub integration** — issue-based rewards, sponsor tiers
- **No Stripe dashboard needed** — Polar wraps Stripe with developer UX
- **Multi-currency** — USD, EUR, GBP supported
- **Free tier: 0% fees for first $1K/mo** — then 5%
