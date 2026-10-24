---
title: Build an API Sandbox Environment
slug: build-api-sandbox-environment
description: Build an API sandbox environment with isolated test data, mock payment processing, realistic responses, rate limit simulation, and developer onboarding for safe API integration testing.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - sandbox
  - api
  - testing
  - developer-experience
  - integration
---

# Build an API Sandbox Environment

## The Problem

Lisa leads developer experience at a 20-person payments API company. Developers integrating the API need to test without moving real money. Today a "test" key still hits the production database and rate limiter, and a customer's load test in test mode filled production tables with test rows. Sandbox responses also differ slightly from production, which causes integration bugs on launch day. The team needs a sandbox with its own database, mock payment processing with predictable outcomes, the same response shapes as production, rate limits that behave like production, and seed data for new developers.

## The Solution

One Hono app serves both modes. A middleware looks the API key up in a table, and every `sk_test_` key is bound to the sandbox Postgres database (a separate database, not a flag in production tables). Payments go through a mock processor driven by test tokens. Failures, latency and rate limiting are simulated on request, so a developer's test suite is deterministic.

## Step-by-Step Walkthrough

### Step 1: Sandbox database and keys

Keys are random, stored only as SHA-256 hashes, and mapped to an organization. Never infer the organization from the key text.

```sql
-- sandbox database only
CREATE TABLE api_keys  (key_hash text PRIMARY KEY, org_id text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE customers (id text PRIMARY KEY, org_id text NOT NULL, name text, email text, created_at timestamptz DEFAULT now());
CREATE TABLE products  (id text PRIMARY KEY, org_id text NOT NULL, name text, price integer, currency text, created_at timestamptz DEFAULT now());
CREATE TABLE payments  (id text PRIMARY KEY, org_id text NOT NULL, customer_id text, amount integer, currency text, status text, created_at timestamptz DEFAULT now());
CREATE INDEX ON customers (org_id);
CREATE INDEX ON payments (org_id);
```

```typescript
// src/sandbox/keys.ts
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';

export const sandboxDb = new Pool({ connectionString: process.env.SANDBOX_DATABASE_URL });
const hash = (key: string) => createHash('sha256').update(key).digest('hex');

export async function createSandboxKey(orgId: string): Promise<string> {
  const key = `sk_test_${randomBytes(24).toString('base64url')}`;
  await sandboxDb.query('INSERT INTO api_keys (key_hash, org_id) VALUES ($1, $2)', [hash(key), orgId]);
  await seedSandbox(orgId);
  return key; // shown once
}

export async function orgForKey(key: string): Promise<string | null> {
  const { rows } = await sandboxDb.query('SELECT org_id FROM api_keys WHERE key_hash = $1', [hash(key)]);
  return rows[0]?.org_id ?? null;
}

export async function seedSandbox(orgId: string) {
  const customers = ['Test Customer', 'Test Enterprise Corp', 'Sandbox User'];
  for (const name of customers) {
    await sandboxDb.query(
      'INSERT INTO customers (id, org_id, name, email) VALUES ($1, $2, $3, $4)',
      [`cus_test_${randomBytes(6).toString('hex')}`, orgId, name, `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`],
    );
  }
  for (const [name, price] of [['Basic Plan', 999], ['Pro Plan', 2999], ['Enterprise', 9999]] as const) {
    await sandboxDb.query(
      "INSERT INTO products (id, org_id, name, price, currency) VALUES ($1, $2, $3, $4, 'usd')",
      [`prod_test_${randomBytes(6).toString('hex')}`, orgId, name, price],
    );
  }
}

export async function resetSandbox(orgId: string) {
  for (const table of ['payments', 'customers', 'products']) {
    await sandboxDb.query(`DELETE FROM ${table} WHERE org_id = $1`, [orgId]);
  }
  await seedSandbox(orgId);
}
```

Production keys (`sk_live_`) are handled by a separate code path with its own database pool, so a sandbox request can never reach production data.

### Step 2: Middleware for auth, rate limits and simulated failures

Random failures break a developer's CI, so errors and latency are opt-in per request. The rate limit is real, with a deliberately low limit and the same headers production sends.

