---
title: Build Soft Delete with Restore and Retention
slug: build-soft-delete-with-restore
description: Build a soft delete system with trash/restore, cascading soft deletes, automatic purging after retention period, and admin recovery tools — preventing accidental data loss across your entire application.
skills:
  - typescript
  - postgresql
  - hono
  - redis
category: development
tags:
  - soft-delete
  - data-recovery
  - database
  - safety
  - data-management
---

# Build Soft Delete with Restore and Retention

## The Problem

Leo leads backend at a 30-person project management tool. A customer accidentally deleted a project with two years of task history. A plain `DELETE FROM projects WHERE id = ...` made it gone for good, and support had to restore from a backup that was hours old, losing half a day of other customers' work. Projects own tasks, documents, comments and attachments, so deleting a project must hide all of them, let the user restore the whole thing within 30 days, and purge it for real afterwards.

## The Solution

Each soft-deletable table gets four columns. Every delete operation gets one `deletion_id` (a UUID) that is stamped on the record the user deleted and on every child hidden with it. Restoring is then a single `UPDATE ... WHERE deletion_id = $1`, which also brings back grandchildren, while rows a user deleted separately earlier stay deleted. Table and column names come from a constant registry, never from request input.

## Step 1: Migrate the schema

```sql
-- one-time, per soft-deletable table (repeat for tasks, documents, comments, ...)
ALTER TABLE projects
  ADD COLUMN deleted_at    timestamptz,
  ADD COLUMN deleted_by    text,
  ADD COLUMN delete_reason text,
  ADD COLUMN deletion_id   uuid;

-- live rows stay fast, trash and purge queries stay cheap
CREATE INDEX projects_deleted_at_idx ON projects (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX projects_deletion_id_idx ON projects (deletion_id) WHERE deletion_id IS NOT NULL;

-- uniqueness must ignore trashed rows, or a deleted slug blocks a new one
CREATE UNIQUE INDEX projects_slug_live_key ON projects (slug) WHERE deleted_at IS NULL;

CREATE TABLE deletion_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deletion_id uuid NOT NULL,
  action      text NOT NULL CHECK (action IN ('delete', 'restore', 'purge')),
  root_table  text NOT NULL,
  root_id     uuid NOT NULL,
  actor       text NOT NULL,
  reason      text,
  affected    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

Every query for live data must add `deleted_at IS NULL`. A Postgres view or your ORM's default scope can enforce that in one place.

## Step 2: The soft delete module

```typescript
// src/db/soft-delete.ts
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Redis } from "ioredis";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");

export const RETENTION_DAYS = 30;

// Table and column names come ONLY from this constant registry, never from user input.
const TREE = {
  projects: [{ table: "tasks", fk: "project_id" }, { table: "documents", fk: "project_id" }],
  tasks: [{ table: "comments", fk: "task_id" }, { table: "attachments", fk: "task_id" }],
  documents: [{ table: "document_versions", fk: "document_id" }],
  comments: [],
  attachments: [],
  document_versions: [],
} as const;
export type SoftTable = keyof typeof TREE;
export const isSoftTable = (t: string): t is SoftTable => Object.hasOwn(TREE, t);
// Leaf tables first, so a purge never trips a foreign key.
const PURGE_ORDER: SoftTable[] = ["comments", "attachments", "document_versions", "tasks", "documents", "projects"];

type Tx = pg.PoolClient;
type Affected = Record<string, string[]>;

async function cascade(tx: Tx, table: SoftTable, parentIds: string[], deletionId: string, by: string, out: Affected) {
  for (const { table: child, fk } of TREE[table]) {
    const { rows } = await tx.query<{ id: string }>(
      `UPDATE ${child} SET deleted_at = now(), deleted_by = $1, delete_reason = 'cascade', deletion_id = $2
       WHERE ${fk} = ANY($3::uuid[]) AND deleted_at IS NULL RETURNING id`,
      [by, deletionId, parentIds],
    );
    if (rows.length === 0) continue;
    out[child] = rows.map((r) => r.id);
    await cascade(tx, child, out[child], deletionId, by, out);
  }
}

