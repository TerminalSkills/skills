---
name: elysia
description: >-
  Build typed HTTP and WebSocket APIs with Elysia, a TypeScript web framework optimized for Bun that also runs on Node.js. Use when someone asks to
  "create an API with Bun", "build a REST API with Elysia", "set up WebSocket
  server on Bun", "type-safe API with Eden Treaty", "Elysia plugin", or
  "fastest TypeScript HTTP framework". Covers REST routes, WebSocket, validation
  with TypeBox, Eden Treaty type-safe client, plugins, auth guards, and
  OpenAPI documentation.
license: Apache-2.0
compatibility: "Bun 1.x (recommended) or Node.js with the @elysia/node adapter. TypeScript."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/elysiajs/elysia
  tags: ["bun", "api", "typescript", "websocket", "elysia"]
---

# Elysia

## Overview

Elysia is a TypeScript HTTP framework optimized for Bun (current release 1.4). It gives end-to-end type safety from server to client via Eden Treaty, built-in schema validation, and an OpenAPI plugin that documents routes from the same schemas. It also runs on Node.js through an adapter. Think Express, but with types.

Package scopes: the official docs now install plugins from `@elysia/*` (`@elysia/cors`, `@elysia/jwt`, `@elysia/openapi`, `@elysia/eden`, `@elysia/node`). The older `@elysiajs/*` names are still published and carry the same releases, so existing projects keep working. `@elysiajs/swagger` is deprecated; use the OpenAPI plugin.

## When to Use

- Building REST APIs on Bun (instead of Express/Fastify)
- Need end-to-end type safety — server defines routes, client auto-infers types
- WebSocket server with typed messages
- Fast APIs where framework overhead matters
- Rapid prototyping with auto-generated OpenAPI docs (Scalar UI)

## Instructions

### Getting Started

```bash
bun create elysia my-api
cd my-api
bun run dev
```

### Basic REST API

```typescript
// src/index.ts — Elysia REST API with validation
/**
 * Type-safe REST API using Elysia.
 * Body/query/params are validated at runtime AND typed at compile time.
 * No separate type definitions needed — schema IS the type.
 */
import { Elysia, t } from "elysia";

const app = new Elysia()
  // GET with typed query params
  .get("/users", async ({ query }) => {
    const { page, limit } = query;
    // page and limit are typed as numbers
    return { users: [], page, limit };
  }, {
    query: t.Object({
      page: t.Number({ default: 1 }),
      limit: t.Number({ default: 20, maximum: 100 }),
    }),
  })

  // POST with body validation
  .post("/users", async ({ body }) => {
    // body is typed as { name: string, email: string }
    const user = { id: crypto.randomUUID(), ...body, createdAt: new Date() };
    return user;
  }, {
    body: t.Object({
      name: t.String({ minLength: 2, maxLength: 100 }),
      email: t.String({ format: "email" }),
    }),
  })

  // Path params + response schema
  .get("/users/:id", async ({ params, status }) => {
    const user = await findUser(params.id);
    if (!user) return status(404, { message: "User not found" });
    return user;
  }, {
    params: t.Object({
      id: t.String({ format: "uuid" }),
    }),
  })

  // DELETE with auth guard
  .delete("/users/:id", async ({ params }) => {
    await deleteUser(params.id);
    return { deleted: true };
  }, {
    params: t.Object({ id: t.String() }),
    beforeHandle: ({ headers, status }) => {
      if (headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return status(401, { message: "Unauthorized" });
      }
    },
  })

  .listen(3000);

console.log(`Elysia running at ${app.server?.hostname}:${app.server?.port}`);
```

### WebSocket

```typescript
// src/ws.ts — Type-safe WebSocket with Elysia
import { Elysia, t } from "elysia";

const app = new Elysia()
  .ws("/chat", {
    query: t.Object({ room: t.Optional(t.String()) }),
    body: t.Object({
      type: t.Union([t.Literal("message"), t.Literal("ping")]),
      content: t.Optional(t.String()),
      room: t.String(),
    }),
    open(ws) {
      const room = ws.data.query.room || "general";
      ws.subscribe(room);
      ws.publish(room, JSON.stringify({ type: "system", content: `User joined ${room}` }));
    },
    message(ws, { type, content, room }) {
      if (type === "message" && content) {
        ws.publish(room, JSON.stringify({ type: "message", content, from: ws.id }));
      }
      if (type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    },
    close(ws) {
      // leave every topic this socket joined
      for (const topic of ws.subscriptions) ws.unsubscribe(topic);
    },
  })
  .listen(3000);
```

### Eden Treaty — Type-Safe Client

