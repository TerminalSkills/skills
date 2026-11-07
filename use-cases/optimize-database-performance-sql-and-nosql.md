---
title: "Optimize Database Performance Across SQL and NoSQL Systems"
slug: optimize-database-performance-sql-and-nosql
description: "Identify and fix slow queries, missing indexes, and inefficient aggregation pipelines across PostgreSQL and MongoDB in a single optimization pass."
skills:
  - sql-optimizer
  - mongodb
category: data-ai
tags:
  - database-optimization
  - sql
  - mongodb
  - indexing
  - query-performance
---

# Optimize Database Performance Across SQL and NoSQL Systems

## The Problem

A B2B SaaS platform uses PostgreSQL for transactional data (users, subscriptions, billing) and MongoDB for product data (user-generated content, activity logs, flexible metadata). Both databases are slowing down as the company scales past 50,000 users. The PostgreSQL dashboard query that joins users, subscriptions, and invoices takes 4.2 seconds. The MongoDB aggregation pipeline that computes user activity summaries scans 12 million documents and takes 8 seconds. Page load times have crept above 3 seconds, and the engineering team is debating an expensive infrastructure upgrade when the real problem is unoptimized queries and missing indexes.

## The Solution

Using the **sql-optimizer** and **mongodb** skills, the workflow reads the query plan in each database, finds missing indexes and inefficient query shapes, applies the fixes, and measures before and after, often making a hardware upgrade unnecessary.

## Step-by-Step Walkthrough

### 1. Analyze and optimize the slow PostgreSQL queries

Read the real plan before guessing. `EXPLAIN ANALYZE` executes the statement, so run it on a read-only query or inside a transaction you roll back.

