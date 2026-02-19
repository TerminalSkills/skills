---
name: nuxt
description: |
  Nuxt is a Vue.js meta-framework for building full-stack web applications with
  server-side rendering, static generation, and file-based routing. It includes
  Nitro server engine, auto-imports, and a powerful module ecosystem.
license: Apache-2.0
compatibility:
  - node >= 18
  - npm or yarn or pnpm
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - vue
    - ssr
    - fullstack
    - typescript
    - node
    - jamstack
---

# Nuxt

Nuxt 3 is built on Vue 3, Vite, and the Nitro server engine. It provides SSR, SSG, file-based routing, auto-imports, and a rich module ecosystem.

## Installation

```bash
# Create new Nuxt project
npx nuxi@latest init my-app
cd my-app && npm install && npm run dev
```

## Pages and Routing

```vue
<!-- pages/articles/index.vue — article list page with data fetching -->
<script setup lang="ts">
const { data: articles } = await useFetch('/api/articles')
</script>

<template>
  <div>
    <h1>Articles</h1>
    <div v-for="article in articles" :key="article.id">
      <NuxtLink :to="`/articles/${article.slug}`">
        <h2>{{ article.title }}</h2>
      </NuxtLink>
    </div>
  </div>
</template>
```

```vue
<!-- pages/articles/[slug].vue — dynamic route page -->
<script setup lang="ts">
const route = useRoute()
const { data: article } = await useFetch(`/api/articles/${route.params.slug}`)
if (!article.value) throw createError({ statusCode: 404, message: 'Not found' })
useHead({ title: article.value.title })
</script>

<template>
  <article>
    <h1>{{ article.title }}</h1>
    <div v-html="article.body" />
  </article>
</template>
```

## Server API Routes

```typescript
// server/api/articles.get.ts — GET /api/articles
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Number(query.page) || 1
  const limit = Math.min(Number(query.limit) || 20, 100)

  return await useDB()
    .select('*').from('articles')
    .where('published', true)
    .orderBy('created_at', 'desc')
    .limit(limit).offset((page - 1) * limit)
})
```

```typescript
// server/api/articles.post.ts — POST /api/articles
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const body = await readBody(event)
  if (!body.title || !body.body) throw createError({ statusCode: 400, message: 'Required' })

  const [article] = await useDB()
    .insert({ title: body.title, body: body.body, author_id: session.user.id })
    .into('articles').returning('*')

  setResponseStatus(event, 201)
  return article
})
```

## Composables

```typescript
// composables/useArticles.ts — reusable data composable
export function useArticles() {
  const articles = useState<Article[]>('articles', () => [])

  async function fetchArticles(page = 1) {
    const { data } = await useFetch('/api/articles', { query: { page } })
    if (data.value) articles.value = data.value
  }

  return { articles: readonly(articles), fetchArticles }
}
```

## Components

```vue
<!-- components/ArticleCard.vue — auto-imported component -->
<script setup lang="ts">
defineProps<{ title: string; slug: string; excerpt: string }>()
</script>

<template>
  <article>
    <NuxtLink :to="`/articles/${slug}`"><h3>{{ title }}</h3></NuxtLink>
    <p>{{ excerpt }}</p>
  </article>
</template>
```

## Middleware

```typescript
// middleware/auth.ts — route middleware
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value) return navigateTo('/login')
})
```

## Configuration

```typescript
// nuxt.config.ts — Nuxt configuration
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase', '@nuxt/ui'],
  runtimeConfig: {
    dbUrl: process.env.DATABASE_URL,
    public: { appName: 'My App' },
  },
  routeRules: {
    '/articles/**': { swr: 3600 },
    '/admin/**': { ssr: false },
  },
})
```

## Key Patterns

- Use `useFetch` for SSR-compatible data fetching — it deduplicates and transfers state
- File-based routing: `pages/users/[id].vue` becomes `/users/:id`
- Server routes in `server/api/` are auto-registered with method suffixes
- Use `useState` for SSR-safe shared state instead of `ref` at module level
- Use `routeRules` for per-route rendering strategies (SSR, SPA, ISR, prerender)
