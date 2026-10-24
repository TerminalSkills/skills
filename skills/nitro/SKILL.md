---
name: nitro
description: >-
  Nitro is a server engine that builds file-routed web servers once and
  deploys them to Node.js, Bun, Deno, Cloudflare, Vercel, Netlify or AWS
  Lambda; it is the server layer of Nuxt. Use when someone asks to "create an
  API server", "build server routes", "deploy to Cloudflare Workers, Vercel or
  Netlify", "universal JavaScript server", or "Nitro server". Covers routes,
  middleware, storage, caching, scheduled tasks and presets.
license: Apache-2.0
compatibility: "Node.js 20.19+ or 22.12+ (nitropack 2.13). Deploys to Node, Deno, Bun, Cloudflare, Vercel, Netlify, AWS Lambda."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/nitrojs/nitro
  tags: ["server", "api", "edge", "universal", "nitro"]
---

# Nitro

## Overview

Nitro is a server framework built on [h3](https://h3.dev): write file-based routes once, and the build output is compatible with many runtimes through "presets". It powers Nuxt's server routes but also runs standalone. Built in: file routing, middleware, plugins, `useStorage` (unstorage drivers), cached handlers, scheduled tasks and hot reload.

Versions (npm, 2026-10-24): the stable line is **`nitropack` 2.13.5** (Node ^20.19 or >=22.12), used by every example here. Nitro **v3** is published as `nitro` 3.0.x-beta, runs as a Vite extension and has a different API; do not mix the two, and use v3 only if the user asks for it.

## Instructions

### Setup

```bash
npx giget@latest nitro my-server --install
cd my-server
npm run dev        # http://localhost:3000
npm run build      # output in .output/
npm run preview    # node .output/server/index.mjs
```

The starter sets `imports: false` in `nitro.config.ts`, so **auto-imports are off**: import helpers from `h3` (`defineEventHandler`, `getQuery`, `readBody`, `createError`...) and from `nitropack/runtime` (`useStorage`, `defineCachedEventHandler`, `defineTask`). Remove that line from the config to get auto-imports back.

### File-based routes

```
server/
├── routes/
│   ├── health.ts            # GET /health
│   ├── users/
│   │   ├── index.get.ts     # GET /users
│   │   ├── index.post.ts    # POST /users
│   │   └── [id].get.ts      # GET /users/:id
│   └── cache/[key].ts       # any method /cache/:key
├── middleware/auth.ts       # runs before every request
├── tasks/reports/refresh.ts # task "reports:refresh"
└── utils/users.ts           # shared code
```

```typescript
// server/routes/users/index.get.ts
import { defineEventHandler, getQuery } from "h3";
import { listUsers } from "../../utils/users";

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Number(query.limit) || 20, 100);
  return { users: listUsers((page - 1) * limit, limit), page, limit };
});

// server/routes/users/index.post.ts
import { defineEventHandler, readBody, createError, setResponseStatus } from "h3";
import { addUser } from "../../utils/users";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; email?: string }>(event);
  if (!body?.email || !body?.name) {
    throw createError({ statusCode: 400, statusMessage: "Email and name required" });
  }
  setResponseStatus(event, 201);
  return addUser({ name: body.name, email: body.email });
});

// server/routes/users/[id].get.ts
import { defineEventHandler, getRouterParam, createError } from "h3";
import { findUser } from "../../utils/users";

export default defineEventHandler((event) => {
  const user = findUser(getRouterParam(event, "id")!);
  if (!user) throw createError({ statusCode: 404, statusMessage: "User not found" });
  return user;
});
```

Supporting files used by the examples (an in-memory store, so the API runs without a database):

```typescript
// server/routes/health.ts
import { defineEventHandler } from "h3";

export default defineEventHandler(() => ({ status: "ok" }));

// server/utils/users.ts
type User = { id: string; name: string; email: string };
const users: User[] = [{ id: "1", name: "Ben", email: "ben@acme-shop.io" }];

export const listUsers = (skip: number, limit: number) => users.slice(skip, skip + limit);
export const findUser = (id: string) => users.find((u) => u.id === id);
export function addUser(input: { name: string; email: string }): User {
  const user = { id: String(users.length + 1), ...input };
  users.push(user);
  return user;
}
```

### Middleware

Fail closed: if the secret is missing, reject everything (comparing with an unset variable would let unauthenticated requests through).

```typescript
// server/middleware/auth.ts
import { defineEventHandler, getRequestURL, getHeader, createError } from "h3";

export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event);
  if (pathname === "/health") return;
  if (import.meta.dev && pathname.startsWith("/_nitro/")) return;   // dev only: lets `nitro task` reach the dev server
  const expected = process.env.API_TOKEN;
  const token = getHeader(event, "authorization")?.replace("Bearer ", "");
  if (!expected || token !== expected) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
});
```

### Storage and caching

```typescript
// server/routes/cache/[key].ts
import { defineEventHandler, getRouterParam, readBody, createError } from "h3";
import { useStorage } from "nitropack/runtime";

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, "key")!;
  const store = useStorage("cache");
  if (event.method === "PUT") {
    await store.setItem(key, await readBody(event));
    return { ok: true };
  }
  const value = await store.getItem(key);
  if (value === null) throw createError({ statusCode: 404 });
  return value;
});
```

`useStorage("cache")` is in-memory by default and does not survive restarts or serverless cold starts. Mount a driver for real persistence in `nitro.config.ts`, for example `storage: { cache: { driver: "redis", url: process.env.REDIS_URL } }` or `{ driver: "cloudflare-kv-binding", binding: "CACHE" }` on Cloudflare.

Cache an expensive handler (stored under the `cache` storage mount):

```typescript
// server/routes/top-products.get.ts
import { defineCachedEventHandler } from "nitropack/runtime";

export default defineCachedEventHandler(
  async () => ({ generatedAt: new Date().toISOString(), products: ["espresso-beans", "grinder"] }),
  { maxAge: 3600, name: "top-products" },
);
```

### Scheduled tasks

A task's name comes from its path: `server/tasks/reports/refresh.ts` is `reports:refresh` (a flat file `reports-refresh.ts` would be named differently and the schedule would warn that the task is not defined).

```typescript
// server/tasks/reports/refresh.ts
import { defineTask } from "nitropack/runtime";

export default defineTask({
  meta: { name: "reports:refresh", description: "Recompute the daily sales report" },
  async run() {
    return { result: "ok" };
  },
});
```

```typescript
// nitro.config.ts
import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
  compatibilityDate: "2026-10-01",
  srcDir: "server",
  experimental: { tasks: true },
  scheduledTasks: { "0 * * * *": ["reports:refresh"] },
});
```

With `npm run dev` running, `npx nitro task list` and `npx nitro task run reports:refresh` execute tasks by hand (the CLI talks to port 3000 and gets a 401 from the auth middleware unless it skips `/_nitro/` in dev, as above). How the cron schedule fires in production depends on the preset and the platform.

### Deploy with presets

```bash
NITRO_PRESET=node-server npx nitro build          # node .output/server/index.mjs
NITRO_PRESET=cloudflare-module npx nitro build    # Cloudflare Workers
NITRO_PRESET=cloudflare-pages npx nitro build     # Cloudflare Pages
NITRO_PRESET=vercel npx nitro build
NITRO_PRESET=netlify npx nitro build
NITRO_PRESET=deno-server npx nitro build
NITRO_PRESET=bun npx nitro build
NITRO_PRESET=aws-lambda npx nitro build
```

These presets all built successfully in a test project. There is no `cloudflare-workers` preset; Workers use `cloudflare-module`. Deploying the output still needs the platform's own tooling and account (for Cloudflare, wrangler and its config; storage bindings such as KV must be declared there).

## Examples

### Example 1: REST API for a shop, tested locally

**User prompt:** "Create a small users API with a protected POST and a public health check."

Create the routes, utils and middleware above, then:

```bash
npm run build
API_TOKEN=dev-secret-123 PORT=3417 node .output/server/index.mjs &
curl -s localhost:3417/health                      # {"status":"ok"}
curl -s localhost:3417/users                       # 401 Unauthorized
curl -s -H "Authorization: Bearer dev-secret-123" "localhost:3417/users?limit=1"
curl -s -X POST -H "Authorization: Bearer dev-secret-123" -H "content-type: application/json" \
  -d '{"name":"Ana","email":"ana@acme-shop.io"}' localhost:3417/users   # 201 Created
```

The users list returns `{"users":[{"id":"1",...}],"page":1,"limit":1}`; a missing id returns a 404 JSON error.

### Example 2: Cached endpoint with an hourly refresh task

**User prompt:** "Cache the top-products query for an hour and recompute a report every hour."

Add `defineCachedEventHandler` (as above) with `maxAge: 3600`, and the `reports:refresh` task with `scheduledTasks: { "0 * * * *": ["reports:refresh"] }`. Check the task with `npx nitro task run reports:refresh`, which prints `✔ Result: ok`. Repeated requests to `/top-products` return the same `generatedAt` until the cache expires.

## Guidelines

- File name sets the method: `users.get.ts`, `users.post.ts`; `[id]` is a route parameter (`getRouterParam(event, "id")`).
- Throw `createError({ statusCode, statusMessage })`; use `setResponseStatus(event, 201)` for non-200 successes.
- `event.context` carries request state from middleware to handlers.
- Middleware runs on every request, including static-looking paths; skip public routes explicitly.
- A built server listens on all interfaces (`[::]`) at `PORT` (default 3000); put it behind a reverse proxy or firewall.
- Pin `compatibilityDate` in the config; it fixes platform behaviour to a known date.
- In-memory storage and caches are per process; on serverless platforms use a real driver.
