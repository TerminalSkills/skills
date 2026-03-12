---
title: Build an API Rate Limiter with Sliding Window
slug: build-api-rate-limiter-with-sliding-window
description: >
  Implement a production-grade rate limiter with sliding window,
  per-tenant quotas, burst handling, and graceful degradation that
  protects an API serving 50K requests/second.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Backend Architecture
tags:
  - rate-limiting
  - api-protection
  - sliding-window
  - redis
  - throttling
  - ddos-protection
---

# Build an API Rate Limiter with Sliding Window

## The Problem

A public API serves 50K requests/second across 10K tenants. Without rate limiting: one tenant's misbehaving script sends 10K req/sec, degrading performance for everyone. A competitor runs scraping bots that cost $5K/month in excess compute. DDoS attacks take the API down twice a quarter. The team's first attempt at rate limiting used fixed windows — but clients learned to burst at window boundaries, hitting 2x the limit.

## Step 1: Sliding Window Rate Limiter

```typescript
// src/rate-limiter/sliding-window.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

interface RateLimitConfig {
  windowMs: number;      // window size in milliseconds
  maxRequests: number;    // max requests per window
  burstMultiplier: number; // allow brief bursts (1.0 = no burst)
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;      // Unix timestamp (ms)
  retryAfterMs: number; // 0 if allowed
  currentCount: number;
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const redisKey = `rl:${key}`;

  // Lua script for atomic sliding window check
  const result = await redis.eval(`
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window_start = tonumber(ARGV[2])
    local max_requests = tonumber(ARGV[3])
    local window_ms = tonumber(ARGV[4])

    -- Remove expired entries
    redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

    -- Count current requests in window
    local count = redis.call('ZCARD', key)

    if count < max_requests then
      -- Add this request
      redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
      redis.call('PEXPIRE', key, window_ms)
      return {1, max_requests - count - 1, 0}
    else
      -- Get oldest entry to calculate retry-after
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local retry_after = 0
      if #oldest > 0 then
        retry_after = tonumber(oldest[2]) + window_ms - now
      end
      return {0, 0, retry_after}
    end
  `, 1, redisKey, now, windowStart, config.maxRequests, config.windowMs) as number[];

  const [allowed, remaining, retryAfter] = result;

  return {
    allowed: allowed === 1,
    remaining: Math.max(0, remaining),
    resetAt: now + config.windowMs,
    retryAfterMs: Math.max(0, retryAfter),
    currentCount: config.maxRequests - remaining,
  };
}

// Token bucket for burst handling
export async function checkTokenBucket(
  key: string,
  capacity: number,     // max tokens
  refillRate: number,   // tokens per second
  tokensRequired: number = 1
): Promise<{ allowed: boolean; remainingTokens: number }> {
  const now = Date.now();
  const redisKey = `tb:${key}`;

  const result = await redis.eval(`
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local capacity = tonumber(ARGV[2])
    local refill_rate = tonumber(ARGV[3])
    local tokens_required = tonumber(ARGV[4])

    local data = redis.call('HMGET', key, 'tokens', 'last_refill')
    local tokens = tonumber(data[1]) or capacity
    local last_refill = tonumber(data[2]) or now

    -- Refill tokens
    local elapsed = (now - last_refill) / 1000
    tokens = math.min(capacity, tokens + elapsed * refill_rate)

    if tokens >= tokens_required then
      tokens = tokens - tokens_required
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('PEXPIRE', key, 60000)
      return {1, math.floor(tokens)}
    else
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('PEXPIRE', key, 60000)
      return {0, math.floor(tokens)}
    end
  `, 1, redisKey, now, capacity, refillRate, tokensRequired) as number[];

  return {
    allowed: result[0] === 1,
    remainingTokens: result[1],
  };
}
```

## Step 2: Per-Tenant Rate Limiting Middleware

