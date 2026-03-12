---
title: Build an Internal Tool with Low-Code Admin Panel
slug: build-internal-tool-with-low-code-admin-panel
description: >
  Replace 15 scattered admin scripts with a unified internal tool
  that operations teams can use without engineering help — CRUD
  interfaces, bulk actions, audit logs, and role-based access.
skills:
  - typescript
  - hono
  - postgresql
  - redis
  - zod
  - authjs
  - prisma
category: Full-Stack Development
tags:
  - admin-panel
  - internal-tools
  - crud
  - backoffice
  - operations
  - low-code
---

# Build an Internal Tool with Low-Code Admin Panel

## The Problem

An operations team of 8 people manages 50K customers using 15 different admin scripts, raw SQL queries, and shared Google Sheets. When support needs to refund a customer, they ask an engineer to run a script. User account issues require SSH access to production. Bulk operations (update 500 subscriptions) are done via CSV imports into a Jupyter notebook. No audit trail — when something goes wrong, nobody knows who did what. Engineering spends 15 hours/week running ops scripts.

## Step 1: Dynamic Resource Configuration

```typescript
// src/admin/resource-config.ts
import { z } from 'zod';

export const ResourceConfig = z.object({
  name: z.string(),
  table: z.string(),
  displayName: z.string(),
  icon: z.string().default('📄'),
  primaryKey: z.string().default('id'),
  searchableFields: z.array(z.string()),
  listFields: z.array(z.object({
    field: z.string(),
    label: z.string(),
    type: z.enum(['text', 'number', 'date', 'boolean', 'email', 'url', 'json', 'enum', 'relation']),
    sortable: z.boolean().default(false),
    filterable: z.boolean().default(false),
  })),
  editableFields: z.array(z.object({
    field: z.string(),
    label: z.string(),
    type: z.enum(['text', 'number', 'date', 'boolean', 'email', 'select', 'textarea', 'json']),
    required: z.boolean().default(false),
    options: z.array(z.string()).optional(),
    validation: z.string().optional(),
  })),
  actions: z.array(z.object({
    name: z.string(),
    label: z.string(),
    icon: z.string(),
    handler: z.string(),
    confirmation: z.string().optional(),
    bulk: z.boolean().default(false),
    requiredRole: z.string().default('admin'),
  })).default([]),
  permissions: z.object({
    read: z.array(z.string()).default(['admin', 'support']),
    create: z.array(z.string()).default(['admin']),
    update: z.array(z.string()).default(['admin', 'support']),
    delete: z.array(z.string()).default(['admin']),
  }).default({}),
});

export const resources: z.infer<typeof ResourceConfig>[] = [
  {
    name: 'users',
    table: 'users',
    displayName: 'Users',
    icon: '👤',
    primaryKey: 'id',
    searchableFields: ['email', 'name'],
    listFields: [
      { field: 'id', label: 'ID', type: 'text' },
      { field: 'email', label: 'Email', type: 'email', sortable: true, filterable: true },
      { field: 'name', label: 'Name', type: 'text', sortable: true },
      { field: 'plan', label: 'Plan', type: 'enum', filterable: true },
      { field: 'status', label: 'Status', type: 'enum', filterable: true },
      { field: 'created_at', label: 'Joined', type: 'date', sortable: true },
    ],
    editableFields: [
      { field: 'name', label: 'Name', type: 'text', required: true },
      { field: 'email', label: 'Email', type: 'email', required: true },
      { field: 'plan', label: 'Plan', type: 'select', options: ['free', 'starter', 'pro', 'enterprise'] },
      { field: 'status', label: 'Status', type: 'select', options: ['active', 'suspended', 'cancelled'] },
    ],
    actions: [
      { name: 'reset_password', label: 'Reset Password', icon: '🔑', handler: 'reset-password', confirmation: 'Send password reset email?' },
      { name: 'impersonate', label: 'Impersonate', icon: '👁️', handler: 'impersonate', requiredRole: 'admin' },
      { name: 'refund', label: 'Issue Refund', icon: '💰', handler: 'issue-refund', confirmation: 'Issue a full refund?', requiredRole: 'admin' },
      { name: 'export', label: 'Export CSV', icon: '📥', handler: 'export-csv', bulk: true },
    ],
    permissions: { read: ['admin', 'support'], create: ['admin'], update: ['admin', 'support'], delete: ['admin'] },
  },
  {
    name: 'subscriptions',
    table: 'subscriptions',
    displayName: 'Subscriptions',
    icon: '💳',
    primaryKey: 'id',
    searchableFields: ['user_email', 'stripe_id'],
    listFields: [
      { field: 'id', label: 'ID', type: 'text' },
      { field: 'user_email', label: 'Customer', type: 'email', sortable: true },
      { field: 'plan', label: 'Plan', type: 'enum', filterable: true },
      { field: 'status', label: 'Status', type: 'enum', filterable: true },
      { field: 'mrr_cents', label: 'MRR', type: 'number', sortable: true },
      { field: 'next_billing', label: 'Next Billing', type: 'date', sortable: true },
    ],
    editableFields: [
      { field: 'plan', label: 'Plan', type: 'select', options: ['starter', 'pro', 'enterprise'] },
      { field: 'status', label: 'Status', type: 'select', options: ['active', 'paused', 'cancelled'] },
    ],
    actions: [
      { name: 'cancel', label: 'Cancel', icon: '❌', handler: 'cancel-subscription', confirmation: 'Cancel this subscription?' },
      { name: 'extend_trial', label: 'Extend Trial', icon: '⏰', handler: 'extend-trial' },
    ],
    permissions: { read: ['admin', 'support', 'finance'], update: ['admin', 'finance'], create: [], delete: [] },
  },
];
```

