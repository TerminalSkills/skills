---
title: Build a SaaS App with SvelteKit and Turso
slug: build-saas-app-with-sveltekit-and-turso
description: Build a multi-tenant SaaS application using SvelteKit for the full-stack framework and Turso's database-per-tenant architecture for data isolation — with embedded replicas for sub-millisecond dashboard reads.
skills:
  - sveltekit
  - turso
  - upstash
category: development
tags:
  - saas
  - svelte
  - multi-tenant
  - sqlite
  - edge
---

# Build a SaaS App with SvelteKit and Turso

Priya is building a project management tool for freelancers. Each freelancer manages their own clients, invoices, and time entries — data that should never leak between accounts. Traditional multi-tenant approaches (row-level filtering with `WHERE tenant_id = ?`) have caused data leaks at two of her previous employers when developers forgot the filter. She wants hard isolation: each customer gets their own database, impossible to accidentally query another tenant's data.

## Step 1 — Set Up Database-Per-Tenant with Turso

Turso makes the database-per-tenant pattern practical. Creating a database takes 200ms via API. Each database is a full SQLite instance, replicated to the edge. A group shares the schema across all tenant databases.

```typescript
// src/lib/server/turso.ts — Tenant database management.
// Each signup creates a new Turso database in the "freelancer" group.
// All databases in the group share the same schema (applied via migrations).

import { createClient, type Client } from "@libsql/client";

const TURSO_ORG = process.env.TURSO_ORG!;
const TURSO_API_TOKEN = process.env.TURSO_API_TOKEN!;
const TURSO_GROUP = "freelancer";

// Cache database clients to avoid creating new connections per request
const clientCache = new Map<string, Client>();

export async function getTenantDb(tenantId: string): Promise<Client> {
  if (clientCache.has(tenantId)) {
    return clientCache.get(tenantId)!;
  }

  const dbName = `tenant-${tenantId}`;
  const client = createClient({
    url: `libsql://${dbName}-${TURSO_ORG}.turso.io`,
    authToken: process.env.TURSO_DB_TOKEN!,
    // Embedded replica: local SQLite copy for sub-millisecond reads
    // Writes go to Turso cloud, reads from local file
    syncUrl: `libsql://${dbName}-${TURSO_ORG}.turso.io`,
    syncInterval: 30,  // Sync every 30 seconds
  });

  clientCache.set(tenantId, client);
  return client;
}

export async function createTenantDb(tenantId: string): Promise<void> {
  const dbName = `tenant-${tenantId}`;

  // Create database in the group via Turso Platform API
  const response = await fetch(
    `https://api.turso.tech/v1/organizations/${TURSO_ORG}/databases`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TURSO_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: dbName,
        group: TURSO_GROUP,  // Inherits schema from group
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to create database: ${await response.text()}`);
  }

  // Seed default data for new tenant
  const db = await getTenantDb(tenantId);
  await db.batch([
    {
      sql: `INSERT INTO settings (key, value) VALUES ('currency', 'USD'), ('tax_rate', '0'), ('invoice_prefix', 'INV')`,
      args: [],
    },
    {
      sql: `INSERT INTO categories (name, color) VALUES ('Development', '#3B82F6'), ('Design', '#8B5CF6'), ('Consulting', '#10B981')`,
      args: [],
    },
  ]);
}

export async function deleteTenantDb(tenantId: string): Promise<void> {
  const dbName = `tenant-${tenantId}`;
  clientCache.delete(tenantId);

  await fetch(
    `https://api.turso.tech/v1/organizations/${TURSO_ORG}/databases/${dbName}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TURSO_API_TOKEN}` },
    }
  );
}
```

The embedded replica is the performance trick. Dashboard pages that show invoices, time entries, and project summaries read from a local SQLite file — 0.1ms per query instead of 15ms over the network. The replica syncs every 30 seconds, which is fine for a single-user SaaS where the user creates the data they're reading.

## Step 2 — Build the Authentication Hook

SvelteKit's `handle` hook runs on every request. It validates the session, resolves the tenant, and attaches the tenant-scoped database client to `event.locals` — making it available to every page and API route.

```typescript
// src/hooks.server.ts — Server hooks for auth and tenant resolution.
// Every request goes through this chain: validate session → resolve tenant →
// attach tenant database to locals. Route handlers never see other tenants.

import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { getTenantDb } from "$lib/server/turso";
import { validateSession } from "$lib/server/auth";

const authHandle: Handle = async ({ event, resolve }) => {
  const sessionToken = event.cookies.get("session");

  if (!sessionToken) {
    event.locals.user = null;
    event.locals.db = null;
    return resolve(event);
  }

  const session = await validateSession(sessionToken);
  if (!session) {
    // Invalid session — clear the cookie
    event.cookies.delete("session", { path: "/" });
    event.locals.user = null;
    event.locals.db = null;
    return resolve(event);
  }

  event.locals.user = session.user;

  // Attach tenant-scoped database — route handlers can only access this tenant's data
  event.locals.db = await getTenantDb(session.user.tenantId);

  return resolve(event);
};

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
};

