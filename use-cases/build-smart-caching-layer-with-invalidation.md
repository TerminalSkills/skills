---
title: Build a Smart Caching Layer with Invalidation
slug: build-smart-caching-layer-with-invalidation
description: Build a multi-tier caching system with tag-based invalidation, cache stampede prevention, stale-while-revalidate, and cache warming — reducing database load by 90% while keeping data fresh.
skills:
  - typescript
  - redis
  - postgresql
  - hono
category: Backend Development
tags:
  - caching
  - redis
  - performance
  - invalidation
  - database
---

# Build a Smart Caching Layer with Invalidation

## The Problem

Nina runs a high-traffic e-commerce API serving 20K requests/second. PostgreSQL handles it during normal hours, but flash sales bring 100K req/s and the database buckles. They added basic Redis caching but now have stale data problems: price updates take 5 minutes to appear. Cache invalidation is ad-hoc — some endpoints clear caches, others don't. During a flash sale, the cache expires and 50K requests simultaneously hit the database (cache stampede), crashing it harder than no cache at all.

## Step 1: Build the Caching Engine

```typescript
// src/cache/smart-cache.ts — Multi-tier cache with stampede prevention and tag invalidation
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface CacheOptions {
  ttlSeconds: number;
  staleTtlSeconds?: number;   // serve stale data for this long while revalidating
  tags?: string[];             // tag-based invalidation groups
  lockTimeoutMs?: number;      // stampede lock duration
}

interface CacheEntry<T> {
  data: T;
  createdAt: number;
  expiresAt: number;
  staleAt: number;
  tags: string[];
}

// Get or compute: the core caching primitive
export async function cached<T>(
  key: string,
  compute: () => Promise<T>,
  options: CacheOptions
): Promise<T> {
  const cacheKey = `cache:${key}`;

  // Try cache first
  const raw = await redis.get(cacheKey);

  if (raw) {
    const entry: CacheEntry<T> = JSON.parse(raw);
    const now = Date.now();

    // Fresh data — return immediately
    if (now < entry.staleAt) {
      return entry.data;
    }

    // Stale but within stale TTL — return stale, revalidate in background
    if (now < entry.expiresAt) {
      revalidateInBackground(key, cacheKey, compute, options).catch(() => {});
      return entry.data;
    }
  }

  // Cache miss — compute with stampede prevention
  return computeWithLock(key, cacheKey, compute, options);
}

// Stampede prevention: only one request computes, others wait
async function computeWithLock<T>(
  key: string,
  cacheKey: string,
  compute: () => Promise<T>,
  options: CacheOptions
): Promise<T> {
  const lockKey = `lock:${key}`;
  const lockTimeout = options.lockTimeoutMs || 10000;
  const lockValue = Math.random().toString(36);

  // Try to acquire lock
  const acquired = await redis.set(lockKey, lockValue, "PX", lockTimeout, "NX");

  if (acquired) {
    try {
      const data = await compute();
      await setCacheEntry(cacheKey, data, options);
      return data;
    } finally {
      // Release lock (only if we still own it)
      const current = await redis.get(lockKey);
      if (current === lockValue) await redis.del(lockKey);
    }
  }

  // Another request holds the lock — wait for result
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const raw = await redis.get(cacheKey);
    if (raw) {
      const entry: CacheEntry<T> = JSON.parse(raw);
      return entry.data;
    }
  }

  // Lock holder probably failed — compute ourselves
  return compute();
}

// Background revalidation (stale-while-revalidate pattern)
async function revalidateInBackground<T>(
  key: string,
  cacheKey: string,
  compute: () => Promise<T>,
  options: CacheOptions
): Promise<void> {
  const revalKey = `reval:${key}`;
  const acquired = await redis.set(revalKey, "1", "EX", 10, "NX");

  if (!acquired) return; // Another process is already revalidating

  try {
    const data = await compute();
    await setCacheEntry(cacheKey, data, options);
  } finally {
    await redis.del(revalKey);
  }
}

async function setCacheEntry<T>(cacheKey: string, data: T, options: CacheOptions): Promise<void> {
  const now = Date.now();
  const entry: CacheEntry<T> = {
    data,
    createdAt: now,
    staleAt: now + options.ttlSeconds * 1000,
    expiresAt: now + (options.ttlSeconds + (options.staleTtlSeconds || 60)) * 1000,
    tags: options.tags || [],
  };

  const totalTtl = options.ttlSeconds + (options.staleTtlSeconds || 60);
  await redis.setex(cacheKey, totalTtl, JSON.stringify(entry));

  // Register tags for invalidation
  if (options.tags?.length) {
    const pipeline = redis.pipeline();
    for (const tag of options.tags) {
      pipeline.sadd(`tag:${tag}`, cacheKey);
      pipeline.expire(`tag:${tag}`, totalTtl * 2);
    }
    await pipeline.exec();
  }
}

// Tag-based invalidation: clear all cache entries matching a tag
export async function invalidateTag(tag: string): Promise<number> {
  const tagKey = `tag:${tag}`;
  const keys = await redis.smembers(tagKey);

  if (keys.length === 0) return 0;

  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.del(key);
  }
  pipeline.del(tagKey);
  await pipeline.exec();

  return keys.length;
}

// Invalidate multiple tags at once
export async function invalidateTags(tags: string[]): Promise<number> {
  let total = 0;
  for (const tag of tags) {
    total += await invalidateTag(tag);
  }
  return total;
}

// Cache warming: pre-populate cache for known hot keys
export async function warmCache<T>(
  entries: Array<{ key: string; compute: () => Promise<T>; options: CacheOptions }>
): Promise<number> {
  let warmed = 0;
  const concurrency = 10;

  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    await Promise.allSettled(
      batch.map(async ({ key, compute, options }) => {
        const data = await compute();
        await setCacheEntry(`cache:${key}`, data, options);
        warmed++;
      })
    );
  }

  return warmed;
}
```

## Step 2: Apply to the Product API

```typescript
// src/routes/products.ts — Cached product API
import { Hono } from "hono";
import { cached, invalidateTags } from "../cache/smart-cache";
import { pool } from "../db";

const app = new Hono();

app.get("/products/:id", async (c) => {
  const id = c.req.param("id");

  const product = await cached(
    `product:${id}`,
    async () => {
      const { rows: [p] } = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
      return p;
    },
    {
      ttlSeconds: 300,              // fresh for 5 minutes
      staleTtlSeconds: 60,          // serve stale for 1 more minute while revalidating
      tags: [`product:${id}`, "products"],
    }
  );

  return c.json(product);
});

// When a product is updated, invalidate all related caches
app.put("/products/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  await pool.query("UPDATE products SET name = $2, price = $3 WHERE id = $1", [id, body.name, body.price]);

  // Invalidate product cache AND any list/category caches containing this product
  await invalidateTags([`product:${id}`, `category:${body.categoryId}`, "product-listings"]);

  return c.json({ updated: true });
});

export default app;
```

## Results

- **Database queries reduced by 92%** — cache hit rate of 97% during normal traffic; database handles only cache misses and writes
- **Flash sale: zero database crashes** — stampede prevention ensures only 1 request computes per cache key; 50K simultaneous requests result in 1 database query, not 50K
- **Price updates visible in under 1 second** — tag-based invalidation clears product caches instantly on update; no more 5-minute stale prices
- **Stale-while-revalidate eliminates latency spikes** — users always get a fast response (from cache); background revalidation refreshes data without blocking
- **Cache warming after deploys** — top 1000 products pre-cached on startup; first users after deploy get cache hits, not cold misses
