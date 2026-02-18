---
title: "Optimize SQL Queries and Database Performance"
slug: optimize-sql-queries
description: "Analyze slow database queries, recommend indexes, rewrite SQL for better performance, and reduce infrastructure costs through query optimization."
skills: [sql-optimizer, db-explain-analyzer, data-analysis]
category: data-ai
tags: [sql, performance, indexing, database, query-optimization, postgresql, mysql]
---

# Optimize SQL Queries and Database Performance

## The Problem

Ravi, a backend engineer at a 30-person e-commerce platform, gets pinged at 2 AM: "Dashboard loading super slow again." The customer analytics page takes 47 seconds to load, the daily sales report times out after 60 seconds, and the top products query is consuming 73% of database CPU during peak hours. What started as elegant queries on 50K rows now crawl through 4.2M orders and 890K customers.

The damage: 12 critical business queries averaging 23 seconds each. During business hours, the database connection pool (max 20) stays saturated with long-running queries. Fast queries wait in line while slow ones hog connections. Customer-facing features timeout, internal reports fail, and the ops team scaled from a $180/month database to $850/month trying to throw hardware at the problem.

Worst part: nobody knows which queries to fix first. EXPLAIN output looks like ancient hieroglyphics. The team debates adding more database replicas ($400/month each) versus hiring a DBA ($140K/year) versus migrating to a bigger instance ($1,200/month). All while the root cause might be missing indexes that cost nothing but 10 minutes to create.

## The Solution

Combine **sql-optimizer** for query analysis and rewriting, **db-explain-analyzer** to decode execution plans, and **data-analysis** for performance trend analysis. The approach: profile query performance, identify bottlenecks through execution plan analysis, rewrite inefficient queries, add strategic indexes, and monitor for regression.

## Step-by-Step Walkthrough

### 1. Identify and profile the slowest queries

```text
Analyze our PostgreSQL slow query log from the past 7 days. Find the top 10 slowest queries by total time consumed (query duration × frequency). Include the query text, average duration, frequency per hour, and percentage of total database load.
```

```text
🔍 SLOW QUERY ANALYSIS - PostgreSQL 14.2 (7 days of logs)

TOP 10 QUERIES BY TOTAL IMPACT:
  1. Customer Analytics Dashboard (avg 47.3s × 840 calls/day)
     Total impact: 11.1 hours/day (46.3% of query load)
     Query: SELECT u.email, u.signup_date, COUNT(o.id), SUM(o.total)...

  2. Sales Report Generation (avg 23.1s × 96 calls/day)
     Total impact: 2.2 hours/day (9.2% of query load)
     Query: SELECT DATE(o.created_at), SUM(o.total), COUNT(*)...

  3. Top Products by Revenue (avg 18.7s × 180 calls/day)
     Total impact: 1.4 hours/day (5.8% of query load)
     Query: SELECT p.name, SUM(oi.quantity * oi.price)...

  4. User Order History (avg 12.4s × 2,340 calls/day)
     Total impact: 8.1 hours/day (33.8% of query load)

[... 6 more queries analyzed ...]

SUMMARY STATS:
  Database load: 24 hours/day (100% utilization during business hours)
  Connection pool saturation: 18.7/20 average connections
  Slowest single query: 94.2s (analytics dashboard timeout)
  Infrastructure cost: $850/month (up 372% from $180 baseline)
```

### 2. Analyze execution plans to find bottlenecks

```text
For the top 3 slowest queries, run EXPLAIN ANALYZE and identify specific performance problems. Show which operations are expensive, which indexes are missing, and what percentage of time each step consumes.
```

```text
📊 EXECUTION PLAN ANALYSIS

QUERY 1: Customer Analytics Dashboard (47.3s avg)
-------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS) results:

Nested Loop (cost=1.43..2847392.91 rows=1 width=32) (actual time=47234.123..47234.890 rows=15432)
  Buffers: shared hit=2893847 read=1594032
  -> Hash Join (cost=1.00..2847391.48 rows=1 width=16) (actual time=12.456..31245.234 rows=15432)
       Hash Cond: (o.customer_id = u.id)  ⚠️ PROBLEM: No index on orders.customer_id
       Buffers: shared hit=1456723 read=892456
       -> Seq Scan on orders o (cost=0.00..2847390.48 rows=4235891 width=16) (actual time=0.123..28934.567 rows=4235891)
            Filter: (created_at > '2024-01-01'::date) ⚠️ PROBLEM: No index on created_at
            Rows Removed by Filter: 0
            Buffers: shared hit=1456723 read=892456
       -> Hash (cost=1.00..1.00 rows=1 width=16) (actual time=12.333..12.334 rows=894532)
            -> Seq Scan on users u ⚠️ PROBLEM: Sequential scan on large users table
  -> GroupAggregate (cost=1.43..1.43 rows=1 width=32) (actual time=1.234..1.234 rows=1)

🔴 CRITICAL ISSUES IDENTIFIED:
  1. Sequential scan on 4.2M orders (28.9s) - Missing index on (customer_id, created_at)
  2. Sequential scan on 894K users (12.3s) - Missing index on frequently joined columns
  3. Hash join without proper indexes causing massive buffer reads
  4. No query-specific optimizations (GROUP BY could be more efficient)

💡 RECOMMENDED FIXES:
  1. CREATE INDEX idx_orders_customer_date ON orders(customer_id, created_at);
  2. CREATE INDEX idx_users_email_signup ON users(email, signup_date);
  3. Rewrite query to avoid correlated subqueries

Projected improvement: 47.3s → 1.8s (96% faster)
```

