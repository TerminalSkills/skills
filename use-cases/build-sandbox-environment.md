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
category: devops
tags:
  - sandbox
  - testing
  - environments
  - preview
  - development
---

# Build a Sandbox Environment System

## The Problem

Erik leads engineering at a 30-person SaaS. Developers share one staging environment. When someone tests a migration, staging breaks for everyone. QA can't test two features at once. Sales demos run on production data, with customer PII on screen. A new test environment takes days of DevOps work. The team wants on-demand sandboxes: isolated databases with realistic seed data, automatic cleanup, and a running copy of a pull request branch for review.

## The Solution

A small TypeScript service that gives every sandbox its own PostgreSQL database and role, cloned from a seed **template database** (`CREATE DATABASE ... TEMPLATE`, a server-side copy that is much faster than replaying inserts). Redis holds the routing table for your reverse proxy, Hono exposes the API, and Zod validates every request. A timer destroys expired sandboxes.

## Step-by-Step Walkthrough

### Step 1: Set up the project and the seed templates

Tested with Node.js 24, PostgreSQL 16 and Redis 7.

```bash
npm init -y && npm pkg set type=module
npm install hono @hono/node-server zod pg ioredis
npm install -D typescript tsx @types/node @types/pg
```

Run the service with a role that has `CREATEDB` and `CREATEROLE`, never a superuser you also use for the application. Bind PostgreSQL and Redis to `127.0.0.1` or a private network.

```bash
export ADMIN_DATABASE_URL="postgresql://sandbox_admin:$SANDBOX_ADMIN_PASSWORD@127.0.0.1:5432/postgres"
export REDIS_URL="redis://127.0.0.1:6379"
export REPO_DIR=/srv/app-repo SANDBOX_DIR=/srv/sandboxes   # only needed for branch previews
```

Create one template database per seed type, and load your schema and anonymised data into it. A template can only be copied while nobody is connected to it, so never connect the application to a `seed_*` database.

```sql
CREATE DATABASE seed_empty;     -- schema only: run your migrations against it
CREATE DATABASE seed_minimal;   -- schema + two demo users
CREATE DATABASE seed_full;      -- schema + generated data for demos and load tests
```

Create the registry table in the admin database (`postgres`):

```sql
CREATE TABLE IF NOT EXISTS sandboxes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner       TEXT NOT NULL,
  type        TEXT NOT NULL,
  branch      TEXT,
  status      TEXT NOT NULL DEFAULT 'creating',
  db_name     TEXT NOT NULL,
  db_user     TEXT NOT NULL,
  seed        TEXT NOT NULL,
  port        INT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

For `production_anonymized` data, do not copy rows from production at request time. Build `seed_full` once, from a dump that you anonymise before it reaches the template (replace emails, names, phone numbers, addresses and IPs, and check free-text columns too), and refresh it on a schedule.

### Step 2: The sandbox manager

```typescript
// src/manager.ts — on-demand sandboxes: one database per sandbox, cloned from a seed template
import { Pool } from "pg";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
export const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL }); // role with CREATEDB + CREATEROLE
export const redis = new Redis(process.env.REDIS_URL!);

export type SeedName = "empty" | "minimal" | "full";
export interface SandboxInput {
  type: "feature" | "demo" | "qa" | "review";
  owner: string;
  name?: string;
  branch?: string;
  seed?: SeedName;
  ttlHours?: number;
}

const MAX_SANDBOXES = 20;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,99}$/;

export async function createSandbox(input: SandboxInput) {
  if (input.branch && !BRANCH_RE.test(input.branch)) throw new Error("invalid branch name");

  // Advisory lock so two concurrent requests cannot both pass the limit check
  const client = await admin.connect();
  let id: string;
  try {
    await client.query("SELECT pg_advisory_lock(42)");
    const { rows } = await client.query("SELECT count(*)::int AS n FROM sandboxes WHERE status <> 'destroying'");
    if (rows[0].n >= MAX_SANDBOXES) throw new Error(`limit of ${MAX_SANDBOXES} sandboxes reached`);
    id = `sb_${randomBytes(6).toString("hex")}`; // hex only, so safe as an SQL identifier
    const port = 4000 + Number(await redis.incr("sandbox:port-seq")) % 1000;
    await client.query(
      `INSERT INTO sandboxes (id, name, owner, type, branch, db_name, db_user, seed, port, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + make_interval(hours => $10))`,
      [id, input.name ?? `${input.type}-${id.slice(3, 9)}`, input.owner, input.type, input.branch ?? null,
       `db_${id}`, `u_${id}`, input.seed ?? "minimal", port, input.ttlHours ?? 48],
    );
  } finally {
    await client.query("SELECT pg_advisory_unlock(42)").catch(() => {});
    client.release();
  }
  provision(id).catch(async (err) => {
    console.error(`sandbox ${id} failed`, err);
    await admin.query("UPDATE sandboxes SET status = 'error' WHERE id = $1", [id]);
  });
  return getSandbox(id);
}

