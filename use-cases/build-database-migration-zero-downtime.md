---
title: Migrate a Production Database with Zero Downtime
slug: build-database-migration-zero-downtime
description: >
  Migrate 500GB of PostgreSQL data from a legacy schema to a new schema
  while serving 2K requests/second — using dual-write, shadow reads,
  and gradual traffic shifting with zero downtime or data loss.
skills:
  - typescript
  - postgresql
  - redis
  - kafka-js
  - zod
  - vitest
category: DevOps & Infrastructure
tags:
  - database-migration
  - zero-downtime
  - dual-write
  - postgresql
  - data-migration
  - schema-evolution
---

# Migrate a Production Database with Zero Downtime

## The Problem

A 4-year-old SaaS app has a PostgreSQL database with a legacy schema designed for a single-tenant world. Now they're multi-tenant with 500 clients, and the schema is held together with hacks: tenant IDs jammed into columns not designed for them, denormalized blobs, and 47 views that paper over the mess. The database is 500GB, serves 2K req/sec, and any downtime costs $8K/hour. Previous migration attempts required a 4-hour maintenance window — the CEO said "never again."

## Step 1: Schema Comparison and Migration Plan

```typescript
// src/migration/schema-diff.ts
import { Pool } from 'pg';

const oldDb = new Pool({ connectionString: process.env.OLD_DATABASE_URL });
const newDb = new Pool({ connectionString: process.env.NEW_DATABASE_URL });

interface ColumnMapping {
  oldTable: string;
  oldColumn: string;
  newTable: string;
  newColumn: string;
  transform?: string; // SQL expression to transform data
}

export const columnMappings: ColumnMapping[] = [
  // Users table: split name into first/last, add tenant_id
  { oldTable: 'users', oldColumn: 'id', newTable: 'users', newColumn: 'id' },
  { oldTable: 'users', oldColumn: 'name', newTable: 'users', newColumn: 'first_name',
    transform: "split_part(name, ' ', 1)" },
  { oldTable: 'users', oldColumn: 'name', newTable: 'users', newColumn: 'last_name',
    transform: "CASE WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1) ELSE '' END" },
  { oldTable: 'users', oldColumn: 'company_id', newTable: 'users', newColumn: 'tenant_id' },
  { oldTable: 'users', oldColumn: 'email', newTable: 'users', newColumn: 'email' },
  { oldTable: 'users', oldColumn: 'created_at', newTable: 'users', newColumn: 'created_at' },

  // Orders: extract metadata JSON blob into proper columns
  { oldTable: 'orders', oldColumn: 'id', newTable: 'orders', newColumn: 'id' },
  { oldTable: 'orders', oldColumn: "metadata->>'shipping_method'", newTable: 'orders', newColumn: 'shipping_method' },
  { oldTable: 'orders', oldColumn: "(metadata->>'priority')::int", newTable: 'orders', newColumn: 'priority' },
  { oldTable: 'orders', oldColumn: 'total_amount', newTable: 'orders', newColumn: 'total_cents',
    transform: "(total_amount * 100)::bigint" }, // float dollars → integer cents
];

export async function validateMigration(batchSize: number = 1000): Promise<{
  table: string;
  totalRows: number;
  migratedRows: number;
  mismatches: number;
  sampleMismatches: any[];
}[]> {
  const results = [];
  const tables = [...new Set(columnMappings.map(m => m.oldTable))];

  for (const table of tables) {
    const { rows: [{ count: oldCount }] } = await oldDb.query(`SELECT COUNT(*) FROM ${table}`);
    const newTable = columnMappings.find(m => m.oldTable === table)!.newTable;
    const { rows: [{ count: newCount }] } = await newDb.query(`SELECT COUNT(*) FROM ${newTable}`);

    // Spot-check random rows
    const { rows: samples } = await oldDb.query(
      `SELECT id FROM ${table} ORDER BY RANDOM() LIMIT 100`
    );

    let mismatches = 0;
    const sampleMismatches: any[] = [];

    for (const sample of samples) {
      const mappings = columnMappings.filter(m => m.oldTable === table);
      const oldRow = await oldDb.query(`SELECT * FROM ${table} WHERE id = $1`, [sample.id]);
      const newRow = await newDb.query(`SELECT * FROM ${newTable} WHERE id = $1`, [sample.id]);

      if (!newRow.rows[0]) { mismatches++; continue; }

      for (const mapping of mappings) {
        const oldVal = mapping.transform
          ? (await oldDb.query(`SELECT ${mapping.transform} as val FROM ${table} WHERE id = $1`, [sample.id])).rows[0]?.val
          : oldRow.rows[0]?.[mapping.oldColumn];
        const newVal = newRow.rows[0]?.[mapping.newColumn];

        if (String(oldVal) !== String(newVal)) {
          mismatches++;
          sampleMismatches.push({ id: sample.id, column: mapping.newColumn, old: oldVal, new: newVal });
        }
      }
    }

    results.push({
      table, totalRows: parseInt(oldCount), migratedRows: parseInt(newCount),
      mismatches, sampleMismatches: sampleMismatches.slice(0, 5),
    });
  }

  return results;
}
```

