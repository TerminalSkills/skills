---
title: Build Multi-Tenant SaaS with Row-Level Isolation
slug: build-multi-tenant-saas-with-row-isolation
description: Build a multi-tenant SaaS architecture using PostgreSQL Row-Level Security where tenant data isolation is enforced at the database level — so a query that forgets the tenant filter returns nothing from other tenants.
skills:
  - typescript
  - postgresql
  - hono
  - zod
category: development
tags:
  - multi-tenant
  - rls
  - security
  - saas
  - postgresql
---

# Build Multi-Tenant SaaS with Row-Level Isolation

## The Problem

Sasha leads engineering at a 30-person B2B SaaS with 400 customers sharing one database. Tenant isolation relies on `WHERE tenant_id = ?` in every query, and developers forget it. Two months ago a new dashboard endpoint leaked data from other customers because the filter was missing, and the follow-up audit found more queries without it. Application-level filtering cannot be trusted to be complete. PostgreSQL Row-Level Security (RLS) moves the rule into the database: a query that forgets the filter returns only the current tenant's rows.

## The Solution

Every tenant-owned table gets a `tenant_id` column and one policy that compares it with a per-transaction setting, `app.tenant_id`. The API connects as `app_user`, a role that is neither superuser nor owner and cannot bypass RLS. Each request runs in a transaction that starts with `set_config('app.tenant_id', ..., true)`. The `true` makes the setting transaction-local, so it disappears at COMMIT or ROLLBACK and a pooled connection can never carry one tenant into another request. This also works behind PgBouncer in transaction mode, which a session-level `SET` does not.

Points the usual tutorials get wrong: `SET` cannot take bind parameters (use `set_config`); `CREATE POLICY IF NOT EXISTS` does not exist; a superuser or a role with `BYPASSRLS` ignores every policy, so the application role must be neither; and a missing setting must mean "no rows", which `current_setting('app.tenant_id', true)` (the `true` means "missing is not an error") gives you.

```bash
npm i pg zod hono @hono/node-server
npm i -D typescript tsx @types/node @types/pg
```

## Step-by-Step Walkthrough

### Step 1: Roles, tables and policies

Run this once per environment as the migration role. Passwords come from variables, not from the file. The `DO` block repeats for every tenant-owned table; on existing tables, add `tenant_id` nullable, backfill it, then set `NOT NULL` before enabling RLS. `FORCE ROW LEVEL SECURITY` binds the table owner too. The single policy covers all commands: `USING` filters reads, updates and deletes, and `WITH CHECK` rejects writes with another tenant's id. The `(SELECT app_tenant())` wrapper lets PostgreSQL evaluate the function once per query instead of once per row.

```sql
-- Run once per environment as the table owner (the migration role), never as app_user.
-- Roles: set the passwords from your secret store, e.g. psql -v app_pw="$APP_DB_PASSWORD" -f rls.sql
CREATE ROLE app_user LOGIN PASSWORD :'app_pw' NOSUPERUSER NOBYPASSRLS;      -- the API connects as this
CREATE ROLE report_user LOGIN PASSWORD :'report_pw' NOSUPERUSER BYPASSRLS;  -- cross-tenant reports only

CREATE TABLE tenants  (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL, description text, created_at timestamptz NOT NULL DEFAULT now()
);

-- NULL when the setting is missing or empty, so a request without a tenant sees no rows
CREATE FUNCTION app_tenant() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- Repeat the block for every tenant-owned table
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['projects'] LOOP
    EXECUTE format('CREATE INDEX ON %I (tenant_id)', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);   -- the owner is bound too
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = (SELECT app_tenant()))
      WITH CHECK (tenant_id = (SELECT app_tenant()))$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;
GRANT SELECT ON tenants TO report_user;
GRANT SELECT ON projects TO report_user;
```

```bash
psql "$MIGRATION_DATABASE_URL" -v app_pw="$APP_DB_PASSWORD" -v report_pw="$REPORT_DB_PASSWORD" -f rls.sql
```

### Step 2: Tenant context middleware

The tenant id must come from the verified session or JWT set by your auth middleware, never from a header or body the client controls. Hono passes handler errors to `onError` instead of throwing through `next()`, so the middleware checks `c.error` to decide between COMMIT and ROLLBACK.

