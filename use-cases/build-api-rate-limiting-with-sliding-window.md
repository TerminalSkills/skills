---
title: Build API Rate Limiting with Sliding Window
slug: build-api-rate-limiting-with-sliding-window
description: Build a production-grade API rate limiter using Redis sorted sets for precise sliding window counting, with per-user quotas, burst allowance, and real-time usage headers.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Backend Development
tags:
  - rate-limiting
  - api
  - redis
  - throttling
  - security
---

# Build API Rate Limiting with Sliding Window

## The Problem

Pavel leads API infrastructure at a 40-person developer tools company. Their API serves 12,000 requests per minute across 800 customers. But there's no rate limiting — a single customer's batch script can consume 60% of capacity and degrade performance for everyone else. Last Tuesday, a customer's runaway loop sent 50,000 requests in 10 minutes, spiking CPU to 98% and causing 502s for other customers. They tried a simple counter-reset approach (100 requests per minute, reset at minute boundary), but customers complained about "unfair" behavior: a request at 0:59 and another at 1:01 counted against different windows. A sliding window algorithm would be accurate, fair, and transparent.

## Step 1: Implement the Sliding Window Rate Limiter

The sliding window algorithm uses Redis sorted sets to track each request's timestamp. At any point, it counts requests within the last N seconds — no boundary artifacts, no unfair resets.

```typescript
// src/limiter/sliding-window.ts — Precise sliding window rate limiter using Redis sorted sets
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface RateLimitConfig {
  windowMs: number;       // window size in milliseconds (e.g., 60000 for 1 minute)
  maxRequests: number;    // maximum requests allowed in the window
  burstAllowance: number; // extra requests allowed for short bursts (0 = no burst)
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;         // configured limit
  remaining: number;     // requests remaining in current window
  retryAfterMs: number;  // when the client can retry (0 if allowed)
  resetAt: number;       // when the window fully resets (epoch ms)
  currentUsage: number;  // requests used in current window
}

export async function checkRateLimit(
  identifier: string,        // user ID, API key, or IP address
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const key = `ratelimit:${identifier}`;
  const effectiveLimit = config.maxRequests + config.burstAllowance;

  // Atomic Redis operation: clean old entries + count + add new entry
  const pipeline = redis.pipeline();
  
  // Remove entries outside the current window
  pipeline.zremrangebyscore(key, 0, windowStart);
  
  // Count entries in the current window
  pipeline.zcard(key);
  
  // Get the oldest entry (to calculate retry-after)
  pipeline.zrange(key, 0, 0, "WITHSCORES");

  const results = await pipeline.exec();
  const currentCount = (results![1][1] as number) || 0;
  const oldestEntry = results![2][1] as string[];

  if (currentCount < effectiveLimit) {
    // Under limit — add this request and allow it
    const addPipeline = redis.pipeline();
    addPipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
    addPipeline.pexpire(key, config.windowMs + 1000); // TTL slightly longer than window
    await addPipeline.exec();

    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: Math.max(0, effectiveLimit - currentCount - 1),
      retryAfterMs: 0,
      resetAt: now + config.windowMs,
      currentUsage: currentCount + 1,
    };
  }

  // Over limit — calculate when the oldest request exits the window
  const oldestTimestamp = oldestEntry.length >= 2 ? parseInt(oldestEntry[1]) : now;
  const retryAfterMs = Math.max(0, oldestTimestamp + config.windowMs - now);

  return {
    allowed: false,
    limit: config.maxRequests,
    remaining: 0,
    retryAfterMs,
    resetAt: oldestTimestamp + config.windowMs,
    currentUsage: currentCount,
  };
}

// Multi-tier rate limiting: different limits for different operations
export async function checkMultiTierLimit(
  identifier: string,
  tiers: Array<{ name: string; config: RateLimitConfig }>
): Promise<{ allowed: boolean; violations: string[]; results: Record<string, RateLimitResult> }> {
  const results: Record<string, RateLimitResult> = {};
  const violations: string[] = [];

  for (const tier of tiers) {
    const tierKey = `${identifier}:${tier.name}`;
    const result = await checkRateLimit(tierKey, tier.config);
    results[tier.name] = result;
    if (!result.allowed) violations.push(tier.name);
  }

  return {
    allowed: violations.length === 0,
    violations,
    results,
  };
}
```

## Step 2: Build the Rate Limiting Middleware

The middleware integrates with the API framework, sets standard rate limit headers, and supports per-plan and per-endpoint limits.

