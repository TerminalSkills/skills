---
name: nitropack
description: >-
  Builds portable server applications with Nitro (nitropack), the server engine behind Nuxt, Analog and SolidStart: file-based routes, middleware, a storage layer, response caching, scheduled tasks and one build that targets Node.js, Bun, Deno, Cloudflare, Vercel, Netlify and AWS. Use when a user asks to create a Nitro server, add API routes or tasks, configure storage, pick a deployment preset, or move from Nitro 2 to Nitro 3.
license: Apache-2.0
compatibility: "Node.js 20.19 or newer (or 22.12+) for nitropack 2.13, Node.js 20 or newer for Nitro 3; Bun or Deno also work. Presets for Cloudflare, Vercel and Netlify need an account on that platform to deploy."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - nitro
    - server
    - h3
    - edge
    - nuxt
  repository: https://github.com/nitrojs/nitro
---

# Nitro — Universal Server Engine

## Overview

Nitro turns a folder of handlers into a server that builds to a self-contained `.output/` directory. The same code runs on Node.js, Bun, Deno, Cloudflare Workers, Vercel, Netlify, AWS and others; the build target is chosen by a *preset*. Nuxt uses Nitro for everything under its `server/` directory, so this skill applies to Nuxt server routes too.

Two lines exist side by side (checked October 2026):

- **Nitro 2** — npm package `nitropack` (2.13.x, `latest`). H3 version 1 underneath. Auto-imports of `defineEventHandler`, `useStorage` and friends. This is what this skill's examples use, and what Nuxt 3/4 ship.
- **Nitro 3** — npm package `nitro` (3.0 beta). H3 version 2, no auto-imports, directory scanning is opt-in, `useStorage` is renamed `useKV`. See "Moving to Nitro 3" below before starting a new project on it.

## Instructions

### Create a project

```bash
npx giget@latest nitro orders-api --install    # starter template (Nitro 2, nitropack)
cd orders-api
npm run dev          # nitro dev, http://localhost:3000
npm run build        # writes .output/
npm run preview      # node .output/server/index.mjs (PORT or NITRO_PORT sets the port)
```

The starter's `nitro.config.ts` sets `srcDir: "server"` and `imports: false`. Two consequences that surprise people:

- With a bare `nitropack` install and no `srcDir`, Nitro scans `routes/`, `api/`, `middleware/`, `tasks/` at the project root, not under `server/`. A `server/routes/users.post.ts` then returns 404 with no warning. Set `srcDir: "server"` (Nuxt already does).
- With `imports: false` there are no auto-imports: `import { defineEventHandler, getRouterParam } from "h3"` and `import { useStorage } from "nitropack/runtime"`. The examples below omit imports, which works only when auto-imports are on (the default when you write your own config, and always in Nuxt).

### Routes

Files under `server/routes/` map to URLs; `server/api/` adds the `/api` prefix. A `.get.ts`/`.post.ts` suffix pins the method, `[id]` is a param, `[...slug]` a catch-all, and `.dev.ts`/`.prod.ts` limits a file to one build mode. One handler per file.

```typescript
// server/routes/users/[id].get.ts  ->  GET /users/42
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const user = await useStorage("db").getItem(`users:${id}`);
  if (!user) throw createError({ statusCode: 404, message: "User not found" });
  return user;
});

// server/routes/users.post.ts  ->  POST /users
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body?.name || !body?.email) {
    throw createError({ statusCode: 400, message: "name and email are required" });
  }
  const id = crypto.randomUUID();
  await useStorage("db").setItem(`users:${id}`, { id, ...body, createdAt: Date.now() });
  setResponseStatus(event, 201);
  return { id, ...body };
});
```

### Middleware and utils

Files in `server/middleware/` run before every route. A middleware may change the request or `event.context`; it must not return a value, because a returned value becomes the response and stops the request. Files in `server/utils/` are auto-imported (Nitro 2 with imports on).

```typescript
// server/middleware/auth.ts
export default defineEventHandler(async (event) => {
  if (getRequestURL(event).pathname.startsWith("/api/public")) return;
  const token = getHeader(event, "authorization")?.replace("Bearer ", "");
  if (!token) throw createError({ statusCode: 401, message: "Unauthorized" });
  event.context.user = await verifyToken(token);   // verifyToken lives in server/utils/
});
```

