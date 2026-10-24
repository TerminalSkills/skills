---
name: pinia
description: >-
  Pinia is the official state management library for Vue.js: type-safe stores
  with getters, actions, plugins, SSR support and Vue DevTools integration.
  Use when a Vue or Nuxt app needs shared state, when migrating from Vuex, or
  when asked to define, test, persist or hydrate Pinia stores.
license: Apache-2.0
compatibility: "Pinia 4.x: Vue >= 3.5.11, TypeScript >= 5.6 (if used), ESM-only, requires @vue/devtools-api"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/vuejs/pinia
  category: development
  tags:
    - vue
    - state-management
    - typescript
    - composition-api
    - store
---

# Pinia — Official Vue.js State Management

## Overview

Pinia is the store library recommended by the Vue team (it replaces Vuex). A store holds state, getters and actions; components, other stores and plain modules all use it through a `useXStore()` function. Pinia 4 (July 2026) only has two breaking changes from 3: the package is ESM-only and `@vue/devtools-api` must be installed next to it.

## Instructions

### Install and register

```bash
npm install pinia @vue/devtools-api
```

```typescript
// main.ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

createApp(App).use(createPinia()).mount("#app");
```

In Nuxt, install `@pinia/nuxt` and add it to `modules` instead; stores in `stores/` are not auto-imported unless you list the directory under `pinia.storesDirs`.

### Define a store


```typescript
// stores/auth.ts and stores/cart.ts, shown together (each file needs its own imports)
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "@/lib/api"; // your own axios/fetch wrapper

interface User { id: string; name: string; role: "admin" | "member" }
interface Product { id: string; name: string; price: number }
interface CartItem extends Product { qty: number }

// Setup Store (Composition API style)
export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  // no localStorage read here: it would crash during SSR (see Guidelines)
  const token = ref<string | null>(null);
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
    user.value = (await api.get("/auth/profile")).data;
  }

  // a setup store must return every state ref, or SSR, devtools and $reset miss it
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

### Use in components

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { storeToRefs } from "pinia";

const auth = useAuthStore();
const cart = useCartStore();
const email = ref("");
const password = ref("");

// storeToRefs gives refs for state and getters; call actions on the store (cart.addItem)
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

## Examples

### Example 1: Persist the cart across reloads

**User request:** "Keep my Vue cart after a page refresh"

```bash
npm install pinia-plugin-persistedstate
```

```typescript
// main.ts
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
```

```typescript
// stores/cart.ts: third argument of a setup store, or `persist` key of an option store
export const useCartStore = defineStore("cart", () => { /* ... */ }, {
  persist: { pick: ["items"] },
});
```

**Result:** `items` is written to `localStorage` on every change and restored when the app starts.

### Example 2: Unit-test a store with Vitest

**User request:** "Test that checkout clears the cart without calling the real API"

```bash
npm install -D @pinia/testing vitest
```

```typescript
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { vi, it, expect } from "vitest";
import { api } from "@/lib/api";
import { useCartStore } from "@/stores/cart";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn().mockResolvedValue({}) } }));

it("checkout clears the cart", async () => {
  setActivePinia(createTestingPinia({ createSpy: vi.fn, stubActions: false }));
  const cart = useCartStore();
  cart.addItem({ id: "p1", name: "Mug", price: 12 });
  await cart.checkout();
  expect(api.post).toHaveBeenCalledWith("/orders", expect.anything());
  expect(cart.items).toEqual([]);
});
```

**Result:** with `stubActions: false` the real actions run while the mocked `api` stops the network call; leave it at the default (`true`) in component tests and assert `expect(cart.checkout).toHaveBeenCalled()`.

## Guidelines

- Prefer setup stores (`ref`, `computed`, functions) for new code; option stores are fine and familiar to Vuex users.
- Never destructure a store directly; use `storeToRefs(store)` for state and getters. Actions can be destructured.
- A setup store must return all its state, or SSR hydration, devtools and `$reset` ignore it. `$reset()` exists only on option stores.
- Call `useXStore()` inside `setup`, an action or after `app.use(pinia)`. Outside components (router guards, plain modules), call it inside the function that needs it, never at module top level.
- Do not touch `localStorage` or `window` when the store is created if the app uses SSR or Nuxt; use a plugin such as `pinia-plugin-persistedstate`, or mark browser-only state with `skipHydrate()`.
- One store per domain (auth, cart, ui). A store may call another store inside an action or getter; two stores must not read each other at setup time (circular).
- Put API calls in actions so components stay thin; derive lists and totals in getters (cached).
- Pinia 4 is ESM-only; CommonJS projects stay on Pinia 3.
