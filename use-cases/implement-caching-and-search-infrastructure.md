---
title: "Implement Caching and Full-Text Search Infrastructure"
slug: implement-caching-and-search-infrastructure
description: "Add Redis caching to eliminate redundant database queries and set up full-text search so users find what they need in milliseconds."
skills:
  - cache-strategy
  - search-engine-setup
  - redis
category: development
tags:
  - caching
  - redis
  - search
  - performance
  - infrastructure
---

# Implement Caching and Full-Text Search Infrastructure

## The Problem

Your API response times are climbing as the dataset grows. The product catalog endpoint takes 800ms because it queries PostgreSQL for 50 products with category filters, price ranges, and sorting on every request -- even though the catalog only changes a few times per day. The search bar does a LIKE query that scans 200,000 rows and takes 2.5 seconds, which is unusable. Users type "running shoes" and get results for "running" OR "shoes" instead of relevant products. You need caching to stop hitting the database for data that rarely changes, and a real search engine that handles typos, synonyms, and relevance ranking.

## The Solution

Use the **redis** skill to set up Redis as the caching and session layer, **cache-strategy** to design invalidation patterns that keep cached data consistent, and **search-engine-setup** to deploy and configure a full-text search engine with relevance tuning.

## Step-by-Step Walkthrough

### 1. Set up Redis and define caching patterns

Install Redis and design the caching strategy for different data types.

> Set up Redis for our Node.js API. Define caching strategies for three data patterns: the product catalog (changes 2-3 times per day, serve stale data for up to 5 minutes), user sessions (must be current, 24-hour TTL), and the homepage featured products (changes weekly, cache for 1 hour). Show me the cache key naming convention and TTL configuration for each.

A clear key naming convention like `catalog:category:{id}:page:{n}` prevents key collisions and makes cache debugging possible.

### 2. Implement cache invalidation without stale data

Caching is easy. Invalidation is where every team gets burned.

> Implement cache invalidation for our product catalog. When an admin updates a product, invalidate all cached pages that include that product without clearing the entire catalog cache. Handle the thundering herd problem: if 500 requests arrive right after cache invalidation, only one should hit the database. Use a cache-aside pattern with lock-based revalidation.

The cache-aside pattern with locking prevents thundering herd in a few lines of TypeScript:

```typescript
async function getCatalogPage(category: string, page: number): Promise<Product[]> {
  const key = `catalog:${category}:page:${page}`;
  const lockKey = `${key}:lock`;

  // Try cache first
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  // Acquire lock so only one request rebuilds the cache
  const acquired = await redis.set(lockKey, "1", "EX", 10, "NX");
  if (!acquired) {
    // Another request is rebuilding; wait and retry
    await sleep(100);
    return getCatalogPage(category, page);
  }

  try {
    const products = await db.query(
      "SELECT * FROM products WHERE category = $1 ORDER BY name LIMIT 50 OFFSET $2",
      [category, page * 50]
    );
    await redis.setex(key, 300, JSON.stringify(products));
    return products;
  } finally {
    await redis.del(lockKey);
  }
}
```

When 500 requests hit simultaneously after invalidation, only the first one queries PostgreSQL. The remaining 499 wait briefly and then read from the freshly populated cache.

### 3. Deploy full-text search with relevance tuning

Replace slow SQL LIKE queries with a proper search engine.

> Set up Meilisearch for our product catalog of 200,000 items. Index product name, description, category, brand, and tags. Configure typo tolerance so "runnng shoes" still returns running shoes. Add synonyms (sneakers = trainers = running shoes). Set up faceted search for category, price range, and brand. The search endpoint should return results in under 50ms.

### 4. Keep the search index in sync with the database

The search index must reflect database changes without manual reindexing.

> Create a sync mechanism that updates the Meilisearch index when products are created, updated, or deleted in PostgreSQL. Use a webhook-based approach where database changes trigger index updates within 10 seconds. Add a full reindex job that runs nightly as a safety net. Monitor index freshness and alert if the lag exceeds 1 minute.

## Real-World Example

An online marketplace with 200,000 products was losing customers to slow search. Users typed queries, waited 2.5 seconds, got irrelevant results, and left. The team added Redis caching for the product catalog, cutting the listing endpoint from 800ms to 12ms for cached responses. Meilisearch replaced the PostgreSQL LIKE query, returning results in 35ms with typo correction and faceted filtering. The cache invalidation strategy used write-through updates so admin product changes appeared in search within 8 seconds. Page load times dropped 60%, search conversion rate doubled, and the PostgreSQL CPU usage fell from 78% to 23% during peak hours because 94% of catalog requests were served from Redis.

## Tips

- Set different TTLs for different data volatility. Product catalogs that change twice a day can tolerate 5-minute TTLs, but inventory counts that change every second should use 10-second TTLs or write-through invalidation.
- Monitor your cache hit rate from day one. A hit rate below 80% means your TTLs are too short, your key structure is too granular, or your access patterns do not benefit from caching.
- Add synonyms to Meilisearch incrementally based on real user searches. Start with the top 20 zero-result queries from your search analytics and map them to existing product terms.
- Run a nightly full reindex as a safety net even if your webhook-based sync is working. Database triggers can fail silently, and the nightly job catches any records that slipped through.