```typescript
import pg from "pg";
import type { MiddlewareHandler } from "hono";

// Connects as app_user, a role that is subject to row-level security
export const appPool = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL, max: 20 });

export type Env = { Variables: { tenantId: string; db: pg.PoolClient } };

// One transaction per request. set_config(..., true) is transaction-local: it is cleared on
// COMMIT/ROLLBACK, so a pooled connection can never carry a tenant into the next request,
// and it stays safe behind PgBouncer in transaction mode (a session-level SET does not).
export const withTenant: MiddlewareHandler<Env> = async (c, next) => {
  const tenantId = c.get("tenantId"); // from the verified session or JWT, never from a header the client controls
  if (!tenantId) return c.json({ error: "Tenant context required" }, 403);
  const db = await appPool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]); // SET cannot take $1
    c.set("db", db);
    await next();
    await db.query(c.error ? "ROLLBACK" : "COMMIT"); // Hono hands handler errors to onError, so check c.error
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
};
```

### Step 3: Routes without tenant filters

Handlers contain no `WHERE tenant_id`. Inserts take `tenant_id` from `app_tenant()` so a body field cannot override it, and a request for another tenant's id gets the same 404 as a missing one.

```typescript
import { Hono } from "hono";
import { z } from "zod";
import { withTenant, type Env } from "./db";

export const app = new Hono<Env>();
// auth middleware (sets tenantId) goes first, then:
app.use("/projects/*", withTenant);

const CreateProject = z.object({ name: z.string().min(1).max(255), description: z.string().max(2000).optional() });

app.get("/projects", async (c) => {
  // No WHERE tenant_id: the policy adds it
  const { rows } = await c.get("db").query("SELECT id, name, description, created_at FROM projects ORDER BY created_at DESC");
  return c.json({ projects: rows });
});

app.post("/projects", async (c) => {
  const body = CreateProject.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  // tenant_id comes from the same setting the policy checks, never from the request body
  const { rows } = await c.get("db").query(
    `INSERT INTO projects (tenant_id, name, description) VALUES (app_tenant(), $1, $2) RETURNING id, name, description`,
    [body.data.name, body.data.description ?? null]);
  return c.json({ project: rows[0] }, 201);
});

app.get("/projects/:id", async (c) => {
  if (!z.uuid().safeParse(c.req.param("id")).success) return c.json({ error: "Project not found" }, 404);
  const { rows } = await c.get("db").query("SELECT id, name, description FROM projects WHERE id = $1", [c.req.param("id")]);
  return rows.length ? c.json({ project: rows[0] }) : c.json({ error: "Project not found" }, 404); // another tenant's id looks the same
});

app.delete("/projects/:id", async (c) => {
  if (!z.uuid().safeParse(c.req.param("id")).success) return c.json({ error: "Project not found" }, 404);
  const r = await c.get("db").query("DELETE FROM projects WHERE id = $1", [c.req.param("id")]);
  return r.rowCount ? c.json({ deleted: true }) : c.json({ error: "Project not found" }, 404);
});
```

### Step 4: Cross-tenant reports

Internal reporting uses a separate connection string for `report_user`, which has `BYPASSRLS` but only `SELECT` rights. Keep it out of the request path: run it in a script or a job, never behind a tenant-facing route. Do not use a superuser for this, as many guides do: it needs no policy and can write anywhere.

```typescript
import pg from "pg";
const reports = new pg.Pool({ connectionString: process.env.REPORT_DATABASE_URL });
const { rows } = await reports.query(
  `SELECT t.name, count(p.id) AS projects FROM tenants t
   LEFT JOIN projects p ON p.tenant_id = t.id GROUP BY t.name ORDER BY projects DESC`);
```

## Real-World Example

Sasha's team ships the policies first, then moves routes onto `withTenant` one at a time. The old dashboard query that forgot its filter now returns only the caller's rows, and the audit's list of missing-filter queries stops being a leak. Developers write `SELECT * FROM projects` and get the right rows. To keep it that way, add a test to CI that runs as `app_user` with no tenant set and asserts that every tenant table returns zero rows.

Checked against PostgreSQL 16 with two tenants: each tenant listed only its own projects; a request without a tenant got 403; reading or deleting another tenant's project id returned 404; a `tenant_id` sent in the body was ignored; an unfiltered `SELECT *` with no setting returned 0 rows; inserting a row for another tenant failed with SQLSTATE 42501 (`new row violates row-level security policy`); the setting was empty on the connection after the transaction ended; and `report_user` could count across tenants but could not delete.

Limits to know: RLS does not protect against a bug that sets the wrong tenant id, so tenant resolution deserves its own tests. Tenant-scoped uniqueness needs composite constraints such as `UNIQUE (tenant_id, slug)`, and a foreign key check runs without RLS, which can reveal that another tenant's id exists. Index `tenant_id` (or lead composite indexes with it) so policy filters use index scans.

## Related Skills

- [typescript](/skills/typescript), [postgresql](/skills/postgresql)
- [hono](/skills/hono), [zod](/skills/zod)
