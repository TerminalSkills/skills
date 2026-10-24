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

Elias leads infrastructure at a 60-person SaaS with customers in the US, EU, and Asia-Pacific. All traffic routes to us-east-1. Their measurements show European users waiting about 200 ms per API call and APAC users about 350 ms. A customer in Tokyo needs 3 round trips to load a dashboard, so over a second goes to network latency alone. They need data replicas close to users. But writes still need to be consistent: if a user updates their profile in Frankfurt, the change must be visible immediately, even if the primary database is in Virginia.

This page uses PostgreSQL streaming replication (one primary, read-only standbys per region), and a regional Redis cache that is only a cache. Redis is not replicated between regions here; each region fills its own cache and the primary's write path deletes the affected keys everywhere.

## The Solution

Send every write to the primary. Serve reads from the nearest standby. After a write, hand the client the primary's WAL position (an LSN), and let the next read check whether the local standby has replayed that position. If it has not, read from the primary instead.

The earlier version of this design measured lag with `NOW() - pg_last_xact_replay_timestamp()`. That is misleading: the PostgreSQL docs say the function returns the commit time of the last replayed transaction, so on an idle primary the "lag" grows forever although the standby is fully caught up. Comparing LSNs has no such problem.

## Step-by-Step Walkthrough

### Step 1: Set up replication

On each standby, build it from a base backup of the primary with `pg_basebackup -R` (this writes `standby.signal` and the connection settings), then start it. Managed services (RDS, Cloud SQL, Azure) offer cross-region read replicas that do the same. Run `SELECT pg_is_in_recovery();` on a standby to confirm it returns `true`. See the PostgreSQL "High Availability, Load Balancing, and Replication" chapter for the full procedure.

### Step 2: Build the region-aware data layer

```typescript
// src/db/multi-region.ts: region-aware routing with read replicas and LSN-based read-after-write
import { Pool, QueryResult } from "pg";
import { Redis } from "ioredis";

interface Region {
  name: string;
  isPrimary: boolean;
  pool: Pool;
  redis: Redis;
}

const regions = new Map<string, Region>();

const configs = [
  { name: "us-east-1", isPrimary: true, db: process.env.DB_URL_US!, redis: process.env.REDIS_URL_US! },
  { name: "eu-west-1", isPrimary: false, db: process.env.DB_URL_EU!, redis: process.env.REDIS_URL_EU! },
  { name: "ap-northeast-1", isPrimary: false, db: process.env.DB_URL_AP!, redis: process.env.REDIS_URL_AP! },
];

for (const c of configs) {
  const pool = new Pool({ connectionString: c.db, max: 20 });
  const redis = new Redis(c.redis);
  // Without these handlers a dropped idle connection (a standby restarting) crashes the process
  pool.on("error", () => {});
  redis.on("error", () => {});
  regions.set(c.name, { name: c.name, isPrimary: c.isPrimary, pool, redis });
}

function closest(userRegion: string): Region {
  return regions.get(userRegion) ?? primary();
}

function primary(): Region {
  for (const r of regions.values()) if (r.isPrimary) return r;
  throw new Error("No primary region configured");
}

// Eventually consistent read from the nearest standby
export function readLocal(userRegion: string, sql: string, params?: unknown[]): Promise<QueryResult> {
  return closest(userRegion).pool.query(sql, params);
}

// Strongly consistent read from the primary
export function readPrimary(sql: string, params?: unknown[]): Promise<QueryResult> {
  return primary().pool.query(sql, params);
}

// Write on the primary, delete cache keys in every region, return the WAL position of the write
export async function writePrimary(
  sql: string,
  params: unknown[],
  cacheKeys: string[] = []
): Promise<{ result: QueryResult; lsn: string }> {
  const p = primary();
  const result = await p.pool.query(sql, params);
  // The WAL position after our commit is at least the commit record's position
  const { rows } = await p.pool.query("SELECT pg_current_wal_lsn()::text AS lsn");

  if (cacheKeys.length > 0) {
    await Promise.allSettled(
      [...regions.values()].flatMap((r) => cacheKeys.map((k) => r.redis.del(k)))
    );
  }
  return { result, lsn: rows[0].lsn };
}

// Read-after-write: use the standby only if it has replayed the client's LSN
export async function readConsistent(
  userRegion: string,
  sql: string,
  params: unknown[],
  minLsn: string
): Promise<QueryResult> {
  const region = closest(userRegion);
  if (region.isPrimary) return region.pool.query(sql, params);

  const { rows } = await region.pool.query(
    "SELECT pg_last_wal_replay_lsn() >= $1::pg_lsn AS caught_up",
    [minLsn]
  );
  return rows[0].caught_up ? region.pool.query(sql, params) : readPrimary(sql, params);
}

// Cache-first read with regional locality
export async function cachedRead(
  userRegion: string,
  cacheKey: string,
  sql: string,
  params: unknown[],
  ttlSeconds = 60
): Promise<{ rows: unknown[]; fromCache: boolean }> {
  const region = closest(userRegion);
  const cached = await region.redis.get(cacheKey);
  if (cached) return { rows: JSON.parse(cached), fromCache: true };

  const result = await region.pool.query(sql, params);
  await region.redis.setex(cacheKey, ttlSeconds, JSON.stringify(result.rows));
  return { rows: result.rows, fromCache: false };
}

// Per-region health: a standby's lag is the byte distance between received and replayed WAL
export async function getRegionHealth() {
  const out = [];
  for (const r of regions.values()) {
    let dbHealthy = false;
    let replayLagBytes = 0;
    let cacheHealthy = false;
    try {
      await r.pool.query("SELECT 1");
      dbHealthy = true;
      if (!r.isPrimary) {
        const { rows } = await r.pool.query(
          "SELECT pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn())::bigint AS lag"
        );
        replayLagBytes = Number(rows[0].lag ?? 0);
      }
    } catch {
      /* reported as unhealthy */
    }
    try {
      cacheHealthy = (await r.redis.ping()) === "PONG";
    } catch {
      /* reported as unhealthy */
    }
    out.push({ region: r.name, isPrimary: r.isPrimary, dbHealthy, replayLagBytes, cacheHealthy });
  }
  return out;
}
```

### Step 3: Carry the LSN with the user

After a write, return `lsn` to the client (in a cookie or response header). On the next request from that user, pass it as `minLsn` to `readConsistent`. Reads that do not follow a write by the same user can use `readLocal` or `cachedRead`.

For lag in seconds rather than bytes, run on the primary `SELECT replay_lag FROM pg_stat_replication;` (PostgreSQL 10 and later), which is measured from actual replay and does not grow while the primary is idle.

### Step 4: Check it

Write through the primary, then read from the standby with the returned LSN: while the standby is behind, `readConsistent` should hit the primary, and once `pg_last_wal_replay_lsn()` passes the LSN it should hit the standby. Pausing replay on a test standby with `SELECT pg_wal_replay_pause();` makes the fallback easy to see (`pg_wal_replay_resume()` undoes it).

## Real-World Example

Elias's team rolls this out region by region, starting with eu-west-1. Their own before/after measurement for a European user's profile read is about 200 ms from us-east-1 versus a single-digit-to-low-tens of milliseconds from the Frankfurt standby plus regional cache; their numbers will differ with provider and distance. They alert when a standby's `replayLagBytes` or `replay_lag` stays high, and they route all reads to the primary while a standby is unhealthy.

## Related Skills

- `typescript` for the typed data layer
- `postgresql` for streaming replication, LSNs and `pg_stat_replication`
- `redis` for the regional cache and invalidation
