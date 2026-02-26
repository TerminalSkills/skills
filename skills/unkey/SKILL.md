---
name: unkey
description: >-
  Add API key management and rate limiting to your API with Unkey — open-source
  API authentication infrastructure. Use when someone asks to "add API keys to
  my API", "rate limit my API", "API key management", "Unkey", "usage-based
  API billing", "issue API keys to customers", or "per-customer rate limits".
  Covers key creation, verification, rate limiting, usage tracking, and
  analytics.
license: Apache-2.0
compatibility: "Any HTTP API. TypeScript SDK. Self-hostable or managed cloud."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: backend
  tags: ["api", "auth", "rate-limiting", "api-keys", "unkey", "usage-billing"]
---

# Unkey

## Overview

Unkey is open-source API key management infrastructure. Create, verify, and rate-limit API keys with sub-millisecond latency at the edge. Instead of building your own key storage, rate limiter, and usage tracker, Unkey provides it as a service (or self-hosted). Issue keys to customers, set per-key rate limits, track usage for billing, and revoke keys — all through an API.

## When to Use

- Building a public API that needs API key authentication
- Per-customer rate limiting (free tier: 100 req/min, pro: 10K req/min)
- Usage-based billing (track API calls per key for invoicing)
- Temporary/expiring API keys (trial access, time-limited tokens)
- Replacing hand-rolled API key systems with a managed solution

## Instructions

### Setup

```bash
npm install @unkey/api
# Or for framework integrations:
npm install @unkey/nextjs  # Next.js middleware
npm install @unkey/hono    # Hono middleware
```

### Create an API and Issue Keys

```typescript
// admin/create-key.ts — Issue API keys to customers
import { Unkey } from "@unkey/api";

const unkey = new Unkey({ rootKey: process.env.UNKEY_ROOT_KEY! });

async function createCustomerKey(customerId: string, plan: "free" | "pro") {
  const limits = {
    free: { limit: 100, duration: 60000 },     // 100 req/min
    pro: { limit: 10000, duration: 60000 },     // 10K req/min
  };

  const { result, error } = await unkey.keys.create({
    apiId: process.env.UNKEY_API_ID!,
    prefix: "sk",                    // Key looks like: sk_1a2b3c...
    ownerId: customerId,             // Link to your customer
    name: `${customerId}-${plan}`,
    meta: { plan, createdBy: "admin" },
    ratelimit: {
      type: "fast",
      ...limits[plan],
    },
    expires: plan === "free"
      ? Date.now() + 30 * 24 * 60 * 60 * 1000  // 30-day trial
      : undefined,
  });

  if (error) throw new Error(error.message);
  return result;  // { key: "sk_1a2b3c...", keyId: "key_xxx" }
}
```

### Verify Keys in Your API

```typescript
// middleware/auth.ts — Verify API key on every request
import { verifyKey } from "@unkey/api";

async function authenticateRequest(req: Request): Promise<{
  valid: boolean;
  ownerId?: string;
  meta?: Record<string, unknown>;
  remaining?: number;
}> {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!apiKey) {
    return { valid: false };
  }

  const { result, error } = await verifyKey({
    key: apiKey,
    apiId: process.env.UNKEY_API_ID!,
  });

  if (error || !result.valid) {
    return { valid: false };
  }

  // result includes: valid, ownerId, meta, ratelimit.remaining, ratelimit.limit
  return {
    valid: true,
    ownerId: result.ownerId,
    meta: result.meta,
    remaining: result.ratelimit?.remaining,
  };
}
```

### Next.js Integration

```typescript
// middleware.ts — Next.js API route protection with Unkey
import { withUnkey } from "@unkey/nextjs";

export default withUnkey(
  async (req, res) => {
    // req.unkey contains verified key data
    const { ownerId, meta } = req.unkey!;

    return res.json({
      message: "Authenticated!",
      customer: ownerId,
      plan: meta?.plan,
    });
  },
  {
    apiId: process.env.UNKEY_API_ID!,
    onError: (req, res) => res.status(500).json({ error: "Internal error" }),
    onUnauthorized: (req, res) => res.status(401).json({ error: "Invalid API key" }),
  }
);
```

### Hono Integration

```typescript
// src/index.ts — Hono API with Unkey middleware
import { Hono } from "hono";
import { unkey } from "@unkey/hono";

const app = new Hono();

// Protect all /api/* routes
app.use("/api/*", unkey({
  apiId: process.env.UNKEY_API_ID!,
}));

app.get("/api/data", (c) => {
  const { ownerId, meta } = c.get("unkey")!;
  return c.json({ data: "secret stuff", customer: ownerId });
});
```

### Usage Tracking for Billing

```typescript
// billing/usage.ts — Track and bill API usage per customer
import { Unkey } from "@unkey/api";

const unkey = new Unkey({ rootKey: process.env.UNKEY_ROOT_KEY! });

async function getCustomerUsage(keyId: string) {
  const { result } = await unkey.keys.getVerifications({
    keyId,
    granularity: "day",
  });

  // result.verifications = [{ time: "2026-02-26", success: 1234, rateLimited: 12 }]
  const totalCalls = result!.verifications.reduce((sum, v) => sum + v.success, 0);
  const rateLimited = result!.verifications.reduce((sum, v) => sum + v.rateLimited, 0);

  return { totalCalls, rateLimited, daily: result!.verifications };
}
```

## Examples

### Example 1: Add API keys to an existing API

**User prompt:** "I have a REST API. Add API key authentication with rate limiting."

The agent will set up Unkey, create a key issuance endpoint, add verification middleware, and configure per-plan rate limits.

### Example 2: Usage-based billing for API

**User prompt:** "I need to charge customers based on how many API calls they make each month."

The agent will use Unkey's verification analytics to track calls per key, aggregate monthly usage, and generate invoices via Stripe.

## Guidelines

- **`verifyKey` on every request** — sub-millisecond at the edge
- **`ownerId` links keys to your customers** — map to your user IDs
- **`meta` for custom data** — plan, team, permissions stored with the key
- **Rate limits are per-key** — different keys can have different limits
- **Expiring keys for trials** — set `expires` timestamp on key creation
- **Revoke instantly** — deleted keys fail verification immediately
- **Prefix your keys** — `sk_` for secret keys, `pk_` for publishable
- **Self-hostable** — run Unkey yourself or use the managed cloud
- **Don't log full keys** — only the key ID for audit trails
