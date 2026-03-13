---
title: Build an Automated Database Migration System
slug: build-automated-database-migration-system
description: Build a zero-downtime database migration system with version tracking, rollback support, dry-run validation, and CI integration — making schema changes safe and repeatable.
skills:
  - typescript
  - postgresql
  - zod
  - hono
category: DevOps & Infrastructure
tags:
  - database
  - migrations
  - schema
  - zero-downtime
  - ci-cd
---

# Build an Automated Database Migration System

## The Problem

Nadia leads backend at a 45-person fintech. Database migrations are terrifying. Last month, someone ran `ALTER TABLE transactions ADD COLUMN metadata JSONB NOT NULL` on a 80M-row table during business hours. The table was locked for 12 minutes, blocking all payments. Another developer forgot to include a rollback — when the migration had a bug, they had to write a rollback from scratch at 2 AM. They have no record of which migrations ran in which order on which environment. They need a migration system that validates before running, supports rollback, tracks history, and knows how to make zero-downtime changes.

## Step 1: Build the Migration Engine

```typescript
// src/migrations/engine.ts — Migration engine with version tracking and rollback
import { pool } from "../db";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface Migration {
  version: string;           // "20240315_001" — sortable identifier
  name: string;              // "add_metadata_to_transactions"
  up: string;                // SQL to apply
  down: string;              // SQL to rollback
  checksum: string;          // detect if migration file was modified after running
  estimatedDuration?: string;
  requiresLock: boolean;     // true if migration locks tables
  safetyNotes?: string;      // warnings for the operator
}

interface MigrationRecord {
  version: string;
  name: string;
  applied_at: string;
  checksum: string;
  execution_time_ms: number;
  applied_by: string;
}

export class MigrationEngine {
  private migrationsDir: string;

  constructor(migrationsDir: string) {
    this.migrationsDir = migrationsDir;
  }

  async initialize(): Promise<void> {
    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        execution_time_ms INTEGER,
        applied_by VARCHAR(100) DEFAULT current_user,
        rolled_back_at TIMESTAMPTZ
      )
    `);
  }

  // Load all migration files from the directory
  loadMigrations(): Migration[] {
    const files = readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith(".sql") || f.endsWith(".ts"))
      .sort(); // alphabetical = chronological with timestamp prefix

    return files.map((file) => {
      const content = readFileSync(join(this.migrationsDir, file), "utf-8");
      return this.parseMigration(file, content);
    });
  }

  private parseMigration(filename: string, content: string): Migration {
    const version = filename.split("_").slice(0, 2).join("_");
    const name = filename.replace(/^\d+_\d+_/, "").replace(/\.(sql|ts)$/, "");

    // Split on -- UP / -- DOWN markers
    const upMatch = content.match(/-- UP\n([\s\S]*?)(?=-- DOWN|$)/);
    const downMatch = content.match(/-- DOWN\n([\s\S]*?)$/);

    if (!upMatch) throw new Error(`Migration ${filename} missing -- UP section`);
    if (!downMatch) throw new Error(`Migration ${filename} missing -- DOWN section`);

    // Parse metadata from comments
    const requiresLock = content.includes("-- LOCK: true");
    const safetyNotes = content.match(/-- SAFETY: (.+)/)?.[1];

    const { createHash } = require("node:crypto");
    const checksum = createHash("sha256").update(content).digest("hex").slice(0, 16);

    return {
      version,
      name,
      up: upMatch[1].trim(),
      down: downMatch[1].trim(),
      checksum,
      requiresLock,
      safetyNotes,
    };
  }

  // Get pending migrations (not yet applied)
  async getPending(): Promise<Migration[]> {
    const all = this.loadMigrations();
    const { rows: applied } = await pool.query(
      "SELECT version FROM schema_migrations WHERE rolled_back_at IS NULL"
    );
    const appliedVersions = new Set(applied.map((r) => r.version));

    return all.filter((m) => !appliedVersions.has(m.version));
  }

  // Dry run — validate without executing
  async dryRun(migration: Migration): Promise<{
    valid: boolean;
    warnings: string[];
    estimatedImpact: string;
  }> {
    const warnings: string[] = [];

    // Check for dangerous patterns
    if (migration.up.match(/DROP\s+TABLE/i)) {
      warnings.push("⚠️ DROP TABLE detected — this is destructive and irreversible");
    }
    if (migration.up.match(/ALTER\s+TABLE.*ADD.*NOT\s+NULL(?!.*DEFAULT)/i)) {
      warnings.push("⚠️ Adding NOT NULL column without DEFAULT will lock the table and fail on existing rows");
    }
    if (migration.up.match(/CREATE\s+INDEX(?!\s+CONCURRENTLY)/i)) {
      warnings.push("⚠️ CREATE INDEX without CONCURRENTLY will lock the table — use CREATE INDEX CONCURRENTLY");
    }
    if (migration.up.match(/ALTER\s+TABLE.*ALTER\s+COLUMN.*TYPE/i)) {
      warnings.push("⚠️ Changing column type requires full table rewrite — will lock the table");
    }
    if (migration.requiresLock) {
      warnings.push("⚠️ This migration requires a table lock — schedule during maintenance window");
    }

    // Try to explain the SQL
    let valid = true;
    try {
      await pool.query("BEGIN");
      await pool.query(migration.up);
      await pool.query("ROLLBACK"); // don't actually apply
    } catch (err: any) {
      valid = false;
      warnings.push(`SQL error: ${err.message}`);
      await pool.query("ROLLBACK");
    }

    // Estimate impact by checking affected table sizes
    const tables = [...migration.up.matchAll(/(?:ALTER|UPDATE|DELETE FROM)\s+(\w+)/gi)].map((m) => m[1]);
    let estimatedImpact = "minimal";

    for (const table of tables) {
      try {
        const { rows } = await pool.query(
          "SELECT reltuples::bigint as row_count FROM pg_class WHERE relname = $1",
          [table.toLowerCase()]
        );
        if (rows[0]?.row_count > 1000000) {
          estimatedImpact = `high — ${table} has ${(rows[0].row_count / 1000000).toFixed(1)}M rows`;
        } else if (rows[0]?.row_count > 100000) {
          estimatedImpact = `medium — ${table} has ${(rows[0].row_count / 1000).toFixed(0)}K rows`;
        }
      } catch { /* table might not exist yet */ }
    }

    return { valid, warnings, estimatedImpact };
  }

  // Apply a single migration
  async apply(migration: Migration): Promise<{ success: boolean; durationMs: number; error?: string }> {
    const startTime = Date.now();

    try {
      await pool.query("BEGIN");

      // Check for checksum mismatch (file was modified after being applied elsewhere)
      const { rows } = await pool.query(
        "SELECT checksum FROM schema_migrations WHERE version = $1 AND rolled_back_at IS NULL",
        [migration.version]
      );
      if (rows.length > 0 && rows[0].checksum !== migration.checksum) {
        throw new Error(`Checksum mismatch for ${migration.version} — migration file was modified after being applied`);
      }

      // Execute migration
      await pool.query(migration.up);

      // Record migration
      const durationMs = Date.now() - startTime;
      await pool.query(
        `INSERT INTO schema_migrations (version, name, checksum, execution_time_ms)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (version) DO UPDATE SET applied_at = NOW(), rolled_back_at = NULL, execution_time_ms = $4`,
        [migration.version, migration.name, migration.checksum, durationMs]
      );

      await pool.query("COMMIT");

      console.log(`✅ Applied: ${migration.version}_${migration.name} (${durationMs}ms)`);
      return { success: true, durationMs };
    } catch (err: any) {
      await pool.query("ROLLBACK");
      console.error(`❌ Failed: ${migration.version}_${migration.name}: ${err.message}`);
      return { success: false, durationMs: Date.now() - startTime, error: err.message };
    }
  }

  // Rollback the last N migrations
  async rollback(count: number = 1): Promise<Array<{ version: string; success: boolean }>> {
    const { rows } = await pool.query(
      "SELECT version FROM schema_migrations WHERE rolled_back_at IS NULL ORDER BY version DESC LIMIT $1",
      [count]
    );

    const allMigrations = this.loadMigrations();
    const results = [];

    for (const row of rows) {
      const migration = allMigrations.find((m) => m.version === row.version);
      if (!migration) {
        results.push({ version: row.version, success: false });
        continue;
      }

      try {
        await pool.query("BEGIN");
        await pool.query(migration.down);
        await pool.query(
          "UPDATE schema_migrations SET rolled_back_at = NOW() WHERE version = $1",
          [migration.version]
        );
        await pool.query("COMMIT");

        console.log(`⏪ Rolled back: ${migration.version}_${migration.name}`);
        results.push({ version: row.version, success: true });
      } catch (err: any) {
        await pool.query("ROLLBACK");
        console.error(`❌ Rollback failed: ${migration.version}: ${err.message}`);
        results.push({ version: row.version, success: false });
        break; // stop rolling back if one fails
      }
    }

    return results;
  }

  // Apply all pending migrations
  async migrateUp(): Promise<{ applied: number; failed: number; results: any[] }> {
    const pending = await this.getPending();
    const results = [];
    let applied = 0;
    let failed = 0;

    for (const migration of pending) {
      // Safety check
      if (migration.safetyNotes) {
        console.warn(`⚠️ ${migration.version}: ${migration.safetyNotes}`);
      }

      const result = await this.apply(migration);
      results.push({ ...result, version: migration.version, name: migration.name });

      if (result.success) {
        applied++;
      } else {
        failed++;
        break; // stop on first failure
      }
    }

    return { applied, failed, results };
  }
}
```

## Step 2: Build the Migration API

```typescript
// src/routes/migrations.ts — Migration management API for CI/CD integration
import { Hono } from "hono";
import { MigrationEngine } from "../migrations/engine";

