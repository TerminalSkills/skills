---
title: "Optimize SQL Queries and Database Performance"
slug: optimize-sql-queries
description: "Analyze slow database queries, recommend indexes, rewrite SQL for better performance, and reduce infrastructure costs through query optimization."
skills: [sql-optimizer, data-analysis]
category: data-ai
tags: [sql, performance, indexing, database, query-optimization, postgresql, mysql]
---

# Optimize SQL Queries and Database Performance

## The Problem

Ravi, a backend engineer at a 30-person e-commerce platform, gets pinged at 2 AM: "Dashboard loading super slow again." The customer analytics page takes 47 seconds to load. The daily sales report times out after 60 seconds. The top products query consumes 73% of database CPU during peak hours.

What started as elegant queries on 50K rows now crawls through 4.2 million orders and 890K customers. The database connection pool — max 20 — stays saturated during business hours with long-running queries. Fast queries line up behind slow ones. Customer-facing features timeout, internal reports fail, and the ops team scaled from a $180/month database to $850/month trying to throw hardware at the problem.

The worst part: nobody knows which queries to fix first. `EXPLAIN` output looks like ancient hieroglyphics. The team debates adding more read replicas ($400/month each) versus hiring a DBA ($140K/year) versus migrating to a bigger instance ($1,200/month). All while the root cause might be missing indexes that cost nothing but 10 minutes to create.

## The Solution

Using the **sql-optimizer** skill for plans, rewrites and indexes and the **data-analysis** skill to rank the `pg_stat_statements` export by total time, the approach is to profile query performance, decode execution plans to find the actual bottlenecks, rewrite the worst queries, add strategic indexes, and set up monitoring to catch regressions before they become incidents.

## Step-by-Step Walkthrough

### Step 1: Identify and Profile the Slowest Queries

PostgreSQL does not keep a slow query log by default. The usual source is the `pg_stat_statements` extension: add it to `shared_preload_libraries` (needs a restart), run `CREATE EXTENSION pg_stat_statements;` in the database, then export the heaviest statements:

```sql
\copy (SELECT queryid, calls, total_exec_time, mean_exec_time, query FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 50) TO 'top_queries.csv' CSV HEADER
```

```text
Analyze top_queries.csv (a pg_stat_statements export). Rank the queries by total_exec_time
(duration x calls), and show the query text, mean_exec_time, calls and each query's share of the total.
```

Sorted by total impact (duration multiplied by frequency), the export tells a clear story:

| Rank | Query | Avg Duration | Calls/Day | Total Impact |
|---|---|---|---|---|
| 1 | Customer Analytics Dashboard | 47.3s | 840 | 11.1 hours/day (46.3%) |
| 2 | User Order History | 12.4s | 2,340 | 8.1 hours/day (33.8%) |
| 3 | Sales Report Generation | 23.1s | 343 | 2.2 hours/day (9.2%) |
| 4 | Top Products by Revenue | 18.7s | 270 | 1.4 hours/day (5.8%) |

The top 4 queries account for 95% of total database load. The database is saturated during business hours — not because it's undersized, but because these four queries are doing full table scans through millions of rows.

Connection pool saturation sits at 18.7 out of 20 average connections. That means every new query waits. The $850/month instance isn't slow — it's being asked to do needlessly expensive work.

### Step 2: Analyze Execution Plans to Find Bottlenecks

```text
For the top 3 slowest queries, run EXPLAIN ANALYZE and identify specific
performance problems. Show which operations are expensive, which indexes are
missing, and what percentage of time each step consumes.
```

The execution plan for the customer analytics query reveals the problem immediately:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT u.email, u.signup_date, COUNT(o.id) AS order_count, SUM(o.total) AS total_spent
FROM users u
JOIN orders o ON u.id = o.customer_id
WHERE o.created_at > '2024-01-01'
GROUP BY u.email, u.signup_date
ORDER BY total_spent DESC
LIMIT 100;
```

The plan shows a **sequential scan on 4.2 million orders** taking 28.9 seconds. PostgreSQL does not index foreign keys automatically, so `orders.customer_id` has no index. The `created_at` filter has none either, so every single order row gets read just to check the date.

Three critical issues in this one query:
- Sequential scan on `orders` (28.9s) — no index on `created_at` (a covering index fixes it, see Step 3)
- Hash join over the unaggregated 4.2 million order rows (12.3s) — the join and the GROUP BY run before the LIMIT can cut anything
- 1.5 million buffer reads from disk, because every order row is fetched just to test the date

The other two queries have similar patterns. Missing indexes on foreign keys and date columns are the theme — these columns were added as the product grew but never properly indexed.

### Step 3: Rewrite Queries and Add Indexes

```text
Rewrite the top 3 slow queries with better SQL structure and provide the exact
CREATE INDEX statements needed. Show before/after projected performance.
```

**Query 1: Customer Analytics Dashboard**

The original query joins users and orders, then groups and sorts the entire result set before taking the top 100. The optimized version flips the logic — aggregate in a subquery first, then join only the 100 rows that matter:

```sql
-- Original (47.3s):
SELECT u.email, u.signup_date, COUNT(o.id) AS order_count, SUM(o.total) AS total_spent
FROM users u
JOIN orders o ON u.id = o.customer_id
WHERE o.created_at > '2024-01-01'
GROUP BY u.email, u.signup_date
ORDER BY total_spent DESC
LIMIT 100;