```typescript
// src/sandbox/middleware.ts
import { createMiddleware } from 'hono/factory';
import { Redis } from 'ioredis';
import { orgForKey } from './keys';

const redis = new Redis(process.env.REDIS_URL!); // use a Redis dedicated to the sandbox
const LIMIT = 25;        // requests per window, lower than production on purpose
const WINDOW_SECONDS = 60;

export type SandboxEnv = { Variables: { orgId: string } };

export const sandbox = createMiddleware<SandboxEnv>(async (c, next) => {
  const key = c.req.header('Authorization')?.replace(/^Bearer /, '') ?? '';
  const orgId = key.startsWith('sk_test_') ? await orgForKey(key) : null;
  if (!orgId) {
    return c.json({ error: { type: 'authentication_error', message: 'Invalid sandbox API key' } }, 401);
  }
  c.set('orgId', orgId);
  c.header('X-Sandbox', 'true');

  const bucket = `rl:${orgId}:${Math.floor(Date.now() / 1000 / WINDOW_SECONDS)}`;
  const count = await redis.incr(bucket);
  if (count === 1) await redis.expire(bucket, WINDOW_SECONDS);
  c.header('X-RateLimit-Limit', String(LIMIT));
  c.header('X-RateLimit-Remaining', String(Math.max(0, LIMIT - count)));
  if (count > LIMIT) {
    c.header('Retry-After', String(WINDOW_SECONDS));
    return c.json({ error: { type: 'rate_limit_error', message: 'Too many requests' } }, 429);
  }

  // Opt-in chaos: X-Sandbox-Simulate: error | latency
  const simulate = c.req.header('X-Sandbox-Simulate');
  if (simulate === 'latency') await new Promise((r) => setTimeout(r, 2000));
  if (simulate === 'error') {
    return c.json({ error: { type: 'api_error', message: 'Simulated server error (sandbox)' } }, 500);
  }
  await next();
});
```

### Step 3: Mock payments with test tokens

Do not accept card numbers in the sandbox. A real integration should send a token from your client-side library, so the sandbox exposes fixed test tokens, each with a known outcome. Validate the body with Zod.

```typescript
// src/sandbox/payments.ts
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { sandbox, type SandboxEnv } from './middleware';
import { sandboxDb, resetSandbox } from './keys';

const OUTCOMES: Record<string, { status: 'succeeded' | 'failed' | 'requires_action'; code?: string }> = {
  tok_success: { status: 'succeeded' },
  tok_declined: { status: 'failed', code: 'card_declined' },
  tok_insufficient_funds: { status: 'failed', code: 'insufficient_funds' },
  tok_expired_card: { status: 'failed', code: 'expired_card' },
  tok_requires_action: { status: 'requires_action' },
};

const PaymentBody = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).toLowerCase(),
  customer_id: z.string(),
  source: z.string(),
});

export const app = new Hono<SandboxEnv>().use(sandbox);

app.post('/v1/payments', async (c) => {
  const parsed = PaymentBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: { type: 'invalid_request_error', message: z.prettifyError(parsed.error) } }, 400);
  }
  const body = parsed.data;
  const outcome = OUTCOMES[body.source];
  if (!outcome) {
    return c.json({ error: { type: 'invalid_request_error', message: `Unknown test token. Use one of: ${Object.keys(OUTCOMES).join(', ')}` } }, 400);
  }

  const id = `pay_test_${randomBytes(12).toString('hex')}`;
  await sandboxDb.query(
    'INSERT INTO payments (id, org_id, customer_id, amount, currency, status) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, c.get('orgId'), body.customer_id, body.amount, body.currency, outcome.status],
  );
  return c.json({
    id,
    status: outcome.status,
    amount: body.amount,
    currency: body.currency,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    ...(outcome.code && { last_payment_error: { code: outcome.code } }),
  }, outcome.status === 'failed' ? 402 : 201);
});

app.post('/v1/sandbox/reset', async (c) => {
  await resetSandbox(c.get('orgId'));
  return c.json({ reset: true });
});
```

The sandbox and production handlers should share one serializer function (or the same OpenAPI schema), so response fields cannot drift apart. Add a contract test that runs the same request against both and compares the JSON shape.

### Step 4: Serve it on localhost or behind your gateway

```typescript
// src/server.ts
import { serve } from '@hono/node-server';
import { app } from './sandbox/payments';

serve({ fetch: app.fetch, port: 8787, hostname: '127.0.0.1' }); // put TLS and public access at the gateway
```

```console
$ curl -s -X POST http://127.0.0.1:8787/v1/payments \
    -H "Authorization: Bearer $SANDBOX_KEY" -H 'Content-Type: application/json' \
    -d '{"amount":2999,"currency":"usd","customer_id":"cus_test_1","source":"tok_declined"}'
```

## Real-World Example

Lisa's team publishes the token list and the `X-Sandbox-Simulate` header in the docs. A customer's load test now hits only the sandbox database and the low rate limit, so production is untouched. Their integration suite exercises the decline, insufficient-funds and requires-action paths with fixed tokens, and one `X-Sandbox-Simulate: error` call per run checks that their retry code works. When they switch to a `sk_live_` key the only change is the key, because the response shapes come from the same serializer.

## Related Skills

- [typescript](../skills/typescript/SKILL.md): typed middleware and handlers
- [redis](../skills/redis/SKILL.md): rate-limit counters
- [postgresql](../skills/postgresql/SKILL.md): the isolated sandbox database
- [hono](../skills/hono/SKILL.md): the API app and middleware
- [zod](../skills/zod/SKILL.md): request validation
