---
title: Build a Globally Distributed API with Hono + Turso on Cloudflare Workers
slug: build-edge-api-with-hono-turso
description: Build a type-safe, globally distributed REST API using Hono RPC and Turso database that runs on Cloudflare Workers close to your users.
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

Sasha is building a SaaS product with a global user base. The API runs on a single Node.js server in US-East, and users in Europe and Asia consistently wait several hundred milliseconds per request. Moving to a traditional multi-region setup means managing database replication, connection pooling, and multiple deployments. It's too complex for a solo developer who needs to ship fast.

Sasha needs an API that:
- Runs at the edge, close to every user
- Has a real database, not just KV storage
- Is fully type-safe between frontend and backend
- Can be deployed in minutes with a single command

## The Solution

Combine three tools:

- **Hono RPC** for a type-safe REST API that runs on Cloudflare Workers
- **Turso** for a SQLite-compatible (libSQL) database that Workers reach over HTTP
- **Drizzle ORM** for type-safe queries and schema-first migrations

The code below was type-checked with TypeScript, the migrations were generated and applied to a local SQLite file with drizzle-kit, and the Worker was built and started with `wrangler dev`. Calls to a real Turso database were not run.

## Step-by-Step Walkthrough

### Step 1: Create the Worker project

```bash
mkdir my-edge-api && cd my-edge-api
npm init -y
npm install hono drizzle-orm @libsql/client zod @hono/zod-validator
npm install -D drizzle-kit wrangler typescript dotenv @cloudflare/workers-types
```

Create `wrangler.jsonc` (new Wrangler projects use JSON config by default; `wrangler.toml` still works):

```jsonc
{
  "name": "my-edge-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-01",
  "vars": {
    "TURSO_DATABASE_URL": "libsql://my-edge-api-your-org.turso.io"
  }
}
```

A minimal `tsconfig.json` with `"types": ["@cloudflare/workers-types"]` gives you the `Request.cf` type used in the health check.

### Step 2: Create the Turso database

Install the Turso CLI with Homebrew (`brew install tursodatabase/tap/turso`, also available on Linux), or download the release archive from <https://github.com/tursodatabase/turso-cli/releases> and check it against `checksums.txt` from the same release before unpacking it. Then:

```bash
turso auth login
turso db create my-edge-api
turso db show my-edge-api --url          # libsql://my-edge-api-<your-org>.turso.io
turso db tokens create my-edge-api       # prints the auth token
```

Put the URL into `vars` in `wrangler.jsonc`, and store the token as a secret rather than in the file:

```bash
npx wrangler secret put TURSO_AUTH_TOKEN
```

For `wrangler dev`, put `TURSO_AUTH_TOKEN=...` in a `.dev.vars` file and keep it out of git.

### Step 3: Define the schema with Drizzle

```typescript
// src/db/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export type User = typeof users.$inferSelect;
export type Item = typeof items.$inferSelect;
```

```typescript
// drizzle.config.ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
```

drizzle-kit reads the credentials from your environment (or a `.env` file, via `dotenv`). Generate and apply the migration:

```bash
export TURSO_DATABASE_URL="libsql://my-edge-api-<your-org>.turso.io"
export TURSO_AUTH_TOKEN="<token from turso db tokens create>"
npx drizzle-kit generate
npx drizzle-kit migrate
```

### Step 4: Build the type-safe Hono server