### Storage (unstorage)

`useStorage(base)` is a key-value layer over drivers. The first argument is a mount point; keys use `:` separators. Without configuration the default mount is in memory and is lost on restart.

```typescript
// nitro.config.ts
export default defineNitroConfig({
  srcDir: "server",
  compatibilityDate: "2025-01-30",
  storage: {
    db: { driver: "fs", base: "./.data/db" },                      // local files
    sessions: { driver: "redis", url: process.env.REDIS_URL },     // see unstorage drivers
  },
  devStorage: { sessions: { driver: "fs", base: "./.data/sessions" } },  // dev only
});
```

Mount points `root`, `src`, `build` and `cache` exist in development; do not reuse the name `cache` for your own data, because Nitro's response cache lives there. For credentials that are not known at build time, mount the driver in a `defineNitroPlugin` using `useRuntimeConfig()`.

### Caching

```typescript
// server/routes/stats.get.ts — cached 1 hour, stale value served while refreshing
export default defineCachedEventHandler(() => computeStats(), { maxAge: 60 * 60 });

// server/utils/github.ts — cache any function; results must be JSON-serializable
export const cachedStars = defineCachedFunction(
  async (repo: string) => (await $fetch<any>(`https://api.github.com/repos/${repo}`)).stargazers_count,
  { maxAge: 3600, name: "ghStars", getKey: (repo: string) => repo },
);
```

Request headers are dropped when building the cache key; list the ones that matter in `varies: ["accept-language"]`. On edge workers pass `event` as the first argument of cached functions so `waitUntil` can finish the refresh. For rules by path, use `routeRules: { "/blog/**": { swr: 600 } }` in the config.

### Tasks and scheduled tasks (experimental)

Tasks need `experimental: { tasks: true }`. A file `server/tasks/db/migrate.ts` is the task `db:migrate`. Schedules use cron patterns and run with the croner engine on `node-server`, `bun` and `deno-server`; on `cloudflare_module` they map to Cron Triggers, so repeat the same patterns in `wrangler.toml`.

```typescript
// nitro.config.ts (add to the config above)
experimental: { tasks: true },
scheduledTasks: { "*/5 * * * *": ["cleanup"] },

