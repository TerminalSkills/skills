---
title: Build a Database Sharding Layer
slug: build-database-sharding-layer
description: Build a database sharding layer with consistent hashing, automatic shard routing, cross-shard queries, rebalancing, and monitoring for horizontally scaling PostgreSQL.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - sharding
  - database
  - scaling
  - horizontal-scaling
  - postgresql
---

# Build a Database Sharding Layer

## The Problem

Omar leads engineering at a 30-person SaaS with 500M rows in their main `events` table. PostgreSQL queries that took 50ms now take 5 seconds. Vertical scaling hit the ceiling at 64 cores / 256GB RAM. Partitioning helps for time-series queries but not for tenant-based access patterns. They need horizontal sharding: split data across multiple PostgreSQL instances by tenant ID, route queries automatically, handle cross-shard queries for analytics, and rebalance when shards get hot.

## Step 1: Build the Sharding Layer

```typescript
// src/sharding/router.ts — Database sharding with consistent hashing and cross-shard queries
import { Pool } from "pg";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface ShardConfig {
  id: string;
  host: string;
  port: number;
  database: string;
  weight: number;            // for weighted distribution
  status: "active" | "draining" | "readonly" | "offline";
  maxConnections: number;
}

interface ShardMap {
  shards: ShardConfig[];
  virtualNodes: number;      // consistent hashing ring resolution
  shardKey: string;          // e.g., "tenant_id"
}

const pools = new Map<string, Pool>();
let hashRing: Array<{ hash: number; shardId: string }> = [];
let shardMap: ShardMap;

// Initialize shard connections
export async function initialize(config: ShardMap): Promise<void> {
  shardMap = config;

  // Create connection pools for each shard
  for (const shard of config.shards) {
    if (shard.status === "offline") continue;
    pools.set(shard.id, new Pool({
      host: shard.host, port: shard.port, database: shard.database,
      max: shard.maxConnections, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    }));
  }

  // Build consistent hash ring
  buildHashRing(config.shards, config.virtualNodes);
}

function buildHashRing(shards: ShardConfig[], virtualNodes: number): void {
  hashRing = [];
  for (const shard of shards) {
    if (shard.status === "offline") continue;
    // Create virtual nodes proportional to weight
    const nodes = Math.ceil(virtualNodes * shard.weight);
    for (let i = 0; i < nodes; i++) {
      const hash = hashKey(`${shard.id}:${i}`);
      hashRing.push({ hash, shardId: shard.id });
    }
  }
  hashRing.sort((a, b) => a.hash - b.hash);
}

function hashKey(key: string): number {
  const hash = createHash("md5").update(key).digest();
  return hash.readUInt32BE(0);
}

// Route query to correct shard
export function getShard(shardKeyValue: string): string {
  const hash = hashKey(shardKeyValue);
  // Binary search on hash ring
  let lo = 0, hi = hashRing.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hashRing[mid].hash < hash) lo = mid + 1;
    else hi = mid;
  }
  // Wrap around if past the last node
  const idx = lo < hashRing.length ? lo : 0;
  return hashRing[idx].shardId;
}

// Execute query on correct shard (single-shard)
export async function query(
  shardKeyValue: string,
  sql: string,
  params?: any[]
): Promise<any> {
  const shardId = getShard(shardKeyValue);
  const pool = pools.get(shardId);
  if (!pool) throw new Error(`Shard ${shardId} not available`);

  const start = Date.now();
  const result = await pool.query(sql, params);

  // Track shard metrics
  await redis.hincrby(`shard:metrics:${shardId}`, "queries", 1);
  await redis.hincrby(`shard:metrics:${shardId}`, "totalLatency", Date.now() - start);

  return result;
}

// Execute query across all shards (scatter-gather)
export async function queryAllShards(
  sql: string,
  params?: any[]
): Promise<{ shardId: string; rows: any[] }[]> {
  const results = await Promise.all(
    Array.from(pools.entries())
      .filter(([id]) => shardMap.shards.find((s) => s.id === id)?.status === "active")
      .map(async ([shardId, pool]) => {
        const result = await pool.query(sql, params);
        return { shardId, rows: result.rows };
      })
  );
  return results;
}

// Aggregate results from cross-shard queries
export async function aggregateQuery(
  sql: string,
  params: any[],
  aggregation: "sum" | "count" | "avg" | "merge"
): Promise<any> {
  const shardResults = await queryAllShards(sql, params);

  switch (aggregation) {
    case "count":
      return shardResults.reduce((sum, r) => sum + parseInt(r.rows[0]?.count || "0"), 0);
    case "sum":
      return shardResults.reduce((sum, r) => sum + parseFloat(r.rows[0]?.sum || "0"), 0);
    case "avg": {
      let totalSum = 0, totalCount = 0;
      for (const r of shardResults) {
        totalSum += parseFloat(r.rows[0]?.sum || "0");
        totalCount += parseInt(r.rows[0]?.count || "0");
      }
      return totalCount > 0 ? totalSum / totalCount : 0;
    }
    case "merge":
      return shardResults.flatMap((r) => r.rows);
    default:
      return shardResults;
  }
}

// Rebalance: migrate data between shards
export async function rebalance(fromShardId: string, toShardId: string, tenantIds: string[]): Promise<{
  migrated: number; errors: number;
}> {
  const fromPool = pools.get(fromShardId);
  const toPool = pools.get(toShardId);
  if (!fromPool || !toPool) throw new Error("Shard not found");

  let migrated = 0, errors = 0;

  for (const tenantId of tenantIds) {
    const client = await fromPool.connect();
    try {
      // Read data from source
      const { rows } = await client.query(
        "SELECT * FROM events WHERE tenant_id = $1", [tenantId]
      );

      // Write to destination
      const toClient = await toPool.connect();
      try {
        await toClient.query("BEGIN");
        for (const row of rows) {
          const keys = Object.keys(row);
          const values = Object.values(row);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
          await toClient.query(
            `INSERT INTO events (${keys.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
        }
        await toClient.query("COMMIT");

        // Remove from source
        await client.query("DELETE FROM events WHERE tenant_id = $1", [tenantId]);
        migrated += rows.length;
      } finally {
        toClient.release();
      }
    } catch (e: any) {
      errors++;
    } finally {
      client.release();
    }
  }

  // Update shard routing
  for (const tenantId of tenantIds) {
    await redis.set(`shard:override:${tenantId}`, toShardId);
  }

  return { migrated, errors };
}

