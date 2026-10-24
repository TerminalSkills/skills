---
title: Build a Webhook Signature Verification System
slug: build-webhook-signature-verification-system
description: Build a production-grade webhook receiving system with HMAC signature verification, replay attack prevention, idempotent processing, and automatic retry handling.
skills:
  - typescript
  - hono
  - redis
  - postgresql
category: development
tags:
  - webhooks
  - security
  - hmac
  - idempotency
  - api-integration
---

# Build a Webhook Signature Verification System

## The Problem

Elena runs integrations at a 30-person fintech. They receive webhooks from Stripe, GitHub, Shopify and a few partners with their own senders: payment confirmations, order events, deploy hooks. But the endpoint is wide open: no signature verification, no replay protection, no idempotency checks. A penetration test showed that anyone could POST a fake `payment_intent.succeeded` event and trigger an account credit. Last month a retry storm processed the same payment four times. Securing the pipeline comes before they process another dollar.

## The Solution

Three layers, each a small Hono middleware:

1. **Verify** the signature over the raw request body, in constant time, before anything is parsed or acted on.
2. **Reject replays** with the provider's own timestamp window (Stripe's library enforces 5 minutes by default) or, for partner webhooks you define, a signed timestamp.
3. **Deduplicate** by the provider's event or delivery id with a Redis `SET ... NX`, with a unique index in PostgreSQL as the durable backstop.

Each provider signs differently, so use the vendor's scheme and, where one exists, its official library. Stripe's SDK parses the `t=` and `v1=` parts of the header, checks every `v1` signature and enforces the timestamp tolerance. GitHub (`X-Hub-Signature-256`) and Shopify (`X-Shopify-Hmac-SHA256`) are HMAC-SHA256 over the raw body, differing in header name and encoding (hex with a `sha256=` prefix versus base64). Some providers do not use a shared-secret HMAC at all: Plaid sends a signed JWT in `Plaid-Verification`, verified with the key from `/webhook_verification_key/get`, and Twilio signs the full URL plus sorted form parameters, which its helper library validates. Use their libraries for those; do not force them into the HMAC shape below.

Use ES modules (`npm pkg set type=module`). Install: `npm i hono @hono/node-server ioredis pg stripe`, and `npm i -D typescript tsx @types/node @types/pg`.

## Step-by-Step Walkthrough

### Step 1: Signature verification middleware

The middleware reads the body once, as text. The signature covers those exact bytes, so never verify against `JSON.stringify(JSON.parse(body))`.

```typescript
// src/middleware/webhook-verify.ts
import type { MiddlewareHandler } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type Verified = { id: string; type: string; payload: any };
export type Env = { Variables: { webhook: Verified & { provider: string } } };

// Each verifier gets the RAW body (a string, never re-serialized JSON) and returns the event or throws.
export const verifiers = {
  stripe: (raw: string, h: Headers, secret: string): Verified => {
    // Checks every v1 signature in the header and rejects timestamps older than 300 s.
    const event = stripe.webhooks.constructEvent(raw, h.get("stripe-signature") ?? "", secret);
    return { id: event.id, type: event.type, payload: event };
  },
  github: (raw: string, h: Headers, secret: string): Verified => {
    const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    if (!safeEqual(h.get("x-hub-signature-256") ?? "", expected)) throw new Error("bad signature");
    return { id: h.get("x-github-delivery") ?? "", type: h.get("x-github-event") ?? "", payload: JSON.parse(raw) };
  },
  shopify: (raw: string, h: Headers, secret: string): Verified => {
    const expected = createHmac("sha256", secret).update(raw).digest("base64");
    if (!safeEqual(h.get("x-shopify-hmac-sha256") ?? "", expected)) throw new Error("bad signature");
    // X-Shopify-Webhook-Id is unique per delivery attempt group; Shopify says to dedupe on it.
    return { id: h.get("x-shopify-webhook-id") ?? "", type: h.get("x-shopify-topic") ?? "", payload: JSON.parse(raw) };
  },
  // For your own partners: HMAC-SHA256 over `${timestamp}.${body}`, with a freshness window.
  generic: (raw: string, h: Headers, secret: string): Verified => {
    const ts = Number(h.get("x-webhook-timestamp"));
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) throw new Error("stale timestamp");
    const expected = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
    if (!safeEqual(h.get("x-webhook-signature") ?? "", expected)) throw new Error("bad signature");
    const payload = JSON.parse(raw);
    return { id: h.get("x-webhook-id") ?? payload.id ?? "", type: payload.type ?? "unknown", payload };
  },
} as const;

export function webhookVerify(provider: keyof typeof verifiers, secret: string): MiddlewareHandler<Env> {
  return async (c, next) => {
    const raw = await c.req.text();
    try {
      const event = verifiers[provider](raw, c.req.raw.headers, secret);
      if (!event.id) return c.json({ error: "Missing event id" }, 400);
      c.set("webhook", { provider, ...event });
    } catch {
      return c.json({ error: "Invalid signature" }, 401);
    }
    await next();
  };
}
```