const withDb = (conn: string, db: string) => { const u = new URL(conn); u.pathname = `/${db}`; return u.toString(); };

async function provision(id: string) {
  const { rows: [sb] } = await admin.query("SELECT * FROM sandboxes WHERE id = $1", [id]);
  const password = randomBytes(16).toString("hex");

  // Snapshot = template database. CREATE DATABASE ... TEMPLATE copies it on the server, far faster than
  // replaying inserts. The template must have no open connections. For a multi-GB seed on PostgreSQL 15+,
  // append STRATEGY = FILE_COPY (default is WAL_LOG, block by block); it forces a checkpoint before and after.
  await admin.query(`CREATE ROLE ${sb.db_user} LOGIN PASSWORD '${password}'`);
  await admin.query(`CREATE DATABASE ${sb.db_name} OWNER ${sb.db_user} TEMPLATE seed_${sb.seed}`);

  // Objects copied from the template belong to the admin role, so hand them to the sandbox role
  const dbAdmin = new Pool({ connectionString: withDb(process.env.ADMIN_DATABASE_URL!, sb.db_name) });
  try {
    await dbAdmin.query(`GRANT ALL ON SCHEMA public TO ${sb.db_user}`);
    await dbAdmin.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${sb.db_user}`);
    await dbAdmin.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${sb.db_user}`);
  } finally { await dbAdmin.end(); }

  const url = new URL(process.env.ADMIN_DATABASE_URL!);
  url.username = sb.db_user; url.password = password; url.pathname = `/${sb.db_name}`;
  await redis.set(`sandbox:${id}:dburl`, url.toString());

  if (sb.branch) await startBranchPreview(sb, url.toString());
  await redis.hset("sandbox:routes", id, `http://127.0.0.1:${sb.port}`); // read by your reverse proxy
  await admin.query("UPDATE sandboxes SET status = 'ready' WHERE id = $1", [id]);
}

async function startBranchPreview(sb: any, databaseUrl: string) {
  const dir = `${process.env.SANDBOX_DIR}/${sb.id}`;
  await run("git", ["-C", process.env.REPO_DIR!, "fetch", "origin", sb.branch]);
  await run("git", ["-C", process.env.REPO_DIR!, "worktree", "add", "--detach", dir, `origin/${sb.branch}`]);
  await run("npm", ["ci"], { cwd: dir });
  const child = spawn("npm", ["start"], {
    cwd: dir, detached: true, stdio: "ignore",
    env: { ...process.env, PORT: String(sb.port), HOST: "127.0.0.1", DATABASE_URL: databaseUrl },
  });
  child.unref();
  await redis.set(`sandbox:${sb.id}:pid`, String(child.pid));
}

