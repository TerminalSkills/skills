---
name: tanstack-start
description: >-
  Build full-stack React apps with TanStack Start. Use when a user asks to
  create a full-stack React application with type-safe server functions, set up
  file-based routing with SSR/SSG/SPA modes, build APIs with middleware and
  validation, implement server-side data fetching with TanStack Router, or
  deploy to Cloudflare/Netlify/Vercel/Node.
license: Apache-2.0
compatibility: 'React 18+, Vite or Rsbuild, Node.js 20+, Cloudflare Workers, Netlify, Vercel'
metadata:
  author: terminal-skills
  repository: https://github.com/TanStack/router
  version: 1.1.0
  category: development
  tags: "tanstack, react, full-stack, ssr, server-functions"
---

# TanStack Start

## Overview

TanStack Start is a full-stack React framework built on TanStack Router and Vite (Rsbuild is also supported). It provides type-safe server functions (`createServerFn`), file-based routes with loaders, middleware, server routes for raw HTTP endpoints, and per-route control of SSR, prerendering and SPA behavior. In v1 Start is a Vite plugin (`tanstackStart()`), not a Vinxi app: there is no `app.config.ts`, and routes live in `src/routes`. Checked against `@tanstack/react-start` 1.169 (October 2026).

## Instructions

### Step 1: Project setup

Scaffold with the official CLI (it asks for package manager and add-ons), or start from an example:

```bash
npx @tanstack/cli@latest create
npx gitpick TanStack/router/tree/main/examples/react/start-basic start-basic
```

By hand: `npm i @tanstack/react-start @tanstack/react-router react react-dom`, then `npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node`, set `"type": "module"` and scripts `"dev": "vite dev"`, `"build": "vite build"`.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart(),
    viteReact(), // must come after tanstackStart()
  ],
})
```

```text
my-app/
├── src/
│   ├── routes/
│   │   ├── __root.tsx          # root layout (html shell)
│   │   ├── index.tsx           # /
│   │   └── health.ts           # server route: /health
│   ├── utils/                  # server functions, middleware
│   ├── router.tsx              # exports getRouter()
│   └── routeTree.gen.ts        # generated on first dev/build, do not edit
├── vite.config.ts
└── tsconfig.json
```

Keep `verbatimModuleSyntax` off; it can leak server code into the client bundle.
```tsx
// src/router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true })
}
```

```tsx
// src/routes/__root.tsx
import { Outlet, createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Northwind Journal' }],
  }),
  component: () => (
    <html>
      <head><HeadContent /></head>
      <body><Outlet /><Scripts /></body>
    </html>
  ),
})
```

### Step 2: Server functions

`createServerFn` defines logic that runs only on the server and is callable from loaders, components and event handlers. The input schema goes in `.validator()` (not `.inputValidator()`, which does not exist in v1). A Zod 4 schema can be passed directly; a plain function `(d: T) => d` also works.

```ts
// src/utils/posts.functions.ts
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { authMiddleware } from './auth'
import { db } from './db.server' // your own DB module

export const getPosts = createServerFn({ method: 'GET' })
  .validator(z.object({ limit: z.number().min(1).max(100).default(20) }))
  .handler(async ({ data }) => db.posts.latest(data.limit))
export const getPost = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const post = await db.posts.find(data.id)
    if (!post) throw notFound()
    return post
  })

export const createPost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ title: z.string().min(1).max(200), body: z.string().min(1) }))
  .handler(async ({ data, context }) => db.posts.insert({ ...data, authorId: context.user.id }))
```

Call one as `getPosts({ data: { limit: 10 } })`; input always comes from the network, so keep the validator. In components wrap it with `useServerFn(createPost)` so redirects and `notFound()` thrown on the server are handled by the router. Put database access in modules the client never imports (for example `*.server.ts`) and import them only from inside handlers.

### Step 3: Routes with loaders

```tsx
// src/routes/index.tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { getPosts } from '~/utils/posts.functions'

export const Route = createFileRoute('/')({
  loader: () => getPosts({ data: { limit: 10 } }),
  component: Home,
})

function Home() {
  const posts = Route.useLoaderData()
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}><Link to="/posts/$postId" params={{ postId: p.id }}>{p.title}</Link></li>
      ))}
    </ul>
  )
}
```

```tsx
// src/routes/posts/$postId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { getPost } from '~/utils/posts.functions'

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => getPost({ data: { id: params.postId } }),
  notFoundComponent: () => <div>Post not found</div>,
  component: () => <h1>{Route.useLoaderData().title}</h1>,
})
```

The loader runs on the server for the first request and on the client during navigation. The `~/` alias needs `"paths": { "~/*": ["./src/*"] }` in `tsconfig.json`.

### Step 4: Middleware

Request middleware (the default, `createMiddleware()`) wraps every server request it is attached to. Function middleware (`createMiddleware({ type: 'function' })`) wraps server functions, can also have a `.client()` step, and can pass `context` down the chain through `next({ context })`.

```ts
// src/utils/auth.ts
import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { verifyToken } from './auth.server'