export async function softDelete(table: SoftTable, id: string, by: string, reason?: string) {
  const deletionId = randomUUID();
  const affected: Affected = {};
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const root = await tx.query(
      `UPDATE ${table} SET deleted_at = now(), deleted_by = $2, delete_reason = $3, deletion_id = $4
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id, by, reason ?? null, deletionId],
    );
    if (root.rowCount === 0) throw new Error("Record not found or already deleted");
    affected[table] = [id];
    await cascade(tx, table, [id], deletionId, by, affected);
    await tx.query(
      `INSERT INTO deletion_log (deletion_id, action, root_table, root_id, actor, reason, affected)
       VALUES ($1, 'delete', $2, $3, $4, $5, $6)`,
      [deletionId, table, id, by, reason ?? null, JSON.stringify(affected)],
    );
    await tx.query("COMMIT");
  } catch (err) {
    await tx.query("ROLLBACK");
    throw err;
  } finally {
    tx.release();
  }
  await invalidate(affected);
  return { deletionId, counts: Object.fromEntries(Object.entries(affected).map(([t, ids]) => [t, ids.length])) };
}

// Restore the record the user deleted; everything deleted with it (same deletion_id) comes back.
export async function restore(table: SoftTable, id: string, by: string) {
  const tx = await pool.connect();
  const affected: Affected = {};
  try {
    await tx.query("BEGIN");
    const root = await tx.query<{ deletion_id: string }>(
      `SELECT deletion_id FROM ${table}
       WHERE id = $1 AND deleted_at > now() - make_interval(days => $2)
         AND delete_reason IS DISTINCT FROM 'cascade' FOR UPDATE`,
      [id, RETENTION_DAYS],
    );
    if (root.rowCount === 0) throw new Error("Not in the trash, expired, or deleted as part of a parent");
    const deletionId = root.rows[0].deletion_id;
    for (const t of Object.keys(TREE) as SoftTable[]) {
      const { rows } = await tx.query<{ id: string }>(
        `UPDATE ${t} SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, deletion_id = NULL
         WHERE deletion_id = $1 RETURNING id`,
        [deletionId],
      );
      if (rows.length) affected[t] = rows.map((r) => r.id);
    }
    await tx.query(
      `INSERT INTO deletion_log (deletion_id, action, root_table, root_id, actor, affected)
       VALUES ($1, 'restore', $2, $3, $4, $5)`,
      [deletionId, table, id, by, JSON.stringify(affected)],
    );
    await tx.query("COMMIT");
  } catch (err) {
    await tx.query("ROLLBACK");
    throw err;
  } finally {
    tx.release();
  }
  await invalidate(affected);
  return Object.fromEntries(Object.entries(affected).map(([t, ids]) => [t, ids.length]));
}

export async function listDeleted(table: SoftTable, page = 1, limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, name, deleted_at, deleted_by, delete_reason, count(*) OVER () AS total
     FROM ${table}
     WHERE deleted_at > now() - make_interval(days => $1) AND delete_reason IS DISTINCT FROM 'cascade'
     ORDER BY deleted_at DESC LIMIT $2 OFFSET $3`,
    [RETENTION_DAYS, limit, (page - 1) * limit],
  );
  return { items: rows.map(({ total, ...r }) => r), total: Number(rows[0]?.total ?? 0), page, limit };
}

export async function purgeExpired() {
  const purged: Record<string, number> = {};
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    for (const t of PURGE_ORDER) {
      const { rowCount } = await tx.query(
        `DELETE FROM ${t} WHERE deleted_at < now() - make_interval(days => $1)`,
        [RETENTION_DAYS],
      );
      if (rowCount) purged[t] = rowCount;
    }
    await tx.query("COMMIT");
  } catch (err) {
    await tx.query("ROLLBACK");
    throw err;
  } finally {
    tx.release();
  }
  return purged;
}

