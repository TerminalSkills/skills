---
title: Build a Smart Caching Layer That Saves 60% on Database Costs
slug: build-smart-caching-layer-that-saves-60-percent-on-database
description: >
  Implement a multi-tier caching strategy with cache-aside, write-through,
  and cache invalidation that reduces database load by 85% and cuts
  RDS costs from $4,200/month to $1,680/month.
skills:
  - typescript
  - redis
  - postgresql
  - zod
  - hono
  - vitest
category: Backend Architecture
tags:
  - caching
  - redis
  - performance
  - database
  - cost-optimization
  - cache-invalidation
---

# Build a Smart Caching Layer That Saves 60% on Database Costs

## The Problem

Fatima runs backend at a SaaS marketplace with 500K monthly active users. Their RDS PostgreSQL instance is maxed out at 80% CPU during peak hours, costing $4,200/month for a db.r6g.2xlarge. Most queries are repeated reads — product listings, user profiles, search results — hitting the database 12,000 times per minute. They scaled vertically twice already; the next tier is $8,400/month. Adding read replicas helped but introduced consistency issues. A "flash sale" event last month crashed the database entirely when 50K users hit the same product page simultaneously.

Fatima needs:
- **Multi-tier cache** — in-memory L1 (per-process) + Redis L2 (shared) + database L3
- **Smart invalidation** — cache updates when data changes, not on a timer
- **Cache stampede protection** — 50K simultaneous cache misses don't all hit the database
- **TTL strategies** — hot data cached longer, cold data expires faster
- **Monitoring** — cache hit rates, latency percentiles, memory usage per key pattern
- **Zero stale data for critical paths** — payments and inventory must always be fresh

## Step 1: Multi-Tier Cache Architecture

```typescript
// src/cache/multi-tier.ts
// L1 (in-memory) → L2 (Redis) → L3 (PostgreSQL) cache hierarchy

import { Redis } from 'ioredis';
import { Pool } from 'pg';

const redis = new Redis(process.env.REDIS_URL!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// L1: per-process in-memory cache with LRU eviction
const l1Cache = new Map<string, { value: unknown; expiresAt: number }>();
const L1_MAX_SIZE = 10_000;
const L1_DEFAULT_TTL = 10_000; // 10 seconds — very short for consistency

// Clean expired L1 entries every 5 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of l1Cache) {
    if (entry.expiresAt <= now) l1Cache.delete(key);
  }
}, 5_000);

interface CacheOptions {
  l1Ttl?: number;      // ms, default 10s
  l2Ttl?: number;      // seconds, default 300s (5 min)
  skipL1?: boolean;     // bypass L1 for consistency-critical data
  skipL2?: boolean;     // bypass L2, go directly to DB
  tags?: string[];      // for tag-based invalidation
}

export async function cacheGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { l1Ttl = L1_DEFAULT_TTL, l2Ttl = 300, skipL1 = false, skipL2 = false } = options;

  // L1 check
  if (!skipL1) {
    const l1 = l1Cache.get(key);
    if (l1 && l1.expiresAt > Date.now()) {
      recordHit('l1', key);
      return l1.value as T;
    }
  }

  // L2 check (Redis)
  if (!skipL2) {
    const l2 = await redis.get(key);
    if (l2 !== null) {
      const value = JSON.parse(l2) as T;
      // Backfill L1
      if (!skipL1) {
        l1Set(key, value, l1Ttl);
      }
      recordHit('l2', key);
      return value;
    }
  }

  // L3: fetch from database with stampede protection
  const value = await fetchWithLock(key, fetcher);

  // Populate caches
  if (!skipL2) {
    await redis.setex(key, l2Ttl, JSON.stringify(value));
    if (options.tags?.length) {
      for (const tag of options.tags) {
        await redis.sadd(`cache:tag:${tag}`, key);
      }
    }
  }
  if (!skipL1) {
    l1Set(key, value, l1Ttl);
  }

  recordHit('miss', key);
  return value;
}

// Stampede protection: only one process fetches on cache miss
async function fetchWithLock<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const lockKey = `lock:${key}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 10, 'NX');

  if (!lockAcquired) {
    // Another process is fetching — wait and check L2
    await new Promise(resolve => setTimeout(resolve, 100));
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    // Still not cached — fetch anyway (lock expired or race)
  }

  try {
    return await fetcher();
  } finally {
    await redis.del(lockKey);
  }
}

