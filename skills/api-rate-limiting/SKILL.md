---
name: api-rate-limiting
description: >-
  Implement API rate limiting. Use when a user asks to throttle API requests,
  prevent abuse, implement sliding window rate limiting, add per-user quotas,
  or protect APIs from DDoS and scraping.
license: Apache-2.0
compatibility: 'Node.js, Python, Go, any language'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - rate-limiting
    - api
    - security
    - throttling
    - redis
---

# API Rate Limiting

## Overview

Rate limiting prevents API abuse — whether from bugs (infinite retry loops), scrapers, or deliberate attacks. This skill covers sliding window counters, token buckets, per-user quotas, and proper HTTP headers for communicating limits to clients.

## Instructions

### Step 1: Redis Sliding Window

```typescript
// lib/rate-limiter.ts — Sliding window rate limiter with Redis
import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  limit: number
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStart = now - windowMs

  // Use Redis sorted set for sliding window
  const pipeline = redis.pipeline()
  pipeline.zremrangebyscore(key, 0, windowStart)     // remove expired entries
  pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`)  // add current request
  pipeline.zcard(key)                                 // count entries in window
  pipeline.pexpire(key, windowMs)                    // set TTL

  const results = await pipeline.exec()
  const count = results[2][1] as number

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(now + windowMs),
    limit,
  }
}
```

### Step 2: Express Middleware

```typescript
// middleware/rateLimiter.ts — Rate limiting middleware
import { checkRateLimit } from '../lib/rate-limiter'

interface RateLimitConfig {
  limit: number           // requests per window
  windowMs: number        // window size in ms
  keyFn?: (req) => string // custom key function
}

export function rateLimit(config: RateLimitConfig) {
  return async (req, res, next) => {
    // Default: rate limit by IP, authenticated users get their own bucket
    const key = config.keyFn?.(req)
      || (req.user ? `rl:user:${req.user.id}` : `rl:ip:${req.ip}`)

    const result = await checkRateLimit(key, config.limit, config.windowMs)

    // Always include rate limit headers
    res.set('X-RateLimit-Limit', String(result.limit))
    res.set('X-RateLimit-Remaining', String(result.remaining))
    res.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt.getTime() / 1000)))

    if (!result.allowed) {
      res.set('Retry-After', String(Math.ceil(config.windowMs / 1000)))
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(config.windowMs / 1000),
      })
    }

    next()
  }
}

// Usage
app.use('/api/', rateLimit({ limit: 100, windowMs: 60_000 }))             // 100 req/min general
app.post('/api/auth/login', rateLimit({ limit: 5, windowMs: 300_000 }))   // 5 attempts per 5 min
app.post('/api/upload', rateLimit({ limit: 10, windowMs: 3600_000 }))     // 10 uploads per hour
```

### Step 3: Tiered Rate Limits

```typescript
// Different limits per plan
const PLAN_LIMITS = {
  free:       { limit: 100,   windowMs: 3600_000 },    // 100/hour
  pro:        { limit: 1000,  windowMs: 3600_000 },    // 1,000/hour
  enterprise: { limit: 10000, windowMs: 3600_000 },    // 10,000/hour
}

app.use('/api/', async (req, res, next) => {
  const plan = req.user?.plan || 'free'
  const config = PLAN_LIMITS[plan]
  const key = req.user ? `rl:${req.user.id}` : `rl:ip:${req.ip}`

  const result = await checkRateLimit(key, config.limit, config.windowMs)

  res.set('X-RateLimit-Limit', String(config.limit))
  res.set('X-RateLimit-Remaining', String(result.remaining))

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      upgrade: plan === 'free' ? 'https://myapp.com/pricing' : undefined,
    })
  }
  next()
})
```

## Guidelines

- Always return `X-RateLimit-*` headers — good clients use them to throttle themselves.
- Return `Retry-After` with 429 responses — tells clients exactly when to retry.
- Rate limit by user ID for authenticated requests, by IP for unauthenticated.
- Use Redis for distributed rate limiting (multiple server instances share state).
- Apply stricter limits to sensitive endpoints (login, signup, password reset).
- Consider using Upstash Redis for serverless — works with edge functions.
