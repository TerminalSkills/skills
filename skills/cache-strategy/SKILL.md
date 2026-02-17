---
name: cache-strategy
description: >-
  Design and implement caching layers for APIs and web applications using Redis
  or Memcached. Use when you need to reduce database load, improve response times,
  or handle traffic spikes. Covers cache-aside, write-through, and write-behind
  patterns, TTL strategies, cache invalidation, and stampede prevention.
  Trigger words: cache, Redis, Memcached, TTL, cache invalidation, response time,
  throughput, rate limiting.
license: Apache-2.0
compatibility: "Redis 7+ or Memcached 1.6+. Node.js 18+ or Python 3.10+."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["caching", "redis", "performance", "api-optimization"]
---

# Cache Strategy

## Overview
This skill helps you design and implement multi-layer caching strategies for high-traffic APIs. It covers choosing the right caching pattern for your data access profile, configuring TTLs, preventing cache stampedes, and setting up cache invalidation that actually works in production.

## Instructions

### 1. Analyze the caching opportunity
Before adding caching, identify what to cache by examining query patterns:

```typescript
// Instrument your API routes to log response times and call frequency
// Look for: high frequency + low change rate = best cache candidates
// Example analysis output:
// GET /api/products      → 12,000 req/min, changes every 30min → CACHE (TTL: 5min)
// GET /api/products/:id  → 8,000 req/min, changes on update   → CACHE (invalidate on write)
// POST /api/orders       → 200 req/min, always unique          → DO NOT CACHE
// GET /api/user/profile  → 3,000 req/min, changes rarely       → CACHE (TTL: 15min)
```

### 2. Implement cache-aside pattern (most common)
The application checks cache first, falls back to database, then populates cache:

```typescript
import Redis from "ioredis";

const redis = new Redis({ host: "localhost", port: 6379, maxRetriesPerRequest: 3 });

async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const data = await fetcher();
  await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
  return data;
}

// Usage in route handler
app.get("/api/products/:id", async (req, res) => {
  const product = await getCached(
    `product:${req.params.id}`,
    () => db.products.findById(req.params.id),
    600 // 10 minutes
  );
  res.json(product);
});
```

### 3. Prevent cache stampedes
When a popular key expires, hundreds of requests hit the database simultaneously:

```typescript
async function getCachedWithLock<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, "1", "EX", 10, "NX");

  if (acquired) {
    try {
      const data = await fetcher();
      await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
      return data;
    } finally {
      await redis.del(lockKey);
    }
  }

  // Another process is refreshing — wait and retry
  await new Promise((r) => setTimeout(r, 100));
  return getCachedWithLock(key, fetcher, ttlSeconds);
}
```

### 4. Cache invalidation strategies
Pattern-based invalidation for related data:

```typescript
async function invalidatePattern(pattern: string): Promise<void> {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    if (keys.length > 0) await redis.del(...keys);
    cursor = nextCursor;
  } while (cursor !== "0");
}

// On product update: invalidate product and any list containing it
async function onProductUpdate(productId: string): Promise<void> {
  await redis.del(`product:${productId}`);
  await invalidatePattern("products:list:*");
}
```

## Examples

### Example 1: API response caching
**Prompt:** "Add Redis caching to my Express API. The /api/catalog endpoint is called 15,000 times per minute but the data only changes when an admin publishes updates. I want sub-10ms response times."

**Agent output:**
- Adds `src/cache/redis-client.ts` with connection pooling and retry config
- Wraps `/api/catalog` with cache-aside pattern, 5-minute TTL
- Adds stampede prevention with distributed locking
- Creates `src/cache/invalidation.ts` — called from the admin publish endpoint to bust catalog cache
- Adds cache hit/miss metrics via response headers (`X-Cache: HIT` / `X-Cache: MISS`)

### Example 2: Multi-layer caching
**Prompt:** "Our product API serves 50,000 RPM. Add in-memory cache for the hottest 1,000 items and Redis for everything else. Products change when inventory updates."

**Agent output:**
- Adds `src/cache/memory-lru.ts` using an LRU cache with 1,000 max entries and 60-second TTL
- Adds `src/cache/tiered-cache.ts` that checks memory → Redis → database in sequence
- Creates `src/events/inventory-handler.ts` that invalidates both cache layers on inventory change
- Adds `/admin/cache/stats` endpoint showing hit rates for each layer

## Guidelines

- **Cache-aside is the default** — use write-through only when you need guaranteed cache freshness on writes.
- **Never cache without a TTL** — even "permanent" data should have a long TTL (1 hour+) as a safety net.
- **Use key namespacing** — prefix keys like `products:v2:{id}` so you can version your cache schema.
- **Monitor hit rate** — below 80% means your TTL is too short or your data changes too fast for caching.
- **Serialize carefully** — JSON.parse/stringify is fine for most cases but consider MessagePack for large payloads.
- **Plan for Redis downtime** — your app should degrade gracefully to direct database queries, not crash.
- **Avoid caching user-specific data in shared caches** without proper key isolation — data leaks are a security incident.
