---
name: rate-limiting-advanced
description: >-
  Implement rate limiting for APIs. Use when a user asks to protect APIs
  from abuse, add request throttling, implement sliding window limits, or
  build tiered rate limiting for pricing plans.
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

Rate limiting protects APIs from abuse and enforces usage quotas. Use Redis sliding windows for distributed environments and tiered limits for different pricing plans.

## Instructions

### Step 1: Redis Sliding Window

```typescript
// lib/rate-limiter.ts — Sliding window with Redis sorted sets
import Redis from 'ioredis'
const redis = new Redis(process.env.REDIS_URL)

export async function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const pipe = redis.pipeline()
  pipe.zremrangebyscore(key, 0, now - windowMs)
  pipe.zadd(key, now.toString(), `${now}:${Math.random()}`)
  pipe.zcard(key)
  pipe.pexpire(key, windowMs)
  const results = await pipe.exec()
  const count = results![2][1] as number
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
}
```

### Step 2: Plan-Based Middleware

```typescript
const LIMITS = {
  free:       { requests: 100,   windowMs: 3600000 },
  pro:        { requests: 10000, windowMs: 3600000 },
  enterprise: { requests: 100000, windowMs: 3600000 },
}

export async function rateLimitMiddleware(req, res, next) {
  const plan = req.user?.plan || 'free'
  const { requests, windowMs } = LIMITS[plan]
  const result = await checkRateLimit(`rl:${req.user?.id || req.ip}`, requests, windowMs)
  res.set('X-RateLimit-Limit', requests.toString())
  res.set('X-RateLimit-Remaining', result.remaining.toString())
  if (!result.allowed) return res.status(429).json({ error: 'Rate limit exceeded' })
  next()
}
```

### Step 3: Per-Endpoint Limits

```typescript
app.post('/api/auth/login', rateLimit(5, 900000), loginHandler)      // 5 per 15min
app.post('/api/ai/generate', rateLimit(20, 60000), generateHandler)  // 20 per min
app.get('/api/projects', rateLimit(100, 60000), listProjects)        // 100 per min
```

## Guidelines

- Sliding window is fairest — fixed windows allow bursts at boundaries.
- Always return X-RateLimit-* and Retry-After headers.
- Rate limit by user ID (authenticated) or IP (unauthenticated).
- Use Redis for distributed — in-memory only works for single instances.
- Stricter limits on auth endpoints to prevent brute force.
