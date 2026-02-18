---
title: "Set Up Automated Database Index Optimization"
slug: automate-database-index-optimization
description: "Analyze query patterns, identify missing indexes, remove unused ones, and keep your database performant as data grows."
skills: [sql-optimizer, data-analysis, report-generator]
category: development
tags: [database, indexes, postgresql, performance, optimization]
---

# Set Up Automated Database Index Optimization

## The Problem

Your PostgreSQL database started fast. Now, 18 months and 12 million rows later, the dashboard takes 8 seconds to load. The orders listing page triggers a sequential scan on a 4-million-row table. Three API endpoints regularly timeout during peak hours.

Your team has added indexes reactively — someone complains about a slow page, a senior engineer adds an index, the page gets faster. But nobody tracks the full picture. You have 67 indexes across 24 tables. Some were added for queries that no longer exist. Others duplicate each other. Meanwhile, the 5 queries responsible for 80% of your database load have no covering indexes at all.

Index bloat slows down writes. Missing indexes slow down reads. Without systematic analysis, you're guessing — and every guess costs either read performance or write performance.

## The Solution

Use **sql-optimizer** to analyze query plans and recommend index changes, **data-analysis** to identify patterns in slow query logs, and **report-generator** to produce actionable optimization reports.

```bash
npx terminal-skills install sql-optimizer data-analysis report-generator
```

## Step-by-Step Walkthrough

### 1. Audit current index usage

```text
Analyze our PostgreSQL database indexes. Show which are used, which are unused, which are duplicates, and the overall index bloat.
```

```text
INDEX AUDIT — 67 indexes across 24 tables

UNUSED INDEXES (no scans in 30 days): 12
  idx_orders_legacy_status — 0 scans, 284 MB on disk
  idx_users_old_email_lower — 0 scans, 156 MB
  idx_invoices_draft_flag — 0 scans, 89 MB
  ... 9 more

DUPLICATE/OVERLAPPING: 4 pairs
  idx_orders_user_id + idx_orders_user_id_created_at (first is subset)
  idx_products_name + idx_products_name_lower (redundant with citext column)

BLOATED (>40% dead tuples): 3
  idx_events_created_at — 62% bloat, 1.2 GB → should be 456 MB
  idx_sessions_token — 48% bloat

TOTAL WASTED SPACE: 1.8 GB across unused + bloated indexes
WRITE OVERHEAD: ~15% slower inserts on orders table due to 8 indexes
```

### 2. Identify missing indexes from slow queries

```text
Analyze the slow query log from the past 7 days. Find the top queries that would benefit from new indexes.
```

```text
SLOW QUERY ANALYSIS — 1,247 slow queries (>500ms) in 7 days

TOP 5 BY TOTAL TIME:
  1. SELECT * FROM orders WHERE user_id = $1 AND status = 'active' ORDER BY created_at
     Avg: 2,340ms | Calls: 892/day | Seq scan on 4.1M rows
     → RECOMMEND: CREATE INDEX idx_orders_user_status_created
       ON orders(user_id, status, created_at DESC)

  2. SELECT count(*) FROM events WHERE org_id = $1 AND type = $2 AND created_at > $3
     Avg: 1,890ms | Calls: 340/day | Partial index scan
     → RECOMMEND: CREATE INDEX idx_events_org_type_created
       ON events(org_id, type, created_at) WHERE type IN ('click','view','purchase')

  3. SELECT * FROM users WHERE lower(email) = $1
     Avg: 980ms | Calls: 2,100/day | Seq scan
     → RECOMMEND: CREATE INDEX idx_users_email_lower ON users(lower(email))

PROJECTED IMPROVEMENT: 87% reduction in total slow query time
```

### 3. Generate and validate the migration

```text
Create a migration that drops unused indexes and adds recommended ones. Include rollback steps and estimated lock times.
```

```text
Migration: 20260217_optimize_indexes.sql

-- Phase 1: Drop unused (no locks needed, instant)
DROP INDEX CONCURRENTLY idx_orders_legacy_status;
DROP INDEX CONCURRENTLY idx_users_old_email_lower;
-- ... 10 more drops, freeing 1.8 GB

-- Phase 2: Add missing (concurrent, no downtime)
CREATE INDEX CONCURRENTLY idx_orders_user_status_created
  ON orders(user_id, status, created_at DESC);
-- Estimated build time: 45 seconds on 4.1M rows

-- Phase 3: Reindex bloated
REINDEX INDEX CONCURRENTLY idx_events_created_at;

ROLLBACK script included: drops new indexes, recreates old ones
Total estimated execution: 3-5 minutes, zero downtime
```

### 4. Set up weekly index health monitoring

```text
Create a weekly report that tracks index usage, identifies new slow queries, and recommends adjustments.
```

```text
Weekly Index Health Report — scheduled every Monday 6:00 AM

Sections:
  1. Index usage stats (scans, rows read, cache hit ratio)
  2. Newly unused indexes (no scans in 14+ days)
  3. New slow queries not covered by existing indexes
  4. Index bloat progression
  5. Write performance impact (indexes per high-write table)

Delivered as: markdown report in docs/db-reports/ + Slack notification
Alert threshold: any index >50% bloat or new query >2s avg
```

## Real-World Example

Kofi, a backend engineer at a 20-person e-commerce SaaS, was firefighting performance issues weekly. The orders table had grown to 4 million rows, and the main listing endpoint was timing out for large accounts. The team had added indexes over 18 months without a strategy — 8 indexes on the orders table alone, some for features that had been removed.

He ran the three-skill workflow during a Friday maintenance window. The sql-optimizer found 12 unused indexes consuming 1.8 GB and 4 duplicate pairs. More importantly, it identified that the top 3 slow queries — responsible for 73% of all timeouts — had no proper covering indexes. The migration dropped dead weight, added 3 targeted indexes, and reindexed 2 bloated ones. Total execution: 4 minutes with zero downtime.

The orders listing endpoint dropped from 2,340ms to 180ms. Weekly slow query volume fell from 1,247 to 94. Write performance on the orders table improved 12% from removing 5 unnecessary indexes. The Monday reports now catch new slow queries before they become customer-facing issues.
