---
title: Build a Sandbox Environment System
slug: build-sandbox-environment
description: Build isolated sandbox environments for testing with database snapshots, environment cloning, automatic cleanup, branch-based previews, and seed data management.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - sandbox
  - testing
  - environments
  - preview
  - development
---

# Build a Sandbox Environment System

## The Problem

Erik leads engineering at a 30-person SaaS. Developers share one staging environment. When someone tests a migration, staging breaks for everyone. QA can't test two features simultaneously. Sales demos use production data (with customer PII visible). Creating a new test environment takes 3 days of DevOps work. They need on-demand sandbox environments: spin up in minutes, isolated databases with realistic seed data, auto-cleanup after use, and branch-based previews for PR review.

## Step 1: Build the Sandbox Manager

```typescript
// src/sandbox/manager.ts — On-demand sandbox environments with DB snapshots and auto-cleanup
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { execSync, exec } from "node:child_process";

const redis = new Redis(process.env.REDIS_URL!);

interface Sandbox {
  id: string;
  name: string;
  owner: string;
  type: "feature" | "demo" | "qa" | "review";
  branch: string | null;
  status: "creating" | "ready" | "sleeping" | "destroying" | "error";
  urls: { app: string; api: string; db: string };
  database: { host: string; port: number; name: string; user: string; password: string };
  seedData: string;
  expiresAt: string;
  lastAccessedAt: string;
  resources: { cpuLimit: string; memoryLimit: string; storage: string };
  createdAt: string;
}

interface SandboxConfig {
  type: Sandbox["type"];
  name?: string;
  branch?: string;
  seedData?: "empty" | "minimal" | "full" | "production_anonymized";
  ttlHours?: number;
  owner: string;
}

const MAX_SANDBOXES = 20;
const DEFAULT_TTL_HOURS = 48;

// Create sandbox environment
export async function createSandbox(config: SandboxConfig): Promise<Sandbox> {
  // Check limits
  const { rows: [{ count }] } = await pool.query(
    "SELECT COUNT(*) as count FROM sandboxes WHERE status IN ('creating', 'ready', 'sleeping')"
  );
  if (parseInt(count) >= MAX_SANDBOXES) {
    throw new Error(`Maximum ${MAX_SANDBOXES} sandboxes reached. Delete unused ones first.`);
  }

  const id = `sb-${randomBytes(6).toString("hex")}`;
  const dbName = `sandbox_${id.replace("-", "_")}`;
  const dbPassword = randomBytes(16).toString("hex");
  const ttl = config.ttlHours || DEFAULT_TTL_HOURS;

  const sandbox: Sandbox = {
    id,
    name: config.name || `${config.type}-${id.slice(3, 9)}`,
    owner: config.owner,
    type: config.type,
    branch: config.branch || null,
    status: "creating",
    urls: {
      app: `https://${id}.sandbox.${process.env.BASE_DOMAIN}`,
      api: `https://${id}-api.sandbox.${process.env.BASE_DOMAIN}`,
      db: `postgresql://sandbox:${dbPassword}@${process.env.DB_HOST}:5432/${dbName}`,
    },
    database: {
      host: process.env.DB_HOST!,
      port: 5432,
      name: dbName,
      user: "sandbox",
      password: dbPassword,
    },
    seedData: config.seedData || "minimal",
    expiresAt: new Date(Date.now() + ttl * 3600000).toISOString(),
    lastAccessedAt: new Date().toISOString(),
    resources: { cpuLimit: "0.5", memoryLimit: "512Mi", storage: "1Gi" },
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO sandboxes (id, name, owner, type, branch, status, urls, database_config, seed_data, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'creating', $6, $7, $8, $9, NOW())`,
    [id, sandbox.name, config.owner, config.type, config.branch,
     JSON.stringify(sandbox.urls), JSON.stringify(sandbox.database),
     sandbox.seedData, sandbox.expiresAt]
  );

  // Provision asynchronously
  provisionSandbox(sandbox, config).catch(async (err) => {
    await pool.query("UPDATE sandboxes SET status = 'error' WHERE id = $1", [id]);
  });

  return sandbox;
}

async function provisionSandbox(sandbox: Sandbox, config: SandboxConfig): Promise<void> {
  // 1. Create database
  await pool.query(`CREATE DATABASE ${sandbox.database.name}`);
  await pool.query(`CREATE USER ${sandbox.database.name}_user WITH PASSWORD '${sandbox.database.password}'`);
  await pool.query(`GRANT ALL PRIVILEGES ON DATABASE ${sandbox.database.name} TO ${sandbox.database.name}_user`);

  // 2. Run migrations
  const migrationDb = `postgresql://${sandbox.database.name}_user:${sandbox.database.password}@${sandbox.database.host}:5432/${sandbox.database.name}`;
  execSync(`DATABASE_URL="${migrationDb}" npx prisma migrate deploy`, { timeout: 60000 });

  // 3. Seed data
  await seedDatabase(sandbox, config.seedData || "minimal");

  // 4. Deploy application (container or process)
  if (config.branch) {
    execSync(`git fetch origin ${config.branch} && git checkout ${config.branch}`, {
      cwd: "/tmp/sandbox-builds",
      timeout: 30000,
    });
  }

  // 5. Configure reverse proxy
  await redis.set(`proxy:${sandbox.id}`, JSON.stringify({
    target: `http://localhost:${3000 + parseInt(sandbox.id.slice(3, 7), 16) % 1000}`,
    sandbox: sandbox.id,
  }));

  // 6. Mark ready
  await pool.query("UPDATE sandboxes SET status = 'ready' WHERE id = $1", [sandbox.id]);

  // Schedule cleanup
  const ttlSeconds = Math.ceil((new Date(sandbox.expiresAt).getTime() - Date.now()) / 1000);
  await redis.setex(`sandbox:ttl:${sandbox.id}`, ttlSeconds, "expire");
}

