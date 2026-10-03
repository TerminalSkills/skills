---
name: polar
description: >-
  Polar is a merchant-of-record billing platform for software: it sells products,
  subscriptions, license keys and usage-based plans and handles international sales
  tax. Use when a developer asks to add payments or subscriptions with Polar, create
  checkout sessions, handle Polar webhooks, validate license keys, or test in the
  Polar sandbox.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+, a Polar organization and an organization access token"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["payments", "subscriptions", "license-keys", "webhooks", "billing"]
  repository: https://github.com/polarsource/polar
---

# Polar — Monetization for Developers

## Overview

Polar (polar.sh) is a billing platform that acts as the merchant of record: it collects payment, handles VAT, GST and sales tax worldwide, and pays you out. You define products (one-time, subscription, seat-based or metered), attach benefits (license keys, file downloads, Discord roles, GitHub repo access, feature flags, credits), send customers to a checkout, and react to webhooks. The Starter plan is listed at 5% plus 50 cents per transaction; check the pricing page before quoting numbers to a user.

The TypeScript SDK is `@polar-sh/sdk`. Current docs create the client with `createPolar` imported from a dated path such as `@polar-sh/sdk/2026-10`; the date pins the API version, and Polar asks production integrations to pin one. The older `@polar-sh/sdk` repository (`polarsource/polar-js`) is archived; the SDK now lives in `sdk/typescript` of `polarsource/polar`.

## Instructions

### 1. Set up and test in the sandbox

Sandbox is a fully separate environment at `sandbox.polar.sh` with its own account, organization and tokens. Create an organization access token (scope it to what you need) and keep it on the server only.

```bash
npm install @polar-sh/sdk
export POLAR_ACCESS_TOKEN=polar_oat_...   # sandbox token while testing
```

```typescript
import { createPolar } from "@polar-sh/sdk/2026-10";

export const polar = createPolar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  environment: process.env.NODE_ENV === "production" ? "production" : "sandbox",
});
```

The sandbox API base URL is `https://sandbox-api.polar.sh`; pay with Stripe test card `4242 4242 4242 4242`. Customer emails in the sandbox go only to members of your organization.

### 2. Products and benefits

Create products in the dashboard (Products) or with `polar.products.create`. A product has `name`, `prices` (each with `amount_type`: fixed, custom for pay-what-you-want, free, seat-based or metered) and, for subscriptions, `recurring_interval` (`month` or `year`) at the product level. Create benefits (License Keys, File Downloads, Discord, GitHub, Feature Flag, Custom) under Benefits and attach them to the product; Polar grants and revokes them automatically as the customer buys or cancels.

### 3. Checkout sessions

```typescript
const checkout = await polar.checkouts.create({
  products: ["8f2b0c57-61d1-4a8a-9d0a-6b1e7a2f4c11"],   // product IDs; the first is preselected
  successUrl: "https://app.acme-notes.dev/billing/success?checkout_id={CHECKOUT_ID}",
  externalCustomerId: "usr_42",                          // your own user ID
  metadata: { plan: "pro" },                             // copied to the order/subscription
});
// redirect the browser to checkout.url
```

`product_id` (singular) is deprecated; use the `products` array. When `externalCustomerId` is set the customer's email field is locked. Checkout statuses are `open`, `expired`, `confirmed` (customer clicked pay, payment not guaranteed), `succeeded` and `failed`. Do not grant access from the redirect: wait for the webhook. For a no-code option use Checkout Links; for an in-page overlay use `@polar-sh/checkout` (`PolarEmbedCheckout.init()`) and list your site under Settings, Embedding.

### 4. Webhooks

Add an endpoint in Settings, Webhooks, and keep its secret in `POLAR_WEBHOOK_SECRET`. The SDK helper needs the raw request body, not parsed JSON.

