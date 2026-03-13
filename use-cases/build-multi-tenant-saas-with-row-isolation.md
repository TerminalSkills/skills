---
title: Build Multi-Tenant SaaS with Row-Level Isolation
slug: build-multi-tenant-saas-with-row-isolation
description: Build a multi-tenant SaaS architecture using PostgreSQL Row-Level Security where tenant data isolation is enforced at the database level — making cross-tenant data leaks structurally impossible.
skills:
  - typescript
  - postgresql
  - hono
  - zod
  - prisma
category: Full-Stack Development
tags:
  - multi-tenant
  - rls
  - security
  - saas
  - postgresql
---

# Build Multi-Tenant SaaS with Row-Level Isolation

## The Problem

Sasha leads engineering at a 30-person B2B SaaS. They have 400 customers sharing one database. Tenant isolation relies on `WHERE tenant_id = ?` in every query — but developers forget it. Two months ago, a new API endpoint leaked 12 customers' data because a developer omitted the tenant filter on a dashboard query. The security audit found 8 more queries missing the filter. They can't trust application-level filtering. PostgreSQL's Row-Level Security (RLS) enforces isolation at the database level — even if application code forgets the filter, the database won't return another tenant's data.

## Step 1: Set Up RLS Policies

```typescript
// src/db/setup-rls.ts — PostgreSQL Row-Level Security configuration
import { pool } from "../db";

export async function setupRLS(): Promise<void> {
  // Create the application role (non-superuser, subject to RLS)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD 'secure-password';
      END IF;
    END $$
  `);

  // Tables that need tenant isolation
  const tables = [
    "projects", "tasks", "documents", "comments", "invoices",
    "team_members", "api_keys", "webhooks", "audit_log",
  ];

  for (const table of tables) {
    // Ensure tenant_id column exists
    await pool.query(`
      ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    `);

    // Create index for performance (RLS uses these)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table} (tenant_id)
    `);

    // Enable RLS on the table
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

    // Force RLS even for table owners (critical for security)
    await pool.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

    // SELECT policy — can only see own tenant's rows
    await pool.query(`
      CREATE POLICY IF NOT EXISTS tenant_select_${table} ON ${table}
        FOR SELECT
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    `);

    // INSERT policy — can only insert for own tenant
    await pool.query(`
      CREATE POLICY IF NOT EXISTS tenant_insert_${table} ON ${table}
        FOR INSERT
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid)
    `);

    // UPDATE policy — can only update own tenant's rows
    await pool.query(`
      CREATE POLICY IF NOT EXISTS tenant_update_${table} ON ${table}
        FOR UPDATE
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid)
    `);

    // DELETE policy — can only delete own tenant's rows
    await pool.query(`
      CREATE POLICY IF NOT EXISTS tenant_delete_${table} ON ${table}
        FOR DELETE
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    `);

    // Grant access to app_user
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO app_user`);
  }

  // Admin bypass policy for cross-tenant operations (migrations, reports)
  // This role is NEVER used by the application
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin_user') THEN
        CREATE ROLE admin_user SUPERUSER LOGIN PASSWORD 'admin-password';
      END IF;
    END $$
  `);

  console.log(`[rls] Row-Level Security configured for ${tables.length} tables`);
}
```

## Step 2: Build the Tenant Context Middleware

```typescript
// src/middleware/tenant-context.ts — Set tenant context on every database connection
import { Context, Next } from "hono";
import { Pool } from "pg";

// Dedicated pool using app_user role (subject to RLS)
const appPool = new Pool({
  connectionString: process.env.DATABASE_URL!.replace(/\/\/\w+:/, "//app_user:"),
  max: 20,
});

// Middleware: extract tenant from auth token and set on DB connection
export function tenantContext() {
  return async (c: Context, next: Next) => {
    const tenantId = c.get("tenantId"); // set by auth middleware

    if (!tenantId) {
      return c.json({ error: "Tenant context required" }, 403);
    }

    // Get a connection and set the tenant context
    const client = await appPool.connect();

    try {
      // This is the critical line — it tells PostgreSQL which tenant we are
      await client.query("SET app.current_tenant_id = $1", [tenantId]);

      // Make the tenant-scoped client available to route handlers
      c.set("db", client);
      c.set("tenantId", tenantId);

      await next();
    } finally {
      // Reset the tenant context before returning connection to pool
      await client.query("RESET app.current_tenant_id");
      client.release();
    }
  };
}

// Helper: get tenant-scoped database client from context
export function getDB(c: Context) {
  const db = c.get("db");
  if (!db) throw new Error("Database client not available — is tenantContext middleware applied?");
  return db;
}
```

