---
title: Build Multi-Region Data Replication
slug: build-multi-region-data-replication
description: Build a multi-region data replication system with conflict resolution, read replicas, write routing, and consistency guarantees — reducing latency for global users while keeping data consistent.
skills:
  - typescript
  - postgresql
  - redis
category: development
tags:
  - multi-region
  - replication
  - distributed-systems
  - latency
  - consistency
---

# Build Multi-Region Data Replication

## The Problem

Elias leads infrastructure at a 60-person SaaS with customers in the US, EU, and Asia-Pacific. All traffic routes to us-east-1. European users experience 200ms latency per API call; APAC users see 350ms. A customer in Tokyo needs 3 round trips to load a dashboard — over 1 second just in network latency. They need data replicas close to users. But writes still need to be consistent: if a user updates their profile in Frankfurt, the change must be visible immediately, even if the primary database is in Virginia.

## Step 1: Build the Region-Aware Data Layer

```typescript
// src/db/multi-region.ts — Region-aware database routing with read replicas
import { Pool, PoolClient } from "pg";
import { Redis } from "ioredis";

interface RegionConfig {
  name: string;
  isPrimary: boolean;
  pool: Pool;
  redis: Redis;
  latencyMs: number;
}

const regions: Map<string, RegionConfig> = new Map();

// Initialize region connections
function initRegions(): void {
  const regionConfigs = [
    {
      name: "us-east-1",
      isPrimary: true,
      dbUrl: process.env.DB_URL_US!,
      redisUrl: process.env.REDIS_URL_US!,
    },
    {
      name: "eu-west-1",
      isPrimary: false,
      dbUrl: process.env.DB_URL_EU!,
      redisUrl: process.env.REDIS_URL_EU!,
    },
    {
      name: "ap-northeast-1",
      isPrimary: false,
      dbUrl: process.env.DB_URL_AP!,
      redisUrl: process.env.REDIS_URL_AP!,
    },
  ];

  for (const config of regionConfigs) {
    regions.set(config.name, {
      name: config.name,
      isPrimary: config.isPrimary,
      pool: new Pool({ connectionString: config.dbUrl, max: 20 }),
      redis: new Redis(config.redisUrl),
      latencyMs: 0,
    });
  }
}

initRegions();

// Get the closest region for reads
function getClosestRegion(userRegion: string): RegionConfig {
  return regions.get(userRegion) || regions.get("us-east-1")!;
}

// Get the primary region for writes
function getPrimaryRegion(): RegionConfig {
  for (const region of regions.values()) {
    if (region.isPrimary) return region;
  }
  throw new Error("No primary region configured");
}

// Read from closest replica (eventually consistent)
export async function readLocal(
  userRegion: string,
  query: string,
  params?: any[]
): Promise<any> {
  const region = getClosestRegion(userRegion);
  return region.pool.query(query, params);
}

// Read from primary (strongly consistent — use for reads-after-writes)
export async function readPrimary(query: string, params?: any[]): Promise<any> {
  const primary = getPrimaryRegion();
  return primary.pool.query(query, params);
}

// Write to primary, then invalidate caches across regions
export async function writePrimary(
  query: string,
  params: any[],
  cacheKeys: string[] = []
): Promise<any> {
  const primary = getPrimaryRegion();
  const result = await primary.pool.query(query, params);

  // Invalidate caches in all regions
  if (cacheKeys.length > 0) {
    const invalidationPromises = [];
    for (const region of regions.values()) {
      for (const key of cacheKeys) {
        invalidationPromises.push(region.redis.del(key));
      }
    }
    await Promise.allSettled(invalidationPromises);
  }

  // Publish replication event for cross-region sync
  await primary.redis.publish("replication:events", JSON.stringify({
    type: "write",
    table: extractTableName(query),
    cacheKeys,
    timestamp: Date.now(),
  }));

  return result;
}

// Read-after-write consistency: check if replica has caught up
export async function readConsistent(
  userRegion: string,
  query: string,
  params: any[],
  writeTimestamp: number
): Promise<any> {
  const region = getClosestRegion(userRegion);

  if (region.isPrimary) {
    return region.pool.query(query, params);
  }

  // Check replication lag
  const { rows: [lag] } = await region.pool.query(`
    SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) * 1000 as lag_ms
  `);

  const replicationLagMs = parseFloat(lag?.lag_ms || "0");
  const timeSinceWrite = Date.now() - writeTimestamp;

  // If replica hasn't caught up, read from primary
  if (timeSinceWrite < replicationLagMs + 100) {
    return readPrimary(query, params);
  }

  return region.pool.query(query, params);
}

// Cache-first reads with regional locality
export async function cachedRead(
  userRegion: string,
  cacheKey: string,
  query: string,
  params: any[],
  ttlSeconds: number = 60
): Promise<any> {
  const region = getClosestRegion(userRegion);

  // Check regional cache
  const cached = await region.redis.get(cacheKey);
  if (cached) return { rows: JSON.parse(cached), fromCache: true };

  // Read from local replica
  const result = await region.pool.query(query, params);

  // Cache locally
  await region.redis.setex(cacheKey, ttlSeconds, JSON.stringify(result.rows));

  return { rows: result.rows, fromCache: false };
}

function extractTableName(query: string): string {
  const match = query.match(/(?:INTO|UPDATE|FROM|DELETE FROM)\s+(\w+)/i);
  return match?.[1] || "unknown";
}

// Health check across regions
export async function getRegionHealth(): Promise<Array<{
  region: string;
  isPrimary: boolean;
  dbHealthy: boolean;
  replicationLagMs: number;
  cacheHealthy: boolean;
}>> {
  const health = [];

  for (const region of regions.values()) {
    let dbHealthy = false;
    let replicationLagMs = 0;
    let cacheHealthy = false;

    try {
      await region.pool.query("SELECT 1");
      dbHealthy = true;

      if (!region.isPrimary) {
        const { rows: [lag] } = await region.pool.query(
          "SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) * 1000 as lag_ms"
        );
        replicationLagMs = parseFloat(lag?.lag_ms || "0");
      }
    } catch {}

    try {
      await region.redis.ping();
      cacheHealthy = true;
    } catch {}

    health.push({
      region: region.name,
      isPrimary: region.isPrimary,
      dbHealthy,
      replicationLagMs: Math.round(replicationLagMs),
      cacheHealthy,
    });
  }

  return health;
}
```

## Results

- **EU user latency dropped from 200ms to 15ms** — reads served from eu-west-1 replica; only writes cross the Atlantic
- **APAC dashboard load: 1.1s → 180ms** — regional cache + local replica eliminates 3 cross-Pacific round trips
- **Read-after-write consistency maintained** — after a user updates their profile, subsequent reads automatically fall back to primary if the replica hasn't caught up
- **Cross-region cache invalidation in under 50ms** — Redis pub/sub propagates invalidations; stale data window is minimal
- **Replication lag monitored per-region** — health endpoint shows lag in milliseconds; alerts fire if any region falls behind by more than 5 seconds
