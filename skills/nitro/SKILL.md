---
name: nitro
description: >-
  Build server-side applications with Nitro — the engine behind Nuxt server
  routes and Analog. Use when someone asks to "create an API server", "deploy
  to edge", "build server routes", "universal JavaScript server", "Nitro server",
  "deploy to Cloudflare Workers/Vercel/Netlify/Deno", or "isomorphic server".
  Covers API routes, middleware, storage, caching, WebSocket, task scheduling,
  and deployment to 15+ platforms with zero config changes.
license: Apache-2.0
compatibility: "Node.js 18+. Deploys to: Node, Deno, Bun, Cloudflare Workers, Vercel, Netlify, AWS Lambda."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["server", "api", "edge", "universal", "nitro"]
---

# Nitro

## Overview

Nitro is a universal server engine — write your server code once, deploy it anywhere. Node.js, Deno, Bun, Cloudflare Workers, Vercel Edge, AWS Lambda, Netlify — same code, zero config changes. It powers Nuxt's server routes but works standalone for any API or full-stack app. File-based routing, built-in KV storage, auto-imports, and hot reload.

## When to Use

- Building APIs that need to deploy to multiple platforms
- Edge-first applications (Cloudflare Workers, Vercel Edge)
- Server-side companion for a frontend framework (not just Nuxt)
- Need built-in caching, storage, and task scheduling without external packages
- Migrating Express/Fastify to a platform-agnostic solution

## Instructions

### Setup

```bash
npx giget@latest nitro my-server
cd my-server
npm install
npm run dev
```

### File-Based API Routes

```
server/
├── routes/
│   ├── index.ts            # GET /
│   ├── users/
│   │   ├── index.get.ts    # GET /users
│   │   ├── index.post.ts   # POST /users
│   │   └── [id].get.ts     # GET /users/:id
│   └── health.ts           # GET /health
├── middleware/
│   └── auth.ts             # Runs before every request
├── plugins/
│   └── database.ts         # Initialization logic
└── utils/
    └── db.ts               # Shared utilities (auto-imported)
```

```typescript
// server/routes/users/index.get.ts — List users
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);

  const users = await db.user.findMany({
    skip: (page - 1) * limit,
    take: limit,
  });

  return { users, page, limit };
});

// server/routes/users/index.post.ts — Create user
export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body.email || !body.name) {
    throw createError({ statusCode: 400, message: "Email and name required" });
  }

  const user = await db.user.create({ data: body });
  setResponseStatus(event, 201);
  return user;
});

// server/routes/users/[id].get.ts — Get user by ID
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const user = await db.user.findUnique({ where: { id } });

  if (!user) {
    throw createError({ statusCode: 404, message: "User not found" });
  }

  return user;
});
```

### Middleware

```typescript
// server/middleware/auth.ts — Auth middleware for all routes
export default defineEventHandler(async (event) => {
  // Skip auth for public routes
  const url = getRequestURL(event);
  if (url.pathname === "/health" || url.pathname.startsWith("/auth/")) return;

  const token = getHeader(event, "authorization")?.replace("Bearer ", "");
  if (!token) {
    throw createError({ statusCode: 401, message: "Unauthorized" });
  }

  const user = await verifyToken(token);
  event.context.user = user;
});
```

### Built-in Storage (KV)

```typescript
// server/routes/cache/[key].ts — KV storage (works on every platform)
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, "key")!;

  if (event.method === "GET") {
    const value = await useStorage("cache").getItem(key);
    if (!value) throw createError({ statusCode: 404 });
    return value;
  }

  if (event.method === "PUT") {
    const body = await readBody(event);
    await useStorage("cache").setItem(key, body);
    return { ok: true };
  }
});
```

### Deploy to Any Platform

```bash
# Build for different targets
NITRO_PRESET=cloudflare-pages npx nitro build
NITRO_PRESET=vercel npx nitro build
NITRO_PRESET=netlify npx nitro build
NITRO_PRESET=node-server npx nitro build
NITRO_PRESET=deno-server npx nitro build
NITRO_PRESET=bun npx nitro build
NITRO_PRESET=aws-lambda npx nitro build
```

## Examples

### Example 1: Build a REST API that deploys to Cloudflare Workers

**User prompt:** "Create a REST API with CRUD routes that runs on Cloudflare Workers edge."

The agent will create a Nitro project with file-based CRUD routes, middleware for auth, Cloudflare KV for storage, and deploy config for Workers.

### Example 2: API with caching and scheduled tasks

**User prompt:** "Build an API that caches expensive database queries and refreshes them every hour."

The agent will use Nitro's built-in storage for caching, defineTask for scheduled refreshes, and route-level cache headers.

## Guidelines

- **File naming = HTTP method** — `users.get.ts`, `users.post.ts`, `users.delete.ts`
- **`[param]` for dynamic routes** — `[id].get.ts` captures `:id`
- **`useStorage()` is universal** — KV that works on every platform (memory, Redis, Cloudflare KV)
- **`createError()` for HTTP errors** — structured error responses with status codes
- **Auto-imports** — `defineEventHandler`, `readBody`, `getQuery` are available without imports
- **Middleware runs on every request** — use path checks to skip public routes
- **`NITRO_PRESET` for deployment** — one codebase, 15+ deployment targets
- **`event.context` for request state** — pass data between middleware and handlers
