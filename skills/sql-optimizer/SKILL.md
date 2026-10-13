---
name: sql-optimizer
description: >-
  Analyze and optimize SQL queries for performance. Use when a user asks to
  optimize a query, speed up a slow query, analyze a query plan, add indexes,
  fix N+1 queries, reduce query time, tune database performance, or rewrite
  SQL for efficiency. Supports PostgreSQL, MySQL, and SQLite.
license: Apache-2.0
compatibility: "Works with PostgreSQL, MySQL, and SQLite"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["sql", "optimization", "database", "performance", "queries"]
---

# SQL Optimizer

## Overview

Analyze SQL queries for performance problems and produce optimized versions with appropriate indexes. Covers query rewriting, index recommendations, execution plan analysis, and common anti-patterns.

## Instructions

When a user asks you to optimize a SQL query or fix slow database performance, follow these steps:

### Step 1: Get the query and context

Determine:
- The full SQL query to optimize
- Database engine (PostgreSQL, MySQL, SQLite)
- Table sizes (approximate row counts)
- Existing indexes
- Current execution time

If you have access to the database, gather this yourself:

```sql
-- PostgreSQL: Check table sizes
SELECT relname AS table_name, reltuples::bigint AS row_count
FROM pg_class
WHERE relkind = 'r' AND relnamespace = (
  SELECT oid FROM pg_namespace WHERE nspname = 'public'
)
ORDER BY reltuples DESC;

-- PostgreSQL: Check existing indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'orders';
```

### Step 2: Analyze the execution plan

```sql
-- PostgreSQL (runs the statement, see the warning below)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, total FROM orders WHERE status = 'pending';

-- MySQL 8.0.18+ (runs the statement)
EXPLAIN ANALYZE
SELECT id, total FROM orders WHERE status = 'pending';

-- MySQL, plan only (does not run the query)
EXPLAIN FORMAT=JSON
SELECT id, total FROM orders WHERE status = 'pending';

-- SQLite, plan only
EXPLAIN QUERY PLAN
SELECT id, total FROM orders WHERE status = 'pending';
```

**Warning:** `EXPLAIN ANALYZE` executes the statement, so an `INSERT`, `UPDATE` or `DELETE` really changes data. Wrap it in a transaction and roll back:

```sql
BEGIN;
EXPLAIN ANALYZE DELETE FROM orders WHERE status = 'cancelled' AND created_at < '2024-01-01';
ROLLBACK;
```

SQLite prints one row per plan step, for example `SEARCH orders USING COVERING INDEX idx_orders_customer_status (customer_id=? AND status=?)`. A covering index means the table row is never read.

Look for these red flags in the plan:
- **Seq Scan** on large tables (missing index)
- **Nested Loop** with large row counts (N+1 pattern)
- **Sort** with high cost (missing index for ORDER BY)
- **Hash Join** when a smaller join would suffice
- **Rows removed by filter** much larger than rows returned (bad selectivity)

### Step 3: Apply optimizations

**Anti-pattern: SELECT * when you need specific columns**

```sql
-- Before (fetches all columns, prevents covering index use)
SELECT * FROM orders WHERE status = 'pending';

-- After (fetch only needed columns)
SELECT id, customer_id, total, created_at
FROM orders WHERE status = 'pending';
```

**Anti-pattern: Missing index on WHERE/JOIN columns**

```sql
-- If this query is slow:
SELECT * FROM orders WHERE customer_id = 123 AND status = 'pending';

-- Add a composite index:
CREATE INDEX idx_orders_customer_status ON orders (customer_id, status);
```

**Anti-pattern: N+1 queries in application code**

```sql
-- Before: 1 query + N queries
SELECT id FROM orders WHERE date > '2024-01-01';
-- Then for each order:
SELECT * FROM order_items WHERE order_id = ?;

-- After: Single query with JOIN
SELECT o.id, o.total, oi.product_name, oi.quantity, oi.price
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
WHERE o.date > '2024-01-01';
```

**Anti-pattern: Functions on indexed columns**

```sql
-- Before (MySQL: YEAR() blocks index use on created_at; PostgreSQL and SQLite have no YEAR())
SELECT * FROM users WHERE YEAR(created_at) = 2024;

-- After (uses index on created_at)
SELECT * FROM users
WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';
```

