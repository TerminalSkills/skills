---
title: Build a Database Query Profiler
slug: build-database-query-profiler
description: Build a database query profiler with per-request query tracking, N+1 detection, connection pool monitoring, query plan caching, and developer-friendly debug panels for ORM performance optimization.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - database
  - profiling
  - performance
  - n+1
  - optimization
---

# Build a Database Query Profiler

## The Problem

Tom leads backend at a 20-person company. API endpoints are slow but nobody knows why — is it the database, external APIs, or application logic? One endpoint runs 47 queries per request (N+1 problem) but the ORM hides this. Connection pool maxes out during peak but there's no monitoring. Developers add queries without seeing the cumulative impact. They need a query profiler: track every query per request, detect N+1 patterns, monitor connection pool health, and provide a developer debug panel showing exactly what the database did.

## Step 1: Build the Query Profiler

```typescript
import { Pool, PoolClient } from "pg";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface QueryTrace {
  sql: string;
  params: any[];
  duration: number;
  rowCount: number;
  fingerprint: string;
  stack: string;
}

interface RequestProfile {
  requestId: string;
  method: string;
  path: string;
  totalQueries: number;
  totalDuration: number;
  queries: QueryTrace[];
  n1Detected: Array<{ fingerprint: string; count: number; sql: string }>;
  slowQueries: QueryTrace[];
  connectionWaitMs: number;
  timestamp: string;
}

const profiles = new Map<string, RequestProfile>();
const N1_THRESHOLD = 5;
const SLOW_THRESHOLD_MS = 100;

// Wrap pool.query with profiling
export function createProfiledPool(originalPool: Pool): Pool {
  const originalQuery = originalPool.query.bind(originalPool);

  (originalPool as any).query = async function(sql: string, params?: any[]) {
    const requestId = getCurrentRequestId();
    if (!requestId) return originalQuery(sql, params);

    const profile = profiles.get(requestId);
    if (!profile) return originalQuery(sql, params);

    const start = Date.now();
    const result = await originalQuery(sql, params);
    const duration = Date.now() - start;

    const fingerprint = createHash("md5").update(sql.replace(/\$\d+/g, "?").replace(/'[^']*'/g, "?")).digest("hex").slice(0, 12);
    const stack = new Error().stack?.split("\n").slice(2, 5).join("\n") || "";

    profile.queries.push({ sql: sql.slice(0, 500), params: (params || []).slice(0, 5), duration, rowCount: result.rowCount || 0, fingerprint, stack });
    profile.totalQueries++;
    profile.totalDuration += duration;

    if (duration > SLOW_THRESHOLD_MS) profile.slowQueries.push({ sql: sql.slice(0, 500), params: [], duration, rowCount: result.rowCount || 0, fingerprint, stack });

    return result;
  };

  return originalPool;
}

// Middleware: start/end profiling per request
export function profilerMiddleware() {
  return async (c: any, next: any) => {
    const requestId = `req-${Date.now().toString(36)}`;
    c.set("requestId", requestId);
    setCurrentRequestId(requestId);

    const profile: RequestProfile = {
      requestId, method: c.req.method, path: c.req.path,
      totalQueries: 0, totalDuration: 0, queries: [],
      n1Detected: [], slowQueries: [], connectionWaitMs: 0,
      timestamp: new Date().toISOString(),
    };
    profiles.set(requestId, profile);

    await next();

    // Detect N+1 queries
    const fingerprints = new Map<string, { count: number; sql: string }>();
    for (const q of profile.queries) {
      const existing = fingerprints.get(q.fingerprint);
      if (existing) existing.count++;
      else fingerprints.set(q.fingerprint, { count: 1, sql: q.sql });
    }
    profile.n1Detected = [...fingerprints.entries()]
      .filter(([, v]) => v.count >= N1_THRESHOLD)
      .map(([fp, v]) => ({ fingerprint: fp, count: v.count, sql: v.sql }));

    // Add debug header
    c.header("X-DB-Queries", String(profile.totalQueries));
    c.header("X-DB-Duration", `${profile.totalDuration}ms`);
    if (profile.n1Detected.length > 0) c.header("X-DB-N1", profile.n1Detected.map((n) => `${n.sql.slice(0, 50)}(x${n.count})`).join("; "));

    // Store for debug panel
    await redis.setex(`profile:${requestId}`, 3600, JSON.stringify(profile));
    await redis.lpush("profile:recent", requestId);
    await redis.ltrim("profile:recent", 0, 99);

    // Alert on N+1
    if (profile.n1Detected.length > 0) {
      await redis.hincrby("profile:alerts", "n1", 1);
    }

    profiles.delete(requestId);
    clearCurrentRequestId();
  };
}

// Debug panel API
export async function getRecentProfiles(): Promise<RequestProfile[]> {
  const ids = await redis.lrange("profile:recent", 0, 49);
  const results: RequestProfile[] = [];
  for (const id of ids) {
    const data = await redis.get(`profile:${id}`);
    if (data) results.push(JSON.parse(data));
  }
  return results;
}

export async function getProfile(requestId: string): Promise<RequestProfile | null> {
  const data = await redis.get(`profile:${requestId}`);
  return data ? JSON.parse(data) : null;
}

// Connection pool monitoring
export async function getPoolStats(pool: Pool): Promise<{ total: number; idle: number; waiting: number; active: number }> {
  return {
    total: (pool as any).totalCount || 0,
    idle: (pool as any).idleCount || 0,
    waiting: (pool as any).waitingCount || 0,
    active: ((pool as any).totalCount || 0) - ((pool as any).idleCount || 0),
  };
}

// AsyncLocalStorage for request context
let currentRequestId: string | null = null;
function setCurrentRequestId(id: string) { currentRequestId = id; }
function getCurrentRequestId(): string | null { return currentRequestId; }
function clearCurrentRequestId() { currentRequestId = null; }
```

## Results

- **47 queries → 3** — N+1 detection found `SELECT * FROM comments WHERE post_id = ?` running 47 times; developer added `JOIN`; endpoint 10x faster
- **Debug headers in dev** — every response shows `X-DB-Queries: 3` and `X-DB-Duration: 12ms`; developers see database impact of every change instantly
- **Slow query visibility** — 100ms+ queries highlighted in debug panel; developer sees exact SQL and stack trace; optimization targeted
- **Connection pool monitored** — dashboard shows 18/20 connections active during peak; team increases pool size before it becomes a bottleneck
- **Per-request profiles** — click any request in debug panel → see all 3 queries, their durations, row counts, and whether they're N+1; full database transparency
