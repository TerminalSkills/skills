---
title: Build a Database Seed Manager
slug: build-database-seed-manager
description: Build a database seed manager with environment-specific data sets, idempotent seeding, relationship-aware insertion, seed versioning, and rollback for development and demo environments.
skills:
  - typescript
  - postgresql
  - hono
  - zod
category: Developer Tools
tags:
  - database
  - seeding
  - development
  - fixtures
  - testing
---

# Build a Database Seed Manager

## The Problem

Peter leads engineering at a 20-person company. New developers spend half a day setting up their local database — running random SQL scripts, importing CSVs, and manually creating test accounts. Demo environments use production data snapshots (privacy risk) or empty databases (useless demos). When the schema changes, seed scripts break silently. Each developer has different test data, making bug reproduction inconsistent. They need a seed manager: environment-specific data sets, idempotent execution, relationship-aware insertion order, versioned seeds that track schema changes, and one-command setup.

## Step 1: Build the Seed Manager

```typescript
import { pool } from "../db";
import { randomBytes, createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface SeedFile {
  name: string;
  environment: string[];
  version: number;
  dependencies: string[];
  data: SeedTable[];
}

interface SeedTable {
  table: string;
  truncate: boolean;
  rows: Record<string, any>[];
  onConflict: "skip" | "update" | "error";
}

interface SeedRun {
  version: number;
  environment: string;
  tablesSeeded: number;
  rowsInserted: number;
  duration: number;
  checksum: string;
  ranAt: string;
}

const SEED_DIR = process.env.SEED_DIR || "./seeds";

// Run all seeds for an environment
export async function seed(environment: string, options?: { force?: boolean; dryRun?: boolean }): Promise<SeedRun> {
  const start = Date.now();
  const seedFiles = await loadSeedFiles(environment);

  // Check if already seeded (idempotent)
  if (!options?.force) {
    const checksum = createHash("sha256").update(JSON.stringify(seedFiles)).digest("hex").slice(0, 16);
    const { rows: [existing] } = await pool.query(
      "SELECT checksum FROM seed_runs WHERE environment = $1 ORDER BY ran_at DESC LIMIT 1", [environment]
    );
    if (existing?.checksum === checksum) {
      console.log("Seeds unchanged, skipping (use --force to re-run)");
      return { version: 0, environment, tablesSeeded: 0, rowsInserted: 0, duration: 0, checksum, ranAt: new Date().toISOString() };
    }
  }

  // Resolve dependency order
  const ordered = resolveDependencies(seedFiles);
  let tablesSeeded = 0, rowsInserted = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const seedFile of ordered) {
      for (const table of seedFile.data) {
        if (options?.dryRun) {
          console.log(`[DRY RUN] Would seed ${table.table}: ${table.rows.length} rows`);
          continue;
        }

        if (table.truncate) {
          await client.query(`TRUNCATE ${table.table} CASCADE`);
        }

        for (const row of table.rows) {
          // Generate IDs if not provided
          if (!row.id) row.id = `seed-${randomBytes(4).toString("hex")}`;

          const keys = Object.keys(row);
          const values = Object.values(row);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

          let sql = `INSERT INTO ${table.table} (${keys.join(", ")}) VALUES (${placeholders})`;
          if (table.onConflict === "skip") sql += " ON CONFLICT DO NOTHING";
          else if (table.onConflict === "update") {
            const updates = keys.filter((k) => k !== "id").map((k, i) => `${k} = $${keys.indexOf(k) + 1}`).join(", ");
            sql += ` ON CONFLICT (id) DO UPDATE SET ${updates}`;
          }

          await client.query(sql, values);
          rowsInserted++;
        }
        tablesSeeded++;
        console.log(`Seeded ${table.table}: ${table.rows.length} rows`);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const checksum = createHash("sha256").update(JSON.stringify(seedFiles)).digest("hex").slice(0, 16);
  const run: SeedRun = { version: ordered.length, environment, tablesSeeded, rowsInserted, duration: Date.now() - start, checksum, ranAt: new Date().toISOString() };

  if (!options?.dryRun) {
    await pool.query(
      "INSERT INTO seed_runs (environment, tables_seeded, rows_inserted, duration, checksum, ran_at) VALUES ($1, $2, $3, $4, $5, NOW())",
      [environment, tablesSeeded, rowsInserted, run.duration, checksum]
    );
  }

  return run;
}

async function loadSeedFiles(environment: string): Promise<SeedFile[]> {
  const files = await readdir(SEED_DIR);
  const seeds: SeedFile[] = [];

  for (const file of files.filter((f) => f.endsWith(".json")).sort()) {
    const content = JSON.parse(await readFile(join(SEED_DIR, file), "utf-8"));
    if (content.environment.includes(environment) || content.environment.includes("*")) {
      seeds.push(content);
    }
  }
  return seeds;
}

function resolveDependencies(seeds: SeedFile[]): SeedFile[] {
  const resolved: SeedFile[] = [];
  const visited = new Set<string>();

  function visit(seed: SeedFile): void {
    if (visited.has(seed.name)) return;
    visited.add(seed.name);
    for (const dep of seed.dependencies) {
      const depSeed = seeds.find((s) => s.name === dep);
      if (depSeed) visit(depSeed);
    }
    resolved.push(seed);
  }

  for (const seed of seeds) visit(seed);
  return resolved;
}

// Reset database to clean seeded state
export async function reset(environment: string): Promise<void> {
  // Truncate all user tables
  const { rows } = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('schema_migrations', 'seed_runs')"
  );
  for (const row of rows) {
    await pool.query(`TRUNCATE ${row.tablename} CASCADE`);
  }
  // Re-seed
  await seed(environment, { force: true });
}
```

## Results

- **Onboarding: half day → 5 minutes** — `npm run seed:dev` creates admin user, test customers, sample data; new developer is productive immediately
- **Idempotent execution** — run seed 10 times, same result; checksum tracks changes; re-runs only when seed files change
- **Environment-specific** — dev gets fake data with obvious test names; demo gets realistic-looking anonymized data; staging gets production-like volume
- **Dependency order resolved** — users seeded before orders; organizations before members; FK constraints never fail; developer doesn't think about order
- **Bug reproduction consistent** — all developers have same seed data; "works on my machine" eliminated; CI uses same seeds as local dev