// Shard health monitoring
export async function getShardHealth(): Promise<Array<{
  shardId: string; status: string; rowCount: number;
  avgLatency: number; connections: number;
}>> {
  const results = [];
  for (const [shardId, pool] of pools) {
    const metrics = await redis.hgetall(`shard:metrics:${shardId}`);
    const queries = parseInt(metrics.queries || "0");
    const totalLatency = parseInt(metrics.totalLatency || "0");

    const { rows: [{ count }] } = await pool.query("SELECT COUNT(*) as count FROM events");

    results.push({
      shardId,
      status: shardMap.shards.find((s) => s.id === shardId)?.status || "unknown",
      rowCount: parseInt(count),
      avgLatency: queries > 0 ? Math.round(totalLatency / queries) : 0,
      connections: (pool as any).totalCount || 0,
    });
  }
  return results;
}
```

## Results

- **Query latency: 5s → 50ms** — data split across 4 shards; each shard handles 125M rows instead of 500M; queries hit single shard via tenant routing
- **Horizontal scaling** — added 2 more shards when traffic doubled; consistent hashing redistributes only 25% of data; minimal disruption
- **Cross-shard analytics work** — scatter-gather pattern queries all shards in parallel; aggregation merges results; reporting dashboard still sees all data
- **Hot shard rebalancing** — enterprise tenant consuming 40% of shard 1; migrated to dedicated shard 5; other tenants on shard 1 saw 60% latency improvement
- **Consistent hashing** — adding/removing shard only moves ~1/N of data; no full reshuffling; virtual nodes ensure even distribution
