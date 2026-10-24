---
name: nextjs
description: >-
  Assists with building production-grade React applications using Next.js 16. Use when working with
  the App Router, Server Components, Server Actions, the proxy file (formerly middleware), Cache
  Components, or deploying to Vercel or self-hosted environments. Trigger words: nextjs, next.js,
  app router, server components, server actions, use cache, proxy.ts, react framework, ssr, isr.
license: Apache-2.0
compatibility: "Requires Node.js 20.9+ (Next.js 16); React 19"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/vercel/next.js
  tags: ["nextjs", "react", "full-stack", "ssr", "server-components"]
---

# Next.js

## Overview

Next.js is a full-stack React framework. The App Router gives file-based routing, Server Components, Server Actions for mutations and streaming. Next.js 16 (current: 16.4) made Turbopack the default bundler, removed synchronous access to `params`, `searchParams`, `cookies()` and `headers()`, renamed `middleware` to `proxy`, and added opt-in Cache Components (`use cache`, Partial Prerendering). `fetch` requests are not cached by default (since 15). Check `npm view next version` and the upgrade guide at nextjs.org/docs/app/guides/upgrading/version-16 before assuming behavior from older projects.

## Instructions

### Setup

```bash
npx create-next-app@latest northwind-portal --yes   # TypeScript, Tailwind, ESLint, App Router, Turbopack
cd northwind-portal
npm run dev                                          # http://localhost:3000
```

`next dev` and `next build` use Turbopack by default (`--turbopack` is no longer needed). A custom `webpack` config makes `next build` fail unless you pass `--webpack` or move to `turbopack` options in `next.config.ts`. Upgrading an older app: `npx @next/codemod@canary upgrade latest`, then `npx @next/codemod@canary next-async-request-api .` for leftover synchronous `params`/`cookies()` access.

### Routes and components

- Use `app/` with `page.tsx`, `layout.tsx`, `loading.tsx` (streaming), `error.tsx` (client component), `not-found.tsx`, `route.ts` for HTTP handlers.
- Components are Server Components by default; add `"use client"` only for state, effects, event handlers or browser APIs. Keep the boundary low in the tree.
- `params` and `searchParams` are Promises. Await them, or type with the global `PageProps<'/orders/[id]'>` helper (run `npx next typegen` to generate it):

```tsx
// app/orders/[id]/page.tsx
export default async function Page({ params }: PageProps<'/orders/[id]'>) {
  const { id } = await params
  const order = await getOrder(id)
  return <h1>Order {order.id}: {order.status}</h1>
}
```

`cookies()`, `headers()` and `draftMode()` are async too: `const theme = (await cookies()).get('theme')?.value`.

### Data fetching and caching

Without Cache Components, `fetch` is uncached unless you pass `{ cache: 'force-cache' }` or `{ next: { revalidate: 3600, tags: ['orders'] } }`; route segment options `export const revalidate = 3600` and `dynamic` still work. Query a database directly in a Server Component and co-locate the query with the component that needs it.

Cache Components is opt-in (`cacheComponents: true` plus `partialPrefetching: true` in `next.config.ts`). Data is then dynamic by default and you choose what to cache with the `use cache` directive; this replaces `revalidate`/`dynamic`/`experimental_ppr` route segment options and requires the Node.js runtime.

```tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { cookies } from 'next/headers'

async function getOrder(id: string) {
  'use cache'
  cacheLife('hours')           // profiles: seconds, minutes, hours, days, weeks, max
  cacheTag(`order-${id}`)
  return db.order.findUnique({ where: { id } })
}

async function OrderDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await getOrder(id)
  return <h1>Order {order?.id}: {order?.status}</h1>
}

export default function Page({ params }: PageProps<'/orders/[id]'>) {
  return (
    <Suspense fallback={<p>Loading order...</p>}>
      <OrderDetails params={params} />
    </Suspense>
  )
}
```

With Cache Components on, reading `params`, `cookies()`, `headers()` or uncached data outside a `<Suspense>` boundary fails `next build` ("uncached or runtime data during prerendering"). Fix it by moving the access into a component wrapped in `<Suspense>` (as above), caching it with `use cache`, or exporting `instant = false` to accept a blocking route. A `use cache` function cannot read `cookies()`/`headers()` itself: read them outside and pass values as arguments.

