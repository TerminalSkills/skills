---
name: db-explain-analyzer
description: >-
  Analyze database query execution plans (EXPLAIN/EXPLAIN ANALYZE) and provide
  actionable optimization recommendations. Use when a user asks to debug slow
  queries, understand query plans, find missing indexes, analyze table scans,
  or diagnose database performance issues. Supports PostgreSQL, MySQL, and SQLite.
license: Apache-2.0
compatibility: "Requires access to EXPLAIN output. Works with PostgreSQL, MySQL 8+, and SQLite."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["database", "performance", "explain", "query-plan", "indexing"]
---

# Database Explain Analyzer

## Overview

Parses EXPLAIN and EXPLAIN ANALYZE output from PostgreSQL, MySQL, and SQLite. Identifies performance bottlenecks like sequential scans on large tables, inefficient joins, sort operations spilling to disk, and suboptimal index usage. Produces prioritized recommendations with estimated impact.

## Instructions

When asked to analyze query performance:

1. **Identify the database engine** from the EXPLAIN output format or user context.

2. **Parse the execution plan** and extract:
   - Node types (Seq Scan, Index Scan, Hash Join, Nested Loop, etc.)
   - Estimated vs actual row counts (when ANALYZE is used)
   - Execution time per node
   - Memory usage and disk spills
   - Filter conditions and their selectivity

3. **Flag these red patterns:**
   - **Sequential scan on tables > 10,000 rows** with a WHERE clause that could use an index
   - **Nested loops with large outer tables** (> 1,000 rows) — suggest hash or merge join
   - **Sort operations on unindexed columns** when ORDER BY or DISTINCT is used
   - **Row estimate mismatches > 10x** between estimated and actual (indicates stale statistics)
   - **Disk-based sorts or hash operations** (work_mem too low or result set too large)
   - **Bitmap heap scan with high recheck rate** — index may not be selective enough

4. **For each issue, provide:**
   - What's happening and why it's slow
   - The specific CREATE INDEX statement or query rewrite that fixes it
   - Estimated improvement (e.g., "should reduce from ~800ms to ~15ms based on index selectivity")

5. **Check for common anti-patterns in the original query:**
   - `SELECT *` when only specific columns are needed
   - Functions on indexed columns in WHERE (breaking index usage)
   - Implicit type casts causing index bypass
   - Correlated subqueries that could be JOINs
   - Missing LIMIT on unbounded queries

6. **Output format:**
   - Summary line: "3 issues found, estimated total improvement: ~95% faster"
   - Issues ranked by impact (highest first)
   - Each issue: description → root cause → fix → expected improvement

## Examples

### Example 1: PostgreSQL sequential scan

**Input:**
```
Analyze this slow query and its EXPLAIN ANALYZE output:

SELECT * FROM orders WHERE customer_email = 'john@example.com' AND status = 'pending';

Seq Scan on orders  (cost=0.00..45892.00 rows=12 width=312) (actual time=423.112..891.445 rows=8 loops=1)
  Filter: ((customer_email = 'john@example.com') AND (status = 'pending'))
  Rows Removed by Filter: 1247832
Planning Time: 0.089 ms
Execution Time: 891.502 ms
```

**Output:**
```
Query Performance Analysis
===========================
1 critical issue found. Estimated improvement: ~98% faster (891ms → ~2ms).

CRITICAL: Sequential scan on "orders" (1.2M rows)
  Problem: Full table scan filtering 1,247,832 rows to find 8 matches.
  No index exists on customer_email or status.

  Root cause: PostgreSQL has no way to locate matching rows except reading
  every row in the table.

  Fix — create a composite index:
    CREATE INDEX idx_orders_email_status ON orders (customer_email, status);

  Why this index works: customer_email is highly selective (few orders per email),
  and adding status as a second column lets PostgreSQL satisfy both conditions
  from the index alone without rechecking.

  Expected: Index Scan returning 8 rows directly. ~1-3ms execution time.

  Bonus: If you only need order_id, total, and created_at, a covering index
  avoids the heap fetch entirely:
    CREATE INDEX idx_orders_email_status_covering
    ON orders (customer_email, status) INCLUDE (order_id, total, created_at);
```

### Example 2: Row estimate mismatch

**Input:**
```
This query is sometimes fast, sometimes takes 30 seconds:

EXPLAIN ANALYZE SELECT p.* FROM products p JOIN inventory i ON p.id = i.product_id
WHERE i.warehouse_id = 7 AND i.quantity > 0;

Hash Join  (cost=185.00..12450.00 rows=50 width=284) (actual time=28423.001..28891.332 rows=48721 loops=1)
  Hash Cond: (p.id = i.product_id)
  -> Seq Scan on products p  (cost=0.00..8412.00 rows=200000 width=284) (actual time=0.011..312.445 rows=200000 loops=1)
  -> Hash  (cost=182.00..182.00 rows=50 width=8) (actual time=0.892..0.893 rows=48721 loops=1)
       Buckets: 1024  Batches: 128  Memory Usage: 45kB
       -> Index Scan on idx_inventory_warehouse on inventory i  (cost=0.42..182.00 rows=50 width=8) (actual time=0.021..415.223 rows=48721 loops=1)
             Index Cond: (warehouse_id = 7)
             Filter: (quantity > 0)
```

**Output:**
```
Query Performance Analysis
===========================
2 issues found. Estimated improvement: ~90% faster.

CRITICAL: Row estimate mismatch (50 estimated vs 48,721 actual — 974x off)
  Problem: PostgreSQL estimated 50 rows from warehouse_id=7 but got 48,721.
  This caused it to choose a Hash Join with only 1024 buckets, forcing 128
  batch passes to disk.

  Root cause: Table statistics are stale. The inventory table likely had a
  recent bulk import.

  Fix:
    ANALYZE inventory;

  After fresh statistics, PostgreSQL will estimate ~48K rows and choose a
  Merge Join or properly-sized Hash Join. The 128 disk batches will drop to 0.

MODERATE: Sequential scan on products (200K rows)
  Problem: Full scan of products table even though only 48K are needed.

  Fix — add an index and rewrite as EXISTS if not all product columns are needed:
    SELECT p.id, p.name, p.price FROM products p
    WHERE EXISTS (SELECT 1 FROM inventory i WHERE i.product_id = p.id
                  AND i.warehouse_id = 7 AND i.quantity > 0);
```

## Guidelines

- Always ask for EXPLAIN ANALYZE (not just EXPLAIN) when possible — actual row counts are essential for accurate diagnosis.
- Consider the table size context: a sequential scan on a 500-row lookup table is fine.
- When recommending indexes, warn about write overhead on high-insert tables.
- For MySQL, check `key_len` in EXPLAIN to verify the full composite index is being used.
- Suggest `pg_stat_statements` or MySQL slow query log for finding the worst offenders systematically.
- Never recommend adding more than 3-4 indexes on a single table without discussing write performance trade-offs.