The `generic` verifier is the scheme to give your own partners: `HMAC-SHA256(secret, "<unix-timestamp>.<raw body>")` in `X-Webhook-Signature`, with the timestamp in `X-Webhook-Timestamp`. Signing the timestamp means an attacker cannot refresh an old capture by changing the header.

### Step 2: Idempotency

Providers retry on timeouts and non-2xx responses, and a delivery can legitimately arrive twice. The first request claims the event id in Redis; later ones get a 200 without side effects. The claim is released if the handler fails, so the provider's retry is processed.

```typescript
// src/middleware/idempotency.ts
import type { MiddlewareHandler } from "hono";
import type { Env } from "./webhook-verify.js";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const TTL_SECONDS = 7 * 24 * 3600;

export function idempotencyCheck(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const { provider, id } = c.get("webhook");
    const key = `webhook:seen:${provider}:${id}`;

    // SET key value EX ttl NX -> "OK" when we claimed it, null when it already existed.
    const claimed = await redis.set(key, String(Date.now()), "EX", TTL_SECONDS, "NX");
    if (claimed === null) return c.json({ status: "already_processed", id }, 200);

    try {
      await next();
      if (c.res.status >= 500) await redis.del(key); // let the provider retry
    } catch (err) {
      await redis.del(key); // handler crashed: release the claim so the retry is processed
      throw err;
    }
  };
}
```

Redis keys can be lost (eviction, restart), so the handler below also writes to PostgreSQL with a unique index. Create it once:

```sql
CREATE TABLE webhook_log (
  id          bigserial PRIMARY KEY,
  provider    text        NOT NULL,
  event_id    text        NOT NULL,
  event_type  text        NOT NULL,
  payload     jsonb       NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
```

### Step 3: Routes

Order matters: verify, then deduplicate, then do work. The Stripe handler writes the log row and does its work in one PostgreSQL transaction. If the row already exists the event was processed, even when Redis forgot it, and the handler returns early. If the work throws, the transaction rolls back, so the log row disappears and the provider's retry is processed instead of being skipped as a duplicate. Handlers should also be harmless when run twice (note the `payment_status <> 'paid'` guard).

