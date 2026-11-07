---
title: "Implement Caching and Full-Text Search Infrastructure"
slug: implement-caching-and-search-infrastructure
description: "Add Redis caching to eliminate redundant database queries and set up full-text search so users find what they need in milliseconds."
skills:
  - cache-strategy
  - search-engine-setup
  - redis
  - meilisearch
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

Your API response times are climbing as the dataset grows. The product catalog endpoint takes 800ms because it queries PostgreSQL for 50 products with category filters, price ranges, and sorting on every request, even though the catalog only changes a few times per day. The search bar does a LIKE query that scans 200,000 rows and takes 2.5 seconds, which is unusable. Users type "running shoes" and get results for "running" OR "shoes" instead of relevant products. You need caching to stop hitting the database for data that rarely changes, and a real search engine that handles typos, synonyms, and relevance ranking.

## The Solution

Use the **redis** skill to set up Redis as the cache and session store, **cache-strategy** to design invalidation patterns that keep cached data consistent, **meilisearch** to deploy the search engine and tune relevance, and **search-engine-setup** for the rules that keep any search index in sync with the database (upserts by id, deletions, scheduled full reindex, zero-result analysis).

## Step-by-Step Walkthrough

### 1. Set up Redis and define caching patterns

Run a Redis instance bound to localhost with a password, and design the strategy for each data type.

> Set up Redis for our Node.js API with ioredis. Define caching strategies for three data patterns: the product catalog (changes 2-3 times per day, serve stale data for up to 5 minutes), user sessions (must be current, 24-hour TTL), and the homepage featured products (changes weekly, cache for 1 hour). Show me the cache key naming convention and TTL configuration for each.

```typescript
// cache.ts
import { Redis } from "ioredis";

export const redis = new Redis({
  host: "127.0.0.1",
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,   // fail fast on an outage so requests fall through to PostgreSQL
});

export const TTL = {
  catalogPage: 300,          // 5 minutes
  session: 86_400,           // 24 hours
  featured: 3_600,           // 1 hour
} as const;
```

A key convention like `catalog:{category}:page:{n}` prevents collisions and makes debugging possible. Never store a key without a TTL, so a missed invalidation is repaired by expiry.

### 2. Implement cache invalidation without stale data

Caching is easy. Invalidation is where every team gets burned.

> Implement cache invalidation for our product catalog. When an admin updates a product, invalidate the cached pages of its category without clearing the whole catalog cache. Handle the thundering herd problem: if 500 requests arrive right after invalidation, only one should hit the database. Use cache-aside with a lock that only its owner can release.

```typescript
import crypto from "node:crypto";
import { redis, TTL } from "./cache";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Release the lock only if we still own it (the lock may have expired and been taken by someone else)
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

export async function getCatalogPage(category: string, page: number): Promise<Product[]> {
  const key = `catalog:${category}:page:${page}`;
  const lockKey = `lock:${key}`;

  for (let attempt = 0; attempt < 20; attempt++) {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const token = crypto.randomUUID();
    if (await redis.set(lockKey, token, "EX", 10, "NX")) {
      try {
        const { rows } = await pool.query(
          "SELECT * FROM products WHERE category = $1 ORDER BY name LIMIT 50 OFFSET $2",
          [category, page * 50],
        );
        await redis.set(key, JSON.stringify(rows), "EX", TTL.catalogPage);
        return rows;
      } finally {
        await redis.eval(RELEASE, 1, lockKey, token);
      }
    }
    await sleep(100);           // another request is rebuilding; wait, then re-read the cache
  }
  // Waited about 2 seconds: stop queuing and read the database directly
  const { rows } = await pool.query(
    "SELECT * FROM products WHERE category = $1 ORDER BY name LIMIT 50 OFFSET $2",
    [category, page * 50],
  );
  return rows;
}

// On product update: drop that category's pages (and the old category's, if it changed)
export async function invalidateCategory(category: string) {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `catalog:${category}:page:*`, "COUNT", 100);
    if (keys.length) await redis.del(...keys);
    cursor = next;
  } while (cursor !== "0");
}
```

When 500 requests arrive simultaneously after invalidation, one acquires the lock and queries PostgreSQL; the others poll the cache every 100 ms and read the freshly stored page. If Redis itself is down, `maxRetriesPerRequest` makes the calls fail, so catch the error in the route handler and answer from PostgreSQL.

### 3. Deploy full-text search with relevance tuning

Replace slow SQL LIKE queries with a search engine.

> Set up Meilisearch for our product catalog of 200,000 items. Index product name, description, category, brand, and tags. Make sure "runnng shoes" still returns running shoes. Add synonyms (sneakers, trainers, running shoes). Set up faceted search for category, price range, and brand.