```typescript
// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql";
import { eq, desc } from "drizzle-orm";
import * as schema from "./db/schema";

type Env = {
  Bindings: { TURSO_DATABASE_URL: string; TURSO_AUTH_TOKEN: string };
};

// The web client talks to Turso over fetch/WebSocket, which Workers support
function getDB(env: Env["Bindings"]) {
  const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  return drizzle(client, { schema });
}

const createUserSchema = z.object({ name: z.string().min(1), email: z.email() });

const createItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().int().positive(),
  ownerId: z.number().int(),
});

const app = new Hono<Env>();

app.use("*", logger());
app.use("/api/*", cors({ origin: ["https://app.example.com"], allowMethods: ["GET", "POST", "DELETE"] }));

// Chain the routes so the exported type carries every path for the RPC client
const routes = app
  .get("/health", (c) => c.json({ status: "ok", colo: c.req.raw.cf?.colo ?? "unknown" }))

  .get("/api/users", async (c) => {
    const users = await getDB(c.env).select().from(schema.users).orderBy(desc(schema.users.createdAt));
    return c.json({ users });
  })
  .post("/api/users", zValidator("json", createUserSchema), async (c) => {
    const [user] = await getDB(c.env).insert(schema.users).values(c.req.valid("json")).returning();
    return c.json({ user }, 201);
  })
  .get("/api/users/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const [user] = await getDB(c.env).select().from(schema.users).where(eq(schema.users.id, id));
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json({ user });
  })

  .get("/api/items", async (c) => {
    const items = await getDB(c.env)
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
  .post("/api/items", zValidator("json", createItemSchema), async (c) => {
    const [item] = await getDB(c.env).insert(schema.items).values(c.req.valid("json")).returning();
    return c.json({ item }, 201);
  })
  .delete("/api/items/:id", async (c) => {
    const id = Number(c.req.param("id"));
    await getDB(c.env).delete(schema.items).where(eq(schema.items.id, id));
    return c.json({ deleted: id });
  });

export type AppType = typeof routes;
export default app;
```

Chaining the routes onto one expression is what lets `typeof routes` carry every path, method, validator and response shape to the client. On Workers use `@libsql/client/web`; the default entry point loads native Node bindings that Workers do not have. The CORS origin is a placeholder; list your real frontend origin.

### Step 5: Call it from the frontend with full types

```typescript
// src/client.ts (or any frontend project that can import the type)
import { hc } from "hono/client";
import type { AppType } from "./index";

const API_URL = "<your workers.dev URL>"; // or your frontend's env variable
export const api = hc<AppType>(API_URL);

export async function loadItems() {
  const res = await api.api.items.$get();
  const { items } = await res.json(); // { id: number; name: string; price: number; ownerName: string }[]
  return items;
}

export async function createUser(name: string, email: string) {
  const res = await api.api.users.$post({ json: { name, email } }); // checked at compile time
  if (!res.ok) throw new Error("Failed to create user");
  const { user } = await res.json();
  return user;
}
```

Import `AppType` with `import type`, so nothing from the server ends up in the frontend bundle.

### Step 6: Run locally and deploy

```bash
npx wrangler dev        # http://127.0.0.1:8787/health
npx wrangler deploy     # prints the https://my-edge-api.<subdomain>.workers.dev URL
```

`wrangler deploy` publishes to Cloudflare's global network, so a request is handled by a data center near the user.

## Real-World Example

Sasha ships the API and points the web app at the workers.dev URL. Compute now runs near every user, so the TLS handshake, routing and JSON handling no longer cross an ocean. The database is the part to measure: a Turso database lives in the locations you chose when you created it (see `turso db locations`), so a request from a far-away region still makes one round trip to the nearest database location. Sasha puts the database in the region where most writes come from, tests latency from the regions that matter with `curl -w '%{time_total}'`, and adds a Turso location (a replica) in another region only if the numbers call for it.

## Tips

- Use `@libsql/client/web` on Cloudflare Workers; drizzle's `drizzle-orm/libsql` driver accepts that client.
- `c.req.raw.cf?.colo` tells you which Cloudflare data center handled the request.
- `npx drizzle-kit studio` opens a visual browser for the database.
- Add authentication before exposing write routes; the `DELETE /api/items/:id` above lets anyone delete any row. Hono ships `hono/bearer-auth` and `hono/jwt` middleware for this.
- Never put the database token in `wrangler.jsonc`; use `wrangler secret put` for production and `.dev.vars` locally.

## Related Skills

- `hono` -- routing, middleware and the typed RPC client
- `turso` -- creating databases, tokens and replicas
- `cloudflare` -- Workers, Wrangler configuration and secrets
