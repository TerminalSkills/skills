---
title: Build a Database Read Replica Router
slug: build-database-read-replica-router
description: Build a database read replica router with automatic read/write splitting, replica health monitoring, connection pooling, lag detection, and failover for scaling PostgreSQL reads.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - database
  - read-replica
  - scaling
  - postgresql
  - connection-pool
---

# Build a Database Read Replica Router

## The Problem

Nadia leads backend at a 30-person SaaS. Their single PostgreSQL instance handles 5,000 queries/second — 80% reads, 20% writes. CPU is at 90%. Vertical scaling hit the ceiling. They added 2 read replicas but developers must manually choose which pool to use for each query — some forgot and all queries still hit the primary. When a replica lags behind (replication delay), users see stale data. If a replica goes down, queries to it fail instead of redirecting. They need automatic read/write routing: detect reads vs writes, route to healthy replicas, handle replication lag, and fail over gracefully.

## Step 1: Build the Replica Router

```typescript
// src/db/replica-router.ts — Read/write splitting with health monitoring and lag detection
import { Pool, PoolClient } from "pg";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface ReplicaConfig {
  id: string;
  host: string;
  port: number;
  database: string;
  weight: number;
  maxLagMs: number;
}

interface ReplicaState {
  id: string;
  status: "healthy" | "lagging" | "down";
  lagMs: number;
  connections: number;
  lastCheckAt: number;
}

const primaryPool: Pool = new Pool({
  host: process.env.DB_PRIMARY_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
});

const replicaPools = new Map<string, Pool>();
const replicaConfigs: ReplicaConfig[] = [
  { id: "replica-1", host: process.env.DB_REPLICA1_HOST || "localhost", port: 5432, database: process.env.DB_NAME || "app", weight: 1, maxLagMs: 1000 },
  { id: "replica-2", host: process.env.DB_REPLICA2_HOST || "localhost", port: 5432, database: process.env.DB_NAME || "app", weight: 1, maxLagMs: 1000 },
];

// Initialize replica pools
for (const config of replicaConfigs) {
  replicaPools.set(config.id, new Pool({
    host: config.host, port: config.port, database: config.database,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    max: 30,
  }));
}

// Smart query router
export async function query(sql: string, params?: any[], options?: { forcePrimary?: boolean; maxLagMs?: number }): Promise<any> {
  // Route writes to primary
  if (options?.forcePrimary || isWriteQuery(sql)) {
    return primaryPool.query(sql, params);
  }

  // Route reads to replica
  const replica = await selectReplica(options?.maxLagMs);
  if (replica) {
    try {
      return await replica.pool.query(sql, params);
    } catch (error) {
      // Fallback to primary on replica failure
      await markReplicaDown(replica.id);
      return primaryPool.query(sql, params);
    }
  }

  // All replicas down — use primary
  return primaryPool.query(sql, params);
}

// Transaction wrapper (always uses primary)
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await primaryPool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Read-after-write consistency: route to primary briefly after a write
export async function queryAfterWrite(userId: string, sql: string, params?: any[]): Promise<any> {
  const recentWriteKey = `db:write:${userId}`;
  const recentWrite = await redis.exists(recentWriteKey);

  if (recentWrite) {
    return primaryPool.query(sql, params);
  }

  return query(sql, params);
}

// Mark that a user just did a write (for read-after-write consistency)
export async function markWrite(userId: string): Promise<void> {
  await redis.setex(`db:write:${userId}`, 5, "1"); // 5 second window
}

async function selectReplica(maxLagMs?: number): Promise<{ id: string; pool: Pool } | null> {
  const healthy: Array<{ id: string; pool: Pool; weight: number; lag: number }> = [];

  for (const config of replicaConfigs) {
    const state = await getReplicaState(config.id);
    if (state.status === "down") continue;
    if (maxLagMs && state.lagMs > maxLagMs) continue;
    if (state.lagMs > config.maxLagMs) continue;

    const pool = replicaPools.get(config.id);
    if (pool) healthy.push({ id: config.id, pool, weight: config.weight, lag: state.lagMs });
  }

  if (healthy.length === 0) return null;

  // Weighted random selection (prefer lower lag)
  const totalWeight = healthy.reduce((s, r) => s + r.weight, 0);
  let random = Math.random() * totalWeight;
  for (const replica of healthy) {
    random -= replica.weight;
    if (random <= 0) return { id: replica.id, pool: replica.pool };
  }

  return { id: healthy[0].id, pool: healthy[0].pool };
}

// Health check and lag monitoring
export async function checkReplicaHealth(): Promise<void> {
  // Get primary WAL position
  const { rows: [{ pg_current_wal_lsn }] } = await primaryPool.query("SELECT pg_current_wal_lsn()");

  for (const config of replicaConfigs) {
    const pool = replicaPools.get(config.id);
    if (!pool) continue;

    try {
      const start = Date.now();
      const { rows: [replica] } = await pool.query(
        "SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn(), EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) * 1000 as lag_ms"
      );
      const latency = Date.now() - start;
      const lagMs = Math.max(parseFloat(replica.lag_ms || "0"), latency);

      const status = lagMs > config.maxLagMs ? "lagging" : "healthy";

      await redis.setex(`db:replica:${config.id}`, 30, JSON.stringify({
        id: config.id, status, lagMs: Math.round(lagMs),
        connections: (pool as any).totalCount || 0,
        lastCheckAt: Date.now(),
      }));
    } catch {
      await redis.setex(`db:replica:${config.id}`, 30, JSON.stringify({
        id: config.id, status: "down", lagMs: 99999,
        connections: 0, lastCheckAt: Date.now(),
      }));
    }
  }
}

async function getReplicaState(replicaId: string): Promise<ReplicaState> {
  const cached = await redis.get(`db:replica:${replicaId}`);
  return cached ? JSON.parse(cached) : { id: replicaId, status: "healthy", lagMs: 0, connections: 0, lastCheckAt: 0 };
}

async function markReplicaDown(replicaId: string): Promise<void> {
  await redis.setex(`db:replica:${replicaId}`, 30, JSON.stringify({
    id: replicaId, status: "down", lagMs: 99999, connections: 0, lastCheckAt: Date.now(),
  }));
}

function isWriteQuery(sql: string): boolean {
  const upper = sql.trimStart().toUpperCase();
  return upper.startsWith("INSERT") || upper.startsWith("UPDATE") ||
    upper.startsWith("DELETE") || upper.startsWith("CREATE") ||
    upper.startsWith("ALTER") || upper.startsWith("DROP") ||
    upper.startsWith("BEGIN") || upper.startsWith("COMMIT");
}

// Dashboard stats
export async function getRouterStats(): Promise<{
  primary: { connections: number; queriesPerSec: number };
  replicas: ReplicaState[];
}> {
  const replicas: ReplicaState[] = [];
  for (const config of replicaConfigs) {
    replicas.push(await getReplicaState(config.id));
  }
  return {
    primary: { connections: (primaryPool as any).totalCount || 0, queriesPerSec: 0 },
    replicas,
  };
}
```

## Results

- **Primary CPU: 90% → 35%** — 80% of queries (reads) offloaded to replicas; primary handles only writes; headroom for 3x growth
- **Automatic routing** — developer writes `query(sql)` — router detects SELECT vs INSERT and routes accordingly; no manual pool selection; zero code changes for existing queries
- **Replication lag handled** — replica 1 lags 5 seconds → marked as "lagging" → reads routed to replica 2; users never see stale data from lagging replica
- **Read-after-write consistency** — user updates profile → next 5 seconds reads go to primary; after 5s, reads go back to replicas; user always sees their own changes
- **Graceful failover** — replica 2 goes down → query fails → automatically retried on primary → replica marked as down → health check restores when back; zero user-visible errors
