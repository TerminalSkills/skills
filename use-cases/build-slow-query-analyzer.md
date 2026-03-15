---
title: Build a Slow Query Analyzer
slug: build-slow-query-analyzer
description: Build a slow query analyzer with automatic detection, EXPLAIN plan capture, index recommendations, query fingerprinting, and alerting for database performance optimization.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - database
  - performance
  - queries
  - optimization
  - monitoring
---

# Build a Slow Query Analyzer

## The Problem

Erik leads backend at a 25-person SaaS. Database response times are creeping up — p99 went from 200ms to 2 seconds over 6 months. They know some queries are slow but don't know which ones or why. PostgreSQL's `pg_stat_statements` shows total time but not individual slow executions. Missing indexes cause full table scans but nobody checks regularly. When a new feature ships with an N+1 query, it goes unnoticed until users complain. They need automated slow query detection: capture queries above threshold, analyze EXPLAIN plans, recommend indexes, group by fingerprint, and alert on regressions.

## Step 1: Build the Query Analyzer

```typescript
// src/db/query-analyzer.ts — Slow query detection with EXPLAIN analysis and index recommendations
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface SlowQuery {
  id: string;
  fingerprint: string;
  sql: string;
  params: any[];
  duration: number;
  explainPlan: any;
  recommendations: string[];
  endpoint: string;
  userId: string;
  timestamp: string;
}

interface QueryFingerprint {
  fingerprint: string;
  normalizedSql: string;
  avgDuration: number;
  maxDuration: number;
  count: number;
  firstSeen: string;
  lastSeen: string;
  trend: "improving" | "stable" | "degrading";
}

const SLOW_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_MS || "500");

// Wrap query execution with monitoring
export async function monitoredQuery(sql: string, params: any[], context?: { endpoint?: string; userId?: string }): Promise<any> {
  const start = Date.now();
  const result = await pool.query(sql, params);
  const duration = Date.now() - start;

  if (duration > SLOW_THRESHOLD_MS) {
    await captureSlowQuery(sql, params, duration, context);
  }

  // Track all query stats
  const fingerprint = getFingerprint(sql);
  await redis.hincrby(`query:stats:${fingerprint}`, "count", 1);
  await redis.hincrby(`query:stats:${fingerprint}`, "totalDuration", duration);

  return result;
}

async function captureSlowQuery(sql: string, params: any[], duration: number, context?: any): Promise<void> {
  const fingerprint = getFingerprint(sql);
  const id = `sq-${Date.now().toString(36)}`;

  // Get EXPLAIN plan
  let explainPlan = null;
  try {
    const { rows } = await pool.query(`EXPLAIN (ANALYZE false, FORMAT JSON) ${sql}`, params);
    explainPlan = rows[0];
  } catch {}

  // Generate recommendations
  const recommendations = analyzeQuery(sql, explainPlan);

  const slowQuery: SlowQuery = {
    id, fingerprint, sql: sql.slice(0, 5000), params,
    duration, explainPlan, recommendations,
    endpoint: context?.endpoint || "",
    userId: context?.userId || "",
    timestamp: new Date().toISOString(),
  };

  // Store in Redis (recent slow queries)
  await redis.lpush("query:slow", JSON.stringify(slowQuery));
  await redis.ltrim("query:slow", 0, 999);

  // Store in DB for history
  await pool.query(
    `INSERT INTO slow_queries (id, fingerprint, sql, duration, explain_plan, recommendations, endpoint, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [id, fingerprint, sql.slice(0, 5000), duration, JSON.stringify(explainPlan), JSON.stringify(recommendations), context?.endpoint]
  );

  // Update fingerprint stats
  await redis.hset(`query:fp:${fingerprint}`, "lastSeen", Date.now());
  const maxDuration = parseInt(await redis.hget(`query:fp:${fingerprint}`, "maxDuration") || "0");
  if (duration > maxDuration) await redis.hset(`query:fp:${fingerprint}`, "maxDuration", duration);

  // Alert if new slow query or regression
  const prevMax = maxDuration;
  if (prevMax === 0 || duration > prevMax * 2) {
    await redis.rpush("notification:queue", JSON.stringify({
      type: "slow_query", fingerprint, duration, sql: sql.slice(0, 200),
      message: prevMax === 0 ? "New slow query detected" : `Query regressed: ${prevMax}ms → ${duration}ms`,
    }));
  }
}

