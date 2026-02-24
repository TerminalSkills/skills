---
name: vue
description: |
  Vue.js is a progressive JavaScript framework for building user interfaces. It features
  the Composition API with reactive refs and computed values, single-file components,
  and an approachable learning curve with powerful scaling capabilities.
license: Apache-2.0
compatibility:
  - node >= 18
  - npm or yarn or pnpm
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - javascript
    - typescript
    - frontend
    - reactive
    - components
    - spa
---

# Vue

Vue 3 uses the Composition API for reactive state management, single-file components (.vue), and a virtual DOM with compiler optimizations. It scales from progressive enhancement to full SPAs.

## Installation

```bash
# Create Vue project with Vite
npm create vue@latest my-app
cd my-app
npm install
npm run dev
```

## Project Structure

```
# Vue 3 project layout
src/
├── App.vue              # Root component
├── main.ts              # Entry point
├── router/index.ts      # Vue Router config
├── stores/              # Pinia stores
│   └── articles.ts
├── composables/         # Reusable logic
│   └── useApi.ts
├── components/          # Shared components
│   └── ArticleCard.vue
├── views/               # Page components
│   ├── HomeView.vue
│   └── ArticlesView.vue
└── types/               # TypeScript types
    └── article.ts
```

## Components (Composition API)

```vue
<!-- src/views/ArticlesView.vue — page component with script setup -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Article } from '@/types/article'
import ArticleCard from '@/components/ArticleCard.vue'

const articles = ref<Article[]>([])
const loading = ref(true)

onMounted(async () => {
  const res = await fetch('/api/articles')
  articles.value = await res.json()
  loading.value = false
})
</script>

<template>
  <div>
    <h1>Articles</h1>
    <p v-if="loading">Loading...</p>
    <div v-else>
      <ArticleCard v-for="article in articles" :key="article.id" :article="article" />
    </div>
  </div>
</template>
```

```vue
<!-- src/components/ArticleCard.vue — reusable component with props -->
<script setup lang="ts">
import type { Article } from '@/types/article'

const props = defineProps<{ article: Article }>()
const emit = defineEmits<{ (e: 'delete', id: number): void }>()
</script>

<template>
  <article class="card">
    <RouterLink :to="`/articles/${props.article.slug}`">
      <h2>{{ article.title }}</h2>
    </RouterLink>
    <p>{{ article.excerpt }}</p>
    <button @click="emit('delete', article.id)">Delete</button>
  </article>
</template>
```

## Reactivity

```vue
<!-- src/components/Counter.vue — reactive state demo -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)

watch(count, (newVal) => {
  console.log(`Count changed to ${newVal}`)
})

function increment() {
  count.value++
}
</script>

<template>
  <div>
    <p>Count: {{ count }} (doubled: {{ doubled }})</p>
    <button @click="increment">+1</button>
  </div>
</template>
```

## Pinia Store

```typescript
// src/stores/articles.ts — Pinia state management
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Article } from '@/types/article'

export const useArticlesStore = defineStore('articles', () => {
  const articles = ref<Article[]>([])
  const loading = ref(false)

  const published = computed(() => articles.value.filter((a) => a.published))

  async function fetchAll() {
    loading.value = true
    const res = await fetch('/api/articles')
    articles.value = await res.json()
    loading.value = false
  }

  async function create(data: Partial<Article>) {
    const res = await fetch('/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const article = await res.json()
    articles.value.unshift(article)
  }

  return { articles, loading, published, fetchAll, create }
})
```

## Composables

```typescript
// src/composables/useApi.ts — reusable fetch composable
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
      data.value = await res.json()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return { data, error, loading, execute }
}
```

## Router

```typescript
// src/router/index.ts — Vue Router configuration
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/views/HomeView.vue') },
    { path: '/articles', component: () => import('@/views/ArticlesView.vue') },
    { path: '/articles/:slug', component: () => import('@/views/ArticleView.vue'), props: true },
    {
      path: '/admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    return '/login'
  }
})

export default router
```

## Provide/Inject

```typescript
// src/main.ts — provide global dependencies
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.provide('apiBase', '/api')
app.mount('#app')
```

## Key Patterns

- Use `<script setup>` for concise component definitions — it's the recommended style
- Use `ref()` for primitives, `reactive()` for objects; `ref` is generally preferred
- Use Pinia stores for shared state across components
- Extract reusable logic into composables (`use*` functions)
- Use `defineProps<T>()` and `defineEmits<T>()` for type-safe component interfaces
- Lazy-load route components with dynamic `import()` for code splitting
