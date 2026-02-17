---
title: "Diagnose Database Performance Bottlenecks with AI"
slug: diagnose-database-performance-bottlenecks
description: "Find and fix the slow queries killing your application's response times using AI-powered execution plan analysis."
skills: [db-explain-analyzer, sql-optimizer, data-analysis]
category: development
tags: [database, performance, postgresql, query-optimization, indexing]
---

# Diagnose Database Performance Bottlenecks with AI

## The Problem

Your application dashboard shows p95 latency spiking to 4 seconds. The APM tool points to the database, but you're staring at 200+ queries and a wall of EXPLAIN output that reads like assembly language. You know _something_ is doing sequential scans, but figuring out which queries matter, what indexes to add without hurting write performance, and whether stale statistics are lying to the planner takes hours of expert-level analysis. Meanwhile, users are churning and the Slack channel is on fire.

## The Solution

Feed your slow query log and execution plans to the AI agent. It parses EXPLAIN ANALYZE output, identifies the root cause of each bottleneck, ranks them by impact, and generates exact CREATE INDEX statements and query rewrites — complete with estimated performance improvements.

```bash
npx terminal-skills install db-explain-analyzer sql-optimizer data-analysis
```

## Step-by-Step Walkthrough

### 1. Identify the worst offenders

```
Here's our PostgreSQL slow query log from the last 24 hours (attached: slow-queries.log). Rank the top 5 queries by total time spent and show me how many times each was called.
```

The agent parses the log and produces:

```
Top 5 Queries by Total Time (last 24h)
========================================
1. SELECT * FROM events WHERE org_id = $1 AND created_at > $2 ORDER BY created_at DESC
   Total: 847s | Calls: 12,431 | Avg: 68ms | Max: 2,100ms

2. SELECT u.*, COUNT(s.*) FROM users u LEFT JOIN sessions s ON s.user_id = u.id WHERE u.org_id = $1 GROUP BY u.id
   Total: 623s | Calls: 3,892 | Avg: 160ms | Max: 4,300ms

3. UPDATE subscriptions SET status = $1 WHERE expires_at < NOW() AND status = 'active'
   Total: 412s | Calls: 288 | Avg: 1,430ms | Max: 8,200ms

4. SELECT DISTINCT tag FROM event_tags WHERE event_id IN (SELECT id FROM events WHERE org_id = $1)
   Total: 389s | Calls: 8,201 | Avg: 47ms | Max: 890ms

5. SELECT * FROM audit_log WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 50
   Total: 201s | Calls: 5,440 | Avg: 37ms | Max: 620ms
```

### 2. Analyze execution plans for top queries

```
Run EXPLAIN ANALYZE on the top 3 queries using org_id = 'org_4f8a2c' and created_at > '2026-01-01'. Show me what's wrong with each.
```

The agent runs the plans and reports:

```
Query #1: events by org_id + created_at
  Issue: Index scan on idx_events_org_id, then in-memory sort on created_at
  The index doesn't include created_at, so PostgreSQL fetches 84,000 rows
  then sorts them to satisfy ORDER BY.
  Fix: CREATE INDEX idx_events_org_created ON events (org_id, created_at DESC);
  Impact: Eliminates sort, reduces from 68ms avg to ~3ms (index-only scan + limit)

Query #2: users with session count
  Issue: Hash aggregate over nested loop join. Sessions table (12M rows) scanned
  per-user via index, but 1,847 users × avg 6,500 sessions = 12M index lookups.
  Fix: Rewrite as lateral join with pre-aggregation:
    SELECT u.*, s.session_count FROM users u
    LEFT JOIN LATERAL (SELECT COUNT(*) as session_count FROM sessions WHERE user_id = u.id) s ON true
    WHERE u.org_id = 'org_4f8a2c';
  Plus: CREATE INDEX idx_sessions_user_id ON sessions (user_id);
  Impact: ~160ms → ~12ms

Query #3: batch subscription expiration
  Issue: Sequential scan on 2.3M subscriptions, filtering by expires_at and status.
  Partial index would be ideal since only ~5% are 'active'.
  Fix: CREATE INDEX idx_subs_active_expiry ON subscriptions (expires_at)
       WHERE status = 'active';
  Impact: 1,430ms → ~8ms (partial index scans only 115K rows instead of 2.3M)
```

### 3. Validate index impact before production

```
Estimate the total disk space and write overhead for these 3 new indexes. Are there any existing indexes that become redundant?
```

```
Index Impact Analysis
======================
New indexes:
  idx_events_org_created:    ~680MB (events: 34M rows, two columns)
  idx_sessions_user_id:      ~92MB  (sessions: 12M rows, one column) — ALREADY EXISTS as idx_sessions_user
  idx_subs_active_expiry:    ~4MB   (partial: only 115K active rows)

Redundant indexes after changes:
  idx_events_org_id (340MB) — fully superseded by idx_events_org_created
  Recommendation: DROP INDEX idx_events_org_id after deploying the new one

Write overhead: ~3% increase on events INSERT (one additional B-tree update).
Negligible for subscriptions partial index.

Net disk change: +680MB +4MB -340MB = +344MB additional disk
```

### 4. Generate migration script

```
Create a database migration file that adds the recommended indexes concurrently, drops the redundant one, and runs ANALYZE on affected tables.
```

The agent produces a production-ready migration with `CREATE INDEX CONCURRENTLY` statements, proper ordering, and rollback commands.

## Real-World Example

A backend engineer at a 15-person marketplace startup notices checkout completion rates dropped 12% over the past month. Their APM shows database response times increased from 45ms (p50) to 380ms (p50). The team has no dedicated DBA.

1. They feed the agent their `pg_stat_statements` output sorted by total_time
2. The agent identifies 4 queries responsible for 78% of total database time
3. EXPLAIN ANALYZE reveals: two missing composite indexes, one query rewrite needed (correlated subquery → JOIN), and stale statistics on a table that received a 2M-row bulk import
4. The generated migration adds 2 indexes concurrently, rewrites the subquery, and runs ANALYZE
5. After deployment, p50 latency drops from 380ms to 28ms, and checkout completion recovers within 48 hours

Total time: 35 minutes from diagnosis to merged migration PR.

## Related Skills

- [db-explain-analyzer](../skills/db-explain-analyzer/) — Parses EXPLAIN output and identifies root causes
- [sql-optimizer](../skills/sql-optimizer/) — Rewrites queries for better performance
- [data-analysis](../skills/data-analysis/) — Analyzes slow query log patterns and trends