async function invalidate(affected: Affected) {
  const keys = Object.entries(affected).flatMap(([t, ids]) => ids.map((id) => `${t}:${id}`));
  if (keys.length) await redis.del(...keys);
}
```

`listDeleted` selects a `name` column; change the select list for tables that call it something else. Restoring a record that conflicts with a live one (for example, a unique slug taken in the meantime) fails with a unique violation and rolls back, so nothing is half restored.

## Step 3: HTTP endpoints with Hono

```typescript
// src/routes/trash.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { isSoftTable, listDeleted, restore, softDelete } from "../db/soft-delete.js";

const Table = z.string().refine(isSoftTable, "unknown table");
const Id = z.uuid();
const app = new Hono();

// Replace with your real auth middleware; the actor must never come from a client header.
const actor = (c: { req: { header(n: string): string | undefined } }) => c.req.header("x-user-id") ?? "unknown";

app.delete("/:table/:id", async (c) => {
  const table = Table.safeParse(c.req.param("table"));
  const id = Id.safeParse(c.req.param("id"));
  if (!table.success || !id.success || !isSoftTable(table.data)) return c.json({ error: "bad request" }, 400);
  const { reason } = await c.req.json().catch(() => ({}));
  try {
    return c.json(await softDelete(table.data, id.data, actor(c), typeof reason === "string" ? reason : undefined));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 404);
  }
});

app.get("/trash/:table", async (c) => {
  const table = c.req.param("table");
  if (!isSoftTable(table)) return c.json({ error: "unknown table" }, 400);
  return c.json(await listDeleted(table, Number(c.req.query("page") ?? 1)));
});

app.post("/trash/:table/:id/restore", async (c) => {
  const table = c.req.param("table");
  const id = Id.safeParse(c.req.param("id"));
  if (!isSoftTable(table) || !id.success) return c.json({ error: "bad request" }, 400);
  try {
    return c.json({ restored: await restore(table, id.data, actor(c)) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 409);
  }
});

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3000 });
```

```console
$ curl -s -X DELETE http://127.0.0.1:3000/projects/$PROJECT_ID -H 'x-user-id: u1' \
    -H 'content-type: application/json' -d '{"reason":"duplicate"}'
{"deletionId":"49773c3f-2e8b-43e5-93cc-1abfb9b0350a","counts":{"projects":1,"tasks":12,"comments":40}}
$ curl -s -X POST http://127.0.0.1:3000/trash/projects/$PROJECT_ID/restore -H 'x-user-id: u1'
{"restored":{"projects":1,"tasks":12,"comments":40}}
```

## Step 4: Purge on a schedule

Call `purgeExpired()` from a small script and run it nightly with cron or your platform's scheduler. Children are deleted before parents inside one transaction, so a foreign key error rolls the whole purge back instead of leaving orphans.

```bash
# crontab: every night at 03:15
15 3 * * * cd /srv/app && node dist/scripts/purge.js >> /var/log/purge.log 2>&1
```

Purging is permanent. If you also need to erase personal data on request, do that with a separate, explicit hard delete; retention does not replace it.

## Real-World Example

Leo's team ships the migration table by table, starting with `projects`. In staging they delete a project that has tasks, documents and comments, confirm the trash list shows only the project (not its cascaded children), restore it, and check that a task someone deleted by hand last week is still in the trash. They then backdate the rows by 31 days and run the purge to confirm that children go before parents and the audit log keeps the entries.

## Related Skills

- [typescript](/skills/typescript) — typed table registry so only known tables can be touched
- [postgresql](/skills/postgresql) — partial indexes, transactions and `make_interval` retention queries
- [hono](/skills/hono) — delete, trash and restore endpoints
- [redis](/skills/redis) — cache invalidation for every record that changes state
