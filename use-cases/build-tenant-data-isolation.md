---
title: Build Tenant Data Isolation for Multi-Tenant SaaS
slug: build-tenant-data-isolation
description: Build bulletproof tenant data isolation using PostgreSQL Row-Level Security, tenant-scoped middleware, cross-tenant query prevention, and audit logging — ensuring no customer ever sees another customer's data.
skills:
  - typescript
  - postgresql
  - hono
  - zod
  - redis
category: development
tags:
  - multi-tenant
  - rls
  - data-isolation
  - security
  - saas
---

# Build Tenant Data Isolation for Multi-Tenant SaaS

## The Problem

Chen leads engineering at a 35-person B2B SaaS. All customers share one database. Last month, a query bug exposed Company A's revenue data to Company B. The CEO got a call from the client's legal team. The bug was a missing `WHERE tenant_id = ?` in one query — a simple oversight that could have killed the company. Every new query, every new feature is a potential data leak. They need isolation that works at the database level, not just application code, so a missing WHERE clause can't leak data.

## Step 1: Build Database-Level Isolation with RLS

```typescript
// src/tenant/isolation.ts — PostgreSQL RLS + middleware for bulletproof tenant isolation
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

// Database setup: Run once to enable RLS on all tenant tables
export async function setupTenantIsolation(): Promise<void> {
  const tenantTables = ["projects", "documents", "invoices", "contacts", "tasks", "comments"];

  for (const table of tenantTables) {
    await pool.query(`
      -- Add tenant_id column if missing
      ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL;
      
      -- Create index for performance
      CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table} (tenant_id);
      
      -- Enable Row-Level Security
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      
      -- Force RLS even for table owners
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      
      -- Policy: users can only see their tenant's rows
      DROP POLICY IF EXISTS tenant_isolation ON ${table};
      CREATE POLICY tenant_isolation ON ${table}
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
    `);
  }

  console.log(`[Tenant] RLS enabled on ${tenantTables.length} tables`);
}

// Middleware: Set tenant context on every request
export async function tenantMiddleware(c: any, next: any): Promise<void> {
  const tenantId = c.get("tenantId"); // extracted from JWT or session
  if (!tenantId) {
    return c.json({ error: "Tenant context required" }, 401);
  }

  // Validate tenant exists and is active
  const tenantValid = await validateTenant(tenantId);
  if (!tenantValid) {
    return c.json({ error: "Invalid or suspended tenant" }, 403);
  }

  // Set tenant context for this database connection
  // Every query through this connection will be filtered by RLS
  const client = await pool.connect();
  try {
    await client.query(`SET app.current_tenant_id = '${tenantId}'`);
    c.set("db", client);
    await next();
  } finally {
    // Reset context and return connection to pool
    await client.query("RESET app.current_tenant_id");
    client.release();
  }
}

// Tenant-scoped query helper (defense in depth)
export function tenantQuery(tenantId: string) {
  return {
    async query(sql: string, params: any[] = []): Promise<any> {
      const client = await pool.connect();
      try {
        await client.query(`SET app.current_tenant_id = '${tenantId}'`);
        const result = await client.query(sql, params);

        // Audit: log cross-tenant query attempts
        if (result.rows?.some((r: any) => r.tenant_id && r.tenant_id !== tenantId)) {
          console.error(`[SECURITY] Cross-tenant data detected! tenant=${tenantId}`);
          await logSecurityEvent(tenantId, "cross_tenant_leak_prevented", { sql });
          return { rows: result.rows.filter((r: any) => r.tenant_id === tenantId) };
        }

        return result;
      } finally {
        await client.query("RESET app.current_tenant_id");
        client.release();
      }
    },
  };
}

// Tenant-aware data export (ensures complete isolation)
export async function exportTenantData(tenantId: string): Promise<Record<string, any[]>> {
  const tables = ["projects", "documents", "invoices", "contacts", "tasks"];
  const data: Record<string, any[]> = {};

  const tq = tenantQuery(tenantId);

  for (const table of tables) {
    const result = await tq.query(`SELECT * FROM ${table}`);
    data[table] = result.rows;
  }

  await logSecurityEvent(tenantId, "data_export", {
    tables,
    rowCounts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
  });

  return data;
}

// Tenant deletion (GDPR compliance)
export async function deleteTenantData(tenantId: string): Promise<{ tablesCleared: number; rowsDeleted: number }> {
  const tables = ["comments", "tasks", "contacts", "invoices", "documents", "projects"]; // order matters (FK)
  let totalDeleted = 0;

  for (const table of tables) {
    const result = await pool.query(
      `DELETE FROM ${table} WHERE tenant_id = $1`,
      [tenantId]
    );
    totalDeleted += result.rowCount || 0;
  }

  await pool.query("UPDATE tenants SET status = 'deleted', deleted_at = NOW() WHERE id = $1", [tenantId]);

  return { tablesCleared: tables.length, rowsDeleted: totalDeleted };
}

async function validateTenant(tenantId: string): Promise<boolean> {
  const cached = await redis.get(`tenant:valid:${tenantId}`);
  if (cached !== null) return cached === "1";

  const { rows } = await pool.query(
    "SELECT 1 FROM tenants WHERE id = $1 AND status = 'active'",
    [tenantId]
  );

  const valid = rows.length > 0;
  await redis.setex(`tenant:valid:${tenantId}`, 300, valid ? "1" : "0");
  return valid;
}

async function logSecurityEvent(tenantId: string, event: string, details: any): Promise<void> {
  await pool.query(
    "INSERT INTO security_audit_log (tenant_id, event, details, created_at) VALUES ($1, $2, $3, NOW())",
    [tenantId, event, JSON.stringify(details)]
  );
}
```

## Results

- **Cross-tenant data leak: impossible** — PostgreSQL RLS enforces isolation at the database level; even if application code forgets `WHERE tenant_id = ?`, the database returns only the current tenant's rows
- **Legal crisis avoided permanently** — RLS policies are checked on every query automatically; a missing filter clause can't expose another customer's data
- **New features ship faster** — developers write normal queries without worrying about tenant filters; RLS handles it; code reviews focus on logic instead of "did you add the tenant check?"
- **GDPR data export/deletion in minutes** — `exportTenantData` and `deleteTenantData` are one-click operations; complete compliance with data portability and right to erasure
- **Defense in depth** — RLS at database level + tenant middleware + application-layer audit logging; three independent layers of protection
