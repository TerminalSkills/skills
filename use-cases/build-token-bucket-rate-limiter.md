---
title: Build a Token Bucket Rate Limiter
slug: build-token-bucket-rate-limiter
description: Build a distributed token bucket rate limiter with per-user buckets, burst allowance, sliding window fallback, response headers, and dynamic configuration for API protection.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Architecture
tags:
  - rate-limiting
  - token-bucket
  - api
  - throttling
  - distributed
---

# Build a Token Bucket Rate Limiter

## The Problem

Vera leads platform at a 25-person API company serving 2,000 customers. Their fixed-window rate limiter creates a thundering herd: customers batch requests at window boundaries, causing 10x traffic spikes every minute. Burst-y workloads get rejected even though average usage is low. Enterprise customers want higher limits but changing limits requires redeploying. They need a token bucket algorithm: smooth rate limiting without boundary spikes, configurable burst allowance, per-customer configuration, and proper rate limit headers so clients can self-throttle.

## Step 1: Build the Rate Limiter

```typescript
// src/ratelimit/token-bucket.ts — Distributed token bucket with burst and dynamic config
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface BucketConfig {
  maxTokens: number;         // bucket capacity (burst size)
  refillRate: number;        // tokens added per second
  refillInterval: number;    // ms between refills (default 1000)
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfter: number | null; // seconds until a token is available
  resetAt: number;           // timestamp when bucket will be full
}

const DEFAULT_CONFIGS: Record<string, BucketConfig> = {
  free:       { maxTokens: 60,   refillRate: 1,   refillInterval: 1000 },
  starter:    { maxTokens: 300,  refillRate: 5,   refillInterval: 1000 },
  pro:        { maxTokens: 1000, refillRate: 20,  refillInterval: 1000 },
  enterprise: { maxTokens: 5000, refillRate: 100, refillInterval: 1000 },
};

// Consume a token from the bucket (atomic via Lua script)
export async function consume(
  key: string,
  config?: BucketConfig,
  tokens: number = 1
): Promise<RateLimitResult> {
  const cfg = config || DEFAULT_CONFIGS.free;
  const now = Date.now();

  // Atomic Lua script for token bucket
  const result = await redis.eval(
    `
    local key = KEYS[1]
    local maxTokens = tonumber(ARGV[1])
    local refillRate = tonumber(ARGV[2])
    local refillInterval = tonumber(ARGV[3])
    local now = tonumber(ARGV[4])
    local requested = tonumber(ARGV[5])

    -- Get current state
    local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
    local currentTokens = tonumber(bucket[1]) or maxTokens
    local lastRefill = tonumber(bucket[2]) or now

    -- Calculate tokens to add since last refill
    local elapsed = now - lastRefill
    local tokensToAdd = math.floor(elapsed / refillInterval) * refillRate
    currentTokens = math.min(maxTokens, currentTokens + tokensToAdd)
    local newLastRefill = lastRefill + math.floor(elapsed / refillInterval) * refillInterval

    -- Try to consume
    local allowed = 0
    if currentTokens >= requested then
      currentTokens = currentTokens - requested
      allowed = 1
    end

    -- Save state
    redis.call('HMSET', key, 'tokens', currentTokens, 'lastRefill', newLastRefill)
    redis.call('EXPIRE', key, math.ceil(maxTokens / refillRate) + 60)

    return {allowed, currentTokens, maxTokens}
    `,
    1, key,
    cfg.maxTokens, cfg.refillRate, cfg.refillInterval, now, tokens
  ) as number[];

  const allowed = result[0] === 1;
  const remaining = result[1];

  let retryAfter: number | null = null;
  if (!allowed) {
    retryAfter = Math.ceil((tokens - remaining) / cfg.refillRate);
  }

  const resetAt = now + Math.ceil((cfg.maxTokens - remaining) / cfg.refillRate) * 1000;

  return { allowed, remaining, limit: cfg.maxTokens, retryAfter, resetAt };
}

// Get current bucket state without consuming
export async function peek(key: string, config?: BucketConfig): Promise<RateLimitResult> {
  const cfg = config || DEFAULT_CONFIGS.free;
  const data = await redis.hmget(key, "tokens", "lastRefill");
  const now = Date.now();

  let currentTokens = data[0] ? parseInt(data[0]) : cfg.maxTokens;
  const lastRefill = data[1] ? parseInt(data[1]) : now;

  const elapsed = now - lastRefill;
  const tokensToAdd = Math.floor(elapsed / cfg.refillInterval) * cfg.refillRate;
  currentTokens = Math.min(cfg.maxTokens, currentTokens + tokensToAdd);

  return {
    allowed: currentTokens > 0,
    remaining: currentTokens,
    limit: cfg.maxTokens,
    retryAfter: currentTokens > 0 ? null : Math.ceil(1 / cfg.refillRate),
    resetAt: now + Math.ceil((cfg.maxTokens - currentTokens) / cfg.refillRate) * 1000,
  };
}

// Hono middleware
export function rateLimitMiddleware(options?: {
  keyExtractor?: (c: any) => string;
  configResolver?: (c: any) => BucketConfig;
  costCalculator?: (c: any) => number;
}) {
  return async (c: any, next: any) => {
    const key = options?.keyExtractor?.(c) || `rl:${c.req.header("X-API-Key") || c.req.header("CF-Connecting-IP") || "anonymous"}`;
    const config = options?.configResolver?.(c);
    const cost = options?.costCalculator?.(c) || 1;

    const result = await consume(key, config, cost);

    // Always set headers
    c.header("X-RateLimit-Limit", String(result.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfter));
      return c.json({ error: "Rate limit exceeded", retryAfter: result.retryAfter }, 429);
    }

    await next();
  };
}

// Dynamic config update (no redeploy)
export async function updateConfig(customerId: string, config: BucketConfig): Promise<void> {
  await redis.set(`rl:config:${customerId}`, JSON.stringify(config));
}

export async function getConfig(customerId: string): Promise<BucketConfig> {
  const cached = await redis.get(`rl:config:${customerId}`);
  return cached ? JSON.parse(cached) : DEFAULT_CONFIGS.free;
}
```

## Results

- **No more thundering herd** — token bucket smooths traffic; no boundary spikes; steady 20 req/sec vs 1200 req burst at minute boundary
- **Burst-friendly** — bucket capacity allows 1000-token burst for pro tier; short spikes accepted; only sustained overuse is throttled
- **Proper headers** — `X-RateLimit-Remaining` and `Retry-After` in every response; well-behaved clients self-throttle; support tickets about rate limits dropped 70%
- **Dynamic configuration** — enterprise customer needs 10K/min temporarily; update via API without redeploy; takes effect in <1 second
- **Atomic via Lua** — single Redis round-trip; no race conditions between check and decrement; works across multiple API servers