```bash
export MEILI_MASTER_KEY="$(openssl rand -hex 16)"     # keep it in your secret store
docker run -d --name meilisearch -p 127.0.0.1:7700:7700 \
  -v meili_data:/meili_data -e MEILI_MASTER_KEY -e MEILI_ENV=production \
  getmeili/meilisearch:v1.56
curl http://127.0.0.1:7700/health      # {"status":"available"}
```

```typescript
import { Meilisearch } from "meilisearch";

const client = new Meilisearch({ host: "http://127.0.0.1:7700", apiKey: process.env.MEILI_MASTER_KEY });
const products = client.index("products");

// Typo tolerance is on by default, so "runnng shoes" already matches "running shoes".
await products.updateSettings({
  searchableAttributes: ["name", "brand", "tags", "category", "description"],
  filterableAttributes: ["category", "brand", "price"],
  sortableAttributes: ["price"],
  // Synonyms are one-way: list each direction you want
  synonyms: {
    sneakers: ["trainers", "running shoes"],
    trainers: ["sneakers", "running shoes"],
    "running shoes": ["sneakers", "trainers"],
  },
}).waitTask();   // settings and documents are asynchronous tasks; check the finished task's status

const res = await products.search("runnng shoes", {
  filter: 'category = "footwear" AND price <= 150',
  facets: ["category", "brand"],
  limit: 20,
});
// res.hits, res.facetDistribution, res.processingTimeMs
```

The browser should never hold the master key. Generate a search-only API key (or tenant token) on the server and give that to the front end, or keep searches behind your own API.

### 4. Keep the search index in sync with the database

The index must follow the database without manual reindexing. Follow the `search-engine-setup` sync rules: the product id is the document id, writes are upserts, deletions are tracked, failures are retried in the next cycle.

> Create a sync worker that updates the Meilisearch index when products are created, updated, or deleted in PostgreSQL. Poll rows changed since the last run every 10 seconds, including soft-deleted rows. Add a full reindex that runs nightly as a safety net. Alert if the lag exceeds 1 minute.

```typescript
// sync.ts — runs every 10 seconds
async function syncOnce(since: Date): Promise<Date> {
  const { rows } = await pool.query(
    "SELECT id, name, brand, category, tags, description, price, deleted_at, updated_at " +
    "FROM products WHERE updated_at > $1 ORDER BY updated_at LIMIT 1000", [since]);
  const live = rows.filter((r) => !r.deleted_at).map(({ deleted_at, updated_at, ...doc }) => doc);
  const gone = rows.filter((r) => r.deleted_at).map((r) => r.id);

  if (live.length) await expectOk(await products.addDocuments(live).waitTask());   // upsert by id
  if (gone.length) await expectOk(await products.deleteDocuments(gone).waitTask());
  return rows.length ? rows[rows.length - 1].updated_at : since;
}
// expectOk throws when task.status === "failed", so the same window is retried next cycle.
```

Lag is "now minus the `updated_at` of the newest row the worker has indexed"; export it as a metric and alert at 60 seconds. Rows that share one `updated_at` at a batch boundary can be skipped, so subtract a few seconds from the saved cursor (upserts are idempotent) and let the nightly full reindex catch anything else.

## Real-World Example

An online marketplace with 200,000 products was losing customers to slow search. Users typed queries, waited 2.5 seconds, got irrelevant results, and left. The team put Redis in front of the catalog listing, with a 5-minute TTL and category-level invalidation on admin edits, and replaced the PostgreSQL LIKE query with Meilisearch. In their own measurements after the change, cached listing responses came back in about 12 ms instead of 800 ms, search answered in tens of milliseconds with typo correction and faceted filters, and PostgreSQL CPU at peak fell sharply because most catalog reads no longer reached the database. Admin edits showed up in search within one sync cycle. Their numbers will differ with their data, hardware and hit rate; measure yours before and after.

## Tips

- Set different TTLs for different data volatility. A catalog that changes twice a day tolerates 5 minutes; inventory counts that change every second need a 10-second TTL or invalidation on write.
- Monitor your cache hit rate from day one. Below 80% means TTLs are too short, keys are too granular, or the access pattern does not benefit from caching.
- Add synonyms incrementally from real searches. Start with the top 20 zero-result queries from your search analytics and map them to existing product terms.
- Keep the nightly full reindex even if the sync worker is healthy; it catches anything that slipped through.
- Redis 8 is licensed RSALv2, SSPLv1 or AGPLv3 at your option; Valkey is a BSD-licensed fork with the same commands, and everything above works on both.

## Related Skills

- **redis**: runs the Redis instance and client settings used for the cache (Step 1).
- **cache-strategy**: cache-aside, stampede lock and invalidation by pattern (Step 2).
- **meilisearch**: deploys the engine, typo tolerance, synonyms and facets (Step 3).
- **search-engine-setup**: the sync-pipeline and relevance-tuning rules applied to the index (Step 4).
