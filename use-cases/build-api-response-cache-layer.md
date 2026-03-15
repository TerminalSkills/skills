---
title: Build an API Response Cache Layer
slug: build-api-response-cache-layer
description: Build an API response cache layer with TTL management, cache invalidation strategies, conditional requests, stale-while-revalidate, and per-endpoint configuration for API performance.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Architecture
tags:
  - caching
  - api
  - performance
  - redis
  - http-cache
---

# Build an API Response Cache Layer

## The Problem

Liam leads backend at a 20-person company. Their API serves 10K requests/second but most responses are identical — product listings, category pages, and config endpoints return the same data for thousands of users. Database handles 8K queries/second for data that changes once per hour. Adding Redis caching per-endpoint is scattered across 50 handlers with inconsistent TTLs and no invalidation strategy. They need a centralized cache layer: configurable per-endpoint, automatic invalidation on writes, conditional requests (ETag/If-None-Match), stale-while-revalidate, and cache analytics.

## Step 1: Build the Cache Layer

```typescript
// src/cache/layer.ts — API response cache with invalidation and conditional requests
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface CacheConfig {
  path: string;
  ttl: number;
  staleWhileRevalidate: number;
  varyBy: string[];
  invalidateOn: string[];
  methods: string[];
}

const CACHE_CONFIGS: CacheConfig[] = [
  { path: "/api/products", ttl: 60, staleWhileRevalidate: 30, varyBy: ["category", "page"], invalidateOn: ["product.created", "product.updated", "product.deleted"], methods: ["GET"] },
  { path: "/api/categories", ttl: 300, staleWhileRevalidate: 60, varyBy: [], invalidateOn: ["category.updated"], methods: ["GET"] },
  { path: "/api/config", ttl: 600, staleWhileRevalidate: 120, varyBy: ["tenant"], invalidateOn: ["config.updated"], methods: ["GET"] },
  { path: "/api/user/profile", ttl: 0, staleWhileRevalidate: 0, varyBy: [], invalidateOn: [], methods: [] },
];

interface CachedResponse {
  body: string;
  status: number;
  headers: Record<string, string>;
  etag: string;
  cachedAt: number;
  ttl: number;
}

// Middleware: check cache before handler, cache after
export function cacheMiddleware() {
  return async (c: any, next: any) => {
    const config = findConfig(c.req.path, c.req.method);
    if (!config || config.ttl === 0) return next();

    const cacheKey = buildCacheKey(c.req, config);

    // Check conditional request (ETag)
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch) {
      const cachedEtag = await redis.get(`${cacheKey}:etag`);
      if (cachedEtag && cachedEtag === ifNoneMatch) {
        await redis.hincrby("cache:stats", "conditionalHits", 1);
        return c.body(null, 304);
      }
    }

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      const entry: CachedResponse = JSON.parse(cached);
      const age = (Date.now() - entry.cachedAt) / 1000;

      if (age < config.ttl) {
        // Fresh — serve from cache
        await redis.hincrby("cache:stats", "hits", 1);
        c.header("X-Cache", "HIT");
        c.header("Cache-Control", `max-age=${Math.ceil(config.ttl - age)}`);
        c.header("ETag", entry.etag);
        c.header("Age", String(Math.ceil(age)));
        return c.json(JSON.parse(entry.body), entry.status);
      }

      if (age < config.ttl + config.staleWhileRevalidate) {
        // Stale but within SWR window — serve stale, revalidate in background
        await redis.hincrby("cache:stats", "staleHits", 1);
        c.header("X-Cache", "STALE");
        c.header("ETag", entry.etag);
        revalidateInBackground(c.req, config, cacheKey).catch(() => {});
        return c.json(JSON.parse(entry.body), entry.status);
      }
    }

    // Cache miss — run handler
    await redis.hincrby("cache:stats", "misses", 1);
    await next();

    // Cache the response
    if (c.res.status < 400) {
      const body = await c.res.clone().text();
      const etag = createHash("md5").update(body).digest("hex").slice(0, 16);

      const entry: CachedResponse = {
        body, status: c.res.status,
        headers: Object.fromEntries(c.res.headers.entries()),
        etag, cachedAt: Date.now(), ttl: config.ttl,
      };

      await redis.setex(cacheKey, config.ttl + config.staleWhileRevalidate, JSON.stringify(entry));
      await redis.setex(`${cacheKey}:etag`, config.ttl + config.staleWhileRevalidate, etag);

      c.header("X-Cache", "MISS");
      c.header("ETag", etag);
      c.header("Cache-Control", `max-age=${config.ttl}`);
    }
  };
}

// Invalidate cache when data changes
export async function invalidate(event: string): Promise<number> {
  let invalidated = 0;
  for (const config of CACHE_CONFIGS) {
    if (config.invalidateOn.includes(event)) {
      const pattern = `cache:${config.path}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        invalidated += keys.length;
      }
    }
  }
  await redis.hincrby("cache:stats", "invalidations", invalidated);
  return invalidated;
}

