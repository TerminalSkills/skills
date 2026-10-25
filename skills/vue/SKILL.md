---
name: vue
description: >-
  Vue.js is a progressive JavaScript framework for building web interfaces with
  single-file components, the Composition API and fine-grained reactivity. Use
  when a user asks to create a Vue 3 app, write a `script setup` component,
  use ref/computed/watch, props and emits, defineModel, Pinia stores, Vue
  Router guards, composables, or provide/inject, or to set up a project with
  Vite and TypeScript.
license: Apache-2.0
compatibility: 'Node.js 22.18+ or 24.12+ for create-vue; npm, pnpm or yarn'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/vuejs/core
  tags: "javascript, typescript, frontend, reactive, components"
---

# Vue

## Overview

Vue 3 builds interfaces from single-file components (`.vue`) that hold a template, a `script setup` block and styles. State is reactive (`ref`, `computed`, `watch`), shared state lives in Pinia, navigation in Vue Router, and reusable logic in composables. Versions checked in October 2026: `vue` 3.5.44 (3.6 with Vapor Mode is still a release candidate, so do not use it unless asked), `vue-router` 5.4, `pinia` 4.1, `vite` 8, `create-vue` 3.24. Router 5 and Pinia 4 keep the Router 4 and Pinia 2 style APIs used below.

## Instructions

### Create a project

```bash
npm create vue@latest -- --ts --router --pinia --vitest --eslint taskboard
cd taskboard && npm install && npm run dev
```

The flags skip the interactive prompts; run `npm create vue@latest -- --help` for the list (`--bare` omits the example code). `create-vue` itself needs Node 22.18+ or 24.12+. `npm run build` runs `vue-tsc` type-checking before the Vite build, so type errors fail the build.

### Project layout

```
src/
  main.ts             entry: createApp, plugins
  App.vue             root component with <RouterView />
  router/index.ts     routes and guards
  stores/             Pinia stores (articles.ts, auth.ts)
  composables/        use* functions (useApi.ts)
  components/         shared components
  views/              route-level components
  types/article.ts    shared TypeScript types
```

```ts
// src/types/article.ts
export interface Article {
  id: number
  slug: string
  title: string
  excerpt: string
  published: boolean
}
```

### Components: props, emits, v-model

Use `script setup`. Since Vue 3.5 props can be destructured and stay reactive; `defineEmits` takes named tuples; `defineModel` (3.4+) replaces the `modelValue` prop plus `update:modelValue` emit.

```vue
<!-- src/components/ArticleCard.vue -->
<script setup lang="ts">
import type { Article } from '@/types/article'

const { article, showDelete = false } = defineProps<{
  article: Article
  showDelete?: boolean
}>()
const emit = defineEmits<{ delete: [id: number] }>()
</script>

<template>
  <article class="card">
    <RouterLink :to="`/articles/${article.slug}`">
      <h2>{{ article.title }}</h2>
    </RouterLink>
    <p>{{ article.excerpt }}</p>
    <button v-if="showDelete" @click="emit('delete', article.id)">Delete</button>
  </article>
</template>
```

```vue
<!-- src/components/SearchBox.vue -->
<script setup lang="ts">
const query = defineModel<string>({ default: '' })
</script>

<template>
  <input v-model="query" type="search" placeholder="Search articles" />
</template>
```

### Reactivity

```ts
const count = ref(0)                              // read and write count.value in script
const doubled = computed(() => count.value * 2)   // cached, recomputed when count changes
watch(count, (newVal, oldVal) => console.log(`Count changed from ${oldVal} to ${newVal}`))
```

### Pinia store (setup syntax)

```ts
// src/stores/articles.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Article } from '@/types/article'

export const useArticlesStore = defineStore('articles', () => {
  const articles = ref<Article[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const published = computed(() => articles.value.filter((a) => a.published))

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const res = await fetch('/api/articles')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      articles.value = await res.json()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function create(data: Pick<Article, 'title' | 'excerpt'>) {
    const res = await fetch('/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    articles.value.unshift(await res.json())
  }

  return { articles, loading, error, published, fetchAll, create }
})
```

