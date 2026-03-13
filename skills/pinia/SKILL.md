---
name: pinia
category: Frontend Development
tags: [vue, state-management, typescript, composition-api, store, devtools]
version: 1.0.0
author: terminal-skills
---

# Pinia — Official Vue.js State Management

You are an expert in Pinia, the official state management library for Vue.js. You help developers build Vue applications with type-safe stores, Composition API support, getters (computed), actions (sync and async), plugins, SSR compatibility, and Vue DevTools integration — replacing Vuex with a simpler, fully typed, modular store system.

## Core Capabilities

### Store Definition

```typescript
// stores/auth.ts
import { defineStore } from "pinia";
import { ref, computed } from "vue";

// Setup Store (Composition API style)
export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem("token"));
  const isLoading = ref(false);

  // Getters (computed)
  const isAuthenticated = computed(() => !!token.value);
  const isAdmin = computed(() => user.value?.role === "admin");

  // Actions
  async function login(email: string, password: string) {
    isLoading.value = true;
    try {
      const response = await api.post("/auth/login", { email, password });
      token.value = response.data.token;
      user.value = response.data.user;
      localStorage.setItem("token", token.value!);
    } finally {
      isLoading.value = false;
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem("token");
  }

  async function fetchProfile() {
    if (!token.value) return;
    user.value = await api.get("/auth/profile");
  }

  return { user, token, isLoading, isAuthenticated, isAdmin, login, logout, fetchProfile };
});

// Option Store style (familiar to Vuex users)
export const useCartStore = defineStore("cart", {
  state: () => ({
    items: [] as CartItem[],
  }),
  getters: {
    total: (state) => state.items.reduce((sum, i) => sum + i.price * i.qty, 0),
    itemCount: (state) => state.items.reduce((sum, i) => sum + i.qty, 0),
  },
  actions: {
    addItem(product: Product) {
      const existing = this.items.find(i => i.id === product.id);
      if (existing) existing.qty++;
      else this.items.push({ ...product, qty: 1 });
    },
    removeItem(id: string) {
      this.items = this.items.filter(i => i.id !== id);
    },
    async checkout() {
      await api.post("/orders", { items: this.items });
      this.items = [];
    },
  },
});
```

### Usage in Components

```vue
<script setup lang="ts">
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { storeToRefs } from "pinia";

const auth = useAuthStore();
const cart = useCartStore();

// storeToRefs preserves reactivity for destructured state/getters
const { user, isAuthenticated } = storeToRefs(auth);
const { total, itemCount } = storeToRefs(cart);
</script>

<template>
  <nav>
    <span v-if="isAuthenticated">{{ user?.name }}</span>
    <button v-else @click="auth.login(email, password)">Login</button>
    <span>Cart ({{ itemCount }}): ${{ total.toFixed(2) }}</span>
  </nav>
</template>
```

## Installation

```bash
npm install pinia
```

```typescript
// main.ts
import { createPinia } from "pinia";
app.use(createPinia());
```

## Best Practices

1. **Setup stores** — Prefer Composition API style (`ref`, `computed`); full TypeScript inference without extra types
2. **storeToRefs** — Use `storeToRefs(store)` when destructuring; plain destructure breaks reactivity
3. **One store per domain** — Separate auth, cart, ui stores; avoid a single monolithic store
4. **Actions for async** — Put API calls in actions; components stay clean, logic is reusable and testable
5. **Getters for derived** — Use computed/getters for filtered lists, totals, formatted values; auto-cached
6. **Plugins** — Use plugins for persistence (`pinia-plugin-persistedstate`), logging, or shared behaviors
7. **Store composition** — Import other stores inside a store: `const auth = useAuthStore()`; explicit dependencies
8. **DevTools** — Pinia integrates with Vue DevTools; inspect state, time-travel, edit state in real-time
