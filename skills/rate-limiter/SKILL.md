---
name: rate-limiter
description: >-
  Designs and implements API rate limiting middleware and abuse protection.
  Use when you need to add request throttling, per-user quotas, IP-based
  blocking, sliding window or token bucket algorithms, Redis-backed
  distributed counters, or 429 response handling. Trigger words: rate limit,
  throttle, API abuse, too many requests, request quota, DDoS protection,
  brute force prevention, credential stuffing defense.
license: Apache-2.0
compatibility: "Node.js 20+ (ioredis 6 requires it), Python 3.9+, or Go 1.21+. Redis 7+ for distributed mode."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["rate-limiting", "api-security", "middleware"]
---

# Rate Limiter

## Overview

This skill enables AI agents to design, implement, and configure production-grade rate limiting for APIs. It covers algorithm selection, middleware generation, Redis-backed distributed counting, abuse pattern detection, and proper HTTP response headers.

## Instructions

### 1. Assess the API Surface

Before writing any code, analyze the target application:

- List all public endpoints and their HTTP methods
- Classify endpoints by sensitivity: authentication (highest), write operations (high), read operations (medium), static/health (low)
- Identify existing middleware stack and framework (Express, Fastify, Django, Gin, etc.)
- Check if Redis or another shared store is available for distributed rate limiting

### 2. Choose the Right Algorithm

Select based on the use case:

| Algorithm | Best For | Trade-off |
|-----------|----------|-----------|
| Fixed Window | Simple per-minute caps | Burst at window edges |
| Sliding Window Log | Precise per-user limits | Higher memory per key |
| Sliding Window Counter | Balance of accuracy and memory | Slight approximation |
| Token Bucket | APIs with burst allowance | More complex to tune |
| Leaky Bucket | Smooth output rate | Delays rather than rejects |

Default recommendation: **Sliding Window Counter** — it handles 95% of use cases with good accuracy and reasonable memory usage.

### 3. Implement Layered Limits

Always implement at least two layers:

**Layer 1 — Global IP limit**: Catches volumetric abuse before authentication. Typical: 100-300 req/min per IP.

**Layer 2 — Endpoint-specific limits**: Different limits per endpoint category. Auth endpoints get the strictest limits (3-10 req/min).

**Layer 3 — Authenticated user quotas** (if applicable): Daily or hourly caps per API key or user ID. Return quota status in response headers.

### 4. Response Headers

Send these headers on EVERY response (not just 429s). `X-RateLimit-*` is a widespread convention, not a standard:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1708012800     (epoch seconds, as in the example below)
Retry-After: 30                   (only on 429 responses)
```

The IETF draft `draft-ietf-httpapi-ratelimit-headers` (version 11, May 2026, still a draft, not an RFC) defines `RateLimit-Policy` and `RateLimit` instead, with the reset given as seconds from now. Choose one scheme and document it. A precise `Retry-After` is the number of seconds until the oldest counted request leaves the window; the example sends the full window length, which is a safe overestimate.

### 5. Abuse Detection Patterns

Beyond simple counting, detect:

- **Credential stuffing**: Many unique usernames from one IP on auth endpoints
- **Scraping**: Sequential access patterns on listing endpoints
- **Header anomalies**: Missing User-Agent, rotating headers on rapid requests
- **Distributed attacks**: Same user-agent/fingerprint across many IPs

### 6. Graceful Degradation

Always implement a fallback when Redis is unavailable:

- Fall back to in-memory rate limiting per process
- Log the Redis failure prominently
- Do NOT fail open (allowing unlimited requests) unless explicitly configured

### 7. Avoid Common Pitfalls

- **Trust proxy configuration**: Always verify how `X-Forwarded-For` is parsed. Behind a load balancer, the client IP may not be `req.ip`
- **Shared NAT**: Don't set per-IP limits too low — corporate networks may have thousands of users behind one IP. Minimum 100 req/min for non-auth endpoints
- **Key design**: Use composite keys (`ip:endpoint`, `userId:endpoint`) not just IP alone
- **Time sync**: Use Redis server time (`TIME` command) not local clock for distributed setups

## Examples

### Example 1: Express middleware with Redis sliding window

**Prompt**: "Add rate limiting to my Express API. Auth endpoints should allow 5 requests per minute per IP. All other endpoints 60 per minute per authenticated user."

**Output**: The agent creates `src/middleware/rateLimiter.ts`:

```typescript
import { Redis } from 'ioredis';
import { Request, Response, NextFunction } from 'express';

const redis = new Redis(process.env.REDIS_URL);

interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator: (req: Request) => string;
}

const configs: Record<string, RateLimitConfig> = {
  auth: {
    windowMs: 60_000,
    max: 5,
    keyGenerator: (req) => `rl:auth:${req.ip}`,
  },
  default: {
    windowMs: 60_000,
    max: 60,
    keyGenerator: (req) => `rl:api:${(req as any).userId ?? req.ip}`,
  },
};

export function rateLimit(category: keyof typeof configs) {
  const config = configs[category];
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = config.keyGenerator(req);
    // Read the Redis server clock so every app instance counts against the same window
    const [sec, usec] = await redis.time();
    const now = Number(sec) * 1000 + Math.floor(Number(usec) / 1000);
    const windowStart = now - config.windowMs;

    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zadd(key, now.toString(), `${now}:${Math.random()}`);
    multi.zcard(key);
    multi.expire(key, Math.ceil(config.windowMs / 1000));
    const results = await multi.exec();

    const count = results![2][1] as number;
    res.set('X-RateLimit-Limit', config.max.toString());
    res.set('X-RateLimit-Remaining', Math.max(0, config.max - count).toString());
    res.set('X-RateLimit-Reset', Math.ceil((now + config.windowMs) / 1000).toString());

    if (count > config.max) {
      res.set('Retry-After', Math.ceil(config.windowMs / 1000).toString());
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
}
```

### Example 2: Abuse detection for credential stuffing

**Prompt**: "Detect credential stuffing on my login endpoint. Block IPs that try more than 20 unique usernames in 5 minutes."

**Output**: The agent adds a detection middleware that tracks unique username attempts per IP using a Redis HyperLogLog, blocking IPs that exceed the threshold and logging the event with full request metadata for incident response.

## Guidelines

- Always test rate limiting with concurrent requests — race conditions in counter logic are common
- Include integration tests that verify 429 responses and header values
- Document the rate limits in your API documentation or OpenAPI spec
- Consider offering rate limit increase for paid tiers via configuration, not code changes
- Log all rate limit events in structured format for security monitoring

Check the 429 path from the shell. With the auth limit of 5 requests per minute, the first five calls return 200 and the sixth returns 429:

```bash
for i in $(seq 1 6); do
  curl -s -o /dev/null -D - -X POST http://localhost:3000/api/login \
    -H "Content-Type: application/json" -d '{"username":"maya.chen"}' \
    | grep -i -E "^HTTP|^x-ratelimit|^retry-after"
done
```
