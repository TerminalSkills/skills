---
name: zustand
description: >-
  Zustand is a small state-management library for React: a store is a hook,
  components subscribe to slices of it with selectors, and no context provider
  is needed. Use when a user asks to "add a Zustand store", "share state
  between components without Redux", "persist state to localStorage", "fix
  Maximum update depth exceeded after upgrading to Zustand v5", "use Zustand
  with Next.js", or wants the persist, devtools, immer or subscribeWithSelector
  middleware. Covers the v5 API: typed stores, useShallow, middleware order,
  access outside React, and per-request stores.
license: Apache-2.0
compatibility: "Zustand 5.x: React 18 or newer, TypeScript 4.5 or newer. The vanilla store (zustand/vanilla) runs without React."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/pmndrs/zustand
  tags:
    - react
    - state-management
    - hooks
    - typescript
    - store
---

# Zustand — Minimal React State Management

## Overview

Zustand keeps application state in a store created with `create()`. The store is a React hook: a component calls it with a selector and re-renders only when the selected value changes. There is no provider to wrap the app in, actions live next to the state they change, and the same store can be read and written from non-React code. Middleware adds persistence, Redux DevTools, Immer-style updates and selector subscriptions.

This skill targets Zustand 5 (current release line 5.0.x). Version 5 dropped default exports, removed the equality-function argument from `create`, and requires selectors to return stable references.

## Instructions

### Install

```bash
npm install zustand
npm install immer   # only if you use zustand/middleware/immer; it is an optional peer dependency
```

### Create a store

In TypeScript, write `create<State>()(...)` with the extra pair of parentheses; that form is what lets middleware types compose.

```typescript
// src/stores/todo-store.ts
import { create } from "zustand";

export interface Todo { id: string; text: string; done: boolean }
export type Filter = "all" | "active" | "done";

interface TodoState {
  todos: Todo[];
  filter: Filter;
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  setFilter: (filter: Filter) => void;
  fetchTodos: () => Promise<void>;
  reset: () => void;
}

export const useTodoStore = create<TodoState>()((set, get, store) => ({
  todos: [],
  filter: "all",
  addTodo: (text) =>
    set((state) => ({
      todos: [...state.todos, { id: crypto.randomUUID(), text, done: false }],
    })),
  toggleTodo: (id) =>
    set((state) => ({
      todos: state.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    })),
  setFilter: (filter) => set({ filter }),      // set() merges one level deep
  fetchTodos: async () => {                    // async actions just call set() when ready
    const response = await fetch("/api/todos");
    set({ todos: await response.json() });
    console.log(`loaded ${get().todos.length} todos`);
  },
  reset: () => set(store.getInitialState()),
}));
```

`set` merges only the top level. Nested objects must be copied by hand (or use the immer middleware below). `set(newState, true)` replaces the whole state instead of merging; in v5 the types require a complete state object when the flag is `true`.

### Read state in components

```tsx
// src/components/todos.tsx
import { useShallow } from "zustand/react/shallow";
import { useTodoStore } from "../stores/todo-store";

export function TodoCount() {
  // Re-renders only when the selected value changes (strict equality)
  const count = useTodoStore((s) => s.todos.length);
  return <span>{count} todos</span>;
}

export function TodoList() {
  // A selector that builds a new object or array must be wrapped in useShallow
  const { todos, filter, toggleTodo } = useTodoStore(
    useShallow((s) => ({ todos: s.todos, filter: s.filter, toggleTodo: s.toggleTodo })),
  );
  const visible = todos.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.done : !t.done,
  );
  return (
    <ul>
      {visible.map((t) => (
        <li key={t.id} onClick={() => toggleTodo(t.id)}>{t.text}</li>
      ))}
    </ul>
  );
}
```

Calling the hook with no selector (`useTodoStore()`) subscribes the component to every change in the store.

### Middleware: devtools, persist, immer

Keep `devtools` outermost: it changes the type of `set`, and a middleware wrapped around it can lose that change.

```typescript
// src/stores/settings-store.ts
import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface SettingsState {
  theme: "light" | "dark";
  editor: { fontSize: number; wordWrap: boolean };
  lastSyncError: string | null;
  setFontSize: (size: number) => void;
  toggleTheme: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      immer((set) => ({
        theme: "light",
        editor: { fontSize: 14, wordWrap: true },
        lastSyncError: null,
        // immer: mutate the draft; the third argument names the action in Redux DevTools
        setFontSize: (size) =>
          set((state) => { state.editor.fontSize = size; }, undefined, "settings/setFontSize"),
        toggleTheme: () =>
          set((state) => { state.theme = state.theme === "light" ? "dark" : "light"; }),
      })),
      {
        name: "settings-v1",                              // storage key, must be unique
        storage: createJSONStorage(() => localStorage),   // the default, shown for clarity
        partialize: (state) => ({ theme: state.theme, editor: state.editor }),
      },
    ),
    { name: "SettingsStore", enabled: process.env.NODE_ENV !== "production" },
  ),
);
```

Other `persist` options: `version` with `migrate(persistedState, version)` for schema changes, `merge` for deep-merging stored state, `skipHydration: true` plus `useSettingsStore.persist.rehydrate()` to hydrate manually. The store also exposes `persist.hasHydrated()`, `persist.onFinishHydration(fn)` and `persist.clearStorage()`.

