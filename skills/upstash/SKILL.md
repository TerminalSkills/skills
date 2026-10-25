---
name: upstash
description: >-
  Upstash is a serverless data platform with HTTP-based Redis, rate limiting,
  QStash message delivery and Workflow for durable functions. Use when adding
  caching, sessions, rate limiting, delayed jobs, cron schedules or multi-step
  background workflows to Vercel, Next.js, Cloudflare Workers or AWS Lambda
  apps that cannot hold persistent connections.
license: Apache-2.0
compatibility: 'Node.js or any edge runtime with fetch; Upstash account; REST and QStash tokens'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/upstash/redis-js
  tags: "redis, qstash, serverless, edge, rate-limiting"
---

# Upstash: Serverless Redis, QStash and Workflow

## Overview

Upstash sells serverless building blocks that talk HTTP, so they work from Vercel, Cloudflare Workers, Netlify, Deno and Lambda without connection pools:

- **Redis** via `@upstash/redis` (REST client; any Redis client also works over TCP) and `@upstash/ratelimit`.
- **QStash**: delivers an HTTP request to your endpoint with retries, delays, cron schedules and fan-out (`@upstash/qstash`).
- **Workflow**: durable multi-step functions on top of QStash (`@upstash/workflow`).
- Also in the current catalog: Vector, Search, Box (sandboxes) and Blob. Upstash Kafka no longer appears in the current docs or product list, so do not build on it.

Pricing changes; read https://upstash.com/pricing/redis and the QStash pricing page rather than trusting numbers in code comments. At the time of checking the Redis free tier was one database with 250 MB of data and 500K commands per month.

## Instructions

### Step 1: Install and configure

```bash
npm install @upstash/redis @upstash/ratelimit @upstash/qstash @upstash/workflow
```

Create a database in the Upstash Console (console.upstash.com) and copy the REST credentials into the environment. Never commit them, and never expose them to browser code.

```bash
UPSTASH_REDIS_REST_URL="https://eu1-calm-lynx-12345.upstash.io"
UPSTASH_REDIS_REST_TOKEN="AbCdEf..."
QSTASH_TOKEN="eyJVc2VySUQi..."
QSTASH_CURRENT_SIGNING_KEY="sig_..."
QSTASH_NEXT_SIGNING_KEY="sig_..."
```

### Step 2: Caching and sessions with Redis

```typescript
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();   // UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

async function getCachedUser(userId: string): Promise<User> {
  const cached = await redis.get<User>(`user:${userId}`);   // JSON is (de)serialized for you
  if (cached) return cached;

  const user = await db.users.findById(userId);
  await redis.set(`user:${userId}`, user, { ex: 3600 });     // 1 hour TTL
  return user;
}

// Session as a hash with a 24 h TTL
await redis.hset(`session:${sessionId}`, { userId: "42", role: "admin" });
await redis.expire(`session:${sessionId}`, 86400);
const session = await redis.hgetall<{ userId: string; role: string }>(`session:${sessionId}`);

// One HTTP round-trip for several commands
const pipe = redis.pipeline();
pipe.incr("stats:page-views");
pipe.sadd("stats:visitors", "usr_42");
const [views] = await pipe.exec<[number, number]>();
```

The client auto-deserializes JSON, so a stored string like `"123"` may come back as a number. Store plain strings only if you handle that.

### Step 3: Rate limiting

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),   // also fixedWindow, tokenBucket
  analytics: true,
  prefix: "ratelimit:api",
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const { success, limit, remaining, reset, pending } = await ratelimit.limit(ip);
  await pending;   // analytics and multi-region sync finish here; on edge use waitUntil(pending)

  if (!success) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(reset),
      },
    });
  }
  return Response.json({ ok: true });
}
```

### Step 4: QStash messages and schedules

```typescript
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