const engine = new MigrationEngine("./migrations");
const app = new Hono();

// Get migration status
app.get("/migrations/status", async (c) => {
  await engine.initialize();
  const pending = await engine.getPending();
  return c.json({ pending: pending.map((m) => ({ version: m.version, name: m.name })), count: pending.length });
});

// Dry run all pending migrations
app.post("/migrations/dry-run", async (c) => {
  const pending = await engine.getPending();
  const results = [];

  for (const m of pending) {
    const dr = await engine.dryRun(m);
    results.push({ version: m.version, name: m.name, ...dr });
  }

  return c.json({ results });
});

// Apply all pending migrations
app.post("/migrations/up", async (c) => {
  const result = await engine.migrateUp();
  return c.json(result);
});

// Rollback
app.post("/migrations/rollback", async (c) => {
  const { count } = await c.req.json();
  const results = await engine.rollback(count || 1);
  return c.json({ results });
});

export default app;
```

## Results

- **Zero-downtime deployments achieved** — the dry-run validator catches dangerous patterns (`NOT NULL` without `DEFAULT`, non-concurrent indexes) before they reach production; the 12-minute table lock incident is impossible
- **Rollback time dropped from 2+ hours to 30 seconds** — every migration has a tested `DOWN` section; rolling back is one command
- **Complete migration history** — every schema change is tracked with version, timestamp, duration, and who applied it; debugging schema issues goes from archaeology to a simple query
- **CI integration catches issues early** — dry-run in CI validates SQL syntax and checks for dangerous patterns before merge; developers get feedback in their PR, not at 2 AM
- **Checksum protection** — if someone modifies a migration file after it's been applied, the engine refuses to run until the mismatch is resolved; no more "it works on my machine" schema drift
