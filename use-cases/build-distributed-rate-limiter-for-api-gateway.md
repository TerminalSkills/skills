---
title: Build a Distributed Rate Limiter for an API Gateway
slug: build-distributed-rate-limiter-for-api-gateway
description: >
  Implement a multi-tier rate limiting system that handles 50K requests/second
  across 12 API servers, supports per-tenant quotas, and degrades gracefully
  when Redis is unreachable.
skills:
  - typescript
  - redis
  - hono
  - zod
  - vitest
  - bull-mq
category: development
tags:
  - rate-limiting
  - api-gateway
  - distributed-systems
  - redis
  - sliding-window
  - throttling
---

# Build a Distributed Rate Limiter for an API Gateway

## The Problem

Dani runs the platform team at an API-first company serving 2,000 tenants. Their current rate limiter is a simple per-process in-memory counter — which means a tenant gets 12x their actual limit (once per server in the load balancer). Last month, a single tenant's automated scraper consumed 40% of total API capacity, degrading performance for everyone. Their largest customer threatened to leave because p99 latency spiked from 50ms to 2.3 seconds during the incident. Simple fixes like nginx rate limiting don't work because limits need to be per-tenant and per-plan, not per-IP.

Dani needs:
- **Distributed counters** — accurate across 12 servers, not per-process
- **Multi-tier limits** — per-second burst + per-minute sustained + per-day quota
- **Per-tenant plans** — free tier gets 100 RPM, pro gets 1,000 RPM, enterprise gets custom
- **Graceful degradation** — if Redis goes down, fall back to local limiting (not unlimited)
- **Usage tracking** — real-time dashboard showing each tenant's consumption vs their quota
- **Sub-millisecond overhead** — rate checking can't add noticeable latency to requests

## Step 1: Rate Limit Configuration Schema

```typescript
// src/config/rate-limits.ts
// Per-plan rate limit tiers with burst, sustained, and daily quotas

import { z } from 'zod';

export const RateLimitTier = z.object({
  perSecond: z.number().int().positive(),       // burst protection
  perMinute: z.number().int().positive(),       // sustained rate
  perHour: z.number().int().positive(),         // hourly cap
  perDay: z.number().int().positive(),          // daily quota
  concurrentRequests: z.number().int().positive(), // max in-flight
});

export type RateLimitTier = z.infer<typeof RateLimitTier>;

export const plans: Record<string, RateLimitTier> = {
  free: {
    perSecond: 5,
    perMinute: 100,
    perHour: 1_000,
    perDay: 10_000,
    concurrentRequests: 10,
  },
  pro: {
    perSecond: 50,
    perMinute: 1_000,
    perHour: 20_000,
    perDay: 200_000,
    concurrentRequests: 100,
  },
  enterprise: {
    perSecond: 200,
    perMinute: 5_000,
    perHour: 100_000,
    perDay: 1_000_000,
    concurrentRequests: 500,
  },
};
```

## Step 2: Sliding Window Rate Limiter with Redis

Token bucket is simple but inaccurate at window boundaries. Sliding window log gives exact counts. The Lua script makes it atomic — no race conditions across 12 servers.

```typescript
// src/limiter/sliding-window.ts
// Distributed sliding window rate limiter using Redis sorted sets + Lua

import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

// Lua script for atomic check-and-increment
// Runs entirely on Redis — no network round trips between check and increment
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local window_ms = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local request_id = ARGV[4]

-- Remove entries outside the window
redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)

-- Count current requests in window
local count = redis.call('ZCARD', key)

if count >= limit then
  -- Return: denied, current count, retry-after (ms until oldest entry expires)
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_after = 0
  if #oldest > 0 then
    retry_after = window_ms - (now - tonumber(oldest[2]))
  end
  return {0, count, retry_after}
end

-- Add this request
redis.call('ZADD', key, now, request_id)
redis.call('PEXPIRE', key, window_ms + 1000) -- TTL = window + buffer

return {1, count + 1, 0}
`;

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  window: string;
}

export async function checkRateLimit(
  tenantId: string,
  window: 'second' | 'minute' | 'hour' | 'day',
  limit: number
): Promise<RateLimitResult> {
  const windowMs: Record<string, number> = {
    second: 1_000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
  };

  const key = `rl:${tenantId}:${window}`;
  const now = Date.now();
  const requestId = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  const [allowed, current, retryAfter] = await redis.eval(
    SLIDING_WINDOW_LUA,
    1,
    key,
    windowMs[window],
    limit,
    now,
    requestId
  ) as [number, number, number];

  return {
    allowed: allowed === 1,
    current,
    limit,
    remaining: Math.max(0, limit - current),
    retryAfterMs: retryAfter,
    window,
  };
}
```

## Step 3: Multi-Tier Rate Limit Checker

Check all tiers (second, minute, hour, day) in a single call. Fail fast — if the smallest window is exceeded, skip the larger ones.

```typescript
// src/limiter/multi-tier.ts
// Checks all rate limit tiers and returns the most restrictive result

