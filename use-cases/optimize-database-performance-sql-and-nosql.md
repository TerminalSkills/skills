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

Using the **sql-optimizer** and **mongodb** skills, the workflow analyzes slow queries in both database systems, identifies missing indexes and inefficient query patterns, rewrites queries for optimal execution plans, and validates the improvements with before/after benchmarks -- often eliminating the need for hardware upgrades entirely.

## Step-by-Step Walkthrough

### 1. Analyze and optimize the slow PostgreSQL queries

Run EXPLAIN ANALYZE on the slowest queries to identify sequential scans, poor join ordering, and missing indexes.

> Analyze this PostgreSQL query that joins users, subscriptions, invoices, and payment_methods to build the billing dashboard. It currently takes 4.2 seconds. Run EXPLAIN ANALYZE, identify the bottlenecks, suggest indexes, and rewrite the query for better performance. The tables have: users (52K rows), subscriptions (48K rows), invoices (890K rows), payment_methods (61K rows).

The optimizer identifies that the invoices table is being sequentially scanned because there is no index on `invoices.subscription_id`. Adding a composite index on `(subscription_id, created_at DESC)` eliminates the sequential scan. The query plan also reveals a nested loop join that should be a hash join -- rewriting the query with explicit join hints drops execution time from 4.2 seconds to 180ms.

### 2. Optimize the MongoDB aggregation pipelines

Analyze slow aggregation pipelines using explain output and index intersection to find where MongoDB is scanning full collections instead of using indexes.

> Optimize this MongoDB aggregation pipeline that computes weekly activity summaries from the user_events collection (12M documents). The pipeline groups by userId and eventType, counts events per week, and sorts by total count. It currently takes 8 seconds. Show me the explain output, identify which stages are causing full collection scans, and suggest indexes and pipeline restructuring.

The explain output reveals exactly where performance breaks down:

```text
MongoDB Aggregation Explain — user_events (12M docs)
======================================================
Stage 1: $lookup (user_profiles)
  → COLLSCAN on user_profiles (52K docs) — no index on userId
  → Time: 1,240ms

Stage 2: $match (createdAt >= 7 days ago)
  → COLLSCAN on user_events — $match after $lookup cannot use index
  → Documents scanned: 12,000,000
  → Documents matched: 340,000
  → Time: 5,890ms

Stage 3: $group (by userId, eventType)
  → In-memory sort exceeded 100MB limit, spilling to disk
  → Time: 870ms

TOTAL: 8,000ms

FIX: Move $match before $lookup, add compound index
  → db.user_events.createIndex({ createdAt: 1, userId: 1, eventType: 1 })
  → Scans reduced: 12M → 340K documents
  → Estimated time after fix: 450ms
```

Restructuring the pipeline to filter by date first (with a compound index on `{createdAt: 1, userId: 1, eventType: 1}`) reduces the documents entering the pipeline from 12 million to 340,000, dropping execution time to 450ms.

### 3. Design cross-system index strategy

Review all indexes across both databases to find redundant indexes wasting storage and missing indexes causing slow queries.

> Audit all indexes on both databases. For PostgreSQL, identify unused indexes (via pg_stat_user_indexes where idx_scan = 0), duplicate indexes covering the same columns, and queries in the slow query log that would benefit from new indexes. For MongoDB, check index usage stats with $indexStats, find indexes that overlap, and identify queries from the profiler that are doing COLLSCAN. Give me a single report with actions: indexes to drop, indexes to create, and estimated impact.

The audit typically reveals 15-30% of existing indexes are unused or redundant, wasting storage and slowing write operations. Dropping 8 unused PostgreSQL indexes frees 2.4GB of storage and improves write throughput by 12%. Adding 3 targeted MongoDB indexes eliminates the remaining collection scans.

### 4. Validate improvements with benchmarks

Run the original slow queries against the optimized schema to confirm performance improvements and ensure no regressions.

> Run benchmarks comparing the original and optimized queries. For each query, run 100 iterations with a warm cache and report p50, p95, and p99 latency. Also run the full test suite to make sure the index changes did not break any existing queries or cause unexpected plan changes.

The benchmark confirms that the changes are stable under load, not just fast on a single run. Sometimes an index that helps one query causes the planner to choose a worse plan for another query -- the full-suite validation catches these regressions before they reach production.

## Real-World Example

A project management SaaS with 50,000 users was considering a database infrastructure upgrade from $800/month to $2,400/month to handle growing query latency. Instead, a single optimization pass found 4 missing PostgreSQL indexes, 6 unused indexes to drop, 2 MongoDB aggregation pipelines that needed restructuring, and 3 MongoDB compound indexes that eliminated collection scans. The billing dashboard query dropped from 4.2 seconds to 180ms. The activity summary aggregation went from 8 seconds to 450ms. Average API response time across the platform decreased from 1.8 seconds to 340ms. The infrastructure upgrade was cancelled, saving $19,200 annually, and the optimized databases handled 3x more concurrent users on the same hardware.

## Tips

- Always check for unused indexes before adding new ones. Every index speeds up reads but slows down writes. Dropping 6 unused PostgreSQL indexes can improve write throughput by 10-15%.
- In MongoDB, the order of fields in a compound index matters. Put the equality match field first, then the range filter, then the sort field. The wrong order forces a full index scan instead of a prefix scan.
- Run EXPLAIN ANALYZE (PostgreSQL) or explain with executionStats (MongoDB) on every slow query before guessing at fixes. The execution plan shows the actual bottleneck, which is often different from what you expect.
- Schedule a quarterly index audit. As query patterns shift with new features, previously useful indexes become dead weight and new queries lack the indexes they need.
