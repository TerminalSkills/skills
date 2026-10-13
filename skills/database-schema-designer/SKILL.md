---
name: database-schema-designer
description: >-
  Designs database schemas with proper normalization, indexing, constraints,
  and tenant isolation patterns. Use when someone needs to create a new
  database schema, add multi-tenant support, design row-level security
  policies, or optimize table structures. Trigger words: database schema,
  table design, RLS, row-level security, foreign keys, indexes, migrations,
  ERD, data model, normalization.
license: Apache-2.0
compatibility: "PostgreSQL 13+ (uuidv7() needs 18+); MySQL and SQLite for the table and index parts only, since row-level security is PostgreSQL-only"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["database", "schema-design", "postgresql", "data-modeling"]
---

# Database Schema Designer

## Overview

This skill designs database schemas from requirements, including table structures, relationships, indexes, constraints, row-level security policies, and migration scripts. It produces production-ready SQL with proper normalization and performance considerations.

## Instructions

### Step 1: Understand the Domain

Identify the core entities, their relationships, and access patterns:
- What are the main entities? (users, orders, products, etc.)
- What are the relationships? (one-to-many, many-to-many)
- What queries will be most frequent? (reads vs writes, filtering patterns)
- Is multi-tenancy needed? What isolation level?

### Step 2: Design the Schema

Apply these principles:
- **3NF by default** — normalize to third normal form unless denormalization is justified by read performance
- **UUIDs for public IDs** — use UUID v7 (time-ordered) for primary keys exposed to clients; serial for internal-only. On PostgreSQL 18+ use `DEFAULT uuidv7()`. On 13–17 `gen_random_uuid()` is built in but returns random v4 UUIDs, so generate v7 in the application or accept v4 (time-ordered keys index better)
- **Timestamps everywhere** — `created_at` and `updated_at` on all tables
- **Soft deletes when appropriate** — `deleted_at TIMESTAMPTZ` for recoverable records
- **JSONB for flexible fields** — use for tenant-specific settings, metadata, but not for frequently queried fields

### Step 3: Add Indexes

```sql
-- Always index foreign keys
CREATE INDEX idx_tasks_project_id ON tasks(project_id);

-- Composite indexes for common query patterns
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status) WHERE deleted_at IS NULL;

-- Partial indexes for filtered queries
CREATE INDEX idx_tasks_active ON tasks(assigned_to, due_date) WHERE status != 'done';
```

### Step 4: Implement Tenant Isolation (if multi-tenant)

For shared-database multi-tenancy:

```sql
-- Add tenant_id to all tenant-scoped tables
ALTER TABLE projects ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create isolation policy. The second argument (true) makes current_setting
-- return NULL instead of an error when the setting was never set. NULLIF also
-- maps the empty string left after a transaction-local setting ends to NULL.
-- Either way the comparison matches no rows (fail closed) instead of raising
-- "invalid input syntax for type uuid".
CREATE POLICY tenant_isolation ON projects
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

-- Ensure tenant_id is in composite indexes
CREATE INDEX idx_projects_tenant ON projects(tenant_id, created_at DESC);
```

Set the tenant inside each transaction, never with a plain `SET` on a pooled connection (the value would leak to the next request that reuses the connection):

```sql
BEGIN;
SELECT set_config('app.current_tenant_id', '3f6c2a1e-8b4d-4e7a-9c1f-5d2e8a7b6c40', true);
SELECT id, name FROM projects ORDER BY created_at DESC LIMIT 20;
COMMIT;
```

Enabling RLS on a table with no policy denies every row to non-bypass roles, so create the policy in the same migration as `ENABLE ROW LEVEL SECURITY`.

### Step 5: Generate Migration Files

Output as numbered migration files compatible with common tools:
```
migrations/
  001_create_tenants.sql
  002_create_users.sql
  003_create_projects.sql
  004_enable_rls_policies.sql
```

Each migration should be idempotent where possible (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

## Examples

### Example 1: Project Management Schema

**User prompt:**
```
Design a schema for a project management app with projects, tasks, members, and comments.
```

**Agent output:**
```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived', 'deleted')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
    priority SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 4),
    assigned_to UUID REFERENCES users(id),
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common access patterns
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_assigned_due ON tasks(assigned_to, due_date)
    WHERE status NOT IN ('done');
CREATE INDEX idx_tasks_tenant ON tasks(tenant_id, created_at DESC);
```

### Example 2: Adding RLS to Existing Tables

**User prompt:**
```
Add row-level security to our existing users and orders tables for multi-tenancy.
```

**Agent output:**
```sql
-- Step 1: Add tenant_id if missing
ALTER TABLE orders ADD COLUMN tenant_id UUID;
UPDATE orders SET tenant_id = (SELECT tenant_id FROM users WHERE users.id = orders.user_id);
ALTER TABLE orders ALTER COLUMN tenant_id SET NOT NULL;

-- Step 2: Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Step 3: Create policies (a policy with only USING also applies that
-- expression to INSERT and UPDATE rows, as if it were WITH CHECK)
CREATE POLICY tenant_orders ON orders FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

CREATE POLICY tenant_users ON users FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

-- Step 4: Admin role policy. Superusers and roles with BYPASSRLS skip RLS
-- entirely, and the table owner also skips it unless FORCE is set. Policies
-- are permissive and combine with OR, so this grants admin_role full access
-- while the tenant policy still applies to everyone else.
-- FORCE also subjects the owner (often the migration user) to the tenant
-- policy, so run migrations as a role that has BYPASSRLS or add the policy below.
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
CREATE POLICY admin_bypass ON orders FOR ALL TO admin_role USING (true) WITH CHECK (true);
```

## Guidelines

- **RLS policies must cover ALL operations** — use `FOR ALL` or create separate policies for SELECT, INSERT, UPDATE, DELETE
- **Test RLS thoroughly** — write integration tests that attempt cross-tenant access and verify it fails
- **Index tenant_id first in composite indexes** — PostgreSQL uses leftmost columns for index scans
- **Don't over-normalize** — if you always fetch user.name with orders, a denormalized `order.user_name` saves a JOIN on read-heavy tables
- **Use CHECK constraints** — they're free documentation and prevent invalid data at the database level
- **Foreign keys with ON DELETE** — always specify CASCADE, SET NULL, or RESTRICT explicitly
- **Consider partitioning at scale** — for tables exceeding 100M rows, partition by tenant_id or date range
