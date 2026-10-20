---
name: vinxi
description: >-
  Vinxi is a JavaScript SDK for composing full-stack apps and meta-frameworks
  from routers (static, http, spa, client) on top of Vite and Nitro. Use when
  maintaining an app or framework already built on Vinxi, or when a user asks
  how Vinxi routers, createApp and the vinxi CLI work. Note that SolidStart 2
  and current TanStack Start no longer use it.
license: Apache-2.0
compatibility: 'vinxi 0.5.x with Vite 6'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/nksaraf/vinxi
  tags: [vinxi, vite, meta-framework, ssr, full-stack]
---

# Vinxi — Full-Stack JavaScript SDK

## Overview

Vinxi composes full-stack apps from a list of routers (`static`, `http`, `spa`, `client`, or custom). Each router is built by Vite, and the `http` routers run on Nitro, so one `app.config.ts` can describe a browser bundle, an SSR server and an API.

**Project status (checked October 2026).** Vinxi is not archived or deprecated, but it is no longer the foundation it was. SolidStart 2.0 (stable August 2026) and current TanStack Start (`@tanstack/react-start` 1.x) do not depend on it; SolidStart 1.x still does. The npm package `vinxi` is at 0.5.11 (January 2026), and the repository's README still lists SolidStart as its active framework, which is out of date. For a new project, pick the framework you want (SolidStart, TanStack Start, or plain Vite with Nitro) instead of building on Vinxi directly. Use this skill for existing Vinxi code, for SolidStart 1.x or older TanStack Start projects, and for understanding how they work.

## Instructions

### Installation

```bash
npm install vinxi
```

Create `app.config.ts` (see App Configuration below) and set `"type": "module"` in `package.json`; without it `vinxi dev` fails with "Cannot use import statement outside a module". The CLI help says it looks for `app.config.js`, and `app.config.ts` works too:

```bash
npx vinxi dev                         # dev server, port 3000 (--port 3001 to change)
npx vinxi build                       # production build, node-server preset by default
npx vinxi build --preset vercel-edge  # or set SERVER_PRESET=vercel-edge
npx vinxi start                       # experimental: run the built app from .output
```

Vinxi 0.5.x depends on Vite 6, so use Vite 6 plugins.

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
// src/api.ts — H3-based API handler; the router's base ("/api") is stripped, so paths here start at "/users"
import { eventHandler, createRouter, defineEventHandler, readBody, getQuery } from "vinxi/http";

const router = createRouter();

router.get("/users", defineEventHandler(async (event) => {
  const { page, limit } = getQuery(event);
  const users = await db.users.findAll({
    offset: ((+page || 1) - 1) * (+limit || 20),
    limit: +limit || 20,
  });
  return { data: users };
}));

router.post("/users", defineEventHandler(async (event) => {
  const body = await readBody(event);
  const user = await db.users.create(body);
  return user;
}));

export default router.handler;
```

### Server Functions

`"use server"` is not on by default. Vinxi ships it as a plugin, `serverFunctions` from `@vinxi/server-functions/plugin` (npm 0.5.1): add `serverFunctions.client(...)` to the client router's `plugins` and `serverFunctions.server(...)` to a dedicated `http` router (conventionally `base: "/_server"`). The `examples/react/rsc/spa` folder in the repository shows the full wiring, including the `runtime` option (`@vinxi/react-server-dom/runtime`) it passes to both calls. Frameworks such as SolidStart 1.x do this for you.

```typescript
// src/features/todos.ts — Server functions (RPC), once the plugin is configured
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

// Client code imports these; the plugin turns the calls into HTTP requests
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

## Examples

### Example 1: React SSR app with an API

Request: "Set up a Vinxi app with a React client, server rendering and a `/api` route."

Use the four-router `app.config.ts` from App Configuration, add `plugins: () => [reactRefresh()]` (with `import reactRefresh from "@vitejs/plugin-react"`) to the `client` router, then run `npx vinxi dev`. `GET http://localhost:3000/api/users?page=1&limit=20` returns `{"data":[...]}` from the router in `src/api.ts`, and every other URL is rendered by `entry-server.tsx`.

### Example 2: Deploy an existing Vinxi app to Vercel

Request: "Our SolidStart 1.4 project is on Vinxi; build it for Vercel Edge."

```bash
SERVER_PRESET=vercel-edge npx vinxi build
```

The result is written to the preset's output directory (`.vercel/output` for Vercel presets, `.output` for the default node-server preset). If the project moves to SolidStart 2, SolidStart 2 does not use Vinxi, so the `vinxi` CLI and `app.config.ts` are replaced by its own Vite setup; follow the SolidStart documentation for that.

## Guidelines



1. **Multiple routers** — Define separate routers for API, SSR, SPA, static; each has its own build pipeline
2. **Server functions** — `"use server"` RPC needs the `@vinxi/server-functions` plugin and a server router; without it the directive does nothing
3. **Vite ecosystem** — Vite plugins work per router through `plugins: () => [...]`; add the framework plugin (for example `@vitejs/plugin-react`) to the `client` router, it is not applied globally
4. **H3 for HTTP** — `vinxi/http` re-exports H3 1.x helpers (the same layer as Nitro)
5. **Framework building** — Vinxi is for building frameworks (SolidStart 1.x uses it; SolidStart 2 and current TanStack Start do not); or for custom full-stack apps
6. **File-system routing** — Vinxi gives an API for file-system routers (a router's `routes` option); the file conventions are yours to define
7. **Universal deployment** — Deploy to Node.js, Vercel, Netlify, Cloudflare, Deno; same code everywhere
8. **Dev experience** — Vite HMR for the client; each router has its own Vite build
9. **Pitfall** — Do not start a new framework on Vinxi without checking the project's pace: releases slowed to a few a year, and its two biggest users moved away.