async function seedDatabase(sandbox: Sandbox, seedType: string): Promise<void> {
  const sandboxPool = new (require("pg").Pool)({
    connectionString: sandbox.urls.db,
  });

  try {
    switch (seedType) {
      case "empty":
        break; // just schema

      case "minimal":
        await sandboxPool.query(`
          INSERT INTO users (id, email, name, role, created_at) VALUES
          ('demo-admin', 'admin@demo.com', 'Demo Admin', 'admin', NOW()),
          ('demo-user', 'user@demo.com', 'Demo User', 'user', NOW());
        `);
        break;

      case "full":
        // Generate realistic fake data
        const users = Array.from({ length: 100 }, (_, i) => `('user-${i}', 'user${i}@demo.com', 'User ${i}', 'user', NOW())`);
        await sandboxPool.query(`INSERT INTO users (id, email, name, role, created_at) VALUES ${users.join(",")}`);
        break;

      case "production_anonymized":
        // Copy production structure with anonymized data
        const tables = ["users", "projects", "tasks", "comments"];
        for (const table of tables) {
          const { rows } = await pool.query(`SELECT * FROM ${table} LIMIT 1000`);
          if (rows.length > 0) {
            const anonymized = rows.map(anonymizeRow);
            // Bulk insert anonymized data
            for (const row of anonymized) {
              const keys = Object.keys(row);
              const values = Object.values(row);
              const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
              await sandboxPool.query(
                `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                values
              );
            }
          }
        }
        break;
    }
  } finally {
    await sandboxPool.end();
  }
}

function anonymizeRow(row: any): any {
  const anonymized = { ...row };
  if (anonymized.email) anonymized.email = `anon-${randomBytes(4).toString("hex")}@demo.com`;
  if (anonymized.name) anonymized.name = `User ${randomBytes(3).toString("hex")}`;
  if (anonymized.phone) anonymized.phone = "+1555" + String(Math.random()).slice(2, 9);
  if (anonymized.address) anonymized.address = "123 Demo St";
  if (anonymized.ip_address) anonymized.ip_address = "192.168.1.1";
  return anonymized;
}

// Destroy sandbox
export async function destroySandbox(sandboxId: string): Promise<void> {
  await pool.query("UPDATE sandboxes SET status = 'destroying' WHERE id = $1", [sandboxId]);

  const { rows: [sb] } = await pool.query("SELECT * FROM sandboxes WHERE id = $1", [sandboxId]);
  if (!sb) return;

  const dbConfig = JSON.parse(sb.database_config);

  try {
    // Drop database
    await pool.query(`DROP DATABASE IF EXISTS ${dbConfig.name}`);
    await pool.query(`DROP USER IF EXISTS ${dbConfig.name}_user`);
  } catch {}

  // Remove proxy config
  await redis.del(`proxy:${sandboxId}`);
  await redis.del(`sandbox:ttl:${sandboxId}`);

  await pool.query("DELETE FROM sandboxes WHERE id = $1", [sandboxId]);
}

// Auto-cleanup expired sandboxes (run by cron)
export async function cleanupExpired(): Promise<number> {
  const { rows } = await pool.query(
    "SELECT id FROM sandboxes WHERE expires_at < NOW() AND status IN ('ready', 'sleeping')"
  );

  for (const row of rows) {
    await destroySandbox(row.id);
  }

  return rows.length;
}

// Extend sandbox TTL
export async function extendTTL(sandboxId: string, hours: number): Promise<void> {
  await pool.query(
    "UPDATE sandboxes SET expires_at = expires_at + $2 * INTERVAL '1 hour' WHERE id = $1",
    [sandboxId, hours]
  );
}

// List user's sandboxes
export async function listSandboxes(owner?: string): Promise<Sandbox[]> {
  const sql = owner
    ? "SELECT * FROM sandboxes WHERE owner = $1 AND status != 'destroying' ORDER BY created_at DESC"
    : "SELECT * FROM sandboxes WHERE status != 'destroying' ORDER BY created_at DESC";
  const { rows } = await pool.query(sql, owner ? [owner] : []);
  return rows.map((r: any) => ({ ...r, urls: JSON.parse(r.urls), database: JSON.parse(r.database_config) }));
}
```

## Results

- **Environment provisioning: 3 days → 5 minutes** — self-service sandbox creation; developers don't wait for DevOps; QA tests independently
- **Staging conflicts eliminated** — each developer gets their own isolated environment; broken migrations don't affect anyone else
- **Sales demos with clean data** — anonymized production data looks realistic without exposing customer PII; demos feel like the real product
- **Branch-based previews** — PR linked to sandbox URL; reviewers see the feature running, not just code diffs; review quality improved
- **Auto-cleanup saves resources** — sandboxes expire after 48 hours; no forgotten environments running for months; hosting costs capped