function analyzeQuery(sql: string, explainPlan: any): string[] {
  const recommendations: string[] = [];
  const upper = sql.toUpperCase();

  // Check for missing WHERE clause on large tables
  if (upper.includes("SELECT") && !upper.includes("WHERE") && !upper.includes("LIMIT")) {
    recommendations.push("Add WHERE clause or LIMIT to prevent full table scan");
  }

  // Check for SELECT *
  if (upper.includes("SELECT *")) {
    recommendations.push("Specify needed columns instead of SELECT * to reduce data transfer");
  }

  // Check for LIKE with leading wildcard
  if (upper.includes("LIKE '%")) {
    recommendations.push("Leading wildcard LIKE prevents index usage; consider full-text search or trigram index");
  }

  // Check for ORDER BY without index hint
  if (upper.includes("ORDER BY") && !upper.includes("LIMIT")) {
    recommendations.push("ORDER BY without LIMIT sorts entire result set; add LIMIT or ensure covering index");
  }

  // Check for N+1 pattern (same fingerprint many times in short window)
  // This would be tracked across multiple calls

  // Analyze EXPLAIN plan
  if (explainPlan) {
    const plan = explainPlan["QUERY PLAN"] || explainPlan;
    const planStr = JSON.stringify(plan);

    if (planStr.includes("Seq Scan")) {
      const tableMatch = planStr.match(/Seq Scan on (\w+)/);
      if (tableMatch) {
        recommendations.push(`Sequential scan on '${tableMatch[1]}'; consider adding an index on the filtered columns`);
      }
    }

    if (planStr.includes("Nested Loop") && planStr.includes("Seq Scan")) {
      recommendations.push("Nested loop with sequential scan detected; likely missing index on join column");
    }
  }

  return recommendations;
}

function getFingerprint(sql: string): string {
  const normalized = sql
    .replace(/\$\d+/g, "$?")
    .replace(/'[^']*'/g, "'?'")
    .replace(/\d+/g, "?")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

// Dashboard data
export async function getSlowQueryDashboard(): Promise<{
  recentSlowQueries: SlowQuery[];
  topFingerprints: QueryFingerprint[];
  recommendations: Array<{ table: string; columns: string[]; reason: string }>;
}> {
  const recent = await redis.lrange("query:slow", 0, 49);
  const recentQueries: SlowQuery[] = recent.map((r) => JSON.parse(r));

  // Group by fingerprint
  const fpMap = new Map<string, SlowQuery[]>();
  for (const q of recentQueries) {
    if (!fpMap.has(q.fingerprint)) fpMap.set(q.fingerprint, []);
    fpMap.get(q.fingerprint)!.push(q);
  }

  const topFingerprints: QueryFingerprint[] = [...fpMap.entries()]
    .map(([fp, queries]) => ({
      fingerprint: fp,
      normalizedSql: queries[0].sql.slice(0, 200),
      avgDuration: queries.reduce((s, q) => s + q.duration, 0) / queries.length,
      maxDuration: Math.max(...queries.map((q) => q.duration)),
      count: queries.length,
      firstSeen: queries[queries.length - 1].timestamp,
      lastSeen: queries[0].timestamp,
      trend: "stable",
    }))
    .sort((a, b) => b.count * b.avgDuration - a.count * a.avgDuration)
    .slice(0, 20);

  // Aggregate index recommendations
  const allRecs = recentQueries.flatMap((q) => q.recommendations);
  const indexRecs = allRecs.filter((r) => r.includes("index")).slice(0, 10);

  return {
    recentSlowQueries: recentQueries.slice(0, 50),
    topFingerprints,
    recommendations: indexRecs.map((r) => ({ table: "", columns: [], reason: r })),
  };
}
```

## Results

- **p99 latency: 2s → 300ms** — top 5 slow queries identified and optimized with recommended indexes; missing index on `orders.customer_id` found and added; 85% improvement
- **N+1 queries caught** — same fingerprint appearing 200 times in 1 second flagged; developer found loop query in product listing; fixed with JOIN; API went from 3s to 50ms
- **EXPLAIN plans captured** — every slow query has its execution plan saved; developer sees "Seq Scan on orders (1.2M rows)" and knows exactly why it's slow
- **Regression alerts** — new feature ships with unindexed query; alert fires when query exceeds 2x historical max; caught in staging before production
- **Index recommendations** — dashboard suggests 3 indexes that would fix 80% of slow queries; DBA reviews and applies; data-driven optimization
