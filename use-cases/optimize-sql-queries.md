---
title: "Optimize SQL Queries with AI"
slug: optimize-sql-queries
description: "Analyze slow database queries, recommend indexes, and rewrite SQL for better performance."
skills: [sql-optimizer]
category: data-ai
tags: [sql, performance, indexing, database]
---

# Optimize SQL Queries with AI

## The Problem

Your application's database queries were fast when you had 1,000 rows. Now you have 2 million rows and that simple-looking JOIN takes 45 seconds. You know you need indexes, but which columns? In what order? Should you rewrite the query or just add an index? Reading EXPLAIN output feels like deciphering hieroglyphics.

## The Solution

Use the **sql-optimizer** skill to have your AI agent analyze slow queries, read execution plans, recommend indexes, and rewrite queries for better performance.

Install the skill:

```bash
npx terminal-skills install sql-optimizer
```

## Step-by-Step Walkthrough

### 1. Share the slow query

```
This query takes 30 seconds on our production database. Can you optimize it?

SELECT u.name, u.email, COUNT(o.id) AS order_count, SUM(o.total) AS total_spent
FROM users u
JOIN orders o ON u.id = o.customer_id
WHERE o.created_at > '2024-01-01'
GROUP BY u.name, u.email
ORDER BY total_spent DESC
LIMIT 100;
```

### 2. The agent analyzes the execution plan

If it has database access, it runs EXPLAIN ANALYZE. Otherwise, it analyzes the query structure and asks about table sizes and existing indexes.

### 3. Problems are identified

```
Issues found:
1. Sequential scan on orders table (2M rows) - no index on customer_id + created_at
2. GROUP BY on non-primary-key columns - should group by u.id for correctness
3. Sorting 200K grouped results to return only 100 - could be optimized
```

### 4. An optimized version is provided

The agent delivers:
- The rewritten query
- CREATE INDEX statements
- Before/after comparison
- Expected performance improvement

### 5. Verify the improvement

```
Before: 30.2 seconds (Seq Scan on orders, Sort on total_spent)
After:  0.4 seconds (Index Scan on idx_orders_customer_date, Top-N Sort)
Improvement: 75x faster
```

## Real-World Example

An e-commerce platform's admin dashboard loads slowly. The "Top Customers" report takes over a minute. Using the sql-optimizer skill:

1. The developer shares the slow query and mentions it runs on PostgreSQL with 3M orders and 500K users
2. The agent identifies three problems: a function call on an indexed column (`YEAR(created_at)`) that prevents index use, a missing composite index, and an implicit join that confuses the optimizer
3. The agent provides a rewritten query that replaces the YEAR function with a range condition, uses explicit JOIN syntax, and recommends a composite index
4. After adding the index and deploying the new query, the report loads in under a second
5. The agent also flags two other queries in the codebase that have the same YEAR-on-indexed-column anti-pattern

## Related Skills

- [data-analysis](../skills/data-analysis/) -- Visualize the query results
- [excel-processor](../skills/excel-processor/) -- Export query results to Excel
- [code-reviewer](../skills/code-reviewer/) -- Review the application code that generates queries