> Analyze this PostgreSQL query that joins users, subscriptions and invoices to build the billing dashboard (last 30 days of invoices for active subscriptions). It takes 4.2 seconds. Run `EXPLAIN (ANALYZE, BUFFERS)`, name the node that costs the most, and suggest indexes. Tables: users (52K rows), subscriptions (48K), invoices (890K).

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT u.email, s.plan, count(*) AS invoices, sum(i.amount_cents) AS total
FROM users u
JOIN subscriptions s ON s.user_id = u.id
JOIN invoices i ON i.subscription_id = s.id
WHERE s.status = 'active' AND i.created_at >= now() - interval '30 days'
GROUP BY u.email, s.plan
ORDER BY total DESC LIMIT 50;
```

Look at which node dominates the actual time. In a run on PostgreSQL 18 with synthetic data of those sizes, the dominant node was a `Parallel Seq Scan on invoices` filtering on `created_at`, and the plan's join type was already a hash join. The fix that the planner actually used was an index on the date column the query filters on, not one on the join key:

```sql
CREATE INDEX CONCURRENTLY idx_invoices_created ON invoices (created_at);
```

On that synthetic data the plan changed to a bitmap index scan and the run time went from about 47 ms to about 26 ms. Your numbers depend on data size and cache, so re-measure on a copy of production. A composite `(subscription_id, created_at DESC)` index was created too and went unused for this query, which is why you check `idx_scan` afterward. PostgreSQL has no join hints: if the planner picks a bad join, update statistics with `ANALYZE`, check for stale estimates, and rewrite the query. `CONCURRENTLY` avoids blocking writes while the index builds; it cannot run inside a transaction.

### 2. Optimize the MongoDB aggregation pipelines

> Optimize this MongoDB aggregation that computes weekly activity summaries from user_events (12M documents). It `$lookup`s user_profiles, `$match`es on createdAt for the last 7 days, groups by userId and eventType, and sorts by count. Show `explain("executionStats")`, say whether it uses COLLSCAN or IXSCAN, and suggest indexes.

```js
db.user_events.explain("executionStats").aggregate(pipeline)
```

The fields to read are `winningPlan` (`COLLSCAN` means the whole collection was read, `IXSCAN` means an index was used), `totalDocsExamined` and `nReturned`. MongoDB's optimizer already moves a `$match` that only touches the collection's own fields ahead of `$lookup`, so reordering the stages by hand rarely helps; put the filter first anyway so the intent is clear. What helps is an index the filter can use:

```js
db.user_events.createIndex({ createdAt: 1, userId: 1, eventType: 1 })
db.user_profiles.createIndex({ userId: 1 })   // the $lookup foreignField
```

On MongoDB 8.2.6 with 300,000 synthetic events spread over 90 days, the explain went from a `COLLSCAN` examining 305,000 documents to an `IXSCAN` examining about 26,700 for the 7-day window. Without an index on the `$lookup` foreign field, every joined event does a collection scan of `user_profiles`. A `$group` stage that exceeds its 100 MB memory limit spills to disk (on by default since MongoDB 6.0).

### 3. Design a cross-system index strategy

Review indexes in both databases for unused and overlapping ones, and for queries that lack one.

> Audit indexes on both databases. For PostgreSQL, list indexes with `idx_scan = 0` in `pg_stat_user_indexes`, duplicate indexes on the same columns, and the slowest statements from `pg_stat_statements`. For MongoDB, read `$indexStats`, find overlapping indexes, and list profiler entries that did a COLLSCAN. Produce one report: indexes to drop, indexes to create, and the evidence for each.

```sql
SELECT schemaname, relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY idx_scan, pg_relation_size(indexrelid) DESC;
```

```js
db.user_events.aggregate([{ $indexStats: {} }])   // accesses.ops per index since the last restart
db.setProfilingLevel(1, { slowms: 100 })          // log operations slower than 100 ms to system.profile
db.system.profile.find({ "planSummary": /COLLSCAN/ }).sort({ ts: -1 }).limit(20)
```

`pg_stat_statements` must be listed in `shared_preload_libraries` (restart required) and enabled with `CREATE EXTENSION pg_stat_statements` before it has data. Treat `idx_scan = 0` as a lead, not a verdict. The counters reset with a statistics reset, they are per server (an index used only on a replica shows zero on the primary), and primary key, unique and foreign key support indexes are needed even when never scanned. Collect at least a full business cycle of data, such as a month, before dropping anything. In MongoDB, `$indexStats` counts reset on restart, and `_id_` cannot be dropped.

### 4. Validate improvements with benchmarks

> Benchmark the original and optimized queries: run each 100 times after a warm-up and report p50, p95 and p99. Then run the application's test suite to check that the new indexes did not change results or plans elsewhere.

`pgbench -f query.sql -c 4 -T 60 -P 10` runs a single custom query for a fixed time and reports average latency, and `explain("executionStats")` gives per-run numbers on the MongoDB side. Run benchmarks on a copy with production-like data, since plans on a small dev database differ. An index that speeds one query can push the planner to a worse plan for another, which is why the full suite runs afterward.

## Real-World Example

A project management SaaS with 50,000 users was considering a database upgrade from $800 to $2,400 a month to handle growing query latency. One optimization pass found the billing dashboard filtering invoices by date with no usable index, two MongoDB aggregations that scanned the whole `user_events` collection, and several unused PostgreSQL indexes. After the indexes were added on a staging copy and measured, the team shipped them with `CREATE INDEX CONCURRENTLY` and `createIndex`, and cancelled the upgrade. (The team's own numbers: the dashboard query dropped from 4.2 s to under 200 ms, and the activity summary from 8 s to under 500 ms.)

## Tips

- Check for unused indexes before adding new ones. Every index speeds some reads but slows every write and takes disk space.
- In a MongoDB compound index, follow the equality, sort, range order (ESR): equality fields first, then the sort field, then range fields. For `find({ userId: 42, createdAt: { $gte: d } }).sort({ createdAt: -1 })`, `{ userId: 1, createdAt: -1 }` examined 21 documents and returned 21. The aggregation index in step 2 puts `createdAt` first on purpose, because that filter is a range with no equality field to lead with.
- Run `EXPLAIN (ANALYZE, BUFFERS)` (PostgreSQL) or `explain("executionStats")` (MongoDB) on every slow query before choosing a fix. The bottleneck is often not the one you expect.
- Schedule a quarterly index audit; query patterns shift with new features.

## Related Skills

- **sql-optimizer**: reads PostgreSQL plans and recommends query rewrites and indexes (steps 1, 3 and 4).
- **mongodb**: aggregation pipelines, `createIndex` and `explain("executionStats")` for the MongoDB half (steps 2 and 3).