### Mutations with Server Actions

```tsx
// app/orders/actions.ts
'use server'
import { revalidateTag, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const Shipment = z.object({ orderId: z.string().min(1), carrier: z.enum(['dhl', 'ups', 'fedex']) })

export async function shipOrder(formData: FormData) {
  const session = await getSession()                 // authorize inside every action
  if (!session) throw new Error('Not signed in')
  const input = Shipment.parse(Object.fromEntries(formData))
  await db.order.update({ where: { id: input.orderId }, data: { status: 'shipped', carrier: input.carrier } })
  updateTag(`order-${input.orderId}`)                // Server Actions only: user sees their change immediately
  revalidateTag('order-list', 'max')                 // stale-while-revalidate; second argument is required
  redirect(`/orders/${input.orderId}`)
}
```

Use it as `<form action={shipOrder}>`. `revalidateTag(tag, 'max')` works in Route Handlers too; `updateTag` does not. `revalidatePath('/orders')` also remains available. In client components use `useActionState` for validation errors and `useOptimistic` for instant feedback.

### Proxy (formerly middleware)

`middleware.ts` is deprecated; rename it to `proxy.ts` (project root or `src/`) and export `proxy`. It runs on the Node.js runtime (use the still-supported `middleware` file only if you need the Edge runtime).

```ts
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  if (!request.cookies.has('session')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = { matcher: ['/dashboard/:path*', '/orders/:path*'] }
```

Without a `matcher` it runs on every request including static assets. Treat it as an optimistic redirect only: verify the session again in Server Actions, Route Handlers and the data layer.

### Metadata, images, fonts

Use `generateMetadata()` (async, receives Promise `params`) or a static `metadata` export, `next/image` for images and `next/font` for fonts. In 16, `next/image` has stricter defaults (local images with query strings need `images.localPatterns`; `minimumCacheTTL` default is 4 hours).

## Examples

### Example 1: Order page with a cached shell and live parts

**User request:** "Make the order detail page fast, but the order status must update when staff mark it shipped."

**Actions:**
1. Enable `cacheComponents` and `partialPrefetching` in `next.config.ts`.
2. Move the query into `getOrder()` with `'use cache'`, `cacheLife('hours')` and `cacheTag(\`order-${id}\`)`.
3. Wrap the `await params` component and the cookie-reading component in separate `<Suspense>` boundaries so the shell prerenders.
4. Call `updateTag(\`order-${id}\`)` in the `shipOrder` Server Action.
5. Run `npx next build` and confirm the route is marked as Partial Prerender.

**Output:** The static shell is served instantly from the cache, the order data is refreshed right after a staff action, and the build log lists `/orders/[id]` with the partial-prerender symbol.

### Example 2: Upgrade an app from Next.js 14 to 16

**User request:** "Upgrade our Next.js 14 app to the latest version."

**Actions:**
1. Check Node.js is 20.9+ and run `npx @next/codemod@canary upgrade latest`.
2. Run `npx @next/codemod@canary next-async-request-api .` and fix remaining `await params`/`await cookies()` spots; run `npx next typegen` for the `PageProps` helpers.
3. Confirm `middleware.ts` became `proxy.ts` with an exported `proxy`, and drop `--turbopack` flags from scripts.
4. Add `cache: 'force-cache'` or `use cache` where pages relied on the old default `fetch` caching.
5. Run `npx next build` and fix errors (custom `webpack` config, image query strings).

**Output:** A passing build on Next.js 16 with async request APIs, `proxy.ts`, and explicit caching.

## Guidelines

- Default to Server Components; add `"use client"` only for interactivity.
- Await `params`, `searchParams`, `cookies()`, `headers()`; synchronous access is gone in 16.
- Never trust a Server Action's input: it is a public POST endpoint. Validate with a schema and check authorization inside the action.
- Proxy is not a security boundary. Re-check sessions where data is read or written.
- Cache deliberately: `fetch` is uncached by default; with Cache Components, wrap dynamic reads in `<Suspense>` and cache with `use cache` plus `cacheTag`.
- Use `loading.tsx` or `<Suspense>` so a slow query does not block the whole page.
- Never expose secrets to the client: only `NEXT_PUBLIC_` variables are bundled; keep the rest in Server Components and actions.
- Use `next/image` for images and `generateMetadata()` for dynamic SEO.
