---
name: nuxt
description: >-
  Nuxt is the full-stack Vue framework with server-side rendering, auto-imports,
  file-based routing and a Nitro server for API routes. Use it when a user asks
  to build or fix a Nuxt app, set up per-route rendering (SSR, prerender, ISR,
  SPA), fetch data with useFetch or useAsyncData, write server/api endpoints,
  share state with useState, set page SEO meta, or deploy a Nuxt 3 or Nuxt 4 site.
license: Apache-2.0
compatibility: 'Nuxt 4.x (Nuxt 3 notes included); Node.js 22.22.3+, 24.15+ or 26+; npm, pnpm, yarn or bun'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/nuxt/nuxt
  tags:
    - vue
    - nuxt
    - ssr
    - fullstack
    - nitro
---

# Nuxt

## Overview

Nuxt is the Vue meta-framework: file-based routing, auto-imported components and composables, server rendering with hydration, and a Nitro server that serves `server/api` endpoints and deploys to Node, serverless and edge platforms. The current major version is Nuxt 4. Its source folder is `app/` (pages, components, composables, layouts, `app.vue`), while `server/`, `public/` and `nuxt.config.ts` stay in the project root. Nuxt 3 projects keep those folders at the root.

## Instructions

### Create a project

```bash
npm create nuxt@latest shop-blog
cd shop-blog && npm install && npm run dev
```

The dev server listens on `http://localhost:3000`. `npm run build` writes `.output/`; run it with `node .output/server/index.mjs` (set `PORT` and `HOST` to change the listener). `npm run generate` prerenders a fully static site.

### Pages and data fetching

```vue
<script setup lang="ts">
const { data: posts } = await useFetch('/api/posts')
</script>

<template>
  <div>
    <h1>Blog</h1>
    <article v-for="post in posts" :key="post.slug">
      <NuxtLink :to="`/posts/${post.slug}`">
        <h2>{{ post.title }}</h2>
        <p>{{ post.excerpt }}</p>
      </NuxtLink>
    </article>
  </div>
</template>
```

```vue
<script setup lang="ts">
const route = useRoute('posts-slug')
const { data: post, error } = await useFetch(() => `/api/posts/${route.params.slug}`)

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}

useSeoMeta({
  title: () => post.value?.title,
  description: () => post.value?.excerpt,
  ogTitle: () => post.value?.title,
})
</script>

<template>
  <article v-if="post">
    <h1>{{ post.title }}</h1>
    <p>{{ post.content }}</p>
  </article>
</template>
```

`useFetch(url)` is `useAsyncData` plus `$fetch`: it runs on the server, ships the result in the payload and does not refetch on hydration. Use `useAsyncData(key, handler)` for anything that is not a plain URL. Use `$fetch` (not `useFetch`) inside event handlers such as a button click. `data` is a shallow ref; use `deep: true` if you mutate nested fields. `useRoute('posts-slug')` with the route name gives typed params.

### Server API routes

Files in `server/api/` become endpoints; the suffix picks the method (`index.get.ts`, `index.post.ts`). Anything exported from `server/utils/` is auto-imported in server code.

```typescript
// server/utils/posts.ts
export interface Post { slug: string; title: string; excerpt: string; content: string }

const posts: Post[] = [
  { slug: 'hello-nuxt', title: 'Hello Nuxt', excerpt: 'First post', content: 'Nitro serves this.' },
  { slug: 'routing-rules', title: 'Route rules', excerpt: 'Hybrid rendering', content: 'ISR, SSR and SPA per route.' },
]
export const listPosts = () => posts
export const findPost = (slug: string) => posts.find((p) => p.slug === slug)
```

```typescript
// server/api/posts/[slug].get.ts
export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug')!
  const post = findPost(slug)
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  return post
})
```

Validate request bodies instead of trusting `readBody`. `readValidatedBody` takes any function that throws on bad input, such as zod's `parse`; a failure answers 400.

