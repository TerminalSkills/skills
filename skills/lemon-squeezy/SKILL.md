---
name: lemon-squeezy
description: >-
  Lemon Squeezy is a payments platform that acts as Merchant of Record for
  software, subscriptions and digital products, handling VAT and sales tax,
  invoices, license keys and a customer portal for you. Use this skill to
  create checkouts with the @lemonsqueezy/lemonsqueezy.js SDK, verify webhook
  signatures, track subscription status, or validate and activate license keys
  for a desktop app or CLI.
license: Apache-2.0
compatibility: "Node.js 20+ for @lemonsqueezy/lemonsqueezy.js 4.x; a Lemon Squeezy store and API key"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/lmsqueezy/lemonsqueezy.js
  tags:
    - payments
    - subscriptions
    - saas
    - licensing
    - webhooks
---

# Lemon Squeezy

## Overview

Lemon Squeezy is the seller of record for your sales: it collects and remits VAT and sales tax, issues invoices, runs fraud checks, hosts the checkout and a customer portal, and pays you out. You integrate through a JSON:API REST API (`https://api.lemonsqueezy.com/v1`), the official SDK `@lemonsqueezy/lemonsqueezy.js` (4.x, Node 20+), and signed webhooks. License keys have their own unauthenticated License API.

Server-side only: the API key gives full access to your stores, so never ship the SDK to the browser.

## Instructions

1. Install and create a key in Settings > API (keys made in test mode only touch test data):

```bash
npm install @lemonsqueezy/lemonsqueezy.js
```

2. Call `lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY })` once at startup.
3. Every SDK call resolves to `{ statusCode, error, data }` and does not throw on API errors. `data` is the raw JSON:API body, so the resource is at `data.data` and its fields at `data.data.attributes`. Check `error` first.
4. `createCheckout(storeId, variantId, options)` takes the store and variant IDs as positional arguments, then `checkoutData`, `checkoutOptions`, `productOptions`, `testMode`, `expiresAt`. Put your own user ID in `checkoutData.custom`. `enabledVariants` is an array of numeric variant IDs. The `dark` checkout option is deprecated; use the colour options.
5. Webhooks: create one in the dashboard (or `createWebhook`) with a signing secret and the events you need. At minimum `order_created`, `subscription_created`, `subscription_updated`, `subscription_payment_success`; add `license_key_created` for license keys. Lemon Squeezy POSTs JSON with `X-Event-Name` and `X-Signature` headers and expects a 200; otherwise it retries up to three more times with exponential backoff.
6. Verify `X-Signature` as the HMAC-SHA256 hex digest of the raw request body (not re-serialised JSON), compared with `crypto.timingSafeEqual`.
7. Event name is `meta.event_name`; your checkout custom data arrives in `meta.custom_data`; the resource is `data` (`data.id`, `data.attributes`). Subscription status values: `on_trial`, `active`, `paused`, `past_due`, `unpaid`, `cancelled`, `expired`.
8. License API (`activateLicense`, `validateLicense`, `deactivateLicense`) needs no API key, so it is safe to call from a desktop app. Activation returns an `instance.id` to store and pass to later validations.

## Examples

### Checkout link for a signed-in user

```typescript
import { lemonSqueezySetup, createCheckout } from "@lemonsqueezy/lemonsqueezy.js";

lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY! });

export async function proCheckoutUrl(userId: string, email: string) {
  const { data, error } = await createCheckout(
    process.env.LEMONSQUEEZY_STORE_ID!,
    process.env.LEMONSQUEEZY_PRO_VARIANT_ID!,
    {
      checkoutData: { email, custom: { user_id: userId } },
      productOptions: { redirectUrl: "https://app.northwind.dev/billing/success" },
    },
  );
  if (error) throw new Error(`Checkout failed: ${error.message}`);
  return data.data.attributes.url; // redirect the browser here
}
```

Result: a hosted checkout URL like `https://northwind.lemonsqueezy.com/checkout/custom/...`.

### Webhook endpoint (Express)

```typescript
import crypto from "node:crypto";
import express from "express";

const app = express();

app.post("/api/webhooks/lemonsqueezy", express.raw({ type: "application/json" }), async (req, res) => {
  const digest = Buffer.from(
    crypto.createHmac("sha256", process.env.LEMONSQUEEZY_WEBHOOK_SECRET!).update(req.body).digest("hex"),
    "utf8",
  );
  const signature = Buffer.from(req.get("X-Signature") ?? "", "utf8");
  if (digest.length !== signature.length || !crypto.timingSafeEqual(digest, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const payload = JSON.parse(req.body.toString("utf8"));
  const { event_name, custom_data } = payload.meta;
  const { id, attributes } = payload.data;

  switch (event_name) {
    case "subscription_created":
    case "subscription_updated":
      await db.users.update(custom_data?.user_id, {
        lemonSubscriptionId: id,
        subscriptionStatus: attributes.status,
        renewsAt: attributes.renews_at,
        endsAt: attributes.ends_at,
      });
      break;
    case "license_key_created":
      await db.licenses.create({ key: attributes.key, userId: custom_data?.user_id });
      break;
  }
  res.json({ received: true });
});
```

Result: `curl` with a wrong signature gets 401; a real `subscription_created` updates the user and returns `{"received":true}`.

### Activate and validate a license in a desktop app

```typescript
import os from "node:os";
import { activateLicense, validateLicense } from "@lemonsqueezy/lemonsqueezy.js";

const key = "38b1460a-5104-4067-a91d-77b872934d51";

const { data: act } = await activateLicense(key, `${os.hostname()}-${os.platform()}`);
if (!act?.activated) throw new Error(act?.error ?? "Activation failed");
const instanceId = act.instance!.id; // persist locally

const { data: check } = await validateLicense(key, instanceId);
console.log(check?.valid, `${check?.license_key.activation_usage}/${check?.license_key.activation_limit}`);
```

Result: `true 1/3` for a key with a three-device limit.

## Guidelines

- Fulfil from webhooks, never from the checkout redirect; webhooks can arrive more than once, so make handlers idempotent (key on `data.id` plus `event_name`).
- Subscription cancellation starts a grace period until `ends_at`; access should last until `subscription_expired`, not end at `subscription_cancelled`.
- Test mode and live mode are separate stores of data with separate API keys and webhooks; set both up before launch.
- Parse the signature against the raw body. Re-serialising `req.body` breaks the hash.
- Amounts are in cents. License API errors come back in `error` on the body, with `valid`/`activated` false.
- Check the list of prohibited products and payout terms before building on it; Lemon Squeezy, not you, is the seller.
