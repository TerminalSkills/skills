---
title: Build a Database Query Performance Analyzer
slug: build-database-query-performance-analyzer
description: Build a tool that identifies slow PostgreSQL queries, explains their execution plans, suggests missing indexes, and tracks query performance over time — turning database optimization from guesswork into data-driven decisions.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - nextjs
category: DevOps & Infrastructure
tags:
  - database
  - performance
  - postgresql
  - query-optimization
  - monitoring
---

# Build a Database Query Performance Analyzer

## The Problem

Noor leads backend at a 35-person SaaS. Their PostgreSQL database handles 5,000 queries per second, but response times are degrading — P95 went from 50ms to 400ms over 3 months. Nobody knows which queries are slow or why. When a page takes 3 seconds to load, the team adds `EXPLAIN ANALYZE` to random queries until they find the culprit. Last week, a missing index on a 50M-row table caused a 15-minute outage during peak hours. They need continuous query monitoring, automatic slow query detection, and actionable optimization suggestions.

## Step 1: Collect Query Performance Data

The system reads from `pg_stat_statements` — PostgreSQL's built-in query statistics extension — and stores historical data for trend analysis.

```typescript
// src/collector/stats-collector.ts — Collect query stats from pg_stat_statements
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface QueryStats {
  queryId: string;
  query: string;                // normalized query (parameters replaced with $1, $2...)
  calls: number;
  totalTimeMs: number;
  meanTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  stddevTimeMs: number;
  rows: number;
  sharedBlksHit: number;       // pages found in cache
  sharedBlksRead: number;      // pages read from disk
  cacheHitRatio: number;       // higher is better
  tempBlksWritten: number;     // indicates sorts/joins spilling to disk
}

export async function collectQueryStats(): Promise<QueryStats[]> {
  // Requires: CREATE EXTENSION pg_stat_statements;
  const { rows } = await pool.query(`
    SELECT 
      queryid::text as query_id,
      query,
      calls,
      total_exec_time as total_time_ms,
      mean_exec_time as mean_time_ms,
      min_exec_time as min_time_ms,
      max_exec_time as max_time_ms,
      stddev_exec_time as stddev_time_ms,
      rows,
      shared_blks_hit,
      shared_blks_read,
      CASE WHEN (shared_blks_hit + shared_blks_read) > 0 
        THEN shared_blks_hit::float / (shared_blks_hit + shared_blks_read) * 100
        ELSE 100 END as cache_hit_ratio,
      temp_blks_written
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND query NOT LIKE '%pg_stat%'
      AND calls > 10
    ORDER BY total_exec_time DESC
    LIMIT 200
  `);

  const stats: QueryStats[] = rows.map((r) => ({
    queryId: r.query_id,
    query: r.query,
    calls: parseInt(r.calls),
    totalTimeMs: parseFloat(r.total_time_ms),
    meanTimeMs: parseFloat(r.mean_time_ms),
    minTimeMs: parseFloat(r.min_time_ms),
    maxTimeMs: parseFloat(r.max_time_ms),
    stddevTimeMs: parseFloat(r.stddev_time_ms),
    rows: parseInt(r.rows),
    sharedBlksHit: parseInt(r.shared_blks_hit),
    sharedBlksRead: parseInt(r.shared_blks_read),
    cacheHitRatio: parseFloat(r.cache_hit_ratio),
    tempBlksWritten: parseInt(r.temp_blks_written),
  }));

  // Store snapshot for trend analysis
  const snapshot = {
    timestamp: Date.now(),
    stats: stats.slice(0, 50), // top 50 by total time
  };

  await redis.zadd("query:snapshots", Date.now(), JSON.stringify(snapshot));
  // Keep 7 days of snapshots (collected every 5 min = ~2016 snapshots)
  await redis.zremrangebyscore("query:snapshots", 0, Date.now() - 7 * 86400000);

  // Cache current stats for API
  await redis.setex("query:current", 300, JSON.stringify(stats));

  return stats;
}

// Identify queries that have degraded over time
export async function detectRegressions(): Promise<Array<{
  queryId: string;
  query: string;
  currentMeanMs: number;
  previousMeanMs: number;
  degradation: number; // percentage increase
}>> {
  // Compare current stats to 24 hours ago
  const oneDayAgo = Date.now() - 86400000;
  const oldSnapshots = await redis.zrangebyscore("query:snapshots", oneDayAgo - 600000, oneDayAgo + 600000);

  if (oldSnapshots.length === 0) return [];

  const oldStats = JSON.parse(oldSnapshots[0]).stats as QueryStats[];
  const currentRaw = await redis.get("query:current");
  if (!currentRaw) return [];

  const currentStats = JSON.parse(currentRaw) as QueryStats[];
  const oldMap = new Map(oldStats.map((s) => [s.queryId, s]));
  const regressions = [];

  for (const current of currentStats) {
    const old = oldMap.get(current.queryId);
    if (!old || old.meanTimeMs < 1) continue; // skip very fast queries

    const degradation = ((current.meanTimeMs - old.meanTimeMs) / old.meanTimeMs) * 100;
    if (degradation > 50 && current.meanTimeMs > 10) { // >50% slower and >10ms
      regressions.push({
        queryId: current.queryId,
        query: current.query,
        currentMeanMs: Math.round(current.meanTimeMs * 100) / 100,
        previousMeanMs: Math.round(old.meanTimeMs * 100) / 100,
        degradation: Math.round(degradation),
      });
    }
  }

  return regressions.sort((a, b) => b.degradation - a.degradation);
}
```