### Use the store outside React

```typescript
// src/stores/session-store.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

interface SessionState { token: string | null; userId: string | null }

export const useSessionStore = create<SessionState>()(
  subscribeWithSelector((): SessionState => ({ token: null, userId: null })),
);

// Read and write without a hook (API clients, WebSocket handlers, tests)
const token = useSessionStore.getState().token;
useSessionStore.setState({ userId: "usr_8f3a21" });

// Plain subscribe fires on every change and returns an unsubscribe function
const unsubscribe = useSessionStore.subscribe((state, prev) => {
  console.log("session changed", prev.userId, "->", state.userId);
});
unsubscribe();

// With subscribeWithSelector, listen to one slice only
useSessionStore.subscribe(
  (state) => state.token,
  (next, previous) => console.log("token rotated", previous, next),
);
```

### Per-request stores (Next.js, tests, component-scoped state)

A store made with `create` is module state, shared by everything that imports it. On a server that renders many requests, create the store per request with the vanilla `createStore` and hand it down through context.

```tsx
// src/providers/cart-provider.tsx
"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createStore, useStore } from "zustand";

interface CartState {
  items: { sku: string; qty: number }[];
  add: (sku: string) => void;
}
type CartStore = ReturnType<typeof createCartStore>;

const createCartStore = (items: CartState["items"] = []) =>
  createStore<CartState>()((set) => ({
    items,
    add: (sku) => set((s) => ({ items: [...s.items, { sku, qty: 1 }] })),
  }));

const CartContext = createContext<CartStore | null>(null);

export function CartProvider({ children, initialItems }: { children: ReactNode; initialItems?: CartState["items"] }) {
  const [store] = useState(() => createCartStore(initialItems));
  return <CartContext.Provider value={store}>{children}</CartContext.Provider>;
}

export function useCart<T>(selector: (state: CartState) => T): T {
  const store = useContext(CartContext);
  if (!store) throw new Error("useCart must be used inside CartProvider");
  return useStore(store, selector);
}
```

## Examples

### Example 1: Fix a render loop after upgrading from v4 to v5

**User request:** "After bumping zustand to 5 my search page crashes with 'Maximum update depth exceeded'."

The cause is a selector that returns a new array on every call, which v4 tolerated and v5 does not:

```tsx
// Before — crashes in v5, and React logs "The result of getSnapshot should be cached"
const [query, setQuery] = useSearchStore((s) => [s.query, s.setQuery]);

// After — useShallow returns the previous reference while the contents are equal
import { useShallow } from "zustand/react/shallow";
const [query, setQuery] = useSearchStore(useShallow((s) => [s.query, s.setQuery]));
```

Also replace `import create from "zustand"` with `import { create } from "zustand"` and move any `useStore(selector, shallow)` call to `useShallow`. Code that needs a custom equality function keeps working through `createWithEqualityFn` from `zustand/traditional` (install `use-sync-external-store` alongside it). The page then renders once and updates only when `query` changes.

### Example 2: Persist a cart and migrate its stored shape

**User request:** "Keep the cart across reloads. We renamed `quantity` to `qty`, so old saved carts must still load."

```typescript
// src/stores/cart-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CartItem { sku: string; qty: number }
interface CartState {
  items: CartItem[];
  add: (sku: string) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (sku) => set((s) => ({ items: [...s.items, { sku, qty: 1 }] })),
    }),
    {
      name: "cart",
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as { items: { sku: string; quantity?: number; qty?: number }[] };
        if (version < 2) {
          return { items: state.items.map((i) => ({ sku: i.sku, qty: i.quantity ?? 1 })) };
        }
        return state as { items: CartItem[] };
      },
    },
  ),
);
```

A browser holding `{"state":{"items":[{"sku":"TSHIRT-M","quantity":2}]},"version":1}` under the `cart` key loads as `[{ sku: "TSHIRT-M", qty: 2 }]`, and the entry is rewritten with `"version":2`.

## Guidelines

- **Select narrowly.** `useStore((s) => s.count)` re-renders on that value only. Never return a fresh object, array or inline fallback function from a selector without `useShallow`; in v5 that is an infinite loop, not just a wasted render.
- **Updates are immutable.** Without the immer middleware, never mutate state inside `set`; return new objects for every nested level you change.
- **`devtools` goes last (outermost)** in the middleware chain, for example `devtools(persist(immer(...)))`. It needs the Redux DevTools browser extension; pass `enabled: false` in production.
- **`persist` stores only what serializes to JSON.** Functions are dropped; `Map`, `Set` and `Date` values need a custom `storage` or the `reviver`/`replacer` options of `createJSONStorage`. Use `partialize` to keep tokens, errors and other transient fields out of storage — `localStorage` is readable by any script on the page.
- **`persist` no longer writes at creation.** Since v5 (and 4.5.5) the initial state is saved only after the first `set`.
- **Server rendering.** A persisted store renders its initial state on the server and the stored state in the browser, which causes hydration mismatches; render persisted values after mount or use `skipHydration`. Do not read or write a store from React Server Components, and do not share one module-level store across requests.
- **Split by domain.** Separate stores for auth, cart and UI stay easier to follow than one large store; inside a large store use the slices pattern.
- **When not to use it.** Server data with caching and refetching belongs in a data-fetching library (TanStack Query, SWR); state that one component owns belongs in `useState`.