export const handle = sequence(authHandle, securityHeaders);
```

```typescript
// src/app.d.ts — Type declarations for locals.
// This ensures every route handler knows exactly what's available.

import type { Client } from "@libsql/client";

declare global {
  namespace App {
    interface Locals {
      user: { id: string; email: string; name: string; tenantId: string } | null;
      db: Client | null;
    }
  }
}
```

## Step 3 — Build Dashboard with Server-Side Data Loading

SvelteKit's `+page.server.ts` loads data on the server. The tenant database is already scoped by the hook — there's no way to accidentally query another tenant's data, even if a developer forgets a WHERE clause.

```typescript
// src/routes/(app)/dashboard/+page.server.ts — Dashboard data loader.
// All queries hit the tenant-scoped database from event.locals.db.
// No tenant_id filters needed — it's a separate database.

import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || !locals.db) redirect(303, "/login");

  const db = locals.db;

  // These three queries run against the tenant's own database
  // No WHERE tenant_id = ? needed — impossible to see other tenants' data
  const [revenueResult, projectsResult, recentEntries] = await Promise.all([
    // Revenue this month
    db.execute({
      sql: `SELECT
              COALESCE(SUM(amount_cents), 0) as revenue,
              COUNT(*) as invoice_count
            FROM invoices
            WHERE status = 'paid'
              AND paid_at >= date('now', 'start of month')`,
      args: [],
    }),

    // Active projects with hours logged
    db.execute({
      sql: `SELECT p.id, p.name, p.client_name, p.hourly_rate,
              COALESCE(SUM(t.duration_minutes), 0) as total_minutes,
              COUNT(t.id) as entry_count
            FROM projects p
            LEFT JOIN time_entries t ON t.project_id = p.id
              AND t.date >= date('now', '-30 days')
            WHERE p.status = 'active'
            GROUP BY p.id
            ORDER BY total_minutes DESC`,
      args: [],
    }),

    // Recent time entries for the activity feed
    db.execute({
      sql: `SELECT t.id, t.description, t.duration_minutes, t.date,
              p.name as project_name, p.client_name
            FROM time_entries t
            JOIN projects p ON p.id = t.project_id
            ORDER BY t.date DESC, t.created_at DESC
            LIMIT 10`,
      args: [],
    }),
  ]);

  const revenue = revenueResult.rows[0];

  return {
    stats: {
      revenue: Number(revenue.revenue),
      invoiceCount: Number(revenue.invoice_count),
    },
    projects: projectsResult.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      clientName: row.client_name as string,
      hourlyRate: Number(row.hourly_rate),
      totalHours: Math.round(Number(row.total_minutes) / 6) / 10,  // Round to 1 decimal
      entryCount: Number(row.entry_count),
    })),
    recentEntries: recentEntries.rows,
  };
};
```

```svelte
<!-- src/routes/(app)/dashboard/+page.svelte — Dashboard UI. -->
<!-- Svelte compiles this to vanilla JS — no virtual DOM, no React runtime. -->
<!-- The `data` prop is type-safe, matching the return type of +page.server.ts. -->

<script lang="ts">
  import type { PageData } from "./$types";
  import { formatCurrency, formatHours } from "$lib/utils";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Dashboard — Freelance Tracker</title>
</svelte:head>

