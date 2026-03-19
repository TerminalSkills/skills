---
title: Build a Globally Distributed API with Hono + Turso on Cloudflare Workers
slug: build-edge-api-with-hono-turso
description: Build a type-safe, globally distributed REST API using Hono RPC and Turso database that runs on Cloudflare Workers with sub-50ms response times worldwide.
skills:
  - hono
  - turso
  - cloudflare
category: development
tags:
  - hono
  - turso
  - drizzle
  - cloudflare-workers
  - edge
  - type-safe
  - sqlite
  - rpc
---

## The Problem

Sasha is building a SaaS product with a global user base. The API runs on a single Node.js server in US-East, and users in Europe and Asia consistently see 300–600ms latency. Moving to a traditional multi-region setup means managing database replication, connection pooling, and multiple deployments. It's too complex for a solo developer who needs to ship fast.

Sasha needs an API that:
- Runs at the edge, close to every user
- Has a real database — not just KV storage
- Is fully type-safe between frontend and backend
- Can be deployed in minutes with a single command

## The Solution

Combine three tools:

- **Hono RPC** — type-safe REST API that runs on Cloudflare Workers
- **Turso** — globally replicated SQLite database with HTTP API (edge-compatible)
- **Drizzle ORM** — type-safe SQL queries with schema-first migrations

## Step-by-Step Walkthrough

### Step 1: Create the Cloudflare Workers project

```bash
npm create cloudflare@latest my-edge-api -- --type hello-world
cd my-edge-api
npm install hono drizzle-orm @libsql/client zod @hono/zod-validator
npm install -D drizzle-kit wrangler
```

### Step 2: Create and configure the Turso database

```bash
# Install Turso CLI and authenticate
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login

# Create the database
turso db create my-edge-api

# Get connection details
turso db show my-edge-api --url
# → libsql://my-edge-api-sasha.turso.io

turso db tokens create my-edge-api
# → eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...

# Store the token as a Workers secret
npx wrangler secret put TURSO_AUTH_TOKEN
```

Set the URL in `wrangler.toml`:

```toml
# wrangler.toml
name = "my-edge-api"
main = "src/index.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[vars]
TURSO_DATABASE_URL = "libsql://my-edge-api-sasha.turso.io"
```

### Step 3: Define the database schema with Drizzle

```typescript
// src/db/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(), // cents
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  items: many(items),
}));

export const itemsRelations = relations(items, ({ one }) => ({
  owner: one(users, { fields: [items.ownerId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
```

Configure drizzle-kit:

```typescript
// drizzle.config.ts
import type { Config } from "drizzle-kit";
import "dotenv/config";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
} satisfies Config;
```

Generate and apply migrations:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### Step 4: Build the type-safe Hono RPC server

```typescript
// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createClient } from "@libsql/client/http";
import { drizzle } from "drizzle-orm/libsql";
import { eq, desc } from "drizzle-orm";
import * as schema from "./db/schema";

type Env = {
  Bindings: {
    TURSO_DATABASE_URL: string;
    TURSO_AUTH_TOKEN: string;
  };
};

// Helper to create a DB connection per request
function getDB(env: Env["Bindings"]) {
  const client = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
  return drizzle(client, { schema });
}

// Schemas
const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const createItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().int().positive(),
  ownerId: z.number().int(),
});

const app = new Hono<Env>();

// Middleware
app.use("*", logger());
app.use("/api/*", cors({ origin: "*", allowMethods: ["GET", "POST", "DELETE"] }));

// Routes — chained for Hono RPC type inference
const routes = app
  // Health check
  .get("/health", (c) => c.json({ status: "ok", region: c.req.raw.cf?.colo ?? "unknown" }))

  // Users
  .get("/api/users", async (c) => {
    const db = getDB(c.env);
    const users = await db
      .select()
      .from(schema.users)
      .orderBy(desc(schema.users.createdAt));
    return c.json({ users });
  })
  .post(
    "/api/users",
    zValidator("json", createUserSchema),
    async (c) => {
      const db = getDB(c.env);
      const data = c.req.valid("json");
      const [user] = await db
        .insert(schema.users)
        .values(data)
        .returning();
      return c.json({ user }, 201);
    }
  )
  .get("/api/users/:id", async (c) => {
    const db = getDB(c.env);
    const id = Number(c.req.param("id"));
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id));
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json({ user });
  })

  // Items
  .get("/api/items", async (c) => {
    const db = getDB(c.env);
    const items = await db
      .select({
        id: schema.items.id,
        name: schema.items.name,
        price: schema.items.price,
        ownerName: schema.users.name,
      })
      .from(schema.items)
      .innerJoin(schema.users, eq(schema.items.ownerId, schema.users.id))
      .orderBy(desc(schema.items.createdAt));
    return c.json({ items });
  })
  .post(
    "/api/items",
    zValidator("json", createItemSchema),
    async (c) => {
      const db = getDB(c.env);
      const data = c.req.valid("json");
      const [item] = await db
        .insert(schema.items)
        .values(data)
        .returning();
      return c.json({ item }, 201);
    }
  )
  .delete("/api/items/:id", async (c) => {
    const db = getDB(c.env);
    const id = Number(c.req.param("id"));
    await db.delete(schema.items).where(eq(schema.items.id, id));
    return c.json({ deleted: id });
  });

// Export AppType for the client
export type AppType = typeof routes;
export default app;
```

### Step 5: Create the type-safe client

```typescript
// packages/web/src/api.ts (or any frontend project)
import { hc } from "hono/client";
import type { AppType } from "../../my-edge-api/src/index";

export const api = hc<AppType>(import.meta.env.VITE_API_URL);

// Usage — fully typed, no manual type definitions
async function loadItems() {
  const res = await api.api.items.$get();
  const { items } = await res.json();
  // items: { id: number; name: string; price: number; ownerName: string }[]
  return items;
}

async function createUser(name: string, email: string) {
  const res = await api.api.users.$post({
    json: { name, email }, // Type-checked at compile time
  });
  if (!res.ok) throw new Error("Failed to create user");
  const { user } = await res.json();
  return user;
}
```

### Step 6: Deploy to Cloudflare Workers

```bash
# Local development
npx wrangler dev

# Deploy to production
npx wrangler deploy

# Output:
# Published my-edge-api (1.23 sec)
# https://my-edge-api.your-subdomain.workers.dev
```

The API is now running on Cloudflare's 300+ edge locations worldwide.

## Results

After deployment, Sasha's API achieves:

| Region | Latency (before) | Latency (after) |
|---|---|---|
| US East | 45ms | 12ms |
| Europe | 380ms | 18ms |
| Asia Pacific | 520ms | 22ms |
| South America | 490ms | 28ms |

**Key wins:**
- **< 50ms globally** — Cloudflare Workers run in 300+ locations
- **Type-safe end-to-end** — backend type changes immediately surface as frontend errors
- **Zero infrastructure** — no servers, load balancers, or connection pools to manage
- **Single deployment command** — `wrangler deploy` pushes to all regions at once
- **SQLite in production** — Turso handles replication and global reads automatically

## Tips

- Use `@libsql/client/http` (not `@libsql/client`) on Cloudflare Workers — native bindings don't work in the Workers runtime.
- Export `AppType` from the server entry point and import it in the client with `import type` — it's a type-only import, zero runtime cost.
- Use `c.req.raw.cf?.colo` in a Cloudflare Worker to see which edge location handled the request.
- Run `npx drizzle-kit studio` to browse and edit your Turso database with a visual UI.
- Use `wrangler secret put TURSO_AUTH_TOKEN` to store the database token — never put it in `wrangler.toml`.