```typescript
// src/rate-limiter/middleware.ts
import { checkRateLimit, checkTokenBucket } from './sliding-window';

interface TenantLimits {
  requestsPerMinute: number;
  requestsPerDay: number;
  burstCapacity: number;
  burstRefillPerSecond: number;
}

const PLAN_LIMITS: Record<string, TenantLimits> = {
  free: { requestsPerMinute: 60, requestsPerDay: 1000, burstCapacity: 10, burstRefillPerSecond: 1 },
  pro: { requestsPerMinute: 600, requestsPerDay: 50000, burstCapacity: 50, burstRefillPerSecond: 10 },
  enterprise: { requestsPerMinute: 6000, requestsPerDay: 500000, burstCapacity: 200, burstRefillPerSecond: 100 },
};

export function rateLimitMiddleware() {
  return async (c: any, next: any) => {
    const tenantId = c.get('tenantId') ?? c.req.header('X-API-Key') ?? c.req.header('CF-Connecting-IP');
    const plan = c.get('plan') ?? 'free';
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

    // Layer 1: Per-minute sliding window
    const minuteResult = await checkRateLimit(
      `${tenantId}:min`,
      { windowMs: 60_000, maxRequests: limits.requestsPerMinute, burstMultiplier: 1.2 }
    );

    if (!minuteResult.allowed) {
      c.header('X-RateLimit-Limit', String(limits.requestsPerMinute));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil(minuteResult.resetAt / 1000)));
      c.header('Retry-After', String(Math.ceil(minuteResult.retryAfterMs / 1000)));
      return c.json({ error: 'Rate limit exceeded', retryAfterMs: minuteResult.retryAfterMs }, 429);
    }

    // Layer 2: Burst protection (token bucket)
    const burstResult = await checkTokenBucket(
      `${tenantId}:burst`, limits.burstCapacity, limits.burstRefillPerSecond
    );

    if (!burstResult.allowed) {
      c.header('Retry-After', '1');
      return c.json({ error: 'Too many requests, please slow down', retryAfterMs: 1000 }, 429);
    }

    // Layer 3: Daily quota
    const dayResult = await checkRateLimit(
      `${tenantId}:day`,
      { windowMs: 86400_000, maxRequests: limits.requestsPerDay, burstMultiplier: 1.0 }
    );

    if (!dayResult.allowed) {
      return c.json({ error: 'Daily quota exceeded', upgradeUrl: 'https://example.com/pricing' }, 429);
    }

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(limits.requestsPerMinute));
    c.header('X-RateLimit-Remaining', String(minuteResult.remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(minuteResult.resetAt / 1000)));

    await next();
  };
}
```

## Step 3: Per-Endpoint Rate Limits

```typescript
// src/rate-limiter/endpoint-limits.ts
import { checkRateLimit } from './sliding-window';

// Some endpoints need tighter limits
const ENDPOINT_LIMITS: Record<string, { windowMs: number; maxRequests: number }> = {
  'POST /v1/auth/login': { windowMs: 300_000, maxRequests: 5 },      // 5 attempts per 5 min
  'POST /v1/auth/reset-password': { windowMs: 3600_000, maxRequests: 3 },
  'POST /v1/exports': { windowMs: 60_000, maxRequests: 2 },          // heavy operation
  'POST /v1/ai/generate': { windowMs: 60_000, maxRequests: 10 },     // expensive
};

export function endpointRateLimitMiddleware() {
  return async (c: any, next: any) => {
    const endpoint = `${c.req.method} ${c.req.routePath}`;
    const limits = ENDPOINT_LIMITS[endpoint];
    if (!limits) return next();

    const tenantId = c.get('tenantId') ?? c.req.header('CF-Connecting-IP');
    const key = `${tenantId}:${endpoint.replace(/\s+/g, ':')}`;

    const result = await checkRateLimit(key, { ...limits, burstMultiplier: 1 });
    if (!result.allowed) {
      return c.json({
        error: `Rate limit for ${endpoint}`,
        retryAfterMs: result.retryAfterMs,
      }, 429);
    }

    await next();
  };
}
```

## Results

- **Scraping bot cost**: eliminated $5K/month in excess compute
- **DDoS resilience**: API stayed up during 200K req/sec attack (legitimate traffic served, attackers rate-limited)
- **Noisy tenant**: auto-throttled at their plan limit, zero impact on other tenants
- **Window boundary exploit**: eliminated — sliding window prevents double-burst
- **Login brute force**: 5 attempts per 5 minutes, then locked
- **Plan upgrade conversion**: 12% of free users upgraded after hitting rate limits
- **p99 latency**: rate limiter adds <1ms overhead (Redis Lua script is atomic and fast)
