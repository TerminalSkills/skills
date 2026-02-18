---
title: "Set Up Automated Database Query Plan Analysis with AI"
slug: set-up-database-query-plan-analysis
description: "Automatically capture, analyze, and optimize slow database query execution plans using AI agents."
skills: [sql-optimizer, data-analysis, report-generator]
category: development
tags: [database, sql, query-plans, performance, optimization]
---

# Set Up Automated Database Query Plan Analysis with AI

## The Problem

Your application is getting slower and nobody knows which queries are responsible. The DBA runs EXPLAIN ANALYZE on a few suspects, stares at nested loop joins and sequential scans, and recommends an index. But there are hundreds of queries, execution plans change as data grows, and what was fast last month might be a bottleneck today. Manual query plan review doesn't scale, and most developers can't read execution plans fluently.

## The Solution

Use **sql-optimizer** to analyze query execution plans and recommend fixes, **data-analysis** to identify patterns across slow query logs, and **report-generator** to produce actionable reports for the team.

## Step-by-Step Walkthrough

### 1. Extract slow queries from your database logs

Tell the agent where to find the data:

```text
Parse the PostgreSQL slow query log at /var/log/postgresql/slow.log. Extract all queries that took longer than 500ms in the past 7 days. Group by query pattern and show frequency and average duration.
```

### 2. The agent identifies the worst offenders

```text
Slow Query Analysis — Last 7 days
```

| Pattern | Count | Avg Duration | Max Duration | Total Time |
|---|---|---|---|---|
| `SELECT * FROM orders JOIN line_items...` | 3,412 | 1,240ms | 8,430ms | 4,231s |
| `SELECT COUNT(*) FROM events WHERE...` | 8,901 | 780ms | 3,210ms | 6,942s |
| `UPDATE users SET last_seen_at...` | 12,340 | 520ms | 1,890ms | 6,416s |

Top 3 patterns account for 73% of total slow query time.

### 3. Analyze execution plans for the worst queries

```text
Run EXPLAIN ANALYZE on the top 3 slow query patterns and tell me exactly what's wrong with each one.
```

### 4. The agent reads the execution plans

Query 1:

```sql
SELECT * FROM orders JOIN line_items ON orders.id = line_items.order_id
WHERE orders.created_at > '2025-01-01' AND orders.status = 'pending'
```

```text
Execution Plan Analysis:
- Nested Loop Join on line_items (cost: 45,230)
- Sequential Scan on orders (rows estimated: 500, actual: 34,210)
- Planner underestimates rows by 68x — stale statistics

Root Cause: Table statistics are outdated. The planner thinks only 500 rows match
the WHERE clause but 34,210 actually do, making it choose a nested loop instead of
a hash join.
```

Fix:

1. Run `ANALYZE orders;` to update statistics
2. Add composite index:

```sql
CREATE INDEX idx_orders_status_created ON orders(status, created_at);
```

3. Expected improvement: ~1,240ms → ~45ms

### 5. Generate a report with all fixes

```text
Create a query optimization report with all findings, recommended indexes, and estimated impact. Format it as a markdown document I can share with the team.
```

The agent produces a complete report with before/after execution plans, SQL statements for each fix, and priority rankings based on total time saved.

## Real-World Example

Ravi is a backend developer at a fintech team running a PostgreSQL database that's grown from 2GB to 80GB over the past year. Response times have crept up and the ops team is seeing database CPU at 85% during business hours. Using the query plan analysis workflow:

1. Ravi points the agent at the slow query log from the past week — it finds 47 distinct slow patterns
2. The agent runs EXPLAIN ANALYZE on the top 10 and finds three queries doing sequential scans on tables with millions of rows
3. For each query, the agent explains in plain English why the plan is bad and what index would fix it
4. The agent generates a migration file with six CREATE INDEX statements, ordered by expected impact
5. After applying the indexes, average API response time drops from 340ms to 95ms and database CPU falls to 40%

## Tips for Query Plan Analysis

- **Run ANALYZE on tables regularly** — stale statistics cause the planner to choose bad plans even when good indexes exist
- **Don't just add indexes blindly** — every index slows down writes; analyze the write-to-read ratio before adding one
- **Watch for plan flips** — a query that uses an index at 1,000 rows might switch to a sequential scan at 100,000 rows; test with production-scale data
- **Check for implicit type casts** — a WHERE clause comparing varchar to integer silently prevents index usage
- **Benchmark before and after** — always measure actual query time improvement, not just estimated plan cost reduction
- **Schedule regular reviews** — as data grows, query plans change; what was optimal last month may not be today
