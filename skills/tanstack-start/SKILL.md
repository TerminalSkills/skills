---
name: tanstack-start
description: >-
  Build full-stack React apps with TanStack Start. Use when a user asks to
  create a full-stack React application with type-safe server functions, set up
  file-based routing with SSR/SSG/SPA modes, build APIs with middleware and
  validation, implement server-side data fetching with TanStack Router, or
  deploy to Cloudflare/Netlify/Vercel/Node.
license: Apache-2.0
compatibility: 'React 18+, Vite, Node.js, Cloudflare Workers, Netlify, Vercel'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - tanstack
    - react
    - full-stack
    - ssr
    - server-functions
    - vite
    - typescript
---

# TanStack Start

## Overview

TanStack Start is a full-stack React framework built on TanStack Router and Vite. It provides type-safe server functions (`createServerFn`), file-based routing with loaders, composable middleware, Zod validation across the network boundary, and flexible rendering modes (SSR, SSG, SPA, ISR). Unlike Next.js, it uses Vite (not Webpack), supports any deployment target, and gives you explicit control over server/client code boundaries.

## Instructions

### Step 1: Project Setup

```bash
npx create-start@latest my-app
cd my-app
npm install
npm run dev
```

```text
my-app/
├── app/
│   ├── routes/
│   │   ├── __root.tsx          # Root layout
│   │   ├── index.tsx           # / route
│   │   ├── about.tsx           # /about route
│   │   ├── posts/
│   │   │   ├── index.tsx       # /posts route
│   │   │   └── $postId.tsx     # /posts/:postId dynamic route
│   │   └── api/
│   │       └── health.ts       # /api/health server route
│   ├── utils/
│   │   ├── posts.functions.ts  # Server function wrappers
│   │   ├── posts.server.ts     # Server-only DB queries
│   │   └── schemas.ts          # Shared Zod schemas
│   ├── router.tsx
│   └── client.tsx
├── app.config.ts               # TanStack Start config
└── package.json
```

### Step 2: Server Functions

Server functions are the core primitive — define server-only logic callable from anywhere (loaders, components, event handlers). They cross the network boundary with full type safety.

```typescript
// app/utils/posts.server.ts — Server-only database queries
import { db } from '~/db'

export async function findPosts(limit: number) {
  return db.query.posts.findMany({
    limit,
    orderBy: (posts, { desc }) => [desc(posts.createdAt)],
    with: { author: true },
  })
}

export async function findPostById(id: string) {
  return db.query.posts.findFirst({
    where: (posts, { eq }) => eq(posts.id, id),
    with: { author: true, comments: { with: { author: true } } },
  })
}

export async function createPost(data: { title: string; content: string; authorId: string }) {
  return db.insert(posts).values(data).returning()
}
```

```typescript
// app/utils/posts.functions.ts — Server functions with validation
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { findPosts, findPostById, createPost } from './posts.server'

// GET — fetch posts (callable from loaders and components)
export const getPosts = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ limit: z.number().min(1).max(100).default(20) }))
  .handler(async ({ data }) => {
    return findPosts(data.limit)
  })

// GET — fetch single post
export const getPost = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const post = await findPostById(data.id)
    if (!post) throw notFound()
    return post
  })

// POST — create post (requires auth via middleware)
export const createNewPost = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(50000),
  }))
  .handler(async ({ data, context }) => {
    // context.user comes from authMiddleware
    return createPost({ ...data, authorId: context.user.id })
  })
```

### Step 3: Routes with Loaders

```tsx
// app/routes/posts/index.tsx — Posts list page with loader
import { createFileRoute } from '@tanstack/react-router'
import { getPosts } from '~/utils/posts.functions'

export const Route = createFileRoute('/posts/')({
  // Loader runs on the server during SSR, fetches data before render
  loader: () => getPosts({ data: { limit: 20 } }),

  component: PostsPage,
})

function PostsPage() {
  const posts = Route.useLoaderData()

  return (
    <div>
      <h1>Posts</h1>
      <ul>
        {posts.map(post => (
          <li key={post.id}>
            <Link to="/posts/$postId" params={{ postId: post.id }}>
              {post.title}
            </Link>
            <span> by {post.author.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

```tsx
// app/routes/posts/$postId.tsx — Dynamic post page
import { createFileRoute, notFound } from '@tanstack/react-router'
import { getPost } from '~/utils/posts.functions'

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => getPost({ data: { id: params.postId } }),

  // Error boundary for not-found
  notFoundComponent: () => <div>Post not found</div>,

  component: PostPage,
})

