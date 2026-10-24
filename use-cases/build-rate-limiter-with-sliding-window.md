---
title: Build a Rate Limiter with Sliding Window
slug: build-rate-limiter-with-sliding-window
description: Build a production rate limiter using Redis sliding window — supporting per-user, per-IP, and per-API-key limits with tiered plans, retry headers, and DDoS protection.
skills:
  - typescript
  - redis
  - hono
  - zod
category: development
tags:
  - rate-limiting
  - security
  - redis
  - api
  - ddos
---

# Build a Rate Limiter with Sliding Window

## The Problem

Olga runs API infrastructure at a 30-person developer tools company. One customer ran a script that sent 50,000 requests in 10 minutes and slowed the API for everyone else. The fixed-window limiter they had has a burst problem: a client can send 100 requests at 11:59:59 and another 100 at 12:00:01, which is 200 requests in two seconds against a "100 per minute" limit. Olga needs a limiter that counts the last 60 seconds from *now*, gives each plan its own limit (free 60/min, pro 600/min, enterprise 6,000/min), and returns headers so clients can slow down on their own.

## The Solution

Use the sliding window log algorithm on a Redis sorted set: every allowed request is stored with its timestamp as the score, old entries are trimmed on each call, and the set size is the request count for the last window. The whole check runs as one Lua script, so two app instances cannot both read "59 of 60" and both let a request through. Hono serves the API, ioredis talks to Redis, and Zod checks the plan name before a limit is picked.

## Step-by-Step Walkthrough

### Step 1: Set up the project

```bash
npm install hono @hono/node-server ioredis zod
npm install -D typescript tsx @types/node
docker run -d --name ratelimit-redis -p 127.0.0.1:6379:6379 redis:7-alpine
```

This was tested with Hono 4.13, ioredis 6.0, Zod 4.6 and Redis 7. The Redis port is bound to `127.0.0.1` so other machines cannot reach it.

### Step 2: Write the limiter

The Lua script trims, counts, checks the limit and adds the request in one step. It reads the time from Redis (`TIME`), so servers with drifting clocks cannot disagree about the window. A denied request is not recorded, so a client that keeps retrying does not extend its own block. The per-day quota is a plain counter with a 24-hour expiry; keeping a million log entries per enterprise customer would cost far more memory than a counter.

```typescript
// src/rate-limiter.ts — sliding-window-log limiter with per-plan limits
import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Redis } from "ioredis";
import { z } from "zod";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");

const Plan = z.enum(["free", "pro", "enterprise"]);
type Plan = z.infer<typeof Plan>;

const PLAN_LIMITS: Record<Plan, { perMinute: number; perDay: number }> = {
  free: { perMinute: 60, perDay: 10_000 },
  pro: { perMinute: 600, perDay: 100_000 },
  enterprise: { perMinute: 6000, perDay: 1_000_000 },
};

// One Lua script = one atomic step: no race between "count" and "add".
// KEYS[1] = sorted set (sliding minute window), KEYS[2] = daily counter.
// A denied request is never recorded, so it does not extend the block.
redis.defineCommand("slidingWindow", {
  numberOfKeys: 2,
  lua: `
    local t = redis.call('TIME')
    local now = t[1] * 1000 + math.floor(t[2] / 1000)
    local window, limit, dayLimit, member = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), ARGV[4]

    redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
    local count = redis.call('ZCARD', KEYS[1])
    local day = tonumber(redis.call('GET', KEYS[2]) or '0')

    if day >= dayLimit then
      return {0, count, 0, 2, 0}
    end
    if count >= limit then
      local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
      return {0, count, tonumber(oldest[2]) + window - now, 1, 0}
    end

    redis.call('ZADD', KEYS[1], now, member)
    redis.call('PEXPIRE', KEYS[1], window)
    if redis.call('INCR', KEYS[2]) == 1 then redis.call('EXPIRE', KEYS[2], 86400) end
    return {1, count + 1, 0, 0, now}
  `,
});

declare module "ioredis" {
  interface RedisCommander<Context> {
    slidingWindow(
      minuteKey: string, dayKey: string,
      windowMs: number, limit: number, dayLimit: number, member: string,
    ): Promise<[number, number, number, number, number]>;
  }
}

export function rateLimiter() {
  return async (c: Context, next: Next) => {
    // Identify the caller: API key if sent, otherwise the TCP peer address.
    // X-Forwarded-For is client-controlled unless a proxy you run overwrites it.
    const apiKey = c.req.header("x-api-key");
    const id = apiKey
      ? `key:${apiKey}`
      : `ip:${getConnInfo(c).remote.address ?? "unknown"}`;

    const plan = Plan.catch("free").parse(c.get("userPlan"));
    const { perMinute, perDay } = PLAN_LIMITS[plan];

    const [ok, count, retryMs, reason] = await redis.slidingWindow(
      `rl:min:${id}`, `rl:day:${id}`, 60_000, perMinute, perDay, randomUUID(),
    );

    c.header("RateLimit-Limit", String(perMinute));
    c.header("RateLimit-Remaining", String(ok ? Math.max(0, perMinute - count) : 0));
    if (!ok) {
      const retryAfter = reason === 2 ? 86_400 : Math.ceil(retryMs / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "rate_limit_exceeded", plan, retryAfterSeconds: retryAfter }, 429);
    }
    await next();
  };
}

// Cheap per-second flood guard for unauthenticated traffic (fixed window is fine here).
export function floodGuard(maxPerSecond = 50) {
  return async (c: Context, next: Next) => {
    const ip = getConnInfo(c).remote.address ?? "unknown";
    const key = `flood:${ip}`;
    // INCR and PEXPIRE NX in one transaction: the key can never be left without an expiry.
    const res = await redis.multi().incr(key).pexpire(key, 1000, "NX").exec();
    const n = Number(res?.[0]?.[1] ?? 0);
    if (n > maxPerSecond) return c.text("Too Many Requests", 429);
    await next();
  };
}
```