async function revalidateInBackground(req: any, config: CacheConfig, cacheKey: string): Promise<void> {
  // Mark as revalidating to prevent duplicate revalidation
  const revalKey = `${cacheKey}:revalidating`;
  const isRevalidating = await redis.set(revalKey, "1", "EX", 10, "NX");
  if (!isRevalidating) return;

  try {
    // Re-fetch from origin
    const response = await fetch(`${process.env.INTERNAL_URL}${req.path}`, {
      headers: { "X-Cache-Bypass": "1" },
    });
    if (response.ok) {
      const body = await response.text();
      const etag = createHash("md5").update(body).digest("hex").slice(0, 16);
      await redis.setex(cacheKey, config.ttl + config.staleWhileRevalidate, JSON.stringify({
        body, status: response.status, headers: {}, etag, cachedAt: Date.now(), ttl: config.ttl,
      }));
    }
  } finally {
    await redis.del(revalKey);
  }
}

// Cache analytics
export async function getCacheStats(): Promise<{
  hits: number; misses: number; staleHits: number; conditionalHits: number;
  invalidations: number; hitRate: number;
}> {
  const stats = await redis.hgetall("cache:stats");
  const hits = parseInt(stats.hits || "0") + parseInt(stats.staleHits || "0") + parseInt(stats.conditionalHits || "0");
  const misses = parseInt(stats.misses || "0");
  const total = hits + misses;

  return {
    hits: parseInt(stats.hits || "0"),
    misses,
    staleHits: parseInt(stats.staleHits || "0"),
    conditionalHits: parseInt(stats.conditionalHits || "0"),
    invalidations: parseInt(stats.invalidations || "0"),
    hitRate: total > 0 ? Math.round((hits / total) * 100) : 0,
  };
}

function findConfig(path: string, method: string): CacheConfig | null {
  return CACHE_CONFIGS.find((c) => path.startsWith(c.path) && (c.methods.length === 0 || c.methods.includes(method))) || null;
}

function buildCacheKey(req: any, config: CacheConfig): string {
  const vary = config.varyBy.map((v) => req.query(v) || req.header(`x-${v}`) || "").join(":");
  return `cache:${req.path}:${vary}`;
}
```

## Results

- **DB queries: 8K/sec → 800/sec** — 90% cache hit rate on product and category endpoints; database load reduced 10x; headroom for growth
- **Stale-while-revalidate** — expired cache serves instant stale response while origin fetched in background; users never see slow responses during cache refresh
- **ETag conditional requests** — clients send `If-None-Match`; unchanged responses return 304 with zero body; saves 60% bandwidth for repeat visitors
- **Event-based invalidation** — `product.updated` event fires → all product cache keys invalidated in <10ms; no stale data after writes; no manual cache busting
- **Centralized config** — all cache rules in one file; change TTL for `/api/products` from 60s to 120s → redeploy; no touching 50 handlers