```typescript
import express from "express";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";

app.post("/webhooks/polar", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const event = validateEvent(req.body, req.headers, process.env.POLAR_WEBHOOK_SECRET ?? "");
    switch (event.type) {
      case "subscription.active":
        await db.users.update(event.data.customer.externalId, { plan: "pro" });
        break;
      case "subscription.canceled":     // may still be active until the period ends
      case "subscription.revoked":
        await db.users.update(event.data.customer.externalId, { plan: "free" });
        break;
    }
    res.status(202).send("");
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.status(403).send("");
    throw err;
  }
});
```

Useful events: `checkout.updated`, `order.created` (check `billing_reason`), `subscription.created|active|canceled|uncanceled|revoked|past_due|cycled|updated`, `customer.state_changed`, `benefit_grant.*`. Act on renewals with `subscription.cycled`, not `order.created`. Secrets created on or after 8 September 2026 follow Standard Webhooks; SDKs from 1.0.0-alpha.19 accept both. For local work, `polar listen` forwards events to your machine and `polar trigger` sends samples.

### 5. License keys

The validate and activate endpoints live under `/v1/customer-portal/license-keys/` and need no access token, so they are safe to call from a desktop or CLI app. `organization_id` is required.

```bash
curl -X POST https://api.polar.sh/v1/customer-portal/license-keys/validate \
  -H "Content-Type: application/json" \
  -d '{"key": "ACME-1C285B2D-6CE6-4BC7", "organization_id": "fda84e25-7b55-4d67-916d-60ead04ff61f", "activation_id": "b6724bc8-7ad9-4ca0-b143-7c896fcbb6fe"}'
```

`activate` takes `key`, `organization_id`, `label` (and optional `conditions`, `meta`) and returns an activation `id`; use it as `activation_id` when validating if the benefit has an activation limit. `increment_usage` charges a usage quota per call. Keys can be rotated (`POST /v1/license-keys/{id}/rotate` or from the portal); the old key stops working at once. The merchant-side endpoint `POST /v1/license-keys/validate` requires a token with `license_keys:write`.

### 6. Usage-based billing and the portal

Send events with the Events Ingestion API, define Meters over them, and add metered prices to a product. Customers manage subscriptions, invoices and license keys in the hosted Customer Portal.

### 7. Framework adapters

Maintained adapters: Next.js (`@polar-sh/nextjs`, `Checkout`, `Webhooks` handlers), Nuxt, TanStack Start, BetterAuth, Laravel. Adapters for Express, Hono, Fastify, Remix, SvelteKit and others are marked deprecated; call the SDK directly there.

## Examples

### Example 1: "Add a Pro subscription to my Next.js app"

```bash
npm install @polar-sh/nextjs
```

```typescript
// app/checkout/route.ts
import { Checkout } from "@polar-sh/nextjs";

export const GET = Checkout({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  successUrl: "https://app.acme-notes.dev/billing/success",
  environment: "sandbox",
});
```

A link to `/checkout?products=8f2b0c57-61d1-4a8a-9d0a-6b1e7a2f4c11&external_customer_id=usr_42` redirects to Polar. Result: after paying with the test card, Polar redirects to `/billing/success?checkout_id=...` and sends `subscription.active` to your webhook route.

### Example 2: "Gate my CLI behind a license key"

Create a License Keys benefit with prefix `ACME` and an activation limit of 3, attach it to a one-time product, then in the CLI call `activate` once with a label like the hostname and `validate` on each start with the stored `activation_id`. Result: a 200 response with `status: "granted"` unlocks the tool; a 404 means the key is revoked, expired or mismatched.

## Guidelines

- Never ship the organization access token in browser or desktop code; only the customer-portal license endpoints are public.
- Sandbox and production tokens, products, IDs and webhook secrets all differ; switching environments means re-creating products.
- Fulfil from webhooks, and make handlers idempotent: deliveries can be retried or redelivered.
- Pin the API version in the SDK import path; unpinned requests change at each quarterly release (January, April, July, October).
- Prefer `externalCustomerId` over matching by email.
- Polar suits software and digital goods; physical goods are not its use case.