## Step 2: Dual-Write Proxy

```typescript
// src/migration/dual-write.ts
// Writes to both old and new database during migration

import { Pool } from 'pg';
import { Redis } from 'ioredis';

const oldDb = new Pool({ connectionString: process.env.OLD_DATABASE_URL });
const newDb = new Pool({ connectionString: process.env.NEW_DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);

type WriteTarget = 'old_only' | 'dual_write' | 'new_primary' | 'new_only';

export async function getWriteTarget(): Promise<WriteTarget> {
  return (await redis.get('migration:write_target') as WriteTarget) ?? 'old_only';
}

export async function dualWrite(
  table: string,
  operation: 'insert' | 'update' | 'delete',
  oldQuery: { sql: string; params: any[] },
  newQuery: { sql: string; params: any[] }
): Promise<void> {
  const target = await getWriteTarget();

  switch (target) {
    case 'old_only':
      await oldDb.query(oldQuery.sql, oldQuery.params);
      break;

    case 'dual_write':
      // Write to old (primary) first, then new (async, best-effort)
      await oldDb.query(oldQuery.sql, oldQuery.params);
      newDb.query(newQuery.sql, newQuery.params).catch(err => {
        console.error(`Dual-write to new DB failed: ${err.message}`);
        // Queue for retry
        redis.lpush('migration:failed_writes', JSON.stringify({
          table, operation, query: newQuery, timestamp: Date.now(),
        }));
      });
      break;

    case 'new_primary':
      // Write to new (primary), replicate to old (async)
      await newDb.query(newQuery.sql, newQuery.params);
      oldDb.query(oldQuery.sql, oldQuery.params).catch(() => {});
      break;

    case 'new_only':
      await newDb.query(newQuery.sql, newQuery.params);
      break;
  }
}
```

## Step 3: Shadow Read Comparison

```typescript
// src/migration/shadow-read.ts
// Reads from both databases and compares results (1% of traffic)

import { Pool } from 'pg';

const oldDb = new Pool({ connectionString: process.env.OLD_DATABASE_URL });
const newDb = new Pool({ connectionString: process.env.NEW_DATABASE_URL });

export async function shadowRead<T>(
  oldQuery: { sql: string; params: any[] },
  newQuery: { sql: string; params: any[] },
  sampleRate: number = 0.01
): Promise<T> {
  // Always read from primary
  const primary = await oldDb.query(oldQuery.sql, oldQuery.params);

  // Shadow read from new DB (sampled)
  if (Math.random() < sampleRate) {
    const start = Date.now();
    try {
      const shadow = await newDb.query(newQuery.sql, newQuery.params);
      const latency = Date.now() - start;

      // Compare results
      const match = JSON.stringify(primary.rows) === JSON.stringify(shadow.rows);
      if (!match) {
        console.warn(`Shadow read mismatch: ${oldQuery.sql}`, {
          primaryCount: primary.rows.length,
          shadowCount: shadow.rows.length,
          latency,
        });
      }
    } catch (err) {
      console.error('Shadow read failed:', err);
    }
  }

  return primary.rows as T;
}
```

## Step 4: Traffic Shifting

```typescript
// src/migration/traffic-shift.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

// Gradual shift: 0% → 1% → 5% → 25% → 50% → 100%
export async function getReadSource(): Promise<'old' | 'new'> {
  const percent = parseInt(await redis.get('migration:read_percent_new') ?? '0');
  return Math.random() * 100 < percent ? 'new' : 'old';
}

export async function setReadPercent(percent: number): Promise<void> {
  await redis.set('migration:read_percent_new', String(percent));
}

// Migration phases
export async function advancePhase(): Promise<string> {
  const currentPhase = await redis.get('migration:phase') ?? 'planning';
  const phases = ['planning', 'backfill', 'dual_write', 'shadow_read', 'traffic_shift', 'new_primary', 'cleanup'];
  const idx = phases.indexOf(currentPhase);
  const next = phases[Math.min(idx + 1, phases.length - 1)];
  await redis.set('migration:phase', next);
  return next;
}
```

## Results

- **Zero downtime**: entire migration completed during business hours, no maintenance window
- **500GB migrated**: incremental backfill over 3 days at off-peak hours
- **Data accuracy**: 99.9997% match rate during shadow reads (3 edge cases found and fixed)
- **Traffic shift**: 0% → 1% → 5% → 25% → 50% → 100% over 5 days
- **Rollback available**: old database kept running for 2 weeks after full cutover
- **Float-to-integer money bug**: caught during shadow reads — $0.01 rounding errors in 340 orders
- **Total migration time**: 12 days (planning to cleanup)
- **Downtime**: 0 seconds