In a component, destructure state and getters with `storeToRefs(store)`; take actions straight from the store. Destructuring state directly loses reactivity.

```vue
<!-- src/views/ArticlesView.vue -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ArticleCard from '@/components/ArticleCard.vue'
import SearchBox from '@/components/SearchBox.vue'
import { useArticlesStore } from '@/stores/articles'

const store = useArticlesStore()
const { published, loading, error } = storeToRefs(store)
const query = ref('')

const visible = computed(() =>
  published.value.filter((a) => a.title.toLowerCase().includes(query.value.toLowerCase())),
)

onMounted(store.fetchAll)
</script>

<template>
  <div>
    <h1>Articles</h1>
    <SearchBox v-model="query" />
    <p v-if="loading">Loading...</p>
    <p v-else-if="error">Could not load articles: {{ error }}</p>
    <div v-else class="cards">
      <ArticleCard v-for="article in visible" :key="article.id" :article="article" />
    </div>
  </div>
</template>
```

### Composable

```ts
// src/composables/useApi.ts
import { ref, type Ref } from 'vue'

export function useApi<T>(url: string) {
  const data: Ref<T | null> = ref(null)
  const error = ref<string | null>(null)
  const loading = ref(false)

  async function execute() {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data.value = (await res.json()) as T
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return { data, error, loading, execute }
}
```

### Router with an auth guard

```ts
// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('@/views/HomeView.vue') },
    { path: '/articles', component: () => import('@/views/ArticlesView.vue') },
    { path: '/articles/:slug', component: () => import('@/views/ArticleView.vue'), props: true },
    { path: '/login', component: () => import('@/views/LoginView.vue') },
    { path: '/admin', component: () => import('@/views/AdminView.vue'), meta: { requiresAuth: true } },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore() // safe: guards run after app.use(createPinia())
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})

export default router
```

`auth` is a small Pinia store exposing `token` and an `isAuthenticated` computed. With `props: true`, a view receives `:slug` as a prop (`const { slug } = defineProps<{ slug: string }>()`).

### Entry point and typed provide/inject

```ts
// src/keys.ts
import type { InjectionKey } from 'vue'
export const apiBaseKey: InjectionKey<string> = Symbol('apiBase')

// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { apiBaseKey } from './keys'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.provide(apiBaseKey, '/api')
app.mount('#app')

// in any component: const apiBase = inject(apiBaseKey, '/api')
```

## Examples

### Example 1: Searchable article list

**User:** "Add a page that lists published articles from /api/articles with a search box."

Create `ArticlesView.vue`, `ArticleCard.vue`, `SearchBox.vue` and the `articles` store as above, and register `/articles` in the router. Run `npm run build`: it type-checks every `.vue` file and fails on a wrong prop or emit. In the browser the page shows "Loading...", then the cards, and typing in the box filters by title.

### Example 2: Protect the admin area

**User:** "Only logged-in users may open /admin; send others to /login and come back after."

Add `meta: { requiresAuth: true }` to the route, the `auth` store, and the `beforeEach` guard above. After a successful login, read `route.query.redirect` and call `router.push` with it (validate that it starts with `/` first, so a crafted link cannot send users to another site).

## Guidelines

- Use `<script setup lang="ts">`; avoid the Options API and `defineComponent` in new code unless the project already uses them.
- `ref` for everything by default; read and write `.value` in script, never in the template. Do not destructure a `reactive()` object or a store's state; use `toRefs` or `storeToRefs`.
- Always give `v-for` a stable `:key`, and do not put `v-for` and `v-if` on the same element: in Vue 3 `v-if` runs first and cannot see the loop variable. Filter with a `computed` or put the `v-if` on a wrapper element around the loop.
- Check `res.ok` before `res.json()`; `fetch` does not reject on HTTP errors.
- Keep secrets out of client code: anything in `import.meta.env` that starts with `VITE_` is public.
- A client-side route guard is a convenience, not security; the API must enforce authorization.
- Check `package.json` first: older projects may be on Vue 2 (end of life), Vue CLI or Pinia 2, where some of the above differs.