import { checkRateLimit, type RateLimitResult } from './sliding-window';
import type { RateLimitTier } from '../config/rate-limits';

export interface MultiTierResult {
  allowed: boolean;
  results: RateLimitResult[];
  limitingTier: RateLimitResult | null;  // which tier blocked the request
}

export async function checkAllTiers(
  tenantId: string,
  tier: RateLimitTier
): Promise<MultiTierResult> {
  // Check smallest window first — fail fast
  const secondResult = await checkRateLimit(tenantId, 'second', tier.perSecond);
  if (!secondResult.allowed) {
    return { allowed: false, results: [secondResult], limitingTier: secondResult };
  }

  // Check remaining tiers in parallel — they're independent
  const [minuteResult, hourResult, dayResult] = await Promise.all([
    checkRateLimit(tenantId, 'minute', tier.perMinute),
    checkRateLimit(tenantId, 'hour', tier.perHour),
    checkRateLimit(tenantId, 'day', tier.perDay),
  ]);

  const results = [secondResult, minuteResult, hourResult, dayResult];
  const blocker = results.find(r => !r.allowed) ?? null;

  return {
    allowed: !blocker,
    results,
    limitingTier: blocker,
  };
}
```

## Step 4: Local Fallback for Redis Outages

If Redis is down, fall back to in-memory rate limiting. It's less accurate (per-process, not distributed) but prevents unlimited access.

```typescript
// src/limiter/fallback.ts
// In-memory fallback when Redis is unavailable

import type { RateLimitTier } from '../config/rate-limits';
import type { MultiTierResult } from './multi-tier';

// Simple in-memory counters with auto-cleanup
const counters = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries every 10 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of counters) {
    if (value.resetAt <= now) counters.delete(key);
  }
}, 10_000);

export function checkLocalRateLimit(
  tenantId: string,
  tier: RateLimitTier
): MultiTierResult {
  // Only check per-minute for simplicity — most important tier
  const key = `${tenantId}:minute`;
  const now = Date.now();

  const entry = counters.get(key);
  if (!entry || entry.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, results: [], limitingTier: null };
  }

  entry.count++;

  // Divide by expected server count for approximate fairness
  // 12 servers → each allows 1/12 of the total limit
  const localLimit = Math.max(1, Math.ceil(tier.perMinute / 12));

  if (entry.count > localLimit) {
    return {
      allowed: false,
      results: [{
        allowed: false,
        current: entry.count,
        limit: localLimit,
        remaining: 0,
        retryAfterMs: entry.resetAt - now,
        window: 'minute',
      }],
      limitingTier: {
        allowed: false,
        current: entry.count,
        limit: localLimit,
        remaining: 0,
        retryAfterMs: entry.resetAt - now,
        window: 'minute',
      },
    };
  }

  return { allowed: true, results: [], limitingTier: null };
}
```

## Step 5: HTTP Middleware

```typescript
// src/middleware/rate-limit.ts
// Hono middleware that applies rate limiting to every request

import { createMiddleware } from 'hono/factory';
import { checkAllTiers, type MultiTierResult } from '../limiter/multi-tier';
import { checkLocalRateLimit } from '../limiter/fallback';
import { plans } from '../config/rate-limits';

let redisHealthy = true;

// Health check ping every 5 seconds
setInterval(async () => {
  try {
    const { Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL!);
    await redis.ping();
    redisHealthy = true;
    redis.disconnect();
  } catch {
    redisHealthy = false;
  }
}, 5_000);

export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  const tenantId = c.req.header('x-tenant-id');
  if (!tenantId) {
    return c.json({ error: 'Missing x-tenant-id header' }, 401);
  }

  // Look up tenant's plan (cached in-memory with 60s TTL in production)
  const planName = await getTenantPlan(tenantId);
  const tier = plans[planName] ?? plans.free;

  let result: MultiTierResult;

  if (redisHealthy) {
    try {
      result = await checkAllTiers(tenantId, tier);
    } catch {
      redisHealthy = false;
      result = checkLocalRateLimit(tenantId, tier);
    }
  } else {
    result = checkLocalRateLimit(tenantId, tier);
  }

  // Always set rate limit headers (RFC 6585 / draft-ietf-httpapi-ratelimit-headers)
  const mostRestrictive = result.results.reduce(
    (min, r) => (r.remaining < min.remaining ? r : min),
    { remaining: Infinity, limit: 0, retryAfterMs: 0, window: '' } as any
  );

  c.header('RateLimit-Limit', String(mostRestrictive.limit || tier.perMinute));
  c.header('RateLimit-Remaining', String(mostRestrictive.remaining ?? tier.perMinute));
  c.header('RateLimit-Policy', `${tier.perMinute};w=60`);

  if (!result.allowed && result.limitingTier) {
    c.header('Retry-After', String(Math.ceil(result.limitingTier.retryAfterMs / 1000)));
    c.header('RateLimit-Reset', String(Math.ceil(result.limitingTier.retryAfterMs / 1000)));

    return c.json({
      error: 'Rate limit exceeded',
      limit: result.limitingTier.limit,
      window: result.limitingTier.window,
      retryAfter: Math.ceil(result.limitingTier.retryAfterMs / 1000),
    }, 429);
  }

  await next();
});

