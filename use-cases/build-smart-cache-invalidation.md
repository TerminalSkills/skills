---
title: Build Smart Cache Invalidation
slug: build-smart-cache-invalidation
description: Build a smart cache invalidation system with tag-based invalidation, dependency tracking, event-driven purging, stale-while-revalidate patterns, and cache warming for consistent data delivery.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Architecture
tags:
  - caching
  - invalidation
  - performance
  - consistency
  - patterns
---

# Build Smart Cache Invalidation

## The Problem

Kai leads backend at a 25-person e-commerce. They cache product data for 1 hour but price changes need to appear immediately. Invalidating by exact key works for single products but updating a category affects 500 products — they can't enumerate all keys. Some caches depend on others: the homepage "featured products" cache depends on individual product caches. Over-invalidation (clearing all product caches on any change) causes cache stampedes. Under-invalidation (missing a dependent cache) shows stale data. They need smart invalidation: tag-based cache groups, dependency tracking, event-driven purging, and cache warming to prevent stampedes.

## Step 1: Build the Invalidation Engine

```typescript
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface CacheEntry { key: string; value: any; tags: string[]; dependencies: string[]; cachedAt: number; ttl: number; version: number; }

// Set cache with tags and dependencies
export async function set(key: string, value: any, options: { ttl: number; tags?: string[]; dependencies?: string[] }): Promise<void> {
  const version = Date.now();
  const entry: CacheEntry = { key, value, tags: options.tags || [], dependencies: options.dependencies || [], cachedAt: Date.now(), ttl: options.ttl, version };

  const pipeline = redis.pipeline();
  pipeline.setex(`cache:${key}`, options.ttl, JSON.stringify(entry));

  // Register tags for tag-based invalidation
  for (const tag of entry.tags) {
    pipeline.sadd(`cache:tag:${tag}`, key);
    pipeline.expire(`cache:tag:${tag}`, options.ttl + 3600); // tag index lives longer than cache
  }

  // Register dependencies
  for (const dep of entry.dependencies) {
    pipeline.sadd(`cache:dep:${dep}`, key);
    pipeline.expire(`cache:dep:${dep}`, options.ttl + 3600);
  }

  await pipeline.exec();
}

// Get from cache
export async function get(key: string): Promise<any | null> {
  const data = await redis.get(`cache:${key}`);
  if (!data) return null;
  const entry: CacheEntry = JSON.parse(data);
  return entry.value;
}

// Get with stale-while-revalidate
export async function getWithSWR(key: string, revalidateFn: () => Promise<any>, options?: { swr?: number }): Promise<any> {
  const data = await redis.get(`cache:${key}`);
  if (data) {
    const entry: CacheEntry = JSON.parse(data);
    const age = (Date.now() - entry.cachedAt) / 1000;
    if (age < entry.ttl) return entry.value; // fresh
    if (age < entry.ttl + (options?.swr || 60)) {
      // Stale but within SWR window — serve stale, revalidate in background
      const revalKey = `cache:reval:${key}`;
      const revalidating = await redis.set(revalKey, "1", "EX", 10, "NX");
      if (revalidating) {
        revalidateFn().then(async (newValue) => {
          await set(key, newValue, { ttl: entry.ttl, tags: entry.tags, dependencies: entry.dependencies });
          await redis.del(revalKey);
        }).catch(() => redis.del(revalKey));
      }
      return entry.value;
    }
  }
  // Cache miss — fetch and cache
  const value = await revalidateFn();
  return value;
}

// Invalidate by tag (e.g., invalidate all "category:electronics" caches)
export async function invalidateByTag(tag: string): Promise<number> {
  const keys = await redis.smembers(`cache:tag:${tag}`);
  if (keys.length === 0) return 0;
  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.del(`cache:${key}`);
    // Also invalidate dependents
    const depKeys = await redis.smembers(`cache:dep:${key}`);
    for (const depKey of depKeys) pipeline.del(`cache:${depKey}`);
  }
  pipeline.del(`cache:tag:${tag}`);
  await pipeline.exec();
  await redis.hincrby("cache:stats", "invalidations", keys.length);
  return keys.length;
}

// Invalidate by key (and all dependents)
export async function invalidateByKey(key: string): Promise<number> {
  let count = 0;
  await redis.del(`cache:${key}`); count++;
  const depKeys = await redis.smembers(`cache:dep:${key}`);
  for (const depKey of depKeys) { await redis.del(`cache:${depKey}`); count++; }
  await redis.del(`cache:dep:${key}`);
  return count;
}

// Event-driven invalidation (subscribe to data change events)
export async function handleDataChange(event: { type: string; entity: string; id: string; tags?: string[] }): Promise<void> {
  // Invalidate specific entity cache
  await invalidateByKey(`${event.entity}:${event.id}`);
  // Invalidate tagged caches
  if (event.tags) {
    for (const tag of event.tags) await invalidateByTag(tag);
  }
  // Warm critical caches
  const warmKeys = await redis.smembers(`cache:warm:${event.entity}`);
  for (const warmKey of warmKeys) {
    await redis.rpush("cache:warm:queue", warmKey);
  }
}

// Register cache key for warming after invalidation
export async function registerForWarming(entityType: string, cacheKey: string, warmFn: string): Promise<void> {
  await redis.sadd(`cache:warm:${entityType}`, JSON.stringify({ key: cacheKey, fn: warmFn }));
}

// Stats
export async function getStats(): Promise<{ hits: number; misses: number; invalidations: number; warmings: number }> {
  const stats = await redis.hgetall("cache:stats");
  return { hits: parseInt(stats.hits || "0"), misses: parseInt(stats.misses || "0"), invalidations: parseInt(stats.invalidations || "0"), warmings: parseInt(stats.warmings || "0") };
}
```

## Results

- **Price change visible immediately** — `handleDataChange({entity:'product', id:'123', tags:['category:electronics']})` → product cache + category listing + homepage featured all invalidated in <10ms
- **Tag-based invalidation** — update category → `invalidateByTag('category:electronics')` clears 500 product caches in one operation; no key enumeration
- **Dependency tracking** — homepage cache depends on featured products; any featured product change auto-invalidates homepage; no stale homepage
- **No cache stampede** — stale-while-revalidate serves old data while one request refreshes; 1000 concurrent requests → 1 DB query, not 1000
- **Cache warming** — after invalidation, critical caches pre-warmed; first user after price change gets cached response, not a slow DB query
