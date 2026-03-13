---
name: vinxi
description: >-
   You are an expert in Vinxi, the full-stack JavaScript SDK for building
  meta-frameworks. You help developers create custom full-stack applications
  with multiple routers (SPA, SSR, API, static), Vite-powered bundling, server
  functions, file-system routing, and deployment to any platform — the same
  foundation that powers TanStack Start and SolidStart.
category: Developer Tools
tags: [meta-framework, vite, full-stack, server, ssr, sdk, router]
version: 1.0.0
author: terminal-skills
---

# Vinxi — Full-Stack JavaScript SDK

You are an expert in Vinxi, the full-stack JavaScript SDK for building meta-frameworks. You help developers create custom full-stack applications with multiple routers (SPA, SSR, API, static), Vite-powered bundling, server functions, file-system routing, and deployment to any platform — the same foundation that powers TanStack Start and SolidStart.

## Core Capabilities

### App Configuration

```typescript
// app.config.ts — Define your full-stack app
import { createApp } from "vinxi";

export default createApp({
  routers: [
    // Static assets
    {
      name: "public",
      type: "static",
      dir: "./public",
    },
    // API routes
    {
      name: "api",
      type: "http",
      handler: "./src/api.ts",
      base: "/api",
      plugins: () => [],
    },
    // SSR client (browser bundle)
    {
      name: "client",
      type: "client",
      handler: "./src/entry-client.tsx",
      base: "/_build",
      build: {
        sourcemap: true,
      },
    },
    // SSR server (server-side rendering)
    {
      name: "ssr",
      type: "http",
      handler: "./src/entry-server.tsx",
      plugins: () => [],
    },
  ],
});
```

### API Routes

```typescript
// src/api.ts — H3-based API handler
import { eventHandler, createRouter, defineEventHandler, readBody, getQuery } from "vinxi/http";

const router = createRouter();

router.get("/api/users", defineEventHandler(async (event) => {
  const { page, limit } = getQuery(event);
  const users = await db.users.findAll({
    offset: ((+page || 1) - 1) * (+limit || 20),
    limit: +limit || 20,
  });
  return { data: users };
}));

router.post("/api/users", defineEventHandler(async (event) => {
  const body = await readBody(event);
  const user = await db.users.create(body);
  return user;
}));

export default router.handler;
```

### Server Functions

```typescript
// src/features/todos.ts — Server functions (RPC)
"use server";

import { db } from "../db";

export async function getTodos() {
  return db.todos.findAll({ orderBy: { createdAt: "desc" } });
}

export async function createTodo(title: string) {
  return db.todos.create({ title, done: false });
}

export async function toggleTodo(id: string) {
  const todo = await db.todos.findById(id);
  return db.todos.update(id, { done: !todo.done });
}

// Client component calls these directly — Vinxi handles RPC
```

```tsx
// src/components/TodoList.tsx — Client component using server functions
import { getTodos, createTodo, toggleTodo } from "../features/todos";

function TodoList() {
  const [todos, setTodos] = useState([]);

  useEffect(() => {
    getTodos().then(setTodos);             // Calls server function transparently
  }, []);

  const handleAdd = async (title: string) => {
    const todo = await createTodo(title);  // Server function — runs on server
    setTodos([todo, ...todos]);
  };

  return (
    <ul>
      {todos.map(t => (
        <li key={t.id} onClick={() => toggleTodo(t.id)}>{t.title}</li>
      ))}
    </ul>
  );
}
```

## Installation

```bash
npx giget vinxi my-app
cd my-app && npm install
npm run dev                                # Vite-powered dev server
npm run build                              # Production build
```

## Best Practices

1. **Multiple routers** — Define separate routers for API, SSR, SPA, static; each has its own build pipeline
2. **Server functions** — Use `"use server"` for RPC; client calls server code directly, Vinxi handles serialization
3. **Vite ecosystem** — All Vite plugins work; use existing React/Vue/Solid plugins without modification
4. **H3 for HTTP** — API routes use H3 (same as Nitro/Nuxt); lightweight, fast, edge-compatible
5. **Framework building** — Vinxi is for building frameworks (TanStack Start uses it); or for custom full-stack apps
6. **File-system routing** — Enable via plugins; maps files to routes like Next.js/Nuxt
7. **Universal deployment** — Deploy to Node.js, Vercel, Netlify, Cloudflare, Deno; same code everywhere
8. **Dev experience** — Vite HMR for instant updates; separate client and server hot reload
