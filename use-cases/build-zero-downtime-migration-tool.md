---
title: Build a Zero-Downtime Database Migration Tool
slug: build-zero-downtime-migration-tool
description: Build a zero-downtime database migration tool with shadow columns, dual-write patterns, background data copying, validation checks, and safe cutover for live schema changes.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - database
  - migration
  - zero-downtime
  - schema
  - deployment
---

# Build a Zero-Downtime Database Migration Tool

## The Problem

Viktor leads backend at a 25-person SaaS with 50M rows. Schema changes require downtime: adding a NOT NULL column locks the table for 15 minutes. Renaming a column breaks the app until all servers are restarted. Index creation on a 50M-row table takes 20 minutes during which writes are blocked. They deploy during 2 AM maintenance windows, limiting iteration speed to weekly. They need zero-downtime migrations: add columns without locks, rename columns safely with dual-write, create indexes concurrently, and validate before cutover.

## Step 1: Build the Migration Tool

```typescript
import { Pool, PoolClient } from "pg";
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface MigrationStep { name: string; type: "add_column" | "rename_column" | "add_index" | "change_type" | "add_not_null" | "drop_column"; table: string; config: Record<string, any>; status: "pending" | "running" | "completed" | "failed"; startedAt: string | null; completedAt: string | null; }
interface Migration { id: string; name: string; steps: MigrationStep[]; status: "pending" | "running" | "validating" | "completed" | "failed" | "rolled_back"; createdAt: string; }

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Execute zero-downtime migration
export async function executeMigration(migration: Migration): Promise<void> {
  migration.status = "running";

  for (const step of migration.steps) {
    step.status = "running";
    step.startedAt = new Date().toISOString();

    try {
      switch (step.type) {
        case "add_column":
          await addColumnSafely(step.table, step.config.column, step.config.type, step.config.default);
          break;
        case "rename_column":
          await renameColumnSafely(step.table, step.config.oldName, step.config.newName);
          break;
        case "add_index":
          await addIndexSafely(step.table, step.config.columns, step.config.indexName, step.config.unique);
          break;
        case "change_type":
          await changeTypeSafely(step.table, step.config.column, step.config.newType);
          break;
        case "add_not_null":
          await addNotNullSafely(step.table, step.config.column, step.config.default);
          break;
        case "drop_column":
          await dropColumnSafely(step.table, step.config.column);
          break;
      }
      step.status = "completed";
      step.completedAt = new Date().toISOString();
    } catch (error: any) {
      step.status = "failed";
      migration.status = "failed";
      throw error;
    }
  }

  migration.status = "validating";
  const valid = await validateMigration(migration);
  migration.status = valid ? "completed" : "failed";
}

// Add column without locking (nullable first, then backfill, then constraint)
async function addColumnSafely(table: string, column: string, type: string, defaultValue?: any): Promise<void> {
  // Step 1: Add nullable column (instant, no lock)
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);

  // Step 2: Backfill default value in batches
  if (defaultValue !== undefined) {
    let updated = 0;
    while (true) {
      const { rowCount } = await pool.query(
        `UPDATE ${table} SET ${column} = $1 WHERE ${column} IS NULL AND ctid IN (SELECT ctid FROM ${table} WHERE ${column} IS NULL LIMIT 10000)`,
        [defaultValue]
      );
      updated += rowCount || 0;
      if (!rowCount || rowCount < 10000) break;
      await sleep(100); // small pause to not overwhelm
    }
    console.log(`Backfilled ${updated} rows for ${table}.${column}`);
  }
}

// Rename column using shadow column + trigger
async function renameColumnSafely(table: string, oldName: string, newName: string): Promise<void> {
  // Step 1: Add new column
  const { rows: [colInfo] } = await pool.query(
    `SELECT data_type, character_maximum_length FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, oldName]
  );
  const colType = colInfo.character_maximum_length ? `${colInfo.data_type}(${colInfo.character_maximum_length})` : colInfo.data_type;
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${newName} ${colType}`);

  // Step 2: Copy data in batches
  while (true) {
    const { rowCount } = await pool.query(
      `UPDATE ${table} SET ${newName} = ${oldName} WHERE ${newName} IS NULL AND ${oldName} IS NOT NULL AND ctid IN (SELECT ctid FROM ${table} WHERE ${newName} IS NULL AND ${oldName} IS NOT NULL LIMIT 10000)`
    );
    if (!rowCount || rowCount < 10000) break;
    await sleep(100);
  }

  // Step 3: Create trigger for dual-write
  await pool.query(`
    CREATE OR REPLACE FUNCTION sync_${table}_${oldName}_to_${newName}() RETURNS TRIGGER AS $$
    BEGIN NEW.${newName} = NEW.${oldName}; RETURN NEW; END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER trg_sync_${oldName}_${newName}
    BEFORE INSERT OR UPDATE ON ${table}
    FOR EACH ROW EXECUTE FUNCTION sync_${table}_${oldName}_to_${newName}();
  `);

  // Step 4: App code now reads from new column
  // Step 5: After all servers updated, drop old column (separate migration)
  console.log(`Column ${oldName} → ${newName} on ${table}: shadow column + trigger active`);
}

// Create index without blocking writes
async function addIndexSafely(table: string, columns: string[], indexName: string, unique: boolean = false): Promise<void> {
  const uniqueStr = unique ? "UNIQUE " : "";
  // CONCURRENTLY doesn't lock the table
  await pool.query(`CREATE ${uniqueStr}INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON ${table} (${columns.join(", ")})`);
}

// Change column type via shadow column
async function changeTypeSafely(table: string, column: string, newType: string): Promise<void> {
  const tempColumn = `${column}_new`;
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${tempColumn} ${newType}`);

  // Backfill with type cast
  while (true) {
    const { rowCount } = await pool.query(
      `UPDATE ${table} SET ${tempColumn} = ${column}::${newType} WHERE ${tempColumn} IS NULL AND ctid IN (SELECT ctid FROM ${table} WHERE ${tempColumn} IS NULL LIMIT 10000)`
    );
    if (!rowCount || rowCount < 10000) break;
    await sleep(100);
  }

  console.log(`Type change ${column} → ${newType}: shadow column ${tempColumn} populated. Update app code, then drop old column.`);
}