// One-off delivery with retries and a delay
await qstash.publishJSON({
  url: "https://shop.vercel.app/api/process-order",   // must be publicly reachable
  body: { orderId: "ord-123", action: "fulfill" },
  retries: 3,
  delay: "30s",
  callback: "https://shop.vercel.app/api/order-done",
  failureCallback: "https://shop.vercel.app/api/order-failed",
});

// Recurring (cron, UTC unless a timezone is set)
await qstash.schedules.create({
  destination: "https://shop.vercel.app/api/daily-report",
  cron: "0 9 * * *",
});
```

Anyone can POST to your endpoint, so verify the QStash signature before acting:

```typescript
import { Receiver } from "@upstash/qstash";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(req: Request) {
  const body = await req.text();   // verify the raw body, before JSON.parse
  const valid = await receiver.verify({
    signature: req.headers.get("upstash-signature") ?? "",
    body,
  });
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const { orderId } = JSON.parse(body);
  await fulfillOrder(orderId);
  return new Response("ok");
}
```

For Next.js there are wrappers, `verifySignatureAppRouter` from `@upstash/qstash/nextjs`.

### Step 5: Workflow for multi-step jobs

```typescript
// app/api/fulfill/route.ts
import { serve } from "@upstash/workflow/nextjs";

export const { POST } = serve<{ orderId: string }>(async (context) => {
  const { orderId } = context.requestPayload;

  const order = await context.run("fetch-order", async () => db.orders.findById(orderId));

  await context.run("charge-payment", async () => {
    await stripe.paymentIntents.create({ amount: order.totalCents, currency: "usd", customer: order.customerId });
  });

  await context.sleep("wait-for-fulfillment", "1h");   // no compute is used while sleeping

  await context.run("send-shipping-notification", async () => {
    await resend.emails.send({ from: "orders@shop.example", to: order.email, subject: "Order shipped" });
  });
});
```

Start a run from server code:

```typescript
import { Client } from "@upstash/workflow";

const client = new Client({ token: process.env.QSTASH_TOKEN! });
const { workflowRunId } = await client.trigger({
  url: "https://shop.vercel.app/api/fulfill",
  body: { orderId: "ord-123" },
  retries: 3,
});
```

For local development set `QSTASH_DEV=true`; the SDK starts a local QStash server and handles signatures. Each `context.run` step is retried and memoized, so keep side effects inside steps and make them idempotent. `zod` is a peer dependency of `@upstash/workflow`.

## Examples

### Example 1: Protect an API route from abuse

**User prompt:** "Limit our /api/search endpoint to 20 requests per minute per IP, on Vercel."

The agent installs `@upstash/ratelimit @upstash/redis`, adds the two env vars, creates a `Ratelimit` with `slidingWindow(20, "1 m")`, calls `limit(ip)` at the top of the handler and returns 429 with the `X-RateLimit-*` headers on failure. Result: the 21st request in a minute gets `429 Too Many Requests`, and the Upstash dashboard shows the analytics.

### Example 2: Send a reminder email 24 hours after signup

**User prompt:** "Email new users a tip 24 hours after they sign up, even if our server restarts."

The agent adds a Workflow endpoint with `await context.sleep("wait-a-day", "24h")` followed by a `context.run("send-tip", ...)` step, triggers it from the signup handler with `client.trigger({ url, body: { userId } })`, and checks the run in the Workflow dashboard. No cron job or queue worker is needed.

## Guidelines

- Use the REST client (`@upstash/redis`) on edge runtimes; a long-running server can use a normal Redis client over TCP instead.
- Every command is billed on pay-as-you-go plans: set TTLs, pipeline related commands, and set a monthly budget on the database.
- Always verify QStash signatures (or use `serve()` from Workflow, which does it) on public endpoints.
- QStash cannot reach `localhost`; use `QSTASH_DEV=true` with Workflow or a tunnel for local tests.
- Delivery is at-least-once: make handlers idempotent (use the message id or an order id as a key).
- On serverless, wait for the rate limiter's `pending` promise (or pass it to `waitUntil`) so analytics are not dropped.
- Keep the REST token server-side; a leaked token gives full read/write to the database.
