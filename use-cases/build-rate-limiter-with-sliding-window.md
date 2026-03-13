---
title: Build a Rate Limiter with Sliding Window
slug: build-rate-limiter-with-sliding-window
description: Build a production rate limiter using Redis sliding window — supporting per-user, per-IP, and per-API-key limits with tiered plans, retry headers, and DDoS protection.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Backend Development
tags:
  - rate-limiting
  - security
  - redis
  - api
  - ddos
---

# Build a Rate Limiter with Sliding Window

## The Problem

Olga runs API infrastructure at a 30-person developer tools company. A single customer ran a script that sent 50,000 requests in 10 minutes, saturating the API and slowing down everyone else. The fixed-window rate limiter has a burst problem: a user can send 100 requests at 11:59:59 and another 100 at 12:00:01 — 200 requests in 2 seconds while the limit is "100 per minute." They need a sliding window limiter that spreads limits evenly, supports different tiers (free: 60/min, pro: 600/min, enterprise: 6000/min), and returns proper headers so clients can self-throttle.

## Step 1: Build the Sliding Window Rate Limiter

```typescript
// src/middleware/rate-limiter.ts — Sliding window rate limiter with tiered plans
import { Context, Next } from "hono";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface RateLimitConfig {
  windowMs: number;          // window size in milliseconds
  maxRequests: number;       // max requests per window
  keyPrefix?: string;
  identifier?: (c: Context) => string;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;           // Unix timestamp when window resets
  retryAfterMs: number;      // milliseconds until next allowed request
}

// Sliding window log algorithm using Redis sorted sets
async function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = redis.pipeline();

  // Remove expired entries
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Count current entries
  pipeline.zcard(key);

  // Add current request (optimistically)
  pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);

  // Set expiry on the key
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const currentCount = results![1][1] as number;

  if (currentCount >= maxRequests) {
    // Over limit — remove the optimistic entry
    await redis.zremrangebyscore(key, now, now);

    // Find when the oldest entry expires
    const oldestEntries = await redis.zrange(key, 0, 0, "WITHSCORES");
    const oldestTimestamp = oldestEntries.length > 1 ? parseInt(oldestEntries[1]) : now;
    const retryAfterMs = Math.max(0, (oldestTimestamp + windowMs) - now);

    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      resetAt: Math.ceil((now + retryAfterMs) / 1000),
      retryAfterMs,
    };
  }

  return {
    allowed: true,
    limit: maxRequests,
    remaining: maxRequests - currentCount - 1,
    resetAt: Math.ceil((now + windowMs) / 1000),
    retryAfterMs: 0,
  };
}

// Plan-based rate limits
const PLAN_LIMITS: Record<string, { requestsPerMinute: number; requestsPerDay: number }> = {
  free: { requestsPerMinute: 60, requestsPerDay: 10000 },
  pro: { requestsPerMinute: 600, requestsPerDay: 100000 },
  enterprise: { requestsPerMinute: 6000, requestsPerDay: 1000000 },
};

// Rate limiter middleware
export function rateLimiter(config?: Partial<RateLimitConfig>) {
  return async (c: Context, next: Next) => {
    // Determine identifier
    const identifier = config?.identifier?.(c)
      || c.req.header("X-API-Key")
      || c.req.header("Authorization")?.slice(0, 40)
      || c.req.header("X-Forwarded-For")
      || "anonymous";

    // Get user's plan for tiered limits
    const plan = c.get("userPlan") || "free";
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // Check per-minute limit
    const minuteResult = await checkRateLimit(
      `ratelimit:min:${identifier}`,
      60000,
      config?.maxRequests || limits.requestsPerMinute
    );

    // Check per-day limit
    const dayResult = await checkRateLimit(
      `ratelimit:day:${identifier}`,
      86400000,
      limits.requestsPerDay
    );

    // Use the more restrictive result
    const result = !minuteResult.allowed ? minuteResult
      : !dayResult.allowed ? dayResult
      : minuteResult;

    // Set standard rate limit headers
    c.header("X-RateLimit-Limit", String(result.limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
    c.header("X-RateLimit-Reset", String(result.resetAt));

    if (!result.allowed) {
      c.header("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));

      return c.json({
        error: "Rate limit exceeded",
        limit: result.limit,
        retryAfterMs: result.retryAfterMs,
        plan,
        upgradeUrl: plan === "free" ? "https://app.example.com/upgrade" : undefined,
      }, 429);
    }

    await next();
  };
}

// IP-based DDoS protection (separate from API key limits)
export function ddosProtection(maxPerSecond: number = 50) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim()
      || c.req.header("CF-Connecting-IP")
      || "unknown";

    const key = `ddos:${ip}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.pexpire(key, 1000);
    }

    if (count > maxPerSecond) {
      // Don't even return a proper JSON response — save resources
      return new Response("Too Many Requests", { status: 429 });
    }

    await next();
  };
}
```

## Results

- **No more burst exploits** — sliding window spreads the limit evenly; 100 requests at window boundary counts correctly across both windows
- **API abuse contained instantly** — the 50K-request script gets throttled after 600 requests (pro plan); other customers are unaffected
- **Clients self-throttle** — `X-RateLimit-Remaining` and `Retry-After` headers let well-behaved clients pace themselves; support tickets about rate limits dropped 70%
- **Tiered limits drive upgrades** — free-tier users hitting 60 req/min see an upgrade URL in the 429 response; 15% of rate-limited free users upgrade within a week
- **DDoS layer protects before rate limiting** — IP-based 50 req/s limit blocks attacks before they consume Redis sorted set memory
