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

Converting a single-tenant application to multi-tenant — or designing multi-tenancy from scratch — involves dozens of interconnected decisions. Shared database or per-tenant? Row-level security or application-layer filtering? How do you handle tenant-specific customizations without forking the codebase? One wrong choice at the database layer means a painful migration later. Teams spend weeks researching patterns, and still end up with data leakage bugs when a query forgets the `WHERE tenant_id = ?` clause.

## The Solution

Use `saas-architecture-advisor` to evaluate tenancy strategies against your specific constraints (tenant count, data sensitivity, compliance needs), and `database-schema-designer` to generate the schema, middleware, and row-level security policies. The agent considers your scale, isolation requirements, and team size to recommend the right tradeoff.

```bash
npx terminal-skills install saas-architecture-advisor database-schema-designer
```

## Step-by-Step Walkthrough

### 1. Evaluate tenancy strategies for your context

```text
We're building a project management SaaS. Expected: 500 tenants in year 1,
scaling to 5,000. Most tenants are 5-20 users, but 3-5 enterprise clients
need strict data isolation for SOC2. Stack: Node.js, PostgreSQL, Redis.
Monthly budget for infrastructure: $3,000. Recommend a multi-tenancy strategy.
```

```text
Multi-Tenancy Strategy Analysis
───────────────────────────────

Option A: Shared Database, Shared Schema (tenant_id column)
  ✅ Simplest to implement and operate
  ✅ Lowest cost — single database handles all 5,000 tenants
  ✅ Easy cross-tenant analytics and admin queries
  ⚠  Every query must include tenant_id filter
  ⚠  One noisy tenant can impact others without rate limiting
  ❌ Enterprise clients may reject shared-table compliance audit

Option B: Shared Database, Separate Schemas (PostgreSQL schemas per tenant)
  ✅ Strong logical isolation — each tenant gets own tables
  ✅ PostgreSQL handles this natively with search_path
  ✅ Enterprise clients get auditable separation
  ⚠  Schema migrations run per-tenant (500+ migrations on deploy)
  ⚠  Connection pooling complexity (schema switching per request)
  ❌ At 5,000 tenants, schema count strains pg_catalog

Option C: Hybrid — Shared schema for standard + dedicated DB for enterprise
  ✅ Standard tenants: low cost, shared schema with RLS
  ✅ Enterprise tenants: dedicated database, full isolation
  ✅ SOC2-compliant for enterprise without overengineering standard tier
  ⚠  Two code paths for data access (manageable with repository pattern)
  Cost: ~$400/mo shared DB + ~$274/mo per enterprise DB (3-5 = $822-$1,370)

⟹ RECOMMENDATION: Option C (Hybrid)
  - 495+ standard tenants on shared DB with row-level security
  - 3-5 enterprise tenants on dedicated RDS instances
  - Total DB cost: ~$1,200-$1,770/mo (within budget)
  - Implement tenant routing at middleware layer
```

### 2. Generate the database schema with tenant isolation

```text
Generate the PostgreSQL schema for the hybrid approach. Include the shared
tenant table, row-level security policies, and the middleware pattern for
tenant context injection. Our main entities: projects, tasks, members, comments.
```

```sql
-- Tenant registry (always in shared DB)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(63) UNIQUE NOT NULL,
    tier VARCHAR(20) NOT NULL DEFAULT 'standard',  -- standard | enterprise
    database_url TEXT,  -- NULL for standard, connection string for enterprise
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Row-level security for shared tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Repeat for tasks, members, comments
-- Application sets tenant context per request:
-- SET LOCAL app.current_tenant_id = '<tenant-uuid>';
```

The agent also generates the Express middleware:

```typescript
// middleware/tenant-context.ts
export async function tenantContext(req: Request, res: Response, next: NextFunction) {
  const tenantSlug = req.headers['x-tenant-id'] || req.subdomains[0];
  const tenant = await tenantCache.get(tenantSlug);

  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  if (tenant.tier === 'enterprise' && tenant.databaseUrl) {
    req.db = getEnterprisePool(tenant.databaseUrl);
  } else {
    req.db = sharedPool;
    await req.db.query("SET LOCAL app.current_tenant_id = $1", [tenant.id]);
  }

  req.tenant = tenant;
  next();
}
```

### 3. Add tenant-aware data access patterns

```text
Generate a repository pattern that works transparently with both shared and
dedicated databases. Include examples for CRUD operations on projects and
handling tenant-specific feature flags.
```

### 4. Generate tenant onboarding and offboarding flows

```text
Create the tenant provisioning flow: when a new enterprise tenant signs up,
automatically create their dedicated database, run migrations, and configure
the routing. Include cleanup for tenant deletion with data export.
```

## Real-World Example

Marta, lead engineer at a 15-person startup building a client portal for accounting firms, faced a classic dilemma. Their app worked great for 20 beta clients on a single database. But their first enterprise prospect, a 200-person firm, required contractual data isolation for their compliance audit.

1. She asked the agent to evaluate tenancy strategies given 500 expected tenants with 3-5 needing strict isolation
2. The hybrid approach was recommended: shared database with PostgreSQL RLS for standard tenants, dedicated databases for enterprise
3. The agent generated the schema with row-level security policies, tenant-routing middleware, and a repository pattern that abstracted the two data paths
4. For enterprise onboarding, the agent produced a provisioning script that created a new RDS instance, ran migrations, and updated the tenant registry — all triggered by a single admin API call
5. The critical win: RLS policies caught two existing queries that were missing tenant filters during testing — preventing potential data leakage bugs before they reached production

The hybrid architecture launched within 3 weeks, supporting 120 standard tenants and 2 enterprise clients, with infrastructure costs under $1,500/month.