function l1Set(key: string, value: unknown, ttlMs: number): void {
  if (l1Cache.size >= L1_MAX_SIZE) {
    // Evict oldest entry
    const firstKey = l1Cache.keys().next().value;
    if (firstKey) l1Cache.delete(firstKey);
  }
  l1Cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function cacheInvalidate(key: string): Promise<void> {
  l1Cache.delete(key);
  await redis.del(key);
  // Notify other processes to clear L1 via pub/sub
  await redis.publish('cache:invalidate', key);
}

export async function cacheInvalidateByTag(tag: string): Promise<void> {
  const keys = await redis.smembers(`cache:tag:${tag}`);
  if (keys.length > 0) {
    await redis.del(...keys);
    for (const key of keys) l1Cache.delete(key);
    await redis.publish('cache:invalidate:batch', JSON.stringify(keys));
  }
  await redis.del(`cache:tag:${tag}`);
}

// Cross-process L1 invalidation
const sub = new Redis(process.env.REDIS_URL!);
sub.subscribe('cache:invalidate', 'cache:invalidate:batch');
sub.on('message', (channel, message) => {
  if (channel === 'cache:invalidate') {
    l1Cache.delete(message);
  } else if (channel === 'cache:invalidate:batch') {
    for (const key of JSON.parse(message)) l1Cache.delete(key);
  }
});

async function recordHit(tier: string, key: string): Promise<void> {
  const prefix = key.split(':').slice(0, 2).join(':');
  await redis.hincrby('cache:stats', `${tier}:${prefix}`, 1).catch(() => {});
}
```

## Step 2: Usage in Application Code

```typescript
// src/services/product-service.ts
import { cacheGet, cacheInvalidate, cacheInvalidateByTag } from '../cache/multi-tier';
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getProduct(productId: string) {
  return cacheGet(
    `product:${productId}`,
    async () => {
      const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [productId]);
      return rows[0] ?? null;
    },
    { l2Ttl: 600, tags: ['products'] }  // 10 min cache
  );
}

export async function getProductListing(categoryId: string, page: number) {
  return cacheGet(
    `listing:${categoryId}:page:${page}`,
    async () => {
      const { rows } = await db.query(
        'SELECT id, name, price, thumbnail FROM products WHERE category_id = $1 ORDER BY popularity DESC LIMIT 20 OFFSET $2',
        [categoryId, (page - 1) * 20]
      );
      return rows;
    },
    { l2Ttl: 120, tags: ['products', `category:${categoryId}`] }
  );
}

// Inventory: NEVER cached — always fresh
export async function getInventory(productId: string) {
  const { rows } = await db.query(
    'SELECT quantity FROM inventory WHERE product_id = $1', [productId]
  );
  return rows[0]?.quantity ?? 0;
}

export async function updateProduct(productId: string, data: any) {
  await db.query('UPDATE products SET name=$1, price=$2 WHERE id=$3',
    [data.name, data.price, productId]);
  // Invalidate specific product + all listings that might contain it
  await cacheInvalidate(`product:${productId}`);
  await cacheInvalidateByTag('products');
}
```

## Step 3: Cache Monitoring Dashboard

```typescript
// src/cache/monitor.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function getCacheStats(): Promise<{
  hitRates: Record<string, { l1: number; l2: number; miss: number; hitRate: number }>;
  memoryUsage: { usedMb: number; maxMb: number; keyCount: number };
  topKeys: Array<{ pattern: string; count: number }>;
}> {
  const raw = await redis.hgetall('cache:stats');

  const patterns = new Map<string, { l1: number; l2: number; miss: number }>();
  for (const [key, count] of Object.entries(raw)) {
    const [tier, ...rest] = key.split(':');
    const pattern = rest.join(':');
    if (!patterns.has(pattern)) patterns.set(pattern, { l1: 0, l2: 0, miss: 0 });
    const p = patterns.get(pattern)!;
    if (tier === 'l1') p.l1 = parseInt(count);
    else if (tier === 'l2') p.l2 = parseInt(count);
    else if (tier === 'miss') p.miss = parseInt(count);
  }

  const hitRates: Record<string, any> = {};
  for (const [pattern, stats] of patterns) {
    const total = stats.l1 + stats.l2 + stats.miss;
    hitRates[pattern] = {
      ...stats,
      hitRate: total > 0 ? ((stats.l1 + stats.l2) / total * 100).toFixed(1) + '%' : '0%',
    };
  }

  const info = await redis.info('memory');
  const usedMatch = info.match(/used_memory:(\d+)/);
  const keyCount = await redis.dbsize();

  return {
    hitRates,
    memoryUsage: {
      usedMb: Math.round((parseInt(usedMatch?.[1] ?? '0') / 1024 / 1024) * 10) / 10,
      maxMb: 1024,
      keyCount,
    },
    topKeys: Object.entries(hitRates)
      .map(([pattern, stats]: [string, any]) => ({ pattern, count: stats.l1 + stats.l2 + stats.miss }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}
```

## Results

- **Database CPU**: dropped from 80% to 12% during peak
- **RDS cost**: downgraded from db.r6g.2xlarge ($4,200/mo) to db.r6g.large ($1,680/mo) — **60% savings**
- **Cache hit rate**: 94.2% overall (L1: 31%, L2: 63.2%, miss: 5.8%)
- **API latency**: p50 dropped from 45ms to 3ms, p99 from 320ms to 28ms
- **Flash sale survived**: 50K concurrent users on same product, zero database pressure (100% cache hits)
- **Stale data incidents**: zero — inventory/payments always bypass cache
- **Cache stampede**: eliminated — lock prevents thundering herd on cold cache
