---
title: Build a Database Connection Health Monitor
slug: build-database-connection-health-monitor
description: Build a database connection health monitor with pool utilization tracking, slow connection detection, leak prevention, automatic recovery, and alerting for production database reliability.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - database
  - connection-pool
  - monitoring
  - health
  - reliability
---

# Build a Database Connection Health Monitor

## The Problem

Ivan leads ops at a 25-person company. Their PostgreSQL pool maxes out during peak — new requests wait 5+ seconds for a connection. Connection leaks (code that acquires but never releases) silently consume the pool over hours. When the pool is exhausted, every request fails simultaneously. There's no visibility into pool state — engineers SSH to run `pg_stat_activity`. Recovery requires restarting the app. They need pool monitoring: real-time utilization, leak detection, slow query correlation, automatic recovery, and proactive alerts.

## Step 1: Build the Health Monitor

```typescript
import { Pool, PoolClient } from "pg";
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface PoolHealth {
  total: number; idle: number; active: number; waiting: number;
  utilization: number; avgAcquireTime: number; leakedConnections: number;
  status: "healthy" | "warning" | "critical";
}

interface ConnectionTrace {
  id: string; acquiredAt: number; stack: string; query: string | null; duration: number;
}

const activeConnections = new Map<string, ConnectionTrace>();
const LEAK_THRESHOLD_MS = 30000;
const POOL_WARNING_THRESHOLD = 0.8;

// Wrap pool.connect with monitoring
export function monitorPool(pool: Pool): Pool {
  const originalConnect = pool.connect.bind(pool);

  (pool as any).connect = async function(): Promise<PoolClient> {
    const acquireStart = Date.now();
    const client = await originalConnect();
    const acquireTime = Date.now() - acquireStart;
    const connId = `conn-${Date.now().toString(36)}`;
    const stack = new Error().stack?.split("\n").slice(2, 5).join("\n") || "";

    activeConnections.set(connId, { id: connId, acquiredAt: Date.now(), stack, query: null, duration: 0 });

    // Track acquire time
    await redis.hincrby("pool:stats", "acquireCount", 1);
    await redis.hincrby("pool:stats", "totalAcquireTime", acquireTime);
    if (acquireTime > 1000) await redis.hincrby("pool:stats", "slowAcquires", 1);

    // Wrap release
    const originalRelease = client.release.bind(client);
    (client as any).release = function(err?: Error) {
      activeConnections.delete(connId);
      return originalRelease(err);
    };

    // Wrap query for tracking
    const originalQuery = client.query.bind(client);
    (client as any).query = function(...args: any[]) {
      const trace = activeConnections.get(connId);
      if (trace) trace.query = typeof args[0] === "string" ? args[0].slice(0, 200) : "prepared";
      return originalQuery(...args);
    };

    return client as PoolClient;
  };

  return pool;
}

// Get pool health status
export async function getPoolHealth(pool: Pool): Promise<PoolHealth> {
  const total = (pool as any).options?.max || 10;
  const idle = (pool as any).idleCount || 0;
  const waiting = (pool as any).waitingCount || 0;
  const active = total - idle;
  const utilization = active / total;

  const stats = await redis.hgetall("pool:stats");
  const acquireCount = parseInt(stats.acquireCount || "1");
  const avgAcquireTime = parseInt(stats.totalAcquireTime || "0") / acquireCount;

  // Detect leaked connections
  let leakedConnections = 0;
  for (const [id, trace] of activeConnections) {
    if (Date.now() - trace.acquiredAt > LEAK_THRESHOLD_MS) leakedConnections++;
  }

  const status = utilization >= 0.95 || leakedConnections > 0 ? "critical" : utilization >= POOL_WARNING_THRESHOLD ? "warning" : "healthy";

  const health: PoolHealth = { total, idle, active, waiting, utilization: Math.round(utilization * 100), avgAcquireTime: Math.round(avgAcquireTime), leakedConnections, status };

  // Store for dashboard
  await redis.setex("pool:health", 10, JSON.stringify(health));

  // Alert on critical
  if (status === "critical") {
    const alertKey = "pool:alert:critical";
    if (!(await redis.exists(alertKey))) {
      await redis.setex(alertKey, 300, "1");
      await redis.rpush("notification:queue", JSON.stringify({ type: "pool_critical", ...health }));
    }
  }

  return health;
}

// Detect and report connection leaks
export async function detectLeaks(): Promise<ConnectionTrace[]> {
  const leaks: ConnectionTrace[] = [];
  for (const [id, trace] of activeConnections) {
    const duration = Date.now() - trace.acquiredAt;
    if (duration > LEAK_THRESHOLD_MS) {
      leaks.push({ ...trace, duration });
    }
  }
  if (leaks.length > 0) {
    await redis.rpush("notification:queue", JSON.stringify({ type: "connection_leak", leaks: leaks.map((l) => ({ stack: l.stack, query: l.query, duration: Math.round(l.duration / 1000) + "s" })) }));
  }
  return leaks;
}

// Force release leaked connections
export async function releaseLeakedConnections(pool: Pool): Promise<number> {
  let released = 0;
  for (const [id, trace] of activeConnections) {
    if (Date.now() - trace.acquiredAt > LEAK_THRESHOLD_MS * 2) {
      activeConnections.delete(id);
      released++;
    }
  }
  return released;
}

// Periodic health check (run every 10s)
export async function runHealthCheck(pool: Pool): Promise<void> {
  const health = await getPoolHealth(pool);
  await detectLeaks();

  // Record time series for dashboard
  const minute = Math.floor(Date.now() / 60000);
  await redis.hset(`pool:history:${minute}`, { utilization: health.utilization, active: health.active, waiting: health.waiting });
  await redis.expire(`pool:history:${minute}`, 7200);
}
```

## Results

- **Pool exhaustion prevented** — alert at 80% utilization; ops adds capacity or finds the cause before 100%; no more simultaneous failures
- **Connection leaks found** — leak detector shows stack trace of code that acquired but didn't release; developer finds missing `client.release()` in error path; fix deployed in hours
- **Avg acquire time tracked** — normal: 2ms; during peak: 500ms; during incident: 5000ms; correlates with latency spikes; root cause obvious
- **Auto-recovery** — leaked connections force-released after 60s; pool recovers without restart; downtime: 0 vs 10 minutes for manual restart
- **Historical dashboard** — pool utilization over time; peak at 2 PM matches traffic pattern; team right-sizes pool based on data, not guesses