## Step 2: Generic CRUD Engine

```typescript
// src/admin/crud-engine.ts
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function listRecords(config: any, options: {
  page: number; pageSize: number; sortBy?: string; sortOrder?: string;
  filters?: Record<string, string>; search?: string;
}): Promise<{ records: any[]; total: number }> {
  let sql = `SELECT * FROM ${config.table}`;
  const params: any[] = [];
  const conditions: string[] = [];
  let paramIdx = 1;

  // Search
  if (options.search && config.searchableFields.length > 0) {
    const searchConds = config.searchableFields.map((f: string) => `${f}::text ILIKE $${paramIdx}`);
    conditions.push(`(${searchConds.join(' OR ')})`);
    params.push(`%${options.search}%`);
    paramIdx++;
  }

  // Filters
  for (const [field, value] of Object.entries(options.filters ?? {})) {
    conditions.push(`${field} = $${paramIdx}`);
    params.push(value);
    paramIdx++;
  }

  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;

  // Count
  const countResult = await db.query(`SELECT COUNT(*) FROM (${sql}) t`, params);
  const total = parseInt(countResult.rows[0].count);

  // Sort & paginate
  if (options.sortBy) sql += ` ORDER BY ${options.sortBy} ${options.sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
  sql += ` LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  params.push(options.pageSize, (options.page - 1) * options.pageSize);

  const { rows } = await db.query(sql, params);
  return { records: rows, total };
}

export async function updateRecord(config: any, id: string, data: Record<string, any>, actorId: string): Promise<void> {
  const fields = Object.keys(data);
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const params = [id, ...Object.values(data)];

  await db.query(`UPDATE ${config.table} SET ${setClause} WHERE ${config.primaryKey} = $1`, params);

  // Audit log
  await db.query(`
    INSERT INTO admin_audit_log (actor_id, resource, record_id, action, changes, timestamp)
    VALUES ($1, $2, $3, 'update', $4, NOW())
  `, [actorId, config.name, id, JSON.stringify(data)]);
}
```

## Results

- **Engineering time**: 15 hours/week → 1 hour/week on ops tasks
- **Refund processing**: self-service for support team (was "ask an engineer")
- **Bulk operations**: UI-based, no more CSV + Jupyter workflows
- **Audit trail**: every action logged with who, what, when
- **Onboarding**: new ops team member productive in 1 day (was 2 weeks learning scripts)
- **Role-based access**: finance sees billing, support sees users, no data leaks
- **15 admin scripts**: replaced by one configurable interface
