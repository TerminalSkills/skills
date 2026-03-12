---
title: Build Multi-Tenant Row-Level Security with Drizzle
slug: build-multi-tenant-row-level-security-with-drizzle
description: Implement PostgreSQL row-level security policies with Drizzle ORM to guarantee tenant data isolation in a shared-database multi-tenant SaaS without manual WHERE clauses.
skills:
  - typescript
  - drizzle-orm
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - multi-tenant
  - row-level-security
  - postgresql
  - data-isolation
  - saas
---

# Build Multi-Tenant Row-Level Security with Drizzle

## The Problem

Omar runs engineering at a 25-person HR SaaS. All 340 customer accounts share one PostgreSQL database. Every query includes `WHERE tenant_id = ?`, but a developer forgot the filter on a new analytics endpoint. A customer saw 12 other companies' employee records for 47 minutes before the bug was caught. The breach notification cost $85K in legal fees and nearly lost their SOC2 certification. They need database-level tenant isolation that makes cross-tenant data access physically impossible — even if application code has bugs.

## Step 1: Set Up PostgreSQL Row-Level Security

RLS policies run inside PostgreSQL itself. Even if the application sends a query without a tenant filter, the database silently filters rows. This is defense-in-depth that no application bug can bypass.

```sql
-- migrations/001_enable_rls.sql — Enable RLS on all tenant-scoped tables

-- Set the current tenant via a session variable (set per-request by the app)
-- PostgreSQL's current_setting() reads this to enforce policies

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see rows where tenant_id matches the session variable
CREATE POLICY tenant_isolation_employees ON employees
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation_departments ON departments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation_payroll ON payroll_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation_time_entries ON time_entries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation_documents ON documents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- The application connects as 'app_user' (RLS enforced)
-- Migrations and admin tasks use 'admin_user' (BYPASSRLS)
CREATE ROLE app_user LOGIN PASSWORD 'changeme';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

CREATE ROLE admin_user LOGIN PASSWORD 'changeme' BYPASSRLS;
GRANT ALL ON ALL TABLES IN SCHEMA public TO admin_user;
```

## Step 2: Build the Tenant-Aware Database Layer

Every database operation sets the tenant context before executing queries. A middleware wraps each HTTP request in a transaction with the tenant variable set.

```typescript
// src/db/tenant-context.ts — Set tenant context on every database connection
import { Pool, PoolClient } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// App connection pool uses the restricted 'app_user' role
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // connects as app_user
  max: 20,
});

// Admin pool bypasses RLS — used only for migrations and cross-tenant operations
const adminPool = new Pool({
  connectionString: process.env.ADMIN_DATABASE_URL, // connects as admin_user
  max: 5,
});

export type TenantDb = NodePgDatabase<typeof schema>;

/**
 * Execute a callback within a tenant-scoped database context.
 * Sets the PostgreSQL session variable before any queries run,
 * ensuring RLS policies filter to the correct tenant.
 */
export async function withTenant<T>(
  tenantId: string,
  callback: (db: TenantDb, client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    // Set the tenant context — RLS policies read this value
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);

    const db = drizzle(client, { schema });
    return await callback(db, client);
  } finally {
    client.release();
  }
}

/**
 * Execute within a tenant-scoped transaction.
 * All queries in the callback share the same connection and tenant context.
 */
export async function withTenantTransaction<T>(
  tenantId: string,
  callback: (db: TenantDb) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);

    const db = drizzle(client, { schema });
    const result = await callback(db);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Admin context — bypasses RLS. Use sparingly and audit every call. */
export function getAdminDb(): TenantDb {
  return drizzle(adminPool, { schema });
}
```

## Step 3: Build the Tenant Middleware

The middleware extracts tenant ID from the authenticated user's JWT token and injects a tenant-scoped database instance into the request context. Route handlers never see or set tenant IDs manually.

```typescript
// src/middleware/tenant.ts — Hono middleware that injects tenant-scoped DB
import { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { withTenant, TenantDb } from "../db/tenant-context";

declare module "hono" {
  interface ContextVariableMap {
    tenantId: string;
    userId: string;
    db: TenantDb;
  }
}

export async function tenantMiddleware(c: Context, next: Next) {
  // Extract tenant from JWT (set during login)
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, process.env.JWT_SECRET!);
    const tenantId = payload.tenantId as string;
    const userId = payload.sub as string;

    if (!tenantId) return c.json({ error: "No tenant context" }, 403);

    // Execute the request within a tenant-scoped database context
    return await withTenant(tenantId, async (db) => {
      c.set("tenantId", tenantId);
      c.set("userId", userId);
      c.set("db", db);
      await next();
      return c.res;
    });
  } catch (error) {
    return c.json({ error: "Invalid token" }, 401);
  }
}
```

## Step 4: Build Tenant-Scoped Route Handlers

Route handlers use `c.get("db")` which is already tenant-scoped. No WHERE clauses for tenant filtering — RLS handles it invisibly. The code is cleaner and impossible to get wrong.

