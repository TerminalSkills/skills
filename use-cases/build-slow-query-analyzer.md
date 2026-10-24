---
title: Build a Slow Query Analyzer
slug: build-slow-query-analyzer
description: Build a slow query analyzer for PostgreSQL in TypeScript that times each query, captures its EXPLAIN plan, groups executions by fingerprint, flags N+1 patterns and regressions, and serves a small dashboard API.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - database
  - performance
  - queries
  - optimization
  - monitoring
---

# Build a Slow Query Analyzer

## The Problem

Erik leads backend at a 25-person SaaS. Database response times are creeping up: p99 went from 200ms to 2 seconds over six months. They know some queries are slow but not which ones or why. PostgreSQL's `pg_stat_statements` gives per-statement totals, means and maxima, but not which endpoint issued a statement, what its plan looked like at the time, or whether one request ran the same statement 200 times. Missing indexes cause sequential scans that nobody checks, and a new feature with an N+1 query goes unnoticed until users complain. They want slow queries captured with their plans, grouped by shape, and an alert when a new one appears or an old one gets twice as slow.

## The Solution

Use **typescript** for the analyzer, **postgresql** for the plans and the history table, **redis** for the hot counters and the recent-queries list, and **hono** with **zod** for a small read-only dashboard API. The analyzer wraps the query function, so it sees the endpoint and request that issued each statement.

## Step-by-Step Walkthrough

### Step 1: Prepare PostgreSQL

Create a history table. Keep `pg_stat_statements` too: it measures every statement with no code changes, and the analyzer adds the endpoint and plan on top. To get plans for statements you do not wrap (migrations, background tools), set `auto_explain.log_min_duration` in the server configuration as well.

```sql
CREATE TABLE slow_queries (
  id          uuid PRIMARY KEY,
  fingerprint text NOT NULL,
  sql         text NOT NULL,          -- literals stripped, never raw parameters
  duration_ms integer NOT NULL,
  hints       jsonb NOT NULL DEFAULT '[]',
  endpoint    text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX slow_queries_fp_idx ON slow_queries (fingerprint, created_at DESC);
```

```bash
npm install pg ioredis hono @hono/node-server @hono/zod-validator zod
npm install -D typescript @types/node @types/pg tsx
```

### Step 2: Build the analyzer

The analyzer imports a shared pool from `src/db.ts`, which is one line in most projects: `export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })` with `import pg from "pg"`. Set `DATABASE_URL` and `REDIS_URL` before running anything.

`monitoredQuery` replaces `pool.query` in your data layer. It times every statement, counts it per fingerprint, and for slow ones runs a plain `EXPLAIN (FORMAT JSON)` (which plans the statement without running it; `ANALYZE` would execute it a second time). The plan is walked as a tree, because in JSON output a scan is `"Node Type": "Seq Scan"` plus `"Relation Name"`, not the text `Seq Scan on orders`.

```typescript
// src/query-analyzer.ts -- capture slow queries, explain them, group them by fingerprint
import { createHash, randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { pool } from "./db.js";

const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const SLOW_MS = Number(process.env.SLOW_QUERY_MS ?? 500);
const BIG_SCAN_COST = 500; // planner cost units: a filtered Seq Scan above this is worth an index (tune per database)

export interface IndexHint { table: string; filter: string; estimatedCost: number }
export interface SlowQuery {
  id: string; fingerprint: string; sql: string; durationMs: number;
  hints: IndexHint[]; endpoint: string; at: string;
}

// Literals become "?" so equal queries share a fingerprint. Parameters are never stored (they can hold personal data).
const normalize = (sql: string) => sql
  .replace(/'(?:[^']|'')*'/g, "?")
  .replace(/\$\d+/g, "?")
  .replace(/\b\d+(?:\.\d+)?\b/g, "?")
  .replace(/\s+/g, " ")
  .trim();

export function fingerprint(sql: string): { id: string; normalized: string } {
  const normalized = normalize(sql);
  return { id: createHash("sha256").update(normalized).digest("hex").slice(0, 16), normalized };
}

interface PlanNode { "Node Type": string; "Relation Name"?: string; Filter?: string; "Total Cost"?: number; Plans?: PlanNode[] }

// EXPLAIN (FORMAT JSON) plans the statement without running it. Walk the tree instead of string-matching it.
export function indexHints(node: PlanNode, hints: IndexHint[] = []): IndexHint[] {
  if (node["Node Type"] === "Seq Scan" && node.Filter && (node["Total Cost"] ?? 0) >= BIG_SCAN_COST) {
    // EXPLAIN can print the bound values, so strip them from the filter too
    hints.push({ table: node["Relation Name"]!, filter: normalize(node.Filter), estimatedCost: node["Total Cost"]! });
  }
  node.Plans?.forEach((child) => indexHints(child, hints));
  return hints;
}

export async function monitoredQuery(
  sql: string, params: unknown[] = [], ctx: { endpoint?: string; requestId?: string } = {},
) {
  const start = performance.now();
  try {
    return await pool.query(sql, params);
  } finally {
    const durationMs = Math.round(performance.now() - start);
    record(sql, params, durationMs, ctx).catch((err) => console.error("query monitor failed", err));
  }
}

async function record(sql: string, params: unknown[], durationMs: number, ctx: { endpoint?: string; requestId?: string }) {
  const fp = fingerprint(sql);
  await redis.hincrby(`query:stats:${fp.id}`, "count", 1);
  await redis.hincrby(`query:stats:${fp.id}`, "totalMs", durationMs);

  if (ctx.requestId) { // N+1: the same statement shape many times inside one request
    const key = `query:n1:${ctx.requestId}:${fp.id}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 60);
    if (n === 20) await alert(`Possible N+1: ${fp.normalized.slice(0, 120)} ran 20 times in one request`);
  }
  if (durationMs < SLOW_MS) return;

  let hints: IndexHint[] = [];
  try { // plain EXPLAIN only: EXPLAIN ANALYZE would run the statement a second time
    const { rows } = await pool.query(`EXPLAIN (FORMAT JSON) ${sql}`, params);
    hints = indexHints(rows[0]["QUERY PLAN"][0].Plan);
  } catch { /* some statements cannot be explained */ }

  const slow: SlowQuery = {
    id: randomUUID(), fingerprint: fp.id, sql: fp.normalized.slice(0, 2000),
    durationMs, hints, endpoint: ctx.endpoint ?? "", at: new Date().toISOString(),
  };
  await redis.lpush("query:slow", JSON.stringify(slow));
  await redis.ltrim("query:slow", 0, 999);
  await pool.query(
    "INSERT INTO slow_queries (id, fingerprint, sql, duration_ms, hints, endpoint) VALUES ($1, $2, $3, $4, $5, $6)",
    [slow.id, fp.id, slow.sql, durationMs, JSON.stringify(hints), slow.endpoint],
  );

  const prevMax = Number(await redis.hget(`query:fp:${fp.id}`, "maxMs") ?? 0);
  if (durationMs > prevMax) await redis.hset(`query:fp:${fp.id}`, "maxMs", durationMs);
  if (prevMax === 0) await alert(`New slow query (${durationMs}ms): ${slow.sql.slice(0, 120)}`);
  else if (durationMs > prevMax * 2) await alert(`Regression ${prevMax}ms -> ${durationMs}ms: ${slow.sql.slice(0, 120)}`);
}