```typescript
// src/routes/webhooks.ts
import { Hono } from "hono";
import { Pool, type PoolClient } from "pg";
import { webhookVerify, type Env } from "../middleware/webhook-verify.js";
import { idempotencyCheck } from "../middleware/idempotency.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = new Hono<Env>();

// The unique (provider, event_id) index is the durable backstop if Redis loses its keys.
async function logEvent(db: Pick<PoolClient, "query">, provider: string, id: string, type: string, payload: unknown): Promise<boolean> {
  const r = await db.query(
    `INSERT INTO webhook_log (provider, event_id, event_type, payload)
     VALUES ($1, $2, $3, $4) ON CONFLICT (provider, event_id) DO NOTHING`,
    [provider, id, type, JSON.stringify(payload)],
  );
  return r.rowCount === 1;
}

// Log + work commit together or not at all.
async function processOnce(
  provider: string, id: string, type: string, payload: unknown,
  work: (db: PoolClient) => Promise<void>,
): Promise<void> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    if (await logEvent(db, provider, id, type, payload)) await work(db);
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
}

app.post(
  "/webhooks/stripe",
  webhookVerify("stripe", process.env.STRIPE_WEBHOOK_SECRET!),
  idempotencyCheck(),
  async (c) => {
    const { provider, id, type, payload } = c.get("webhook");
    await processOnce(provider, id, type, payload, async (db) => {
      if (type === "payment_intent.succeeded") {
        await db.query(
          "UPDATE orders SET payment_status = 'paid', paid_at = NOW() WHERE stripe_payment_id = $1 AND payment_status <> 'paid'",
          [payload.data.object.id],
        );
      } else if (type === "invoice.payment_failed") {
        const inv = payload.data.object;
        await db.query(
          "INSERT INTO payment_failures (customer_id, invoice_id, amount, failed_at) VALUES ($1, $2, $3, NOW())",
          [inv.customer, inv.id, inv.amount_due / 100],
        );
      }
    });
    return c.json({ received: true });
  },
);

app.post(
  "/webhooks/github",
  webhookVerify("github", process.env.GITHUB_WEBHOOK_SECRET!),
  idempotencyCheck(),
  async (c) => {
    const { provider, id, type, payload } = c.get("webhook");
    await logEvent(pool, provider, id, type, payload);
    return c.json({ received: true });
  },
);

export default app;
```

Serve it with `@hono/node-server` and keep the app behind HTTPS. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (the `whsec_...` value for this endpoint), `GITHUB_WEBHOOK_SECRET`, `REDIS_URL` and `DATABASE_URL` from your secret store, never in the repository.

### Step 4: Test it

Stripe's SDK can generate a correctly signed header for tests, so you do not need the live dashboard. Check the three cases that matter: a valid signature passes, a tampered body fails, a stale timestamp fails.

```typescript
const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_test" });
await app.request("/webhooks/stripe", { method: "POST", headers: { "stripe-signature": header }, body });          // 200
await app.request("/webhooks/stripe", { method: "POST", headers: { "stripe-signature": header }, body: body + " " }); // 401
const old = stripe.webhooks.generateTestHeaderString({
  payload: body, secret: "whsec_test", timestamp: Math.floor(Date.now() / 1000) - 900,
});
await app.request("/webhooks/stripe", { method: "POST", headers: { "stripe-signature": old }, body });              // 401
```

Run with `npx tsx`. For a live end-to-end check, `stripe listen --forward-to localhost:3000/webhooks/stripe` prints a temporary signing secret to use as `STRIPE_WEBHOOK_SECRET`, and `stripe trigger payment_intent.succeeded` sends a real signed event.

## Real-World Example

Elena's team ships the middleware behind the existing `/webhooks/stripe` and `/webhooks/github` URLs. In the first week the log shows two classes of rejected requests: scanners posting unsigned JSON (401 at the verify layer, nothing reaches the handlers) and a handful of Stripe retries that hit the dedupe path and return 200 without touching the orders table. The replayed pen-test request is now rejected on its signature, and the retried payment event can no longer credit an account twice, because both Redis and the `UNIQUE (provider, event_id)` index stand in the way.

## Related Skills

- [typescript](../skills/typescript/) for the strict typing of the middleware and context variables
- [hono](../skills/hono/) for the routing and middleware layer
- [redis](../skills/redis/) for the atomic `SET NX` claim
- [postgresql](../skills/postgresql/) for the audit log and unique-index backstop