<div class="space-y-8">
  <h1 class="text-2xl font-bold">Dashboard</h1>

  <!-- Stats cards -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <div class="rounded-xl border bg-white p-6 shadow-sm">
      <p class="text-sm text-gray-500">Revenue this month</p>
      <p class="mt-1 text-3xl font-bold text-green-600">
        {formatCurrency(data.stats.revenue)}
      </p>
      <p class="text-sm text-gray-400">{data.stats.invoiceCount} invoices paid</p>
    </div>

    <div class="rounded-xl border bg-white p-6 shadow-sm">
      <p class="text-sm text-gray-500">Active projects</p>
      <p class="mt-1 text-3xl font-bold">{data.projects.length}</p>
    </div>

    <div class="rounded-xl border bg-white p-6 shadow-sm">
      <p class="text-sm text-gray-500">Hours this month</p>
      <p class="mt-1 text-3xl font-bold">
        {data.projects.reduce((sum, p) => sum + p.totalHours, 0).toFixed(1)}
      </p>
    </div>
  </div>

  <!-- Active projects -->
  <section>
    <h2 class="mb-4 text-lg font-semibold">Active Projects</h2>
    <div class="space-y-3">
      {#each data.projects as project (project.id)}
        <a href="/projects/{project.id}" class="block rounded-lg border p-4 hover:bg-gray-50 transition-colors">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-medium">{project.name}</p>
              <p class="text-sm text-gray-500">{project.clientName}</p>
            </div>
            <div class="text-right">
              <p class="font-medium">{formatHours(project.totalHours)}</p>
              <p class="text-sm text-gray-400">{project.entryCount} entries</p>
            </div>
          </div>
        </a>
      {/each}
    </div>
  </section>

  <!-- Recent time entries -->
  <section>
    <h2 class="mb-4 text-lg font-semibold">Recent Activity</h2>
    <div class="space-y-2">
      {#each data.recentEntries as entry (entry.id)}
        <div class="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <div>
            <p class="text-sm font-medium">{entry.description || "No description"}</p>
            <p class="text-xs text-gray-500">{entry.project_name} · {entry.client_name}</p>
          </div>
          <div class="text-right">
            <p class="text-sm font-medium">{formatHours(Number(entry.duration_minutes) / 60)}</p>
            <p class="text-xs text-gray-400">{entry.date}</p>
          </div>
        </div>
      {/each}
    </div>
  </section>
</div>
```

## Step 4 — Handle Forms with Progressive Enhancement

SvelteKit form actions process form submissions on the server. The time entry form works without JavaScript (pure HTML form post), then enhances with `use:enhance` for a smoother experience when JavaScript is available.

```typescript
// src/routes/(app)/time/+page.server.ts — Time entry form actions.
// The create action validates input, inserts into the tenant database,
// and redirects. If validation fails, it returns errors without redirecting.

import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types";

const TimeEntrySchema = z.object({
  projectId: z.string().min(1, "Select a project"),
  description: z.string().max(500).optional(),
  date: z.string().date(),
  hours: z.coerce.number().min(0.1).max(24),
  minutes: z.coerce.number().int().min(0).max(59).default(0),
});

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.db) redirect(303, "/login");

  const projects = await locals.db.execute({
    sql: "SELECT id, name, client_name FROM projects WHERE status = 'active' ORDER BY name",
    args: [],
  });

  const entries = await locals.db.execute({
    sql: `SELECT t.*, p.name as project_name
          FROM time_entries t
          JOIN projects p ON p.id = t.project_id
          WHERE t.date >= date('now', '-7 days')
          ORDER BY t.date DESC, t.created_at DESC`,
    args: [],
  });

  return { projects: projects.rows, entries: entries.rows };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.db) redirect(303, "/login");

    const formData = Object.fromEntries(await request.formData());
    const parsed = TimeEntrySchema.safeParse(formData);

    if (!parsed.success) {
      return fail(400, {
        errors: parsed.error.flatten().fieldErrors,
        values: formData,
      });
    }

    const { projectId, description, date, hours, minutes } = parsed.data;
    const durationMinutes = Math.round(hours * 60 + minutes);

    await locals.db.execute({
      sql: `INSERT INTO time_entries (id, project_id, description, date, duration_minutes, created_at)
            VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, datetime('now'))`,
      args: [projectId, description || null, date, durationMinutes],
    });

    // Force sync embedded replica so the new entry appears immediately
    await locals.db.sync();

    return { success: true };
  },

  delete: async ({ request, locals }) => {
    if (!locals.db) redirect(303, "/login");

    const formData = await request.formData();
    const entryId = formData.get("entryId") as string;

    await locals.db.execute({
      sql: "DELETE FROM time_entries WHERE id = ?",
      args: [entryId],
    });

    await locals.db.sync();
    return { success: true };
  },
};
```

The `await locals.db.sync()` after writes is important for embedded replicas. Without it, the redirect back to the page would read from the local replica, which might not have the new entry yet (it syncs every 30 seconds). The explicit sync ensures the user sees their change immediately.

## Results

Priya launched the freelancer tool in three weeks. After two months with 200 paying customers:

- **Zero data leaks** — database-per-tenant means there's no WHERE clause to forget. A developer literally cannot query another tenant's data because they never have a connection to that database.
- **Dashboard loads in 80ms** — embedded replicas serve all read queries from a local SQLite file. Three SQL queries execute in 0.3ms total (vs 45ms each over the network).
- **Monthly cost: $15** for 200 tenants — Turso's free tier covers 500 databases. The $15 covers additional compute and storage. Compare to a shared PostgreSQL RDS instance at $30+/month.
- **Bundle size: 38KB JavaScript** — SvelteKit ships about one-third the JS of an equivalent Next.js app. Pages render server-side and navigate client-side with minimal overhead.
- **Form submissions work without JS** — two customers use NoScript browser extensions. The time entry form works identically because SvelteKit form actions are standard HTML form posts.
- **Tenant deletion is instant** — deleting a customer account means dropping their database. No `DELETE FROM ... WHERE tenant_id = ?` across 20 tables.
- **New tenant onboarding: 400ms** — database creation (200ms) + seed data (200ms). Customers start using the app within seconds of signing up.
