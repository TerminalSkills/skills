---
title: "Design Multi-Tenant SaaS Architecture with AI"
slug: design-multi-tenant-saas-architecture
description: "Choose the right multi-tenancy strategy, design tenant isolation at database and application layers, and generate implementation scaffolding."
skills: [saas-architecture-advisor, database-schema-designer]
category: development
tags: [multi-tenant, saas, architecture, database-design, tenant-isolation]
---

# Design Multi-Tenant SaaS Architecture with AI

## The Problem

Converting a single-tenant application to multi-tenant -- or designing multi-tenancy from scratch -- involves dozens of interconnected decisions that compound on each other. Shared database or per-tenant? Row-level security or application-layer filtering? How do you handle tenant-specific customizations without forking the codebase?

One wrong choice at the database layer means a painful migration later. Teams spend weeks researching patterns and still end up with data leakage bugs when a query forgets the `WHERE tenant_id = ?` clause. The worst part: you won't discover the architectural mistake until you have paying customers who can't tolerate downtime for a redesign. A shared-schema approach that works beautifully for 50 tenants can become a compliance nightmare when your first enterprise customer asks "can you prove our data is isolated from other tenants?" during a SOC 2 audit.

## The Solution

Using the **saas-architecture-advisor** and **database-schema-designer** skills, the agent evaluates tenancy strategies against your specific constraints -- tenant count, data sensitivity, compliance needs, team size, and budget -- then generates the schema, middleware, and row-level security policies for the recommended approach.

## Step-by-Step Walkthrough

### Step 1: Evaluate Tenancy Strategies for Your Context

```text
We're building a project management SaaS. Expected: 500 tenants in year 1,
scaling to 5,000. Most tenants are 5-20 users, but 3-5 enterprise clients
need strict data isolation for SOC2. Stack: Node.js, PostgreSQL, Redis.
Recommend a multi-tenancy strategy.
```

Three options surface, each with real tradeoffs:

| Strategy | Pros | Cons |
|---|---|---|
| **Shared DB, shared schema** (`tenant_id` column) | Simplest to build and cheapest to run; cross-tenant admin queries are easy | Every query needs the tenant filter; noisy neighbors; some enterprise auditors reject shared tables |
| **Shared DB, schema per tenant** | Strong logical separation inside one server | Every migration runs once per tenant; per-request `search_path` switching complicates connection pooling; catalog size grows with tenant count |
| **Hybrid**: shared schema for standard tenants, dedicated database for enterprise | Cheap for the long tail, full isolation where a contract demands it | Two data-access paths to keep in sync |

For this profile the hybrid wins: hundreds of small tenants share one database protected by row-level security (RLS), and the few enterprise tenants get their own database, which is what their auditors ask to see. Schema-per-tenant looks tidy at 50 tenants and becomes a migration and pooling burden at thousands.

### Step 2: Generate the Database Schema with Tenant Isolation

```text
Generate the PostgreSQL schema for the hybrid approach. Include the shared
tenant table, row-level security policies, and the middleware pattern for
tenant context injection. Our main entities: projects, tasks, members, comments.
```

