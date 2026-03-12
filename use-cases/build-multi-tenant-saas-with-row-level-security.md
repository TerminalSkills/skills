---
title: Build Multi-Tenant SaaS with Row-Level Security
slug: build-multi-tenant-saas-with-row-level-security
description: A B2B SaaS startup implements multi-tenancy with Postgres Row-Level Security — a single database where every query is automatically filtered by tenant, eliminating the risk of data leaks between customers, with tenant-aware connection pooling, per-tenant usage tracking, and automated tenant provisioning.
skills: [prisma, neon-serverless, authjs, hono, zod]
category: Backend Development
tags: [multi-tenant, saas, security, postgres, rls, b2b, database]
---

# Build Multi-Tenant SaaS with Row-Level Security

Alex is building a project management SaaS for agencies. Each agency is a tenant with their own projects, tasks, and team members. The critical requirement: Agency A must never see Agency B's data, even if there's a bug in the application code. A data leak between tenants would destroy the business.

There are three approaches to multi-tenancy:

1. **Database per tenant**: Perfect isolation, nightmare to manage at scale (100+ tenants = 100+ databases)
2. **Schema per tenant**: Good isolation, complex migrations (ALTER TABLE on 100+ schemas)
3. **Shared database with Row-Level Security**: Single database, single schema, Postgres enforces isolation at the database level

Alex chooses option 3. Here's why: RLS means that even if a developer forgets a `WHERE tenant_id = ?` clause, Postgres itself blocks the data leak. The security boundary is in the database, not the application.

## Step 1: Database Schema with RLS Policies

```sql
-- migrations/001_multi_tenant.sql

-- Tenants table (agencies)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects belong to a tenant
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks belong to a project (and transitively to a tenant)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  assignee_id UUID,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tenant-scoped tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies: rows only visible if tenant_id matches the session variable
CREATE POLICY tenant_isolation_projects ON projects
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_tasks ON tasks
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Indexes for performance (RLS filters use these)
CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX idx_tasks_project ON tasks(project_id, tenant_id);
```

The key insight: `current_setting('app.current_tenant_id')` is a Postgres session variable. The application sets it at the start of every request. Every query on `projects` and `tasks` is automatically filtered by this tenant — even raw SQL, even joins, even subqueries.

## Step 2: Tenant-Aware Request Handling

```typescript
// middleware/tenant.ts — Set tenant context on every request
import { Hono } from "hono";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Middleware: extract tenant from auth token and set on DB connection
async function tenantMiddleware(c: any, next: () => Promise<void>) {
  const session = c.get("session");
  if (!session?.user?.tenantId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const tenantId = session.user.tenantId;

  // Get a connection and set the tenant context
  const client = await pool.connect();
  try {
    // This is the magic line — Postgres RLS reads this variable
    await client.query("SET app.current_tenant_id = $1", [tenantId]);
    c.set("db", client);
    c.set("tenantId", tenantId);

    await next();
  } finally {
    // Reset before returning to pool (security: prevent tenant leakage)
    await client.query("RESET app.current_tenant_id");
    client.release();
  }
}

// API routes — no tenant_id in queries! RLS handles it.
const app = new Hono();

app.use("/api/*", tenantMiddleware);

app.get("/api/projects", async (c) => {
  const db = c.get("db");

  // This query returns ONLY the current tenant's projects
  // Even though there's no WHERE tenant_id = ? clause
  // Postgres RLS filters automatically
  const result = await db.query(
    "SELECT * FROM projects WHERE status = $1 ORDER BY created_at DESC",
    ["active"],
  );

  return c.json(result.rows);
});

app.post("/api/tasks", zValidator("json", createTaskSchema), async (c) => {
  const db = c.get("db");
  const tenantId = c.get("tenantId");
  const input = c.req.valid("json");

  // tenant_id is set explicitly on INSERT (RLS doesn't auto-set it)
  const result = await db.query(
    `INSERT INTO tasks (tenant_id, project_id, title, status)
     VALUES ($1, $2, $3, 'todo') RETURNING *`,
    [tenantId, input.projectId, input.title],
  );

  return c.json(result.rows[0], 201);
});
```

The developer never writes `WHERE tenant_id = ?` in SELECT queries. If they forget, Postgres returns empty results instead of leaking data. If they try to access another tenant's project by ID, the query returns nothing — not an error, just empty. The data doesn't exist from their perspective.

## Step 3: Tenant Provisioning

When a new agency signs up, the system creates their tenant and seeds initial data:

```typescript
// services/tenant-provisioning.ts
async function provisionTenant(input: { name: string; slug: string; ownerEmail: string }) {
  // Use a connection WITHOUT RLS (admin connection) for provisioning
  const adminClient = await adminPool.connect();

  try {
    await adminClient.query("BEGIN");

    // Create tenant
    const { rows: [tenant] } = await adminClient.query(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, 'trial') RETURNING *`,
      [input.name, input.slug],
    );

    // Create owner user linked to tenant
    const { rows: [user] } = await adminClient.query(
      `INSERT INTO users (email, tenant_id, role) VALUES ($1, $2, 'owner') RETURNING *`,
      [input.ownerEmail, tenant.id],
    );

    // Seed default project
    await adminClient.query(
      `INSERT INTO projects (tenant_id, name) VALUES ($1, 'Getting Started')`,
      [tenant.id],
    );

    await adminClient.query("COMMIT");

    return { tenant, user };
  } catch (error) {
    await adminClient.query("ROLLBACK");
    throw error;
  } finally {
    adminClient.release();
  }
}
```

## Step 4: Per-Tenant Usage Tracking

```typescript
// middleware/usage.ts — Track API calls per tenant for billing
app.use("/api/*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  const tenantId = c.get("tenantId");

  // Async — don't block the response
  queueUsageRecord({
    tenantId,
    endpoint: c.req.path,
    method: c.req.method,
    statusCode: c.res.status,
    durationMs: duration,
    timestamp: new Date(),
  });
});

// Aggregate for billing
async function getTenantUsage(tenantId: string, month: string) {
  return db.query(`
    SELECT
      COUNT(*) as total_requests,
      COUNT(*) FILTER (WHERE status_code < 400) as successful_requests,
      AVG(duration_ms) as avg_latency,
      COUNT(DISTINCT DATE(timestamp)) as active_days
    FROM usage_records
    WHERE tenant_id = $1 AND TO_CHAR(timestamp, 'YYYY-MM') = $2
  `, [tenantId, month]);
}
```

## Results

After 8 months with 150 tenants:

- **Zero data leaks**: Not a single cross-tenant data access in 8 months; RLS prevented 12 potential leaks from application bugs
- **Developer confidence**: New developers can't accidentally expose tenant data; the database enforces isolation regardless of query
- **Single database**: 150 tenants in one Postgres database; simple migrations, simple backups, simple monitoring
- **Performance**: RLS adds <1ms overhead per query; tenant_id indexes make filtered queries fast
- **Provisioning**: New tenant ready in <3 seconds (create records + seed data); no infrastructure provisioning
- **Cost**: Single Neon database ($50/mo) serves all tenants; database-per-tenant would cost $7,500/mo
- **Compliance**: Audit logs show tenant isolation is enforced at the database level; satisfies enterprise security reviews
- **Scaling**: Ready for 10,000+ tenants; Postgres handles it; if needed, shard by tenant_id ranges later