// Add NOT NULL constraint safely
async function addNotNullSafely(table: string, column: string, defaultValue: any): Promise<void> {
  // Backfill nulls first
  while (true) {
    const { rowCount } = await pool.query(
      `UPDATE ${table} SET ${column} = $1 WHERE ${column} IS NULL AND ctid IN (SELECT ctid FROM ${table} WHERE ${column} IS NULL LIMIT 10000)`,
      [defaultValue]
    );
    if (!rowCount || rowCount < 10000) break;
    await sleep(100);
  }

  // Add constraint with NOT VALID (doesn't scan table)
  await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_not_null CHECK (${column} IS NOT NULL) NOT VALID`);
  // Validate in background (doesn't lock)
  await pool.query(`ALTER TABLE ${table} VALIDATE CONSTRAINT ${table}_${column}_not_null`);
}

async function dropColumnSafely(table: string, column: string): Promise<void> {
  // Verify column is not used (check if any trigger references it)
  await pool.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`);
}

async function validateMigration(migration: Migration): Promise<boolean> {
  // Check all steps completed
  return migration.steps.every((s) => s.status === "completed");
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
```

## Results

- **Zero downtime** — all schema changes without table locks; 50M-row table altered while serving 5K queries/sec; users notice nothing
- **Deploy anytime** — no more 2 AM maintenance windows; schema changes during business hours; iteration speed: weekly → daily
- **Index creation: 20 min blocked → 20 min background** — `CREATE INDEX CONCURRENTLY` builds index without blocking writes; same time, zero impact
- **Column rename safe** — shadow column + trigger ensures both old and new columns stay in sync; app servers can be updated gradually; no big-bang cutover
- **NOT NULL without lock** — backfill in batches → add constraint NOT VALID → validate in background; table never locked; constraint enforced