function PostPage() {
  const post = Route.useLoaderData()

  return (
    <article>
      <h1>{post.title}</h1>
      <p>By {post.author.name} · {new Date(post.createdAt).toLocaleDateString()}</p>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />

      <h2>Comments ({post.comments.length})</h2>
      {post.comments.map(comment => (
        <div key={comment.id}>
          <strong>{comment.author.name}</strong>
          <p>{comment.body}</p>
        </div>
      ))}
    </article>
  )
}
```

### Step 4: Middleware

Composable middleware for auth, logging, rate limiting — chains execute in order with `next()`.

```typescript
// app/middleware/auth.ts — Authentication middleware
import { createMiddleware } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { getRequestHeader } from '@tanstack/react-start/server'
import { verifyToken } from '~/utils/auth.server'

// Request middleware — runs on all server requests that use it
export const authMiddleware = createMiddleware()
  .server(async ({ next }) => {
    const token = getRequestHeader('Authorization')?.replace('Bearer ', '')

    if (!token) {
      throw redirect({ to: '/login' })
    }

    const user = await verifyToken(token)
    if (!user) {
      throw redirect({ to: '/login' })
    }

    // Pass user to the next middleware / server function via context
    return next({ context: { user } })
  })

// Logging middleware — logs request timing
export const loggingMiddleware = createMiddleware()
  .server(async ({ next }) => {
    const start = Date.now()
    const result = await next()
    console.log(`Request took ${Date.now() - start}ms`)
    return result
  })

// Compose middleware — auth depends on logging
export const protectedMiddleware = createMiddleware()
  .middleware([loggingMiddleware, authMiddleware])
  .server(async ({ next, context }) => {
    // context.user is available from authMiddleware
    console.log(`Authenticated request from ${context.user.email}`)
    return next()
  })
```

### Step 5: Server Functions in Components

```tsx
// app/routes/posts/new.tsx — Form with server function mutation
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { createNewPost } from '~/utils/posts.functions'

export const Route = createFileRoute('/posts/new')({
  component: NewPostForm,
})

function NewPostForm() {
  const navigate = useNavigate()
  const createPost = useServerFn(createNewPost)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const post = await createPost({
      data: {
        title: formData.get('title') as string,
        content: formData.get('content') as string,
      },
    })

    // Navigate to the new post
    navigate({ to: '/posts/$postId', params: { postId: post.id } })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Post title" required />
      <textarea name="content" placeholder="Write your post..." required rows={10} />
      <button type="submit">Publish</button>
    </form>
  )
}
```

### Step 6: Server Routes (API Endpoints)

```typescript
// app/routes/api/health.ts — API-only route (no React component)
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/health')({
  GET: async ({ request }) => {
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION,
    })
  },
})
```

```typescript
// app/routes/api/webhooks/stripe.ts — Webhook handler
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/webhooks/stripe')({
  POST: async ({ request }) => {
    const signature = request.headers.get('stripe-signature')
    const body = await request.text()

    const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object)
        break
    }

    return Response.json({ received: true })
  },
})
```

### Step 7: Rendering Modes

```typescript
// app.config.ts — Configure rendering mode
import { defineConfig } from '@tanstack/react-start/config'
import vite from 'vite'

export default defineConfig({
  vite: {
    // Vite config
  },
  // Deploy targets
  server: {
    preset: 'node-server',        // or 'cloudflare-pages', 'netlify', 'vercel'
  },
})
```

```tsx
// Static prerendering — generate at build time
// app/routes/about.tsx
export const Route = createFileRoute('/about')({
  // This page will be statically generated at build time
  staticData: { prerender: true },
  loader: () => getAboutContent(),
  component: AboutPage,
})

// Selective SSR — skip SSR for client-heavy pages
// app/routes/dashboard.tsx
export const Route = createFileRoute('/dashboard')({
  // This page will be a client-side SPA (no SSR)
  ssr: false,
  component: DashboardPage,
})
```

## Guidelines

- **Server functions are the network boundary** — `createServerFn` replaces API routes for most use cases. Server code stays on the server, client gets type-safe RPC stubs.
- **File organization**: `.functions.ts` for server function wrappers, `.server.ts` for server-only helpers, `.ts` for shared schemas. Static imports of `.functions.ts` are safe anywhere.
- **Loaders run before render** — data is available immediately in components via `Route.useLoaderData()`. No loading spinners for initial page data.
- **Use `useServerFn()` hook** in components to call server functions with proper error handling and loading states.
- **Middleware composes** — build auth, logging, rate limiting as independent middleware and chain them. Context flows through the chain via `next({ context })`.
- **Zod validation in `inputValidator`** — validates on both client and server, single schema definition, full TypeScript inference.
- **Deploy anywhere** — Vite-based build outputs for Node.js, Cloudflare Workers/Pages, Netlify, Vercel, Deno. Change the `server.preset` in config.
- **TanStack Router underneath** — all router features work (type-safe links, search params, nested layouts, error boundaries, pending states).
- **Use React Query for mutations** — combine `useServerFn` with `useMutation` for optimistic updates, error handling, and cache invalidation.