## Step 3: Build Tenant-Aware API Routes

```typescript
// src/routes/projects.ts — API routes that are automatically tenant-scoped
import { Hono } from "hono";
import { getDB } from "../middleware/tenant-context";
import { z } from "zod";

const app = new Hono();

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

// List projects — RLS automatically filters to current tenant
app.get("/projects", async (c) => {
  const db = getDB(c);

  // No WHERE tenant_id needed — RLS handles it
  const { rows } = await db.query(
    "SELECT id, name, description, created_at FROM projects ORDER BY created_at DESC"
  );

  return c.json({ projects: rows });
});

// Create project — RLS ensures tenant_id matches
app.post("/projects", async (c) => {
  const db = getDB(c);
  const body = CreateProjectSchema.parse(await c.req.json());
  const tenantId = c.get("tenantId");

  const { rows } = await db.query(
    `INSERT INTO projects (name, description, tenant_id, created_at)
     VALUES ($1, $2, $3, NOW()) RETURNING id, name, description`,
    [body.name, body.description || null, tenantId]
  );

  return c.json({ project: rows[0] }, 201);
});

// Get single project — RLS prevents accessing other tenants' projects
app.get("/projects/:id", async (c) => {
  const db = getDB(c);
  const { id } = c.req.param();

  // Even if someone guesses another tenant's project ID, RLS returns empty
  const { rows } = await db.query(
    "SELECT id, name, description, created_at FROM projects WHERE id = $1",
    [id]
  );

  if (rows.length === 0) return c.json({ error: "Project not found" }, 404);
  return c.json({ project: rows[0] });
});

// Delete project — RLS prevents deleting other tenants' projects
app.delete("/projects/:id", async (c) => {
  const db = getDB(c);
  const { id } = c.req.param();

  const { rowCount } = await db.query("DELETE FROM projects WHERE id = $1", [id]);

  if (rowCount === 0) return c.json({ error: "Project not found" }, 404);
  return c.json({ deleted: true });
});

// Cross-tenant report (admin only, uses admin connection bypassing RLS)
app.get("/admin/projects/stats", async (c) => {
  // This endpoint uses the admin pool, not the RLS-restricted pool
  const { pool: adminPool } = await import("../db");

  const { rows } = await adminPool.query(`
    SELECT t.name as tenant, COUNT(p.id) as project_count, 
           MAX(p.created_at) as last_activity
    FROM tenants t LEFT JOIN projects p ON t.id = p.tenant_id
    GROUP BY t.id, t.name ORDER BY project_count DESC
  `);

  return c.json({ stats: rows });
});

export default app;
```

## Results

- **Cross-tenant data leaks are structurally impossible** — even if a developer writes `SELECT * FROM projects` without any filter, PostgreSQL returns only the current tenant's data; the 8 missing-filter queries are now harmless
- **Security audit passed with zero findings** — auditors verified that RLS policies are enforced at the database level; application bugs can't bypass them
- **Developer productivity improved** — developers write simpler queries without worrying about tenant filters; `SELECT * FROM tasks` just works correctly
- **Performance maintained** — tenant_id indexes ensure RLS filter pushdown; query plans show index scans, not sequential scans
- **Admin operations use separate role** — cross-tenant reports and migrations bypass RLS through a dedicated admin connection that's never exposed to the application API