```typescript
// src/routes/employees.ts — Route handlers with automatic tenant isolation
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { employees, departments } from "../db/schema";
import { tenantMiddleware } from "../middleware/tenant";

const app = new Hono();
app.use("*", tenantMiddleware);

const CreateEmployeeSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  departmentId: z.string().uuid(),
  role: z.string(),
  salary: z.number().positive(),
});

// List employees — RLS automatically filters to current tenant
app.get("/", async (c) => {
  const db = c.get("db");

  // No WHERE tenant_id needed — RLS handles it
  const result = await db.select().from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .orderBy(employees.name);

  return c.json({ employees: result });
});

// Create employee — RLS WITH CHECK ensures tenant_id matches
app.post("/", async (c) => {
  const db = c.get("db");
  const tenantId = c.get("tenantId");
  const body = CreateEmployeeSchema.parse(await c.req.json());

  const [employee] = await db.insert(employees).values({
    ...body,
    tenantId, // must match current_setting('app.current_tenant_id')
  }).returning();

  return c.json(employee, 201);
});

// Get single employee — even if someone guesses another tenant's employee ID,
// RLS will return zero rows (not a forbidden error, just "not found")
app.get("/:id", async (c) => {
  const db = c.get("db");
  const { id } = c.req.param();

  const [employee] = await db.select().from(employees)
    .where(eq(employees.id, id));

  if (!employee) return c.json({ error: "Not found" }, 404);
  return c.json(employee);
});

// Update employee
app.patch("/:id", async (c) => {
  const db = c.get("db");
  const { id } = c.req.param();
  const updates = await c.req.json();

  const [updated] = await db.update(employees)
    .set(updates)
    .where(eq(employees.id, id))
    .returning();

  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

// Delete employee
app.delete("/:id", async (c) => {
  const db = c.get("db");
  const { id } = c.req.param();

  const [deleted] = await db.delete(employees)
    .where(eq(employees.id, id))
    .returning();

  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

export default app;
```

## Step 5: Add RLS Verification Tests

Automated tests verify that RLS actually prevents cross-tenant access. These run in CI to catch any RLS policy regressions.

```typescript
// src/__tests__/rls.test.ts — Verify tenant isolation at the database level
import { describe, it, expect, beforeAll } from "vitest";
import { withTenant, withTenantTransaction, getAdminDb } from "../db/tenant-context";
import { employees } from "../db/schema";
import { eq } from "drizzle-orm";

const TENANT_A = "aaaaaaaa-0000-0000-0000-000000000001";
const TENANT_B = "bbbbbbbb-0000-0000-0000-000000000002";

describe("Row-Level Security", () => {
  let employeeAId: string;
  let employeeBId: string;

  beforeAll(async () => {
    const admin = getAdminDb();
    // Seed test data using admin (bypasses RLS)
    const [empA] = await admin.insert(employees).values({
      name: "Alice", email: "alice@a.com", tenantId: TENANT_A, role: "engineer", salary: 100000,
    }).returning();
    const [empB] = await admin.insert(employees).values({
      name: "Bob", email: "bob@b.com", tenantId: TENANT_B, role: "designer", salary: 90000,
    }).returning();
    employeeAId = empA.id;
    employeeBId = empB.id;
  });

  it("tenant A can only see their own employees", async () => {
    await withTenant(TENANT_A, async (db) => {
      const result = await db.select().from(employees);
      expect(result.every((e) => e.tenantId === TENANT_A)).toBe(true);
      expect(result.find((e) => e.name === "Alice")).toBeDefined();
      expect(result.find((e) => e.name === "Bob")).toBeUndefined();
    });
  });

  it("tenant B cannot access tenant A employee by ID", async () => {
    await withTenant(TENANT_B, async (db) => {
      const result = await db.select().from(employees)
        .where(eq(employees.id, employeeAId));
      // RLS silently filters — returns empty, not an error
      expect(result).toHaveLength(0);
    });
  });

  it("tenant B cannot update tenant A employee", async () => {
    await withTenant(TENANT_B, async (db) => {
      const [updated] = await db.update(employees)
        .set({ salary: 999999 })
        .where(eq(employees.id, employeeAId))
        .returning();
      // No rows affected — RLS prevented the update
      expect(updated).toBeUndefined();
    });
  });

  it("cannot insert with mismatched tenant_id", async () => {
    await expect(
      withTenant(TENANT_A, async (db) => {
        await db.insert(employees).values({
          name: "Hacker", email: "h@x.com",
          tenantId: TENANT_B, // wrong tenant
          role: "admin", salary: 0,
        });
      })
    ).rejects.toThrow(); // RLS WITH CHECK blocks the insert
  });
});
```

## Results

After deploying RLS across all tenant-scoped tables:

- **Cross-tenant data exposure: mathematically impossible** — RLS policies run inside PostgreSQL; even SQL injection or application bugs cannot bypass tenant boundaries
- **SOC2 audit passed with zero findings** — the auditor specifically praised database-level isolation as exceeding the standard's requirements
- **Developer velocity improved** — new endpoints don't need manual `WHERE tenant_id = ?` clauses; the code is simpler and review is faster
- **Performance overhead: <1ms per query** — RLS policies on indexed `tenant_id` columns add negligible cost; the `set_config` call per request takes 0.2ms
- **Legal exposure eliminated** — the $85K breach notification scenario is no longer possible; customer data contracts now reference database-level isolation as a guarantee