The tenant registry lives in the shared database and routes requests to the right place. Tables that hold tenant data carry a `tenant_id` and an RLS policy:

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'enterprise')),
    database_url TEXT,                 -- NULL for standard tenants; keep it encrypted or in a secrets store
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL
);
CREATE INDEX ON projects (tenant_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;   -- the table owner is subject to the policy too
CREATE POLICY tenant_isolation ON projects
    USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
-- Repeat for tasks, members, comments.
-- A dedicated enterprise database needs the same tables and policies; there, drop the
-- REFERENCES tenants(id) clause or keep a one-row copy of the tenants table.
```

Three details decide whether this actually isolates tenants:

- **The application must connect as a role that is neither a superuser nor `BYPASSRLS`.** Those roles skip every policy. Run migrations as one role and serve traffic as another.
- **The tenant id travels in a transaction-scoped setting.** `SET LOCAL x = $1` is a syntax error (`SET` takes no bind parameters), so use `set_config('app.current_tenant_id', $1, true)` inside a transaction. The setting disappears at `COMMIT`, so it cannot leak to the next request on a pooled connection. With `current_setting(..., true)` and `nullif`, a query that forgot to set the tenant sees zero rows instead of raising an error or matching everything.
- **`WITH CHECK` stops writes into another tenant.** Inserting a row with a different `tenant_id` fails with "new row violates row-level security policy".

RLS is the safety net for the query someone writes without a `WHERE tenant_id = ?`: PostgreSQL applies the filter to every statement, including raw SQL and ORM shortcuts.

The Express side resolves the tenant and runs each request's queries through one helper that opens the transaction and sets the context:

```typescript
// tenant.ts
import { Pool, type PoolClient } from "pg";
import type { Request, Response, NextFunction } from "express";

interface Tenant {
  id: string;
  slug: string;
  tier: "standard" | "enterprise";
  databaseUrl: string | null;
}

declare module "express-serve-static-core" {
  interface Request {
    tenant?: Tenant;
  }
}

const sharedPool = new Pool({ connectionString: process.env.DATABASE_URL });
const dedicatedPools = new Map<string, Pool>();

function poolFor(tenant: Tenant): Pool {
  if (tenant.tier !== "enterprise" || !tenant.databaseUrl) return sharedPool;
  let pool = dedicatedPools.get(tenant.id);
  if (!pool) {
    pool = new Pool({ connectionString: tenant.databaseUrl, max: 5 });
    dedicatedPools.set(tenant.id, pool);
  }
  return pool;
}

// Every query for a tenant runs through here, inside one transaction.
export async function withTenant<T>(tenant: Tenant, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await poolFor(tenant).connect();
  try {
    await client.query("BEGIN");
    // set_config(..., true) is the parameterised form of SET LOCAL; it ends with the transaction.
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenant.id]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

declare function lookupTenant(slug: string): Promise<Tenant | null>; // cached read of the tenants table

export async function tenantContext(req: Request, res: Response, next: NextFunction) {
  // Resolve the tenant from the host name (acme.app.example.com), never from a client-supplied header.
  const slug = req.hostname.split(".")[0];
  const tenant = await lookupTenant(slug);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  req.tenant = tenant; // authentication must still check the user belongs to this tenant
  next();
}
```

Resolve the tenant from the host name or from the authenticated user's membership, not from a request header: a header like `x-tenant-id` lets any caller name someone else's tenant. Cache `lookupTenant` (for example in Redis with a short TTL) so routing does not hit the tenants table on every request.

### Step 3: Add Tenant-Aware Data Access Patterns

```text
Generate a repository pattern that works transparently with both shared and
dedicated databases. Include examples for CRUD operations on projects and
handling tenant-specific feature flags.
```

Repositories take a `tenant` and call `withTenant(tenant, db => ...)`, so controllers never know whether they are talking to the shared database or a dedicated instance and no `if (tenant.tier === 'enterprise')` branches leak into business logic. Feature flags and per-tenant settings (timezone, branding, beta features) live in the `settings` JSONB column, so they change without schema migrations.

### Step 4: Generate Tenant Onboarding and Offboarding Flows

```text
Create the tenant provisioning flow: when a new enterprise tenant signs up,
automatically create their dedicated database, run migrations, and configure
the routing. Include cleanup for tenant deletion with data export.
```

Standard tenants are provisioned by inserting one row into `tenants`; RLS does the rest. Enterprise provisioning is an idempotent admin job: create the database, wait until it accepts connections, run the full migration suite, seed roles and defaults, store the connection string, then invalidate the routing cache. Make each step safe to retry so a half-finished run can be resumed.

Offboarding runs in a fixed order: export the tenant's data to an archive with a manifest, tell the tenant's admin the export is ready, wait out a retention window your contract defines, then drop the dedicated database or delete the tenant's rows. Keep a tombstone record of the tenant so legal holds, accidental deletion and reactivation can be handled, and give the archive a lifecycle rule that deletes it at the end of its own retention period.

## Real-World Example

Marta, lead engineer at a 15-person startup building a client portal for accounting firms, had 20 beta clients on one database. Their first enterprise prospect, a 200-person firm, required contractual data isolation for its audit. Rebuilding the data layer looked like a month-long project.

The hybrid design kept the change small: RLS for standard tenants, a dedicated database for enterprise, and a repository layer hiding the two paths. While testing the policies, the team found two existing queries that had no tenant filter. They had gone unnoticed because the beta clients happened to use distinct project names; with RLS on, the same queries returned only the caller's rows. The enterprise tenant went live on its own database, and the auditor's check of the isolation boundary was short because there was one boundary to inspect.

## Related Skills

- [saas-architecture-advisor](../skills/saas-architecture-advisor/SKILL.md): compares tenancy strategies against your constraints
- [database-schema-designer](../skills/database-schema-designer/SKILL.md): generates the tenant-aware schema and policies
