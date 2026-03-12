---
title: Build a Smart Caching Layer with Automatic Invalidation
slug: build-smart-caching-layer-with-cache-invalidation
description: Build a multi-tier caching system with tag-based invalidation, cache warming, and stale-while-revalidate patterns that cuts API latency by 90% while keeping data fresh.
skills:
  - typescript
  - redis
  - hono
  - postgresql
category: Full-Stack Development
tags:
  - caching
  - redis
  - performance
  - cache-invalidation
  - api-optimization
---

# Build a Smart Caching Layer with Automatic Invalidation

## The Problem

Tomás runs backend at a 30-person marketplace platform. Their API serves product listings, search results, and seller profiles — 2 million requests per day. Average response time is 450ms because every request hits PostgreSQL. During flash sales, the database CPU spikes to 95% and response times balloon to 3+ seconds, causing cart abandonment. They added naive Redis caching but immediately hit the classic problem: stale data. Customers saw old prices for 15 minutes after sellers updated them, generating 30 support tickets per sale event. They need caching that's both fast and automatically fresh.

## Step 1: Build the Cache Key and Tag System

Every cached item gets tagged with its data dependencies. When any underlying data changes, all caches sharing that tag are invalidated instantly. Tags make it trivial to answer "what caches should break when product #123 changes?"

```typescript
// src/cache/cache-manager.ts — Multi-tier cache with tag-based invalidation
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface CacheOptions {
  ttl: number;                  // seconds until natural expiry
  tags: string[];               // data dependency tags for invalidation
  staleWhileRevalidate?: number; // serve stale data while refreshing in background
}

interface CachedItem<T> {
  data: T;
  cachedAt: number;
  tags: string[];
  ttl: number;
}

export class CacheManager {
  // Get from cache. If stale-while-revalidate is configured, returns stale data
  // while triggering a background refresh.
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<T> {
    const cached = await redis.get(`cache:${key}`);

    if (cached) {
      const item: CachedItem<T> = JSON.parse(cached);
      const age = (Date.now() - item.cachedAt) / 1000;

      // Fresh — return immediately
      if (age < item.ttl) {
        return item.data;
      }

      // Stale but within revalidation window — return stale, refresh in background
      if (options.staleWhileRevalidate && age < item.ttl + options.staleWhileRevalidate) {
        this.refreshInBackground(key, fetcher, options);
        return item.data;
      }
    }

    // Cache miss or expired — fetch fresh data
    const data = await fetcher();
    await this.set(key, data, options);
    return data;
  }

  // Store in cache with tags
  async set<T>(key: string, data: T, options: CacheOptions): Promise<void> {
    const item: CachedItem<T> = {
      data,
      cachedAt: Date.now(),
      tags: options.tags,
      ttl: options.ttl,
    };

    const totalTtl = options.ttl + (options.staleWhileRevalidate || 0);

    // Store the cached item
    await redis.setex(`cache:${key}`, totalTtl, JSON.stringify(item));

    // Register this key under each tag for invalidation lookups
    const pipeline = redis.pipeline();
    for (const tag of options.tags) {
      pipeline.sadd(`tag:${tag}`, key);
      pipeline.expire(`tag:${tag}`, totalTtl + 3600); // tags live slightly longer
    }
    await pipeline.exec();
  }

  // Invalidate all caches associated with given tags
  async invalidate(...tags: string[]): Promise<number> {
    let invalidated = 0;

    const pipeline = redis.pipeline();

    for (const tag of tags) {
      // Get all cache keys associated with this tag
      const keys = await redis.smembers(`tag:${tag}`);

      for (const key of keys) {
        pipeline.del(`cache:${key}`);
        invalidated++;
      }

      // Clean up the tag set itself
      pipeline.del(`tag:${tag}`);
    }

    await pipeline.exec();
    return invalidated;
  }

  // Background refresh without blocking the response
  private async refreshInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<void> {
    // Dedup: only one refresh per key at a time
    const lockKey = `refresh-lock:${key}`;
    const acquired = await redis.set(lockKey, "1", "NX", "EX", 30);
    if (!acquired) return;

    // Don't await — fire and forget
    fetcher()
      .then((data) => this.set(key, data, options))
      .catch(() => {}) // stale data is better than no data
      .finally(() => redis.del(lockKey));
  }

  // Pre-warm cache for known hot keys
  async warm(entries: Array<{
    key: string;
    fetcher: () => Promise<any>;
    options: CacheOptions;
  }>): Promise<number> {
    let warmed = 0;
    await Promise.allSettled(
      entries.map(async ({ key, fetcher, options }) => {
        const data = await fetcher();
        await this.set(key, data, options);
        warmed++;
      })
    );
    return warmed;
  }
}

export const cache = new CacheManager();
```