### 3. Generate optimized query versions with indexes

```text
Rewrite the top 3 slow queries with better SQL structure and provide the exact CREATE INDEX statements needed. Show before/after execution plans and projected performance improvements.
```

```text
🚀 OPTIMIZED QUERY SOLUTIONS

QUERY 1: Customer Analytics Dashboard
-------------------------------------
ORIGINAL (47.3s):
SELECT u.email, u.signup_date, COUNT(o.id) AS order_count, SUM(o.total) AS total_spent
FROM users u
JOIN orders o ON u.id = o.customer_id
WHERE o.created_at > '2024-01-01'
GROUP BY u.email, u.signup_date
ORDER BY total_spent DESC
LIMIT 100;

OPTIMIZED (1.8s):
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

REQUIRED INDEXES:
  CREATE INDEX CONCURRENTLY idx_orders_customer_date ON orders(customer_id, created_at);
  CREATE INDEX CONCURRENTLY idx_orders_total_desc ON orders(total DESC);  -- for ORDER BY optimization

IMPROVEMENT: 47.3s → 1.8s (96% faster, 26x performance gain)

QUERY 2: Sales Report Generation
--------------------------------
ORIGINAL (23.1s): Large GROUP BY with date functions
OPTIMIZED (0.7s): Pre-computed daily aggregates with date range index
IMPROVEMENT: 33x faster

QUERY 3: Top Products by Revenue
--------------------------------
ORIGINAL (18.7s): Complex JOIN across orders/order_items/products
OPTIMIZED (0.9s): Materialized view with covering index
IMPROVEMENT: 21x faster

TOTAL DATABASE LOAD REDUCTION:
  Before: 21.8 hours/day query time
  After: 1.2 hours/day query time
  Improvement: 94% reduction in database CPU usage
```

### 4. Analyze performance trends and set up monitoring

```text
Create a performance monitoring dashboard that tracks query execution times, identifies performance regressions, and alerts when queries exceed baseline thresholds. Track the impact of our optimizations over time.
```

```text
📈 PERFORMANCE MONITORING SETUP

Created monitoring dashboard with 4 key metrics:

1. QUERY PERFORMANCE TRENDS (7-day rolling average):
   - Customer analytics: 47.3s → 1.8s → stable
   - Sales reports: 23.1s → 0.7s → stable
   - Top products: 18.7s → 0.9s → stable
   - Connection pool usage: 18.7/20 → 3.2/20 (83% improvement)

2. DATABASE RESOURCE UTILIZATION:
   - CPU usage: 85% peak → 23% peak
   - Memory buffer hit ratio: 67% → 94%
   - I/O wait time: 340ms avg → 45ms avg
   - Active connections: 18.7 avg → 3.2 avg

3. REGRESSION ALERTS (automated notifications):
   ⚡ Query >5x baseline duration (any query >10s triggers alert)
   ⚡ Connection pool >15/20 connections for >5 minutes
   ⚡ Buffer hit ratio <90% for >10 minutes
   ⚡ New slow queries in top 10 (queries not seen before)

4. BUSINESS IMPACT METRICS:
   - Dashboard load time: 47.3s → 1.8s (customers see results faster)
   - Report generation: 23.1s → 0.7s (97% success rate vs 34% timeouts)
   - Customer support tickets: "slow dashboard" tickets down 89%
   - Infrastructure cost: $850/mo → $280/mo (scaling down unnecessary resources)

COST SAVINGS:
  Database instance: $850/mo → $280/mo (saved $570/mo)
  Prevented replica additions: $800/mo saved
  Developer time saved: ~8 hours/week on performance issues
  Total annual savings: $16,440 in infrastructure + $20K in developer time
```

## Real-World Example

At a fast-growing logistics startup, the engineering team was spending 40% of their time firefighting database performance issues. Their main reporting dashboard took 2-3 minutes to load, customer-facing order tracking timed out 23% of the time, and they'd scaled their PostgreSQL instance from $200/month to $1,200/month trying to solve performance with bigger hardware.

The breaking point came during a board presentation when the revenue dashboard failed to load. The VP of Engineering used the sql-optimizer skill to analyze their 15 slowest queries, which revealed a pattern: missing indexes on foreign keys and date columns that were added as the product grew but never properly indexed.

The skill's execution plan analysis found that their main customer query was doing a sequential scan through 8.2M order records every time someone viewed their dashboard. A simple composite index on `(customer_id, created_at)` reduced that query from 43 seconds to 0.6 seconds. Similar optimizations across their top 10 queries reduced overall database load by 87%.

Results after optimization: Dashboard load times dropped from 2.5 minutes to 12 seconds. Customer-facing timeouts went from 23% to 0.3%. They scaled back down to a $400/month database instance while handling 3x more traffic. The engineering team went from spending 2 days/week on database performance to checking their monitoring dashboard once daily.

Most importantly, the systematic approach meant future performance issues were caught early through monitoring alerts, preventing the crisis-driven scaling pattern that had been burning through their infrastructure budget.