-- Optimized (1.8s):
SELECT u.email, u.signup_date, agg.order_count, agg.total_spent
FROM (
  SELECT customer_id, COUNT(*) AS order_count, SUM(total) AS total_spent
  FROM orders
  WHERE created_at > '2024-01-01'
  GROUP BY customer_id
  ORDER BY total_spent DESC
  LIMIT 100
) agg
JOIN users u ON u.id = agg.customer_id
ORDER BY agg.total_spent DESC;
```

The key insight: aggregate 4.2 million orders down to 100 rows *before* joining to users, instead of joining first and aggregating after. Combined with the right indexes, this eliminates the sequential scans entirely.

Required indexes:

```sql
-- Order history: WHERE customer_id = ? ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY idx_orders_customer_date ON orders (customer_id, created_at);
-- Dashboard: date-range filter, then aggregate customer_id and total from the index alone
CREATE INDEX CONCURRENTLY idx_orders_created_covering ON orders (created_at) INCLUDE (customer_id, total);
```

`CREATE INDEX CONCURRENTLY` avoids blocking writes but cannot run inside a transaction block, so run it outside a migration wrapped in one. If a build fails it leaves an `INVALID` index: drop it and retry. Index-only scans also need a recent `VACUUM` to keep the visibility map current.

**Query 2: Sales Report** — pre-computed daily aggregates with a date range index. **23.1s down to 0.7s** (33x faster).

**Query 3: Top Products** — a materialized view, refreshed on a schedule. **18.7s down to 0.9s** (21x faster). `REFRESH MATERIALIZED VIEW CONCURRENTLY` needs a unique index on the view:

```sql
CREATE MATERIALIZED VIEW top_products_30d AS
SELECT oi.product_id, SUM(oi.quantity * oi.price) AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.created_at > now() - interval '30 days'
GROUP BY oi.product_id;

CREATE UNIQUE INDEX ON top_products_30d (product_id);
REFRESH MATERIALIZED VIEW CONCURRENTLY top_products_30d;
```

These timings are the example team's projections: run `EXPLAIN (ANALYZE, BUFFERS)` before and after on your own data, and confirm the rewrite returns the same rows as the original.

### Step 4: Set Up Performance Monitoring

```text
Create a performance monitoring setup that tracks query execution times, identifies
regressions, and alerts when queries exceed baseline thresholds.
```

With the optimizations deployed, the example team's database metrics shift dramatically:

| Metric | Before | After | Improvement |
|---|---|---|---|
| Peak CPU usage | 85% | 23% | 73% reduction |
| Buffer hit ratio | 67% | 94% | Data served from memory |
| Avg active connections | 18.7/20 | 3.2/20 | 83% reduction |
| I/O wait time | 340ms avg | 45ms avg | 87% reduction |

Monitoring alerts catch regressions early:
- Any query whose `mean_exec_time` in `pg_stat_statements` exceeds 5x its baseline triggers a Slack alert (compare snapshots; call `pg_stat_statements_reset()` only after saving one)
- Connection pool above 15/20 for more than 5 minutes fires a warning
- Buffer hit ratio dropping below 90% signals potential index issues
- New queries appearing in the slow query log get flagged for review

The dashboard load time drops from 47.3 seconds to 1.8 seconds. Report generation goes from timing out at 60 seconds to completing in 0.7 seconds with a 97% success rate (up from 34%).

## Real-World Example

Ravi applies all three query rewrites and four indexes in a single deployment. The total database load drops from 24 hours/day of query time to 1.2 hours/day — a 95% reduction.

The infrastructure cost impact is immediate. The $850/month database instance is dramatically oversized now. Ravi downgrades to a $280/month instance that handles the optimized workload with headroom to spare. The read replica discussion ($400/month each) is dead. The DBA hiring conversation ($140K/year) is shelved.

The "slow dashboard" support tickets — a steady stream of 2-3 per week — drop to zero. The engineering team stops spending 2 days per week firefighting database performance and checks the monitoring dashboard once a day instead.

Total savings: $570/month in infrastructure, plus roughly $800/month in prevented replica costs, plus the engineering time that's no longer spent on database emergencies. The root cause of a $850/month infrastructure problem turned out to be four missing indexes and three suboptimal queries.