export async function destroySandbox(id: string) {
  const { rows: [sb] } = await admin.query("UPDATE sandboxes SET status = 'destroying' WHERE id = $1 RETURNING *", [id]);
  if (!sb) return;
  const pid = await redis.get(`sandbox:${id}:pid`);
  if (pid) { try { process.kill(-Number(pid)); } catch { /* already gone */ } }
  if (sb.branch) await run("git", ["-C", process.env.REPO_DIR!, "worktree", "remove", "--force", `${process.env.SANDBOX_DIR}/${id}`]).catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS ${sb.db_name} WITH (FORCE)`); // PostgreSQL 13+
  await admin.query(`DROP ROLE IF EXISTS ${sb.db_user}`);
  await redis.hdel("sandbox:routes", id);
  await redis.del(`sandbox:${id}:dburl`, `sandbox:${id}:pid`);
  await admin.query("DELETE FROM sandboxes WHERE id = $1", [id]);
}

export async function cleanupExpired() {
  const { rows } = await admin.query("SELECT id FROM sandboxes WHERE expires_at < now() AND status IN ('ready','error')");
  for (const r of rows) await destroySandbox(r.id);
  return rows.length;
}

export async function extendTTL(id: string, hours: number) {
  await admin.query("UPDATE sandboxes SET expires_at = expires_at + make_interval(hours => $2) WHERE id = $1", [id, hours]);
}

export async function getSandbox(id: string) {
  const { rows } = await admin.query("SELECT * FROM sandboxes WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function listSandboxes(owner?: string) {
  const { rows } = await admin.query(
    "SELECT * FROM sandboxes WHERE status <> 'destroying' AND ($1::text IS NULL OR owner = $1) ORDER BY created_at DESC",
    [owner ?? null],
  );
  return rows;
}

export const databaseUrl = (id: string) => redis.get(`sandbox:${id}:dburl`);
```

### Step 3: The HTTP API

```typescript
// src/server.ts — HTTP API for the sandbox manager
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { createSandbox, destroySandbox, extendTTL, listSandboxes, cleanupExpired, databaseUrl } from "./manager.js";

const CreateBody = z.object({
  type: z.enum(["feature", "demo", "qa", "review"]),
  owner: z.string().min(1),
  name: z.string().max(60).optional(),
  branch: z.string().max(100).optional(),
  seed: z.enum(["empty", "minimal", "full"]).default("minimal"),
  ttlHours: z.number().int().min(1).max(168).default(48),
});

const app = new Hono();
app.post("/sandboxes", async (c) => {
  const body = CreateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: z.treeifyError(body.error) }, 400);
  try { return c.json(await createSandbox(body.data), 202); }
  catch (e) { return c.json({ error: (e as Error).message }, 409); }
});
app.get("/sandboxes", async (c) => c.json(await listSandboxes(c.req.query("owner"))));
app.post("/sandboxes/:id/extend", async (c) => {
  const body = z.object({ hours: z.number().int().min(1).max(72) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: z.treeifyError(body.error) }, 400);
  await extendTTL(c.req.param("id"), body.data.hours);
  return c.body(null, 204);
});
app.get("/sandboxes/:id/database-url", async (c) => c.json({ url: await databaseUrl(c.req.param("id")) }));
app.delete("/sandboxes/:id", async (c) => { await destroySandbox(c.req.param("id")); return c.body(null, 204); });

setInterval(() => cleanupExpired().catch(console.error), 5 * 60_000);
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3100 });
```

Start it with `npx tsx src/server.ts` and call it from CI or a chat command:

```bash
curl -s -X POST http://127.0.0.1:3100/sandboxes -H 'content-type: application/json' \
  -d '{"type":"review","owner":"erik","branch":"feature/billing-v2","seed":"minimal"}'
```

The response carries the sandbox `id` and `status: "creating"`. Poll `GET /sandboxes?owner=erik` until the status is `ready`, then read the connection string from `GET /sandboxes/<id>/database-url`. The password is stored only in Redis, never in the registry table.

### Step 4: Route traffic and protect the previews

Point your reverse proxy (Caddy, Traefik, nginx) at the `sandbox:routes` hash in Redis, or generate its config from it. Put authentication in front of the previews: a sandbox created from `seed_full` holds fake data, but a branch preview runs unreviewed code. Keep the preview processes on `127.0.0.1` (the manager sets `HOST=127.0.0.1`) so they are reachable only through the proxy.

## Results

Erik's team can create a sandbox with one request instead of filing a DevOps ticket. Each sandbox has its own database and role, so a broken migration only affects its owner. Demos use the anonymised `seed_full` template instead of production data. Every sandbox has a time limit (48 hours by default, extendable) and the cleanup timer removes the database, role, route and preview process, so abandoned environments stop costing money.

## Related Skills

- [typescript](/skills/typescript) — typing the manager and the API
- [redis](/skills/redis) — routing table and per-sandbox connection strings
- [postgresql](/skills/postgresql) — template databases, roles and cleanup
- [hono](/skills/hono) — the HTTP API
- [zod](/skills/zod) — request validation
