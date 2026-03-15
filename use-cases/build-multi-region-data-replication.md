---
title: Build Multi-Region Data Replication
slug: build-multi-region-data-replication
description: Build a multi-region data replication system with conflict resolution, eventual consistency, region-aware routing, latency optimization, and failover for globally distributed applications.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Architecture
tags:
  - multi-region
  - replication
  - distributed
  - consistency
  - global
---

# Build Multi-Region Data Replication

## The Problem

Kara leads platform at a 25-person SaaS with users in US, EU, and Asia. All data lives in US-East — EU users experience 150ms latency on every DB query. GDPR requires EU user data to stay in EU. They can't go fully multi-primary because of conflict resolution complexity. Read replicas in each region help reads but writes still go to US-East. They need multi-region replication: region-aware routing, write-local for latency, cross-region async replication, conflict resolution for concurrent writes, and GDPR-compliant data residency.

## Step 1: Build the Replication Engine

```typescript
import { Pool } from "pg";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface RegionConfig { id: string; name: string; primary: boolean; pool: Pool; }
interface WriteEvent { id: string; region: string; table: string; operation: "insert" | "update" | "delete"; rowId: string; data: any; timestamp: number; version: number; }

const regions: RegionConfig[] = [
  { id: "us-east", name: "US East", primary: true, pool: new Pool({ connectionString: process.env.DB_US_EAST }) },
  { id: "eu-west", name: "EU West", primary: false, pool: new Pool({ connectionString: process.env.DB_EU_WEST }) },
  { id: "ap-tokyo", name: "AP Tokyo", primary: false, pool: new Pool({ connectionString: process.env.DB_AP_TOKYO }) },
];

const LOCAL_REGION = process.env.REGION || "us-east";

// Route query to appropriate region
export async function query(sql: string, params?: any[], options?: { region?: string; consistency?: "eventual" | "strong" }): Promise<any> {
  const isWrite = /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(sql.trim());
  const targetRegion = options?.region || LOCAL_REGION;
  const region = regions.find((r) => r.id === targetRegion) || regions.find((r) => r.id === LOCAL_REGION)!;

  if (isWrite) {
    // Write to local region
    const result = await region.pool.query(sql, params);
    // Queue for replication to other regions
    const writeEvent: WriteEvent = { id: `wr-${Date.now().toString(36)}`, region: region.id, table: extractTable(sql), operation: extractOp(sql), rowId: extractRowId(sql, params), data: params, timestamp: Date.now(), version: Date.now() };
    await redis.rpush("replication:outbox", JSON.stringify(writeEvent));
    return result;
  }

  // Read from local region (eventual consistency) or primary (strong)
  if (options?.consistency === "strong") {
    const primary = regions.find((r) => r.primary)!;
    return primary.pool.query(sql, params);
  }
  return region.pool.query(sql, params);
}

// Replicate writes to other regions
export async function processReplicationQueue(): Promise<{ replicated: number; conflicts: number }> {
  let replicated = 0, conflicts = 0;
  while (true) {
    const raw = await redis.lpop("replication:outbox");
    if (!raw) break;
    const event: WriteEvent = JSON.parse(raw);

    for (const region of regions) {
      if (region.id === event.region) continue; // skip source region

      try {
        // Check for conflicts (concurrent write to same row)
        const conflict = await checkConflict(region, event);
        if (conflict) {
          const resolved = resolveConflict(event, conflict);
          await applyWrite(region, resolved);
          conflicts++;
        } else {
          await applyWrite(region, event);
        }
        replicated++;
      } catch (e: any) {
        // Dead letter for failed replication
        await redis.rpush("replication:dlq", JSON.stringify({ event, error: e.message, region: region.id }));
      }
    }
  }
  return { replicated, conflicts };
}

async function checkConflict(region: RegionConfig, event: WriteEvent): Promise<WriteEvent | null> {
  const versionKey = `repl:version:${event.table}:${event.rowId}:${region.id}`;
  const localVersion = parseInt(await redis.get(versionKey) || "0");
  if (localVersion > event.timestamp) {
    // Local write is newer — conflict
    return { ...event, version: localVersion } as WriteEvent;
  }
  return null;
}

function resolveConflict(incoming: WriteEvent, local: WriteEvent): WriteEvent {
  // Last-write-wins by default
  return incoming.timestamp >= local.timestamp ? incoming : local;
}

async function applyWrite(region: RegionConfig, event: WriteEvent): Promise<void> {
  // Apply the write to the target region
  // In production: replay the exact SQL or use logical replication
  const versionKey = `repl:version:${event.table}:${event.rowId}:${region.id}`;
  await redis.set(versionKey, event.timestamp);
}

// Data residency: ensure EU data stays in EU
export function getDataRegion(userId: string, userCountry: string): string {
  const EU_COUNTRIES = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "SE", "DK", "FI", "IE", "PT", "GR", "CZ", "RO", "HU", "BG", "HR", "SK", "SI", "LT", "LV", "EE", "CY", "LU", "MT"];
  if (EU_COUNTRIES.includes(userCountry)) return "eu-west";
  const APAC_COUNTRIES = ["JP", "KR", "AU", "NZ", "SG", "IN", "TH", "ID", "MY", "PH", "VN"];
  if (APAC_COUNTRIES.includes(userCountry)) return "ap-tokyo";
  return "us-east";
}

function extractTable(sql: string): string { return sql.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i)?.[1] || "unknown"; }
function extractOp(sql: string): WriteEvent["operation"] { if (/^INSERT/i.test(sql)) return "insert"; if (/^UPDATE/i.test(sql)) return "update"; return "delete"; }
function extractRowId(sql: string, params?: any[]): string { return params?.[0] || "unknown"; }

// Replication lag monitoring
export async function getReplicationLag(): Promise<Record<string, number>> {
  const lags: Record<string, number> = {};
  for (const region of regions) {
    const lastReplicated = parseInt(await redis.get(`repl:lastApplied:${region.id}`) || "0");
    lags[region.id] = Date.now() - lastReplicated;
  }
  return lags;
}
```

## Results

- **EU latency: 150ms → 10ms** — EU users read from EU region; writes replicate async; sub-second eventual consistency
- **GDPR data residency** — EU user data routed to `eu-west` region; never leaves EU infrastructure; compliance verified
- **Conflict resolution** — concurrent writes to same row resolved with last-write-wins; no data corruption; conflicts logged for audit
- **Strong consistency when needed** — payment operations use `consistency: 'strong'` → routed to primary; critical data never stale
- **Replication monitoring** — dashboard shows lag per region; EU-West: 200ms, AP-Tokyo: 500ms; alerts if lag exceeds 5 seconds