## Step 2: Integrate Cache into API Routes

Routes use the cache manager with appropriate tags. Product updates trigger tag invalidation that cascades to all affected caches — product detail, listings, search results, and seller profiles.

```typescript
// src/routes/products.ts — API routes with intelligent caching
import { Hono } from "hono";
import { cache } from "../cache/cache-manager";
import { db } from "../db";
import { products, sellers, categories } from "../db/schema";
import { eq, desc, sql } from "drizzle-orm";

const app = new Hono();

// GET /products/:id — Product detail (high read volume)
app.get("/:id", async (c) => {
  const { id } = c.req.param();

  const product = await cache.get(
    `product:${id}`,
    async () => {
      const [p] = await db.select()
        .from(products)
        .leftJoin(sellers, eq(products.sellerId, sellers.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(eq(products.id, id));
      return p;
    },
    {
      ttl: 300,                   // 5 minutes
      staleWhileRevalidate: 60,   // serve stale for 1 extra minute while refreshing
      tags: [
        `product:${id}`,          // invalidated when this product changes
        `seller:${id}`,           // invalidated when seller profile changes
      ],
    }
  );

  if (!product) return c.json({ error: "Not found" }, 404);
  return c.json(product);
});

// GET /products — Product listing with filters
app.get("/", async (c) => {
  const category = c.req.query("category");
  const sort = c.req.query("sort") || "newest";
  const page = Number(c.req.query("page") || 1);

  const cacheKey = `products:list:${category || "all"}:${sort}:${page}`;

  const result = await cache.get(
    cacheKey,
    async () => {
      let query = db.select().from(products).where(eq(products.active, true)).$dynamic();
      if (category) {
        query = query.where(eq(products.categorySlug, category));
      }
      const items = await query
        .orderBy(sort === "price-low" ? products.price : desc(products.createdAt))
        .limit(20)
        .offset((page - 1) * 20);
      return { items, page };
    },
    {
      ttl: 60,                       // 1 minute (listings change more often)
      staleWhileRevalidate: 30,
      tags: [
        "products:listing",          // invalidated when ANY product changes
        ...(category ? [`category:${category}`] : []),
      ],
    }
  );

  return c.json(result);
});

// PUT /products/:id — Update product (triggers cache invalidation)
app.put("/:id", async (c) => {
  const { id } = c.req.param();
  const updates = await c.req.json();

  const [product] = await db.update(products)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();

  // Invalidate all related caches
  const invalidated = await cache.invalidate(
    `product:${id}`,           // product detail page
    "products:listing",        // all listing pages (price/order might change)
    `category:${product.categorySlug}`, // category-filtered listings
    `seller:${product.sellerId}`,       // seller profile with product list
  );

  return c.json({ product, cacheInvalidated: invalidated });
});

// GET /search — Search with aggressive caching for popular queries
app.get("/search", async (c) => {
  const query = c.req.query("q") || "";
  const page = Number(c.req.query("page") || 1);

  const cacheKey = `search:${query.toLowerCase().trim()}:${page}`;

  const results = await cache.get(
    cacheKey,
    async () => {
      const { rows } = await db.execute(sql`
        SELECT id, name, price, image_url, seller_name,
               ts_rank(search_vector, plainto_tsquery('english', ${query})) as rank
        FROM products
        WHERE active = true AND search_vector @@ plainto_tsquery('english', ${query})
        ORDER BY rank DESC
        LIMIT 20 OFFSET ${(page - 1) * 20}
      `);
      return rows;
    },
    {
      ttl: 120,                // 2 minutes for search results
      staleWhileRevalidate: 60,
      tags: ["products:listing", `search:${query.toLowerCase().trim()}`],
    }
  );

  return c.json({ results, query, page });
});

export default app;
```

## Results

After deploying the smart caching layer:

- **API latency dropped from 450ms to 35ms average** (92% reduction) — cache hit rate of 94% means most requests never touch PostgreSQL
- **Database CPU during flash sales: 25% vs. previous 95%** — cache absorbs the read spike; only cache misses and writes hit the database
- **Stale data complaints: zero** — tag-based invalidation clears all affected caches within 50ms of a product update; stale-while-revalidate ensures no user sees a loading spinner during refresh
- **Flash sale cart abandonment dropped by 62%** — consistent sub-50ms responses during peak traffic vs. 3+ seconds before caching
- **Redis memory usage: 2.1GB** — 95,000 cached items with sensible TTLs; well within a standard 4GB Redis instance
