---
name: rate-limiting-advanced
description: >-
  Implement rate limiting for APIs and web apps. Use when a user asks to
  protect APIs from abuse, implement request throttling, add sliding window
  rate limits, or build tiered rate limiting for different user plans.
license: Apache-2.0
compatibility: 'Node.js, Express, Fastify, Next.js'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - rate-limiting
    - security
    - api
    - redis
    - throttling
---

# Rate Limiting (Advanced)

## Overview

Rate limiting protects APIs from abuse, prevents resource exhaustion, and enforces usage quotas. Implement with Redis for distributed environments, with sliding windows for fairness, and tiered limits for different pricing plans.

## Instructions

### Step 1: Redis Sliding Window

```typescript
// lib/rate-limiter.ts — Sliding window rate limiter with Redis
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
}

export async function slidingWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStart = now - windowMs

  // Atomic operation: remove old entries, add new, count
  const pipeline = redis.pipeline()
  pipeline.zremrangebyscore(key, 0, windowStart)      // remove expired entries
  pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`)  // add current request
  pipeline.zcard(key)                                   // count entries in window
  pipeline.pexpire(key, windowMs)                       // auto-expire the key

  const results = await pipeline.exec()
  const count = results![2][1] as number

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetMs: windowMs - (now - windowStart),
  }
}
```

### Step 2: Express Middleware

```typescript
// middleware/rate-limit.ts — Rate limiting middleware with plan-based tiers
const PLAN_LIMITS: Record<string, { requests: number; windowMs: number }> = {
  free:       { requests: 100,    windowMs: 3600000 },    // 100/hour
  starter:    { requests: 1000,   windowMs: 3600000 },    // 1,000/hour
  pro:        { requests: 10000,  windowMs: 3600000 },    // 10,000/hour
  enterprise: { requests: 100000, windowMs: 3600000 },    // 100,000/hour
}

export function rateLimitMiddleware(req, res, next) {
  const plan = req.user?.plan || 'free'
  const { requests, windowMs } = PLAN_LIMITS[plan]
  const key = `ratelimit:${req.user?.id || req.ip}:${plan}`

  const result = await slidingWindowRateLimit(key, requests, windowMs)

  // Standard rate limit headers
  res.set('X-RateLimit-Limit', requests.toString())
  res.set('X-RateLimit-Remaining', result.remaining.toString())
  res.set('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + result.resetMs / 1000).toString())

  if (!result.allowed) {
    res.set('Retry-After', Math.ceil(result.resetMs / 1000).toString())
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. ${result.remaining} requests remaining.`,
      retryAfter: Math.ceil(result.resetMs / 1000),
    })
  }

  next()
}
```

### Step 3: Per-Endpoint Limits

```typescript
// Different limits for different endpoints
function endpointRateLimit(limit: number, windowMs: number) {
  return async (req, res, next) => {
    const key = `ratelimit:${req.user?.id || req.ip}:${req.route.path}`
    const result = await slidingWindowRateLimit(key, limit, windowMs)
    if (!result.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded' })
    }
    next()
  }
}

// Apply per-endpoint
app.post('/api/auth/login', endpointRateLimit(5, 900000), loginHandler)       // 5 per 15min
app.post('/api/auth/register', endpointRateLimit(3, 3600000), registerHandler) // 3 per hour
app.post('/api/ai/generate', endpointRateLimit(20, 60000), generateHandler)    // 20 per minute
app.get('/api/projects', endpointRateLimit(100, 60000), listProjects)          // 100 per minute
```

## Guidelines

- Sliding window is fairest — fixed windows allow bursts at window boundaries.
- Always return `X-RateLimit-*` and `Retry-After` headers — clients need them.
- Rate limit by user ID (authenticated) or IP (unauthenticated) — never only by IP.
- Use Redis for distributed rate limiting — in-memory only works for single instances.
- Set stricter limits on auth endpoints (login, register, password reset) to prevent brute force.
- Log rate limit hits — they may indicate abuse or a bug in the client.
