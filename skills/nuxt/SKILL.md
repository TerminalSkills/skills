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
  category: development
  tags:
    - vue
    - ssr
    - fullstack
    - typescript
    - node
    - jamstack
---

# Nuxt

Nuxt 3 is built on Vue 3, Vite, and the Nitro server engine. It provides SSR, SSG, file-based routing, auto-imports, and a rich module ecosystem for building modern web apps.

## Installation

```bash
# Create new Nuxt project
npx nuxi@latest init my-app
cd my-app
npm install
npm run dev
```

## Project Structure

```
# Nuxt 3 project layout (file-based conventions)
app/
├── pages/              # File-based routing
│   ├── index.vue       # /
│   ├── about.vue       # /about
│   └── articles/
│       ├── index.vue   # /articles
│       └── [slug].vue  # /articles/:slug
├── components/         # Auto-imported components
├── composables/        # Auto-imported composables
├── layouts/            # Page layouts
├── middleware/          # Route middleware
└── plugins/            # Nuxt plugins
server/
├── api/                # Server API routes
│   └── articles.get.ts # GET /api/articles
├── middleware/          # Server middleware
└── utils/              # Server utilities
nuxt.config.ts          # Nuxt configuration
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
      <p>{{ article.excerpt }}</p>
    </div>
  </div>
</template>
```

```vue
<!-- pages/articles/[slug].vue — dynamic route page -->
<script setup lang="ts">
const route = useRoute()
const { data: article } = await useFetch(`/api/articles/${route.params.slug}`)

if (!article.value) {
  throw createError({ statusCode: 404, message: 'Article not found' })
}

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

  const articles = await useDB()
    .select('*')
    .from('articles')
    .where('published', true)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset((page - 1) * limit)

  return articles
})
```

```typescript
// server/api/articles.post.ts — POST /api/articles
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const body = await readBody(event)

  if (!body.title || !body.body) {
    throw createError({ statusCode: 400, message: 'Title and body required' })
  }

  const article = await useDB()
    .insert({ title: body.title, body: body.body, author_id: session.user.id })
    .into('articles')
    .returning('*')

  setResponseStatus(event, 201)
  return article[0]
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
interface Props {
  title: string
  slug: string
  excerpt: string
  date: string
}
defineProps<Props>()
</script>

<template>
  <article class="card">
    <NuxtLink :to="`/articles/${slug}`">
      <h3>{{ title }}</h3>
    </NuxtLink>
    <p>{{ excerpt }}</p>
    <time>{{ date }}</time>
  </article>
</template>
```

## Layouts and Middleware

```vue
<!-- layouts/default.vue — default layout -->
<template>
  <div>
    <header>
      <nav>
        <NuxtLink to="/">Home</NuxtLink>
        <NuxtLink to="/articles">Articles</NuxtLink>
      </nav>
    </header>
    <main><slot /></main>
  </div>
</template>
```

```typescript
// middleware/auth.ts — route middleware
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value) {
    return navigateTo('/login')
  }
})
```

## Configuration

```typescript
// nuxt.config.ts — Nuxt configuration
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/supabase',
    '@nuxt/ui',
  ],
  runtimeConfig: {
    dbUrl: process.env.DATABASE_URL,
    public: {
      appName: 'My App',
    },
  },
  routeRules: {
    '/articles/**': { swr: 3600 },  // stale-while-revalidate
    '/admin/**': { ssr: false },      // SPA mode
  },
})
```

## Data Fetching

```vue
<!-- pages/dashboard.vue — multiple data fetching strategies -->
<script setup lang="ts">
// SSR fetch — runs on server, cached on client
const { data: stats } = await useFetch('/api/stats')

// Lazy fetch — doesn't block navigation
const { data: notifications, pending } = await useLazyFetch('/api/notifications')

// Client-only fetch
const { data: live } = await useFetch('/api/live', { server: false })
</script>
```

## Key Patterns

- Use `useFetch` for SSR-compatible data fetching — it deduplicates and transfers state
- File-based routing: `pages/users/[id].vue` becomes `/users/:id`
- Server routes in `server/api/` are auto-registered with method suffixes (`.get.ts`, `.post.ts`)
- Use `useState` for SSR-safe shared state instead of `ref` at module level
- Use `runtimeConfig` for environment variables — public config is exposed to client
- Use `routeRules` for per-route rendering strategies (SSR, SPA, ISR, prerender)