## Step 2: Build the Query Analyzer

The analyzer runs `EXPLAIN ANALYZE` on slow queries, parses the execution plan, and generates optimization suggestions.

```typescript
// src/analyzer/query-analyzer.ts — Parse execution plans and suggest optimizations
import { pool } from "../db";

interface QueryAnalysis {
  query: string;
  executionPlan: ExecutionNode;
  totalCost: number;
  actualTimeMs: number;
  rowsEstimateAccuracy: number; // ratio of actual/estimated rows
  suggestions: Suggestion[];
  missingIndexes: IndexSuggestion[];
}

interface ExecutionNode {
  nodeType: string;
  relation?: string;
  startupCost: number;
  totalCost: number;
  actualStartupTime: number;
  actualTotalTime: number;
  planRows: number;
  actualRows: number;
  filter?: string;
  indexName?: string;
  scanDirection?: string;
  children: ExecutionNode[];
}

interface Suggestion {
  type: "index" | "rewrite" | "config" | "schema";
  severity: "info" | "warning" | "critical";
  description: string;
  impact: string;
}

interface IndexSuggestion {
  table: string;
  columns: string[];
  type: "btree" | "gin" | "gist" | "hash";
  reason: string;
  createStatement: string;
  estimatedImprovement: string;
}

export async function analyzeQuery(query: string): Promise<QueryAnalysis> {
  // Get the execution plan with actual timings
  const { rows } = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
  const plan = rows[0]["QUERY PLAN"][0];
  const rootNode = parsePlanNode(plan.Plan);

  const suggestions: Suggestion[] = [];
  const missingIndexes: IndexSuggestion[] = [];

  // Walk the plan tree and identify problems
  walkPlan(rootNode, (node) => {
    // Sequential scan on large table — missing index
    if (node.nodeType === "Seq Scan" && node.actualRows > 10000) {
      const table = node.relation || "unknown";
      const filterCols = extractFilterColumns(node.filter || "");

      if (filterCols.length > 0) {
        const idx: IndexSuggestion = {
          table,
          columns: filterCols,
          type: "btree",
          reason: `Sequential scan on ${table} with filter — ${node.actualRows} rows scanned`,
          createStatement: `CREATE INDEX CONCURRENTLY idx_${table}_${filterCols.join("_")} ON ${table} (${filterCols.join(", ")})`,
          estimatedImprovement: `Could reduce scan from ${node.actualRows} rows to index lookup`,
        };
        missingIndexes.push(idx);

        suggestions.push({
          type: "index",
          severity: node.actualRows > 100000 ? "critical" : "warning",
          description: `Missing index on ${table}(${filterCols.join(", ")}) — sequential scan on ${node.actualRows} rows`,
          impact: `Adding an index could reduce query time by 90%+`,
        });
      }
    }

    // Nested loop with high row count — might need a hash or merge join
    if (node.nodeType === "Nested Loop" && node.actualRows > 50000) {
      suggestions.push({
        type: "rewrite",
        severity: "warning",
        description: `Nested loop join processing ${node.actualRows} rows — consider restructuring the query or increasing work_mem`,
        impact: "Hash join could be 10-100x faster for large result sets",
      });
    }

    // Sort spilling to disk
    if (node.nodeType === "Sort" && node.actualRows > 10000) {
      suggestions.push({
        type: "config",
        severity: "info",
        description: `Sort operation on ${node.actualRows} rows — check if work_mem is sufficient`,
        impact: "Increasing work_mem prevents sorts from spilling to disk",
      });
    }

    // Poor row estimate (off by >10x) — stale statistics
    if (node.planRows > 0 && node.actualRows > 0) {
      const ratio = node.actualRows / node.planRows;
      if (ratio > 10 || ratio < 0.1) {
        suggestions.push({
          type: "schema",
          severity: "warning",
          description: `Row estimate off by ${Math.round(ratio)}x for ${node.relation || node.nodeType} — run ANALYZE on the table`,
          impact: "Accurate statistics help the planner choose better strategies",
        });
      }
    }
  });

  return {
    query,
    executionPlan: rootNode,
    totalCost: plan.Plan["Total Cost"],
    actualTimeMs: plan["Execution Time"],
    rowsEstimateAccuracy: rootNode.planRows > 0 ? rootNode.actualRows / rootNode.planRows : 1,
    suggestions,
    missingIndexes,
  };
}

function parsePlanNode(node: any): ExecutionNode {
  return {
    nodeType: node["Node Type"],
    relation: node["Relation Name"],
    startupCost: node["Startup Cost"],
    totalCost: node["Total Cost"],
    actualStartupTime: node["Actual Startup Time"],
    actualTotalTime: node["Actual Total Time"],
    planRows: node["Plan Rows"],
    actualRows: node["Actual Rows"],
    filter: node["Filter"],
    indexName: node["Index Name"],
    scanDirection: node["Scan Direction"],
    children: (node.Plans || []).map(parsePlanNode),
  };
}

function walkPlan(node: ExecutionNode, callback: (node: ExecutionNode) => void) {
  callback(node);
  for (const child of node.children) {
    walkPlan(child, callback);
  }
}

function extractFilterColumns(filter: string): string[] {
  // Extract column names from filter expressions like "(status = 'active') AND (created_at > ...)"
  const matches = [...filter.matchAll(/\((\w+)\s*[=<>!]/g)];
  return [...new Set(matches.map((m) => m[1]))];
}
```