```typescript
// client.ts — Auto-typed API client generated from Elysia server
/**
 * Eden Treaty creates a fully typed client from your Elysia app type.
 * No codegen, no OpenAPI parsing — just TypeScript inference.
 */
import { treaty } from "@elysia/eden";
import type { App } from "./src/index";  // Import the app TYPE

const api = treaty<App>("localhost:3000");

// All methods, params, body, and responses are fully typed
const { data: users } = await api.users.get({ query: { page: 1, limit: 10 } });
//    ^? { users: User[], page: number, limit: number }

const { data: newUser } = await api.users.post({
  name: "Kai",
  email: "kai@brightpath.io",
});
//    ^? { id: string, name: string, email: string, createdAt: Date }

const { error } = await api.users({ id: "bad-id" }).delete();
// error is null on success; otherwise { status: 401 | 422, value: ... }
if (error) console.error(error.status, error.value);
```

### Plugins and Middleware

```typescript
// src/app.ts — Elysia with plugins
import { Elysia } from "elysia";
import { cors } from "@elysia/cors";
import { openapi } from "@elysia/openapi";
import { jwt } from "@elysia/jwt";

const app = new Elysia()
  .use(cors())
  .use(openapi({
    documentation: {
      info: { title: "My API", version: "1.0.0" },
    },
  }))
  .use(jwt({
    name: "jwt",
    secret: process.env.JWT_SECRET!,
    exp: "7d",
  }))
  // resolve runs after validation (derive runs before it)
  .resolve(async ({ jwt, headers }) => {
    const token = headers.authorization?.replace("Bearer ", "");
    if (!token) return { user: null };
    const payload = await jwt.verify(token);
    if (!payload) return { user: null };
    return { user: payload as { id: string; email: string } };
  })
  // Protected route
  .get("/me", ({ user, status }) => {
    if (!user) return status(401, { message: "Not authenticated" });
    return user;
  })
  .listen(3000);

export type App = typeof app;
```

### Group Routes

```typescript
// src/routes/users.ts — Route group with shared prefix and guards
import { Elysia, t } from "elysia";

export const usersRoutes = new Elysia({ prefix: "/users" })
  .get("/", () => listUsers())
  .get("/:id", ({ params }) => getUser(params.id), {
    params: t.Object({ id: t.String() }),
  })
  .post("/", ({ body }) => createUser(body), {
    body: t.Object({
      name: t.String(),
      email: t.String({ format: "email" }),
    }),
  });

// Main app
import { Elysia } from "elysia";
import { usersRoutes } from "./routes/users";

const app = new Elysia()
  .use(usersRoutes)
  .listen(3000);
```

## Examples

### Example 1: Build a CRUD API with auth

**User prompt:** "Create a REST API for a todo app with JWT auth, input validation, and OpenAPI docs using Elysia on Bun."

The agent will create an Elysia app with JWT plugin, CRUD routes for todos with TypeBox validation, auth guards on mutation routes, and auto-generated OpenAPI docs at /openapi (Scalar UI; raw spec at /openapi/json).

### Example 2: Real-time chat server

**User prompt:** "Build a WebSocket chat server with rooms using Elysia."

The agent will set up Elysia WebSocket with typed messages, room subscription via pub/sub, and a REST endpoint to list active rooms.

## Guidelines

- **Use `t.Object()` for all inputs** — runtime validation + compile-time types in one declaration
- **Export the app type** — `export type App = typeof app` enables Eden Treaty client
- **Group routes with `new Elysia({ prefix })`** — keeps route files modular
- **`resolve` (or `derive`) for auth** — compute the user from the JWT once per request; `resolve` runs after validation, `derive` before it
- **`beforeHandle` for guards** — return an error to short-circuit the request
- **Return `status(code, body)` instead of the old `error()`** — it is typed against the response schema and Eden narrows on it
- **Bun is the native runtime; Node.js works through the adapter** — `npm install elysia @elysia/node`, then `new Elysia({ adapter: node() })` with `import { node } from "@elysia/node"`
- **OpenAPI plugin serves Scalar at `/openapi`** — generated from route schemas; `references: fromTypes()` (from `@elysia/openapi`) also reads TypeScript types, and in production point it at a pre-built `dist/index.d.ts`
- **Do not use `@elysiajs/swagger` in new code** — it is deprecated and unmaintained
- **Keep plugin and `elysia` versions aligned** — Eden infers types from the installed `elysia` package, so client and server must resolve the same version
- **Chain calls** — Elysia types flow through the method chain; routes added to a variable in separate statements are missing from `typeof app`
