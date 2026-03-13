---
name: upstash
description: >-
   You are an expert in Upstash, the serverless data platform for Redis,
  Kafka, and QStash. You help developers add caching, rate limiting, session
  storage, message queuing, and scheduled jobs to serverless and edge
  applications — with HTTP-based APIs that work on Vercel Edge, Cloudflare
  Workers, and AWS Lambda without persistent connections.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Cloud & Serverless
  tags:
    - redis
    - kafka
    - qstash
    - serverless
    - edge
    - rate-limiting
    - caching
---

# Upstash — Serverless Redis, Kafka & QStash

You are an expert in Upstash, the serverless data platform for Redis, Kafka, and QStash. You help developers add caching, rate limiting, session storage, message queuing, and scheduled jobs to serverless and edge applications — with HTTP-based APIs that work on Vercel Edge, Cloudflare Workers, and AWS Lambda without persistent connections.

## Core Capabilities

### Serverless Redis

```typescript
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();            // Uses UPSTASH_REDIS_REST_URL + TOKEN

// Caching
async function getCachedUser(userId: string): Promise<User> {
  const cached = await redis.get<User>(`user:${userId}`);
  if (cached) return cached;

  const user = await db.users.findById(userId);
  await redis.set(`user:${userId}`, user, { ex: 3600 });  // 1 hour TTL
  return user;
}

// Rate limiting
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),  // 10 requests per 10 seconds
  analytics: true,
});

// In API route / middleware
const { success, limit, remaining, reset } = await ratelimit.limit(userId);
if (!success) {
  return new Response("Too Many Requests", {
    status: 429,
    headers: {
      "X-RateLimit-Limit": limit.toString(),
      "X-RateLimit-Remaining": remaining.toString(),
      "X-RateLimit-Reset": reset.toString(),
    },
  });
}

// Session storage
await redis.hset(`session:${sessionId}`, { userId: "42", role: "admin", cart: JSON.stringify(items) });
const session = await redis.hgetall(`session:${sessionId}`);
await redis.expire(`session:${sessionId}`, 86400);  // 24h TTL
```

### QStash (Serverless Message Queue)

```typescript
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

// Publish message to endpoint
await qstash.publishJSON({
  url: "https://myapp.vercel.app/api/process-order",
  body: { orderId: "ord-123", action: "fulfill" },
  retries: 3,
  delay: "30s",                           // Delay delivery by 30s
});

// Schedule recurring
await qstash.publishJSON({
  url: "https://myapp.vercel.app/api/daily-report",
  cron: "0 9 * * *",                     // Daily at 9 AM
});

// Batch
await qstash.batchJSON([
  { url: "https://myapp.vercel.app/api/send-email", body: { to: "user1@example.com" } },
  { url: "https://myapp.vercel.app/api/send-email", body: { to: "user2@example.com" } },
]);

// Callback URL (webhook when processing completes)
await qstash.publishJSON({
  url: "https://myapp.vercel.app/api/long-task",
  body: { taskId: "task-1" },
  callback: "https://myapp.vercel.app/api/task-complete",
  failureCallback: "https://myapp.vercel.app/api/task-failed",
});
```

### Upstash Workflow

```typescript
import { serve } from "@upstash/workflow/nextjs";

export const { POST } = serve(async (context) => {
  const { orderId } = context.requestPayload;

  // Step 1 (durable)
  const order = await context.run("fetch-order", async () => {
    return await db.orders.findById(orderId);
  });

  // Step 2
  await context.run("charge-payment", async () => {
    await stripe.charges.create({ amount: order.total * 100, customer: order.customerId });
  });

  // Sleep (durable)
  await context.sleep("wait-for-fulfillment", 60 * 60);  // 1 hour

  // Step 3
  await context.run("send-shipping-notification", async () => {
    await resend.emails.send({ to: order.email, subject: "Order Shipped" });
  });
});
```

## Installation

```bash
npm install @upstash/redis @upstash/ratelimit @upstash/qstash
```

## Best Practices

1. **HTTP-based** — Upstash Redis uses HTTP, not TCP; works on edge/serverless without connection pooling
2. **Rate limiting** — Use `@upstash/ratelimit` with sliding window; built for API protection on edge
3. **QStash for async** — Use QStash instead of SQS/BullMQ on serverless; delivers to any HTTP endpoint
4. **Edge-compatible** — All Upstash SDKs work on Vercel Edge, CF Workers, Deno Deploy; no Node.js APIs needed
5. **TTL on everything** — Set expiration on cache keys; prevent stale data and control costs
6. **Pipeline for batch** — Use `redis.pipeline()` for multiple operations; single HTTP round-trip
7. **Workflow for durable** — Use Upstash Workflow for multi-step processes; survives serverless timeouts
8. **Free tier** — 10K commands/day free; great for prototyping and small projects