## Step 3: Build the Performance Dashboard API

```typescript
// src/routes/query-perf.ts — Query performance dashboard API
import { Hono } from "hono";
import { Redis } from "ioredis";
import { analyzeQuery } from "../analyzer/query-analyzer";
import { detectRegressions } from "../collector/stats-collector";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();

// Top slow queries
app.get("/queries/slow", async (c) => {
  const raw = await redis.get("query:current");
  if (!raw) return c.json({ queries: [] });

  const stats = JSON.parse(raw);
  const sortBy = c.req.query("sort") || "total_time"; // total_time, mean_time, calls

  const sorted = [...stats].sort((a: any, b: any) => {
    if (sortBy === "mean_time") return b.meanTimeMs - a.meanTimeMs;
    if (sortBy === "calls") return b.calls - a.calls;
    return b.totalTimeMs - a.totalTimeMs;
  }).slice(0, 20);

  return c.json({ queries: sorted });
});

// Analyze a specific query
app.post("/queries/analyze", async (c) => {
  const { query } = await c.req.json();
  const analysis = await analyzeQuery(query);
  return c.json(analysis);
});

// Detect performance regressions
app.get("/queries/regressions", async (c) => {
  const regressions = await detectRegressions();
  return c.json({ regressions });
});

// Missing index suggestions across all slow queries
app.get("/queries/index-suggestions", async (c) => {
  const raw = await redis.get("query:current");
  if (!raw) return c.json({ suggestions: [] });

  const stats = JSON.parse(raw);
  const slowQueries = stats.filter((s: any) => s.meanTimeMs > 100).slice(0, 10);

  const allSuggestions = [];
  for (const sq of slowQueries) {
    try {
      const analysis = await analyzeQuery(sq.query);
      allSuggestions.push(...analysis.missingIndexes.map((idx) => ({
        ...idx,
        queryMeanMs: sq.meanTimeMs,
        queryCalls: sq.calls,
      })));
    } catch {
      // Some queries can't be analyzed (DDL, etc.)
    }
  }

  // Deduplicate and sort by impact
  const unique = new Map<string, any>();
  for (const s of allSuggestions) {
    const key = s.createStatement;
    if (!unique.has(key) || unique.get(key).queryCalls < s.queryCalls) {
      unique.set(key, s);
    }
  }

  return c.json({
    suggestions: [...unique.values()].sort((a, b) => b.queryCalls - a.queryCalls),
  });
});

export default app;
```

## Results

After deploying the query performance analyzer:

- **P95 query latency dropped from 400ms to 45ms** — the analyzer identified 7 missing indexes on high-traffic tables; adding them reduced scan times by 95%
- **15-minute outage prevention** — the missing index on the 50M-row table was identified by the analyzer with a specific `CREATE INDEX CONCURRENTLY` command; adding it proactively prevented the next peak-hour outage
- **Query regression detection catches issues within 24 hours** — when a schema migration slowed a critical query by 300%, the regression alert fired before users complained
- **DBA time reduced by 70%** — automated analysis replaces manual `EXPLAIN ANALYZE` sessions; developers get index suggestions with copy-paste SQL
- **Cache hit ratio improved from 92% to 99.1%** — the analyzer identified queries reading excessive pages from disk; index improvements and query rewrites brought most data from cache
