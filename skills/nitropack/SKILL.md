---
name: nitropack
description: >-
   You are an expert in Nitro (NitroJS), the universal server engine powering
  Nuxt, Analog, and SolidStart. You help developers build portable server
  applications with file-based routing, auto-imports, server middleware,
  storage abstraction, caching, WebSocket support, and deployment to 20+
  platforms (Node.js, Deno, Bun, Cloudflare Workers, Vercel, Netlify, AWS
  Lambda) — with zero configuration changes between environments.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - server
    - universal
    - runtime
    - node
    - deno
    - bun
    - edge
    - h3
---

# Nitro — Universal Server Engine

You are an expert in Nitro (NitroJS), the universal server engine powering Nuxt, Analog, and SolidStart. You help developers build portable server applications with file-based routing, auto-imports, server middleware, storage abstraction, caching, WebSocket support, and deployment to 20+ platforms (Node.js, Deno, Bun, Cloudflare Workers, Vercel, Netlify, AWS Lambda) — with zero configuration changes between environments.

## Core Capabilities

### Server Routes

```typescript
// server/routes/users/[id].get.ts — File-based API routes
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const user = await useStorage("db").getItem(`users:${id}`);
  if (!user) throw createError({ statusCode: 404, message: "User not found" });
  return user;
});

// server/routes/users.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body.name || !body.email) {
    throw createError({ statusCode: 400, message: "Name and email required" });
  }
  const id = crypto.randomUUID();
  await useStorage("db").setItem(`users:${id}`, { id, ...body, createdAt: Date.now() });
  setResponseStatus(event, 201);
  return { id, ...body };
});

// server/routes/health.get.ts
export default defineEventHandler(() => ({ status: "ok", timestamp: Date.now() }));
```

### Middleware and Utils

```typescript
// server/middleware/auth.ts — Runs on every request
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;
  if (path.startsWith("/api/public")) return;

  const token = getHeader(event, "authorization")?.replace("Bearer ", "");
  if (!token) throw createError({ statusCode: 401, message: "Unauthorized" });

  event.context.user = await verifyToken(token);
});

// server/utils/db.ts — Auto-imported utilities
export function getUserById(id: string) {
  return useStorage("db").getItem(`users:${id}`);
}

// server/middleware/cache.ts
export default defineEventHandler(async (event) => {
  if (getMethod(event) === "GET") {
    setResponseHeaders(event, { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" });
  }
});
```

### Storage & Tasks

```typescript
// nitro.config.ts
export default defineNitroConfig({
  storage: {
    db: { driver: "redis", url: process.env.REDIS_URL },
    cache: { driver: "memory" },
    fs: { driver: "fs", base: "./data" },
  },
  scheduledTasks: {
    "*/5 * * * *": ["cleanup"],           // Every 5 minutes
    "0 9 * * *": ["daily-report"],
  },
});

// server/tasks/cleanup.ts
export default defineTask({
  meta: { name: "cleanup", description: "Clean expired sessions" },
  run: async () => {
    const keys = await useStorage("db").getKeys("sessions:");
    // ... cleanup logic
    return { result: `Cleaned ${deleted} sessions` };
  },
});
```

## Installation

```bash
npx giget nitro my-app
cd my-app && npm install
npm run dev                                # Dev server on :3000
npm run build                              # Build for current preset
NITRO_PRESET=cloudflare-pages npm run build  # Build for Cloudflare
```

## Best Practices

1. **File-based routing** — `server/routes/` maps to URLs; `[param].ts` for dynamic, `.get.ts`/`.post.ts` for methods
2. **Auto-imports** — `defineEventHandler`, `useStorage`, `createError` auto-imported; no import statements needed
3. **Universal deployment** — Same code deploys everywhere; change `NITRO_PRESET` to switch platform
4. **Storage abstraction** — Use `useStorage()` for Redis, KV, FS, S3; swap drivers without changing code
5. **Server tasks** — Define cron-like tasks in `server/tasks/`; scheduled via `nitro.config.ts`
6. **H3 under the hood** — Nitro uses H3 for HTTP handling; ultralight, tree-shakeable, edge-compatible
7. **Cached routes** — Use `defineCachedEventHandler` for automatic response caching; TTL-based invalidation
8. **WebSocket support** — Use `defineWebSocketHandler` for real-time features; works across all platforms
