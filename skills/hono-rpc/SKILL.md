---
name: hono-rpc
description: >-
  Hono RPC — end-to-end type-safe API client for the Hono web framework. Use
  when building type-safe REST APIs with Hono, sharing types between frontend
  and backend, or replacing tRPC with a REST-compatible approach. Works on
  Cloudflare Workers, Deno, Bun, and Node.js.
license: Apache-2.0
compatibility: "Hono 4.x. Works on Cloudflare Workers, Deno, Bun, Node.js."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: backend
  tags: ["hono", "rpc", "type-safe", "cloudflare-workers", "api", "typescript"]
  use-cases:
    - "Build a type-safe REST API with Hono RPC and share types with the frontend"
    - "Replace tRPC with Hono RPC for a REST-compatible type-safe API"
    - "Create a Cloudflare Workers API with full type inference on the client"
    - "Validate API inputs with Zod middleware and propagate types to the client"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Hono RPC

## Overview

Hono RPC provides end-to-end type safety between a Hono server and its clients. Define routes with typed validators on the server, export the `AppType`, and use the `hc` client to make fully type-safe HTTP calls from the frontend or another service — no code generation, no schema files.

## Installation

```bash
# npm / Node.js
npm install hono
npm install zod @hono/zod-validator

# Bun
bun add hono zod @hono/zod-validator

# Deno (deno.json imports)
# "hono": "jsr:@hono/hono@^4"
```

## Server Setup

### Basic Route Definition

```typescript
// src/server.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const app = new Hono();

// Define a route with typed response
const route = app.get("/hello", (c) => {
  return c.json({ message: "Hello, Hono!" });
});

export type AppType = typeof route;
export default app;
```

### Full API with Multiple Routes

```typescript
// src/server.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// Schemas
const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

const updateUserSchema = createUserSchema.partial();

// Router
const users = new Hono()
  .get("/", (c) => {
    const users = [{ id: 1, name: "Alice", email: "alice@example.com" }];
    return c.json({ users });
  })
  .get("/:id", (c) => {
    const id = Number(c.req.param("id"));
    return c.json({ user: { id, name: "Alice", email: "alice@example.com" } });
  })
  .post(
    "/",
    zValidator("json", createUserSchema),
    async (c) => {
      const data = c.req.valid("json"); // Fully typed
      const user = { id: Date.now(), ...data };
      return c.json({ user }, 201);
    }
  )
  .patch(
    "/:id",
    zValidator("json", updateUserSchema),
    async (c) => {
      const id = Number(c.req.param("id"));
      const data = c.req.valid("json");
      return c.json({ user: { id, ...data } });
    }
  )
  .delete("/:id", (c) => {
    const id = Number(c.req.param("id"));
    return c.json({ deleted: id });
  });

const app = new Hono().route("/users", users);

// Export the type — this is the key to Hono RPC
export type AppType = typeof app;
export default app;
```

## Client Usage

```typescript
// src/client.ts
import { hc } from "hono/client";
import type { AppType } from "./server";

// Create the typed client
const client = hc<AppType>("http://localhost:3000");

// All calls are fully type-safe
async function main() {
  // GET /users — response is typed
  const res = await client.users.$get();
  const { users } = await res.json(); // users: { id: number; name: string; email: string }[]

  // POST /users — request body is type-checked
  const createRes = await client.users.$post({
    json: {
      name: "Bob",
      email: "bob@example.com",
      age: 30,
    },
  });
  const { user } = await createRes.json();

  // GET /users/:id — typed param
  const userRes = await client.users[":id"].$get({ param: { id: "1" } });
  const data = await userRes.json();

  // PATCH /users/:id
  await client.users[":id"].$patch({
    param: { id: "1" },
    json: { name: "Bob Updated" },
  });

  // DELETE /users/:id
  await client.users[":id"].$delete({ param: { id: "1" } });
}
```

## Query Parameters

```typescript
// Server — define query schema
const searchSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

const app = new Hono().get(
  "/search",
  zValidator("query", searchSchema),
  (c) => {
    const { q, page, limit } = c.req.valid("query");
    return c.json({ results: [], q, page, limit });
  }
);

export type AppType = typeof app;

// Client
const client = hc<AppType>("http://localhost:3000");
const res = await client.search.$get({
  query: { q: "hono", page: "1", limit: "10" },
});
```

## Headers and Auth

```typescript
// Pass headers in the client factory
const client = hc<AppType>("http://localhost:3000", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// Or per-request
const res = await client.users.$get(undefined, {
  headers: { "X-Request-ID": crypto.randomUUID() },
});
```

## Cloudflare Workers Deployment

```typescript
// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Middleware
app.use("*", logger());
app.use(
  "/api/*",
  cors({ origin: ["https://myapp.com"], allowMethods: ["GET", "POST", "PUT", "DELETE"] })
);

// Routes with D1 database binding
const api = app
  .get("/api/items", async (c) => {
    const db = c.env.DB; // Cloudflare D1
    const items = await db.prepare("SELECT * FROM items").all();
    return c.json({ items: items.results });
  })
  .post(
    "/api/items",
    zValidator("json", z.object({ name: z.string(), price: z.number() })),
    async (c) => {
      const { name, price } = c.req.valid("json");
      const db = c.env.DB;
      await db.prepare("INSERT INTO items (name, price) VALUES (?, ?)").bind(name, price).run();
      return c.json({ ok: true }, 201);
    }
  );

export type AppType = typeof api;
export default app;
```

```toml
# wrangler.toml
name = "my-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "your-database-id"
```

## Sharing Types with Frontend

```typescript
// packages/api/src/types.ts — shared package
export type { AppType } from "./server";

// packages/web/src/api.ts — frontend
import { hc } from "hono/client";
import type { AppType } from "@myapp/api";

export const api = hc<AppType>(import.meta.env.VITE_API_URL);

// React component — fully typed
const { data } = useQuery({
  queryKey: ["users"],
  queryFn: async () => {
    const res = await api.users.$get();
    return res.json();
  },
});
```

## Type Inference Helpers

```typescript
import type { InferRequestType, InferResponseType } from "hono/client";
import type { AppType } from "./server";

const client = hc<AppType>("http://localhost:3000");

// Infer types from client methods
type CreateUserRequest = InferRequestType<typeof client.users.$post>;
type CreateUserResponse = InferResponseType<typeof client.users.$post, 201>;

// Use in form handlers
async function createUser(data: CreateUserRequest["json"]) {
  const res = await client.users.$post({ json: data });
  const result: CreateUserResponse = await res.json();
  return result;
}
```

## Error Handling

```typescript
// Server — use HTTPException
import { HTTPException } from "hono/http-exception";

app.get("/users/:id", (c) => {
  const user = findUser(c.req.param("id"));
  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }
  return c.json({ user });
});

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

// Client — check response status
const res = await client.users[":id"].$get({ param: { id: "999" } });
if (!res.ok) {
  const error = await res.json();
  console.error("Error:", error);
}
```

## Guidelines

- Export `AppType` from the server file as `typeof app` (not as an interface) to preserve route types.
- Keep schemas close to routes so types stay in sync.
- Use `zValidator` for all user input — body, query, params, headers.
- In monorepos, put `AppType` in a shared package so both server and client import from one place.
- Use `InferRequestType` and `InferResponseType` to derive types for form handlers and tests.
- Hono RPC works on any runtime — Cloudflare Workers, Deno Deploy, Bun, and Node.js.
- The `hc` client uses native `fetch` under the hood — no special transport needed.