Two choices matter here. The caller is identified by API key, or else by the TCP address of the connection. `X-Forwarded-For` is deliberately not used: any client can send that header and get a fresh limit on every request. If the service sits behind a load balancer you control, use the address that proxy sets and make sure it overwrites the header.

`floodGuard` is a separate, cheaper fixed-window counter for floods. It runs first, so attack traffic costs one `INCR` and not a sorted-set update.

### Step 3: Mount the middleware

Set `c.set("userPlan", ...)` in your auth middleware before the limiter runs. An unknown or missing plan falls back to `free` because of `Plan.catch("free")`.

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { floodGuard, rateLimiter } from "./rate-limiter.ts";

const app = new Hono();
app.use(floodGuard(50));
app.use(rateLimiter());
app.get("/", (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: Number(process.env.PORT ?? 3000) });
```

### Step 4: Check it

Send more requests than the free limit allows and look at the response. The `sleep` keeps the loop under the 50 requests per second that `floodGuard` allows; without it the flood guard answers first and you see its plain-text `429` instead.

```bash
for i in $(seq 1 62); do curl -s -o /dev/null -w "%{http_code}\n" -H "x-api-key: demo-key" http://127.0.0.1:3000/; sleep 0.05; done | sort | uniq -c
curl -si -H "x-api-key: demo-key" http://127.0.0.1:3000/ | head -6
```

```console
     60 200
      2 429
HTTP/1.1 429 Too Many Requests
content-type: application/json
ratelimit-limit: 60
ratelimit-remaining: 0
retry-after: 58
```

The headers use the `RateLimit-*` names from the IETF draft; `Retry-After` is standard HTTP. If existing clients read `X-RateLimit-*`, set those names instead.

## Real-World Example

Olga deploys the limiter on the public API and gives the customer who ran the 50,000-request script a pro key. Their script now gets 600 responses a minute and a `429` with `Retry-After` for the rest, while other customers see no change in latency. Support points customers who hit the free limit at the response body, which names the plan and the seconds to wait.

## Related Skills

- [typescript](/skills/typescript) - type-check the middleware and the Redis command declaration
- [redis](/skills/redis) - sorted sets, Lua scripts and key expiry
- [hono](/skills/hono) - the web framework and middleware chain
- [zod](/skills/zod) - validates the plan name before a limit is chosen
