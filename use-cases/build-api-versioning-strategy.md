---
title: Build an API Versioning Strategy
slug: build-api-versioning-strategy
description: Build a robust API versioning system supporting URL-based and header-based versioning, deprecation notices, migration guides, and backward-compatible schema evolution.
skills:
  - typescript
  - hono
  - zod
  - postgresql
category: Backend Development
tags:
  - api-versioning
  - api-design
  - backward-compatibility
  - deprecation
  - migration
---

# Build an API Versioning Strategy

## The Problem

Dani leads API development at a 40-person B2B company with 200+ API consumers. The team needs to change the user response format — splitting `name` into `firstName` and `lastName`. But changing the response would break every integration. Last time they changed an endpoint, 30 customers filed support tickets. They added a `v2` prefix once, but now have duplicated route handlers that drift apart. They need a versioning system that supports smooth transitions: serve old and new formats simultaneously, notify consumers about deprecations, and track who's still on old versions.

## Step 1: Build the Versioning Middleware

```typescript
// src/versioning/middleware.ts — API version resolution and routing
import { Context, Next, Hono } from "hono";

type ApiVersion = "2024-01-01" | "2024-06-01" | "2025-01-01";

const VERSIONS: ApiVersion[] = ["2024-01-01", "2024-06-01", "2025-01-01"];
const LATEST_VERSION: ApiVersion = "2025-01-01";
const DEPRECATED_VERSIONS: ApiVersion[] = ["2024-01-01"];
const SUNSET_DATES: Record<string, string> = {
  "2024-01-01": "2025-06-01",
};

// Resolve API version from request
export function versionMiddleware() {
  return async (c: Context, next: Next) => {
    let version: string | undefined;

    // Priority 1: URL path (/v2024-01-01/users)
    const pathMatch = c.req.path.match(/^\/v(\d{4}-\d{2}-\d{2})\//);
    if (pathMatch) {
      version = pathMatch[1];
      // Rewrite path to remove version prefix
      const newPath = c.req.path.replace(`/v${version}`, "");
      c.set("originalPath", c.req.path);
      c.set("path", newPath);
    }

    // Priority 2: Header
    if (!version) {
      version = c.req.header("API-Version") || c.req.header("X-API-Version");
    }

    // Priority 3: Query parameter
    if (!version) {
      version = c.req.query("api_version");
    }

    // Default to latest
    const resolvedVersion = (version && VERSIONS.includes(version as ApiVersion))
      ? version as ApiVersion
      : LATEST_VERSION;

    c.set("apiVersion", resolvedVersion);

    // Add deprecation headers
    if (DEPRECATED_VERSIONS.includes(resolvedVersion)) {
      c.header("Deprecation", "true");
      c.header("Sunset", SUNSET_DATES[resolvedVersion] || "");
      c.header("Link", `<https://api.example.com/docs/migration/${resolvedVersion}>; rel="deprecation"`);
    }

    c.header("API-Version", resolvedVersion);

    await next();
  };
}

// Version-aware response transformer
export function versionedResponse<T>(c: Context, data: T, transformers: Record<string, (data: T) => any>): Response {
  const version = c.get("apiVersion") as ApiVersion;
  const transformer = transformers[version];

  if (transformer) {
    return c.json(transformer(data));
  }

  return c.json(data);
}
```

## Step 2: Apply Versioned Transformations

```typescript
// src/routes/users.ts — Versioned user API
import { Hono } from "hono";
import { versionMiddleware, versionedResponse } from "../versioning/middleware";
import { pool } from "../db";

const app = new Hono();
app.use("*", versionMiddleware());

// Internal user representation (latest format)
interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  plan: string;
  createdAt: string;
  metadata: Record<string, any>;
}

app.get("/users/:id", async (c) => {
  const { rows: [user] } = await pool.query(
    "SELECT * FROM users WHERE id = $1",
    [c.req.param("id")]
  );

  if (!user) return c.json({ error: "User not found" }, 404);

  const internal: User = {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    plan: user.plan,
    createdAt: user.created_at,
    metadata: user.metadata || {},
  };

  // Transform based on API version
  return versionedResponse(c, internal, {
    // v2024-01-01: Old format with combined "name" field
    "2024-01-01": (u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,   // combined field (deprecated)
      email: u.email,
      plan: u.plan,
      created_at: u.createdAt,                 // snake_case (old convention)
    }),

    // v2024-06-01: Transition format with both old and new fields
    "2024-06-01": (u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,   // kept for backward compat
      firstName: u.firstName,                   // new field
      lastName: u.lastName,                     // new field
      email: u.email,
      plan: u.plan,
      createdAt: u.createdAt,                  // camelCase (new convention)
    }),

    // v2025-01-01: Latest format (firstName/lastName only, no combined name)
    "2025-01-01": (u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      plan: u.plan,
      createdAt: u.createdAt,
      metadata: u.metadata,
    }),
  });
});

// Track version usage for migration planning
app.use("*", async (c, next) => {
  await next();

  const version = c.get("apiVersion");
  const apiKey = c.req.header("Authorization")?.replace("Bearer ", "") || "anonymous";

  // Non-blocking tracking
  pool.query(
    `INSERT INTO api_version_usage (api_key, version, endpoint, method, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [apiKey.slice(0, 20), version, c.req.path, c.req.method]
  ).catch(() => {});
});

export default app;
```

## Step 3: Build the Version Usage Dashboard

```typescript
// src/routes/admin/versions.ts — Version usage analytics
import { Hono } from "hono";
import { pool } from "../../db";

const app = new Hono();

// Which API versions are consumers using?
app.get("/admin/api-versions/usage", async (c) => {
  const { rows } = await pool.query(`
    SELECT version, COUNT(DISTINCT api_key) as consumers,
           COUNT(*) as requests, MAX(created_at) as last_used
    FROM api_version_usage
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY version
    ORDER BY version DESC
  `);

  return c.json({ usage: rows });
});

// Which consumers are still on deprecated versions?
app.get("/admin/api-versions/deprecated-consumers", async (c) => {
  const { rows } = await pool.query(`
    SELECT api_key, version, COUNT(*) as requests, MAX(created_at) as last_request
    FROM api_version_usage
    WHERE version IN ('2024-01-01') AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY api_key, version
    ORDER BY requests DESC
  `);

  return c.json({ consumers: rows });
});

export default app;
```

## Results

- **Zero breaking changes for existing consumers** — the `name` → `firstName/lastName` migration happened transparently; v2024-01-01 consumers still receive the old format
- **Deprecation headers drive migration** — consumers see `Deprecation: true` and `Sunset` date headers; 80% migrated within 3 months without support intervention
- **Version usage tracking** — the admin dashboard shows exactly which consumers use which versions; the team contacts the remaining 12 consumers on v2024-01-01 directly
- **Transition version eases migration** — v2024-06-01 sends both `name` and `firstName/lastName`; consumers update their code at their own pace
- **No duplicated route handlers** — one route handler, versioned transformers; business logic stays in one place