const alert = (message: string) => redis.rpush("notification:queue", JSON.stringify({ type: "slow_query", message }));

// Worst offenders first: total time = count x average
export async function dashboard(limit: number) {
  const recent = (await redis.lrange("query:slow", 0, 199)).map((r) => JSON.parse(r) as SlowQuery);
  const groups = new Map<string, SlowQuery[]>();
  for (const q of recent) groups.set(q.fingerprint, [...(groups.get(q.fingerprint) ?? []), q]);
  const top = [...groups.values()]
    .map((qs) => ({
      fingerprint: qs[0].fingerprint, sql: qs[0].sql, count: qs.length,
      avgMs: Math.round(qs.reduce((s, q) => s + q.durationMs, 0) / qs.length),
      maxMs: Math.max(...qs.map((q) => q.durationMs)), hints: qs[0].hints,
    }))
    .sort((a, b) => b.count * b.avgMs - a.count * a.avgMs)
    .slice(0, limit);
  return { recent: recent.slice(0, limit), top };
}
```

Three choices matter. Parameters are never stored, only the normalized SQL, because they often hold emails and ids; EXPLAIN can echo bound values in a filter, so those are stripped as well. Monitoring runs after the result is returned and its errors are logged, never thrown into the request. And the sequential-scan hint uses planner cost, not a row estimate: the estimated rows of a filtered scan are the rows it returns, which is small even on a huge table. `BIG_SCAN_COST` is a heuristic to tune against your own data.

### Step 3: Serve the dashboard

```typescript
// src/server.ts -- read-only dashboard API for the analyzer
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { dashboard } from "./query-analyzer.js";

const app = new Hono();
const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

app.get("/slow-queries", zValidator("query", query), async (c) => {
  return c.json(await dashboard(c.req.valid("query").limit));
});

serve({ fetch: app.fetch, port: 3300, hostname: "127.0.0.1" });
```

`GET /slow-queries?limit=10` returns the recent slow executions and the worst fingerprints ranked by count times average duration, each with its index hints. The server listens on 127.0.0.1 only; put authentication in front before exposing it, because the SQL shapes it returns reveal your schema.

### Step 4: Use it

Replace `pool.query(sql, params)` with `monitoredQuery(sql, params, { endpoint: "GET /orders", requestId })` in the hot paths, pass the request id from your middleware so N+1 detection works, run `npx tsx src/server.ts`, and read the alert list with `redis-cli LRANGE notification:queue 0 -1` or have a worker drain it into Slack. A hint such as `orders` with filter `(customer_id = ?)` means: test `CREATE INDEX CONCURRENTLY orders_customer_id_idx ON orders (customer_id)` on a copy, compare `EXPLAIN (ANALYZE, BUFFERS)` before and after, and keep it only if the plan changes and the writes you pay for are worth it.

## Real-World Example

Erik's team wraps their ten busiest endpoints first. In the first week the dashboard ranks one fingerprint, `SELECT * FROM orders WHERE customer_id = ?`, at the top: a sequential scan over a 1.2-million-row table with a cost far above the threshold. They add the index and its latency drops from seconds to milliseconds in their own measurements. The N+1 alert fires for the product listing, where a loop ran one query per product; a join replaces it. Because each fingerprint remembers its highest duration, the next feature that ships a query twice as slow as anything seen before pages the team in staging rather than in production.

## Related Skills

- **typescript** -- strict typing for the plan walker and the dashboard shapes
- **postgresql** -- EXPLAIN, `pg_stat_statements` and index design
- **redis** -- counters, the recent-queries list and the alert queue
- **hono** -- the dashboard API server
- **zod** -- validation of the dashboard query string