export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const token = getRequestHeader('authorization')?.replace('Bearer ', '')
  const user = token ? await verifyToken(token) : null
  if (!user) throw new Error('Unauthorized')
  return next({ context: { user } })
})
```

Middleware can depend on other middleware with `.middleware([...])`. To run one on everything, create `src/start.ts`:

```ts
import { createStart } from '@tanstack/react-start'
import { loggingMiddleware } from './utils/logging'

export const startInstance = createStart(() => ({
  functionMiddleware: [loggingMiddleware], // every server function
  // requestMiddleware: [...]              // every request
}))
```

### Step 5: Server routes (HTTP endpoints)

Server routes serve requests from outside your app (webhooks, health checks, public APIs). Add a `server.handlers` property to `createFileRoute` in any file under `src/routes`; `createAPIFileRoute` from older betas no longer exists. Use server functions instead when only your own UI calls the code.

```ts
// src/routes/health.ts  ->  GET /health
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/health')({
  server: {
    handlers: {
      GET: async () => Response.json({ status: 'ok', at: new Date().toISOString() }),
    },
  },
})
```

```ts
// src/routes/api/webhooks/stripe.ts  ->  POST /api/webhooks/stripe
import { createFileRoute } from '@tanstack/react-router'
import Stripe from 'stripe'

export const Route = createFileRoute('/api/webhooks/stripe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get('stripe-signature') ?? ''
        const payload = await request.text() // raw body, needed for the signature check
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!) // inside the handler: a top-level `new Stripe()` throws at import when the key is unset and breaks every route
        try {
          stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!)
        } catch {
          return new Response('Invalid signature', { status: 400 })
        }
        return Response.json({ received: true })
      },
    },
  },
})
```

File names follow router conventions: `users.$id.ts` and `users/$id.ts` both map to `/users/$id`. A path can have only one handler file. A route may hold both `server.handlers` and a `component`.

### Step 6: Rendering modes

Each route chooses its SSR behavior with `ssr`: `true` (default), `false` (render only in the browser), or `'data-only'` (loaders run on the server, component renders only on the client). A child can only be more restrictive than its parent. Change the default with `defaultSsr` in `createStart`.

```tsx
// src/routes/dashboard.tsx
export const Route = createFileRoute('/dashboard')({
  ssr: false,
  component: DashboardPage,
})
```

Static prerendering is a plugin option and is off by default:

```ts
plugins: [
  tanstackStart({
    prerender: { enabled: true, crawlLinks: true, failOnError: true },
    pages: [{ path: '/about' }], // extra pages to render besides discovered static routes
  }),
  viteReact(),
]
```

`vite build` then prints `[prerender] Prerendered N pages` and writes `<path>/index.html` files into the output.

### Step 7: Deploy

Start builds with Vite, so the target is chosen by a Vite plugin:

- **Node, Docker, Vercel, Bun and other hosts: Nitro.** `npm i nitro`, add `nitro()` from `nitro/vite` to `plugins` (between `tanstackStart()` and `viteReact()`), run `vite build`, start with `node .output/server/index.mjs`. Nitro is still a beta release, so pin its version. Vercel follows the same Nitro setup.
- **Cloudflare Workers:** `npm i -D @cloudflare/vite-plugin wrangler`, add the `cloudflare()` plugin (see the hosting guide for the `wrangler.jsonc` entry), then `wrangler deploy`.
- **Netlify:** `npm i -D @netlify/vite-plugin-tanstack-start` and add its plugin.

The built Node server reads `PORT` and `HOST` from the environment.

## Examples

### Example 1: Blog with a protected create action
**User:** "Add a posts list, a post page and an authenticated create-post action to my TanStack Start app."

Create `src/utils/posts.functions.ts` with `getPosts`, `getPost` and `createPost` as in Step 2, `src/utils/auth.ts` with `authMiddleware`, then routes `index.tsx` and `posts/$postId.tsx` as in Step 3. Verify with `npm run build` and `node .output/server/index.mjs`: `GET /` returns server-rendered HTML with the post links, and `/posts/missing` answers 404 with the "Post not found" component.

### Example 2: Health check and a client-only dashboard
**User:** "Add a /health JSON endpoint for the load balancer, and make /dashboard skip server rendering because it uses window APIs."

Add `src/routes/health.ts` with a `server.handlers.GET` handler and set `ssr: false` on `src/routes/dashboard.tsx`. After building and starting the server, `curl http://127.0.0.1:3000/health` prints `{"status":"ok","at":"2026-10-24T09:00:00.000Z"}`, and the HTML for `/dashboard` contains only the shell; the component renders in the browser.

## Guidelines

- Server functions are the default way to talk to the server from your own UI; use server routes only for endpoints that outside clients call.
- Handlers and middleware `.server()` bodies run only on the server, but top-level imports in a route file reach the client bundle. Keep secrets and database clients in server-only modules imported from handlers.
- `routeTree.gen.ts` is generated; commit it or regenerate it with `vite dev`/`vite build`, never edit it.
- Do not use `app.config.ts`, `@tanstack/react-start/config`, `createAPIFileRoute` or `app/` paths from pre-1.0 tutorials; they belong to the removed Vinxi-based betas.