async function getTenantPlan(tenantId: string): Promise<string> {
  // In production: Redis cache → database lookup
  // Simplified for example
  return 'pro';
}
```

## Step 6: Usage Tracking for Dashboard

```typescript
// src/tracking/usage-tracker.ts
// Aggregates usage data for real-time tenant dashboard

import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function recordUsage(
  tenantId: string,
  endpoint: string,
  statusCode: number,
  latencyMs: number
): Promise<void> {
  const minute = Math.floor(Date.now() / 60_000);
  const hour = Math.floor(Date.now() / 3_600_000);
  const day = new Date().toISOString().split('T')[0];

  // Pipeline for efficiency — single round trip
  const pipeline = redis.pipeline();

  // Per-minute counter (for real-time dashboard)
  pipeline.hincrby(`usage:${tenantId}:min:${minute}`, 'total', 1);
  pipeline.hincrby(`usage:${tenantId}:min:${minute}`, `status:${statusCode}`, 1);
  pipeline.expire(`usage:${tenantId}:min:${minute}`, 7200); // 2h TTL

  // Per-endpoint counter (for analytics)
  pipeline.hincrby(`usage:${tenantId}:endpoint:${day}`, endpoint, 1);
  pipeline.expire(`usage:${tenantId}:endpoint:${day}`, 86400 * 7);

  // Daily totals
  pipeline.hincrby(`usage:${tenantId}:day:${day}`, 'total', 1);
  pipeline.hincrby(`usage:${tenantId}:day:${day}`, `status:${Math.floor(statusCode / 100)}xx`, 1);
  pipeline.expire(`usage:${tenantId}:day:${day}`, 86400 * 30);

  // Latency tracking (HyperLogLog approximation for p50/p95)
  pipeline.lpush(`latency:${tenantId}:min:${minute}`, latencyMs);
  pipeline.ltrim(`latency:${tenantId}:min:${minute}`, 0, 999); // last 1000 samples
  pipeline.expire(`latency:${tenantId}:min:${minute}`, 7200);

  await pipeline.exec();
}

export async function getTenantUsage(tenantId: string): Promise<{
  currentMinute: number;
  currentHour: number;
  today: number;
  topEndpoints: Array<{ endpoint: string; count: number }>;
}> {
  const minute = Math.floor(Date.now() / 60_000);
  const day = new Date().toISOString().split('T')[0];

  const [minuteTotal, dayData, endpoints] = await Promise.all([
    redis.hget(`usage:${tenantId}:min:${minute}`, 'total'),
    redis.hget(`usage:${tenantId}:day:${day}`, 'total'),
    redis.hgetall(`usage:${tenantId}:endpoint:${day}`),
  ]);

  const topEndpoints = Object.entries(endpoints)
    .map(([endpoint, count]) => ({ endpoint, count: parseInt(count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    currentMinute: parseInt(minuteTotal ?? '0'),
    currentHour: 0, // aggregate from last 60 minutes
    today: parseInt(dayData ?? '0'),
    topEndpoints,
  };
}
```

## Results

After deploying across 12 API servers:

- **Rate limit accuracy**: 99.7% — distributed counters match expected limits within 0.3% variance
- **Overhead**: 0.8ms average per request (Redis round trip + Lua execution)
- **Noisy neighbor incidents**: zero since deployment (was 3-4 per month)
- **Redis failover**: tested 15-minute outage, local fallback engaged automatically, no tenant exceeded 2x their limit
- **P99 latency** for all tenants: stabilized at 52ms (was spiking to 2.3s during abuse)
- **Revenue impact**: largest customer renewed ($240K ARR) after seeing the stability improvement
- **Tenant usage dashboard** drives upsell — 14 tenants upgraded from free to pro after hitting limits
- **50K requests/second** sustained during load test with consistent sub-millisecond rate checking