Install the validator first with `npm install zod`.

```typescript
// server/api/posts/index.post.ts
import { z } from 'zod'
const schema = z.object({ title: z.string().min(3), content: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, schema.parse)
  setResponseStatus(event, 201)
  return { slug: body.title.toLowerCase().replace(/\s+/g, '-'), ...body }
})
```

Server middleware in `server/middleware/` runs on every request. Secrets belong in `runtimeConfig` (override `adminToken` at runtime with the `NUXT_ADMIN_TOKEN` environment variable):

```typescript
// server/middleware/auth.ts
export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/admin')) return
  if (getHeader(event, 'authorization') !== `Bearer ${useRuntimeConfig(event).adminToken}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
})
```

The `/api/admin/ping` route the middleware protects:

```typescript
// server/api/admin/ping.get.ts
export default defineEventHandler(() => ({ ok: true }))
```

### Rendering modes per route

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  runtimeConfig: { adminToken: '' },
  routeRules: {
    '/': { prerender: true },
    '/posts/**': { isr: 3600 },
    '/admin/**': { ssr: false },
  },
})
```

`prerender: true` builds the page once at build time, `isr: 3600` caches the rendered page on supported hosts (Vercel, Netlify) and revalidates hourly, `ssr: false` makes that section a client-rendered SPA.

### Shared state and composables

Anything in `app/composables/` is auto-imported. Use `useState` (never a module-level `ref`) for state shared between components, because module-level state leaks between requests on the server.

```typescript
// app/composables/useAuth.ts
interface User { id: string; name: string }

export function useAuth() {
  const user = useState<User | null>('user', () => null)
  const isLoggedIn = computed(() => user.value !== null)

  async function login(email: string, password: string) {
    user.value = await $fetch<User>('/api/auth/login', { method: 'POST', body: { email, password } })
  }
  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/login')
  }
  return { user, isLoggedIn, login, logout }
}
```

## Examples

**"Add a /posts/<slug> page that returns 404 for unknown posts."** Create `app/pages/posts/[slug].vue` as above and the `[slug].get.ts` endpoint. Tested on Nuxt 4.5: `curl localhost:3000/posts/hello-nuxt` renders `<h1>Hello Nuxt</h1>` with the title in `<title>`, and `/posts/nope` returns status 404.

**"Protect /api/admin with a token."** Add the middleware above, set `NUXT_ADMIN_TOKEN=s3cret` when starting the server. A request without a header gets `401`; with `Authorization: Bearer s3cret` the handler answers `{"ok":true}`.

**"Reject bad input on POST /api/posts."** With the zod schema above, `{"title":"Ab"}` returns `400 Validation Error`, and `{"title":"My first post","content":"hi"}` returns `201` with `{"slug":"my-first-post",...}`.

## Guidelines

- Pick a rendering mode per route in `routeRules` instead of one global choice. Keep authenticated dashboards on `ssr: false` or SSR without caching.
- Nuxt 3 to 4 differences: the `app/` source directory, shallow `data` refs from `useFetch`/`useAsyncData`, and a `compatibilityDate` in `nuxt.config.ts` that pins Nitro and module defaults. Run `npx nuxt upgrade` and follow the official migration guide when moving a Nuxt 3 project.
- Fetch keys must be unique per distinct request; a repeated key shares one cached result.
- Do not put API secrets in `runtimeConfig.public` or in client code; only `runtimeConfig.public` is exposed to the browser.
- Use `v-html` only with sanitized content.
- Modules extend Nuxt through `modules: []` in `nuxt.config.ts`: for example `@nuxt/ui`, `@nuxt/image`, `@nuxt/content`, `nuxt-auth-utils`. Prefer official or well-maintained ones, and check that a module lists support for your Nuxt major version.
- Deploy by choosing the Nitro preset (`NITRO_PRESET=cloudflare_pages npm run build`, or let Vercel and Netlify auto-detect). For a plain server use the Node output above.