// server/tasks/cleanup.ts
export default defineTask({
  meta: { name: "cleanup", description: "Delete expired sessions" },
  async run() {
    const keys = await useStorage("sessions").getKeys();
    return { result: `${keys.length} sessions checked` };
  },
});
```

While `nitro dev` is running: `nitro task list` and `nitro task run cleanup --payload "{}"`, or `GET /_nitro/tasks`. A task name defined in `scheduledTasks` but missing as a file prints "Scheduled task ... is not defined!" at build time.

### WebSocket and SSE

WebSockets are experimental: set `experimental: { websocket: true }`, then export `defineWebSocketHandler({ open, message, close, error })` from `server/routes/_ws.ts` (any route file works). For one-way streams use `createEventStream(event)` in an ordinary handler and return `eventStream.send()`.

### Deploy

The default preset is `node-server`. Zero-config detection exists for Vercel, Netlify, Cloudflare, Azure, AWS Amplify, Firebase App Hosting, Stormkit and Zeabur when building in their CI. Otherwise choose a preset explicitly:

```bash
nitro build --preset cloudflare_module     # also: NITRO_PRESET=... or preset: in config
node .output/server/index.mjs              # node-server output
```

Preset names use underscores in the docs (`cloudflare_pages`, `cloudflare_module`, `aws_lambda`, `deno_deploy`). `cloudflare_module` is the recommended Cloudflare preset; `cloudflare_pages` is for Pages-specific needs. Set `compatibilityDate` so provider behavior does not change under you.

### Moving to Nitro 3

1. Replace `nitropack` with `nitro` in `package.json`; use Node.js 20 or newer.
2. Config: `import { defineConfig } from "nitro"` and `serverDir: "./server"` (scanning is off by default; `srcDir` is deprecated).
3. Add explicit imports: `defineHandler`, `definePlugin`, `defineErrorHandler` from `"nitro"`; `useKV` from `"nitro/kv"` (was `useStorage`; config key `storage` becomes `kv`); `defineCachedFunction`/`defineCachedHandler` from `"nitro/cache"`; `defineTask`/`runTask` from `"nitro/task"`; `useRuntimeConfig` from `"nitro/runtime-config"`; H3 utilities from `"nitro/h3"`.
4. Handlers move to H3 version 2: `defineHandler` replaces `defineEventHandler`; return the body or `throw new HTTPError(...)` (`createError` is gone); read bodies with `await event.req.json()` instead of `readBody`; headers are `event.req.headers.get(...)`. `app.config.ts` support is removed.
5. Nitro 3 is built around Vite: in an existing Vite project add `nitro()` from `"nitro/vite"` to `vite.config.ts` and use `vite dev` / `vite build`; new projects start with `npx create-nitro-app`. `nitro build` still works and runs the Vite build.
6. Use the Nitro 3 migration guide (nitro.build, "Migration Guide") as the checklist; it is marked as a living document while the release is in beta.

## Examples

### Example 1: Key-value API for orders on Node.js

Request: "Set up a small Nitro API that stores orders on disk and exposes GET /orders/:id and POST /orders."

```bash
npx giget@latest nitro orders-api --install && cd orders-api
mkdir -p server/routes/orders
```

Add `storage: { orders: { driver: "fs", base: "./.data/orders" } }` to `nitro.config.ts`, put the two handlers from "Routes" in `server/routes/orders/[id].get.ts` and `server/routes/orders.post.ts` (storage name `orders`), then:

```bash
npm run build && PORT=3111 node .output/server/index.mjs &
curl -s -X POST localhost:3111/orders -H 'content-type: application/json' -d '{"name":"Alice","email":"alice@shop.test"}'
# {"id":"428279da-52bb-4706-a5bb-c4ccb8b0584e","name":"Alice","email":"alice@shop.test"}
curl -s localhost:3111/orders/428279da-52bb-4706-a5bb-c4ccb8b0584e
```

The file `.data/orders/<id>` holds the JSON. A request for an unknown id returns `{"statusCode":404,"message":"User not found",...}`. If every route answers "Cannot find any route", the config is missing `srcDir: "server"`.

### Example 2: Precompute a slow report every night

Request: "The /reports/daily endpoint takes 4 seconds; build it every night at 02:00 and serve the stored copy."

```typescript
// server/tasks/reports/build.ts
export default defineTask({
  meta: { name: "reports:build", description: "Build the daily sales report" },
  async run() {
    const report = await buildDailyReport();            // slow query in server/utils/
    await useStorage("db").setItem("reports:daily", report);
    return { result: `report with ${report.rows.length} rows stored` };
  },
});

// server/routes/reports/daily.get.ts
export default defineEventHandler(async () => {
  return (await useStorage("db").getItem("reports:daily")) ?? { rows: [], note: "not built yet" };
});
```

In `nitro.config.ts`: `experimental: { tasks: true }, scheduledTasks: { "0 2 * * *": ["reports:build"] }`. While `nitro dev` runs, `nitro task run reports:build` prints the task result and `curl localhost:3000/reports/daily` returns the stored report in milliseconds. For a response that may simply be a little stale, `defineCachedEventHandler(handler, { maxAge: 86400 })` is the smaller change.

## Guidelines

- Pin the line you use: `nitropack@^2` for production Nuxt 3/4 and existing projects; Nitro 3 is a beta and its APIs still change.
- Never return a value from middleware, and validate input yourself (`readBody` returns whatever the client sent).
- Tasks and WebSockets are experimental and platform-dependent; check the platform table in the docs before relying on them in an edge preset.
- Do not call `runTask` or `/_nitro/tasks` from a public route without authentication.
- In-memory storage and in-memory cache do not survive restarts and are not shared between serverless instances; use a real driver for state.
- Do not put secrets in `nitro.config.ts`; read them from environment variables or `runtimeConfig` (`NITRO_` prefixed variables override it at runtime).
- When you want only a thin HTTP layer with no build step, plain H3 or a framework may be simpler than Nitro.