**Anti-pattern: Correlated subquery that can be a JOIN**

```sql
-- Before (executes subquery for every row)
SELECT name, (
  SELECT COUNT(*) FROM orders WHERE orders.customer_id = customers.id
) AS order_count
FROM customers;

-- After (single pass with JOIN)
SELECT c.name, COUNT(o.id) AS order_count
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id, c.name;
```

**Anti-pattern: OFFSET for deep pagination**

```sql
-- Before (scans and discards 10000 rows)
SELECT * FROM products ORDER BY id LIMIT 20 OFFSET 10000;

-- After (keyset pagination, uses index)
SELECT * FROM products WHERE id > 10000 ORDER BY id LIMIT 20;
```

### Step 4: Recommend indexes

Follow these rules for index design:
1. Index columns used in WHERE, JOIN ON, and ORDER BY clauses
2. Put equality conditions first, then range conditions in composite indexes
3. Consider covering indexes that include SELECT columns to avoid table lookups
4. Do not create indexes on low-cardinality columns (e.g., boolean flags) alone
5. Remove unused or duplicate indexes

```sql
-- Composite index for: WHERE status = 'active' AND created_at > '2024-01-01' ORDER BY name
CREATE INDEX idx_users_status_created_name
ON users (status, created_at, name);
```

### Step 5: Report the results

Present:
1. The original query with identified problems
2. The optimized query
3. Index recommendations with CREATE INDEX statements
4. Expected improvement (estimated from plan changes)

## Examples

### Example 1: Optimize a slow reporting query

**User request:** "This query takes 45 seconds on 2M rows, can you speed it up?"

**Original query:**
```sql
SELECT c.name, c.email,
       COUNT(*) AS order_count,
       SUM(o.total) AS total_spent
FROM customers c, orders o
WHERE c.id = o.customer_id
  AND YEAR(o.created_at) = 2024
  AND o.status IN ('completed', 'shipped')
GROUP BY c.name, c.email
HAVING SUM(o.total) > 500
ORDER BY total_spent DESC;
```

**Problems identified:**
1. Implicit join syntax (old-style comma join)
2. `YEAR()` (MySQL syntax) prevents index use on `created_at`
3. No index on `(customer_id, status, created_at)`
4. GROUP BY on non-indexed columns

**Optimized query:**
```sql
SELECT c.name, c.email,
       COUNT(*) AS order_count,
       SUM(o.total) AS total_spent
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.created_at >= '2024-01-01'
  AND o.created_at < '2025-01-01'
  AND o.status IN ('completed', 'shipped')
GROUP BY c.id, c.name, c.email
HAVING SUM(o.total) > 500
ORDER BY total_spent DESC;
```

**Index recommendations:**
```sql
CREATE INDEX idx_orders_customer_status_date
ON orders (customer_id, status, created_at);
```

**Expected result:** Compare `EXPLAIN ANALYZE` before and after. The plan should change from a scan of `orders` to an index search; the actual time depends on data size and cache state, so measure it on your database.

### Example 2: Fix N+1 in an ORM

**User request:** "My Django view is slow, the debug toolbar shows 200+ queries"

**Problem:** ORM fetching related objects lazily in a loop.

**Fix:**
```python
# Before: N+1 queries
orders = Order.objects.filter(status="pending")
for order in orders:
    print(order.customer.name)  # Each access = 1 query

# After: 2 queries total
orders = Order.objects.filter(status="pending").select_related("customer")
for order in orders:
    print(order.customer.name)  # Already loaded
```

## Guidelines

- Always check the execution plan before and after optimization. Do not guess at performance.
- Index recommendations must consider write overhead. Tables with heavy INSERT/UPDATE may not benefit from many indexes.
- Composite index column order matters. Put equality columns first, then range columns, then sort columns.
- For PostgreSQL, use `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` for the most useful plan output.
- Do not blindly add indexes to every column in a WHERE clause. Analyze query patterns first.
- When rewriting queries, verify that the optimized version returns the same results as the original.
- For MySQL, check the chosen index with `EXPLAIN ANALYZE` (8.0.18+) instead of assuming a composite index is used.
- If a query cannot be optimized further, suggest materialized views or caching as alternatives.
- Always present the original and optimized queries side by side for easy comparison.