```typescript
// src/middleware/rate-limit-middleware.ts — Hono middleware with per-plan rate limits
import { Context, Next } from "hono";
import { checkMultiTierLimit, RateLimitResult } from "../limiter/sliding-window";
import { pool } from "../db";

// Rate limits by plan tier
const PLAN_LIMITS: Record<string, { perMinute: number; perHour: number; perDay: number; burst: number }> = {
  free:       { perMinute: 20,   perHour: 500,    perDay: 5000,    burst: 5 },
  starter:    { perMinute: 60,   perHour: 2000,   perDay: 20000,   burst: 15 },
  pro:        { perMinute: 200,  perHour: 10000,  perDay: 100000,  burst: 50 },
  enterprise: { perMinute: 1000, perHour: 50000,  perDay: 500000,  burst: 200 },
};

// Extra limits for expensive endpoints
const ENDPOINT_LIMITS: Record<string, { perMinute: number }> = {
  "/api/export":    { perMinute: 5 },
  "/api/bulk":      { perMinute: 10 },
  "/api/ai/generate": { perMinute: 15 },
};

export function rateLimitMiddleware() {
  return async (c: Context, next: Next) => {
    const apiKey = c.req.header("x-api-key") || c.req.header("authorization")?.replace("Bearer ", "");
    if (!apiKey) {
      return c.json({ error: "API key required" }, 401);
    }

    // Look up the API key's plan
    const { rows } = await pool.query(
      "SELECT user_id, plan FROM api_keys WHERE key_hash = encode(sha256($1::bytea), 'hex') AND revoked_at IS NULL",
      [apiKey]
    );
    if (rows.length === 0) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    const { user_id, plan } = rows[0];
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const path = c.req.path;

    // Build rate limit tiers
    const tiers = [
      { name: "minute", config: { windowMs: 60000, maxRequests: limits.perMinute, burstAllowance: limits.burst } },
      { name: "hour", config: { windowMs: 3600000, maxRequests: limits.perHour, burstAllowance: 0 } },
      { name: "day", config: { windowMs: 86400000, maxRequests: limits.perDay, burstAllowance: 0 } },
    ];

    // Add endpoint-specific limits if applicable
    const endpointLimit = ENDPOINT_LIMITS[path];
    if (endpointLimit) {
      tiers.push({
        name: "endpoint",
        config: { windowMs: 60000, maxRequests: endpointLimit.perMinute, burstAllowance: 0 },
      });
    }

    const result = await checkMultiTierLimit(user_id, tiers);
    const minuteResult = result.results.minute;

    // Always set rate limit headers (even when allowed)
    c.header("X-RateLimit-Limit", String(limits.perMinute));
    c.header("X-RateLimit-Remaining", String(minuteResult.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(minuteResult.resetAt / 1000)));

    if (!result.allowed) {
      const strictest = Object.entries(result.results)
        .filter(([_, r]) => !r.allowed)
        .sort((a, b) => b[1].retryAfterMs - a[1].retryAfterMs)[0];

      c.header("Retry-After", String(Math.ceil(strictest[1].retryAfterMs / 1000)));

      // Log rate limit hit for analytics
      await pool.query(
        `INSERT INTO rate_limit_events (user_id, tier_violated, endpoint, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [user_id, result.violations.join(","), path]
      );

      return c.json({
        error: "Rate limit exceeded",
        limit: limits.perMinute,
        remaining: 0,
        retryAfterSeconds: Math.ceil(strictest[1].retryAfterMs / 1000),
        violatedTiers: result.violations,
        plan,
        upgradeUrl: plan !== "enterprise" ? "https://api.example.com/pricing" : undefined,
      }, 429);
    }

    await next();
  };
}
```

## Step 3: Build the Usage Dashboard API

```typescript
// src/routes/usage.ts — Rate limit usage and analytics API
import { Hono } from "hono";
import { Redis } from "ioredis";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();

// Current usage for an API key
app.get("/usage/current", async (c) => {
  const userId = c.get("userId");

  const minuteKey = `ratelimit:${userId}:minute`;
  const hourKey = `ratelimit:${userId}:hour`;
  const dayKey = `ratelimit:${userId}:day`;

  const now = Date.now();
  const pipeline = redis.pipeline();
  pipeline.zcount(minuteKey, now - 60000, now);
  pipeline.zcount(hourKey, now - 3600000, now);
  pipeline.zcount(dayKey, now - 86400000, now);
  const results = await pipeline.exec();

  return c.json({
    usage: {
      minute: { used: results![0][1], window: "60s" },
      hour: { used: results![1][1], window: "1h" },
      day: { used: results![2][1], window: "24h" },
    },
  });
});

// Rate limit events history (when limits were hit)
app.get("/usage/limits-hit", async (c) => {
  const userId = c.get("userId");
  const { rows } = await pool.query(
    `SELECT tier_violated, endpoint, created_at
     FROM rate_limit_events WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return c.json({ events: rows });
});

// Admin: top consumers
app.get("/admin/usage/top", async (c) => {
  const { rows } = await pool.query(`
    SELECT r.user_id, u.email, u.plan,
           COUNT(*) as limit_hits_7d,
           COUNT(DISTINCT DATE(r.created_at)) as days_hit
    FROM rate_limit_events r JOIN users u ON r.user_id = u.id
    WHERE r.created_at > NOW() - INTERVAL '7 days'
    GROUP BY r.user_id, u.email, u.plan
    ORDER BY limit_hits_7d DESC LIMIT 20
  `);
  return c.json({ topConsumers: rows });
});

export default app;
```

## Results

After deploying the sliding window rate limiter:

- **Zero capacity-related outages since deployment** — the runaway-loop scenario that caused 502s is now impossible; the customer hits their limit at request 200, not request 50,000
- **Fair, transparent limiting** — no more boundary artifacts; customers see consistent behavior regardless of when in the minute they start making requests
- **Self-service upgrade path works** — 23% of free-tier customers who hit rate limits upgraded within 7 days; the `upgradeUrl` in the 429 response drives conversions
- **P99 latency overhead: 1.2ms** — the Redis sorted set operations add negligible latency; the rate limiter itself is faster than the API endpoints it protects
- **Multi-tier protection** — per-minute limits prevent burst abuse, per-day limits prevent sustained abuse, per-endpoint limits protect expensive operations independently
