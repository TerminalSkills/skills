---
name: valtio
description: >-
  Valtio is a proxy-based state library for React: wrap an object in proxy(),
  mutate it like plain JavaScript, and components that read it through
  useSnapshot re-render only for the properties they used. Use when someone
  asks for "simple React state management", "Valtio", "proxy state", "mutable
  state in React", "alternative to Zustand/Redux", or "state management
  without boilerplate". Covers Valtio 2: proxy state, snapshots, subscriptions,
  computed getters, async values with React's use hook, proxyMap/proxySet, and
  devtools.
license: Apache-2.0
compatibility: "Valtio 2.x: React 18 or newer, TypeScript 4.5 or newer. valtio/vanilla runs without React."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/pmndrs/valtio
  tags: ["state", "valtio", "react", "proxy", "store"]
---

# Valtio

## Overview

Valtio makes React state management feel like plain JavaScript — mutate objects directly and React re-renders automatically. No reducers, no actions, no selectors. Wrap an object in `proxy()`, mutate it anywhere, and components that read the changed properties re-render. Based on JavaScript Proxy, it tracks which properties each component uses and only re-renders when those specific properties change.

This skill targets Valtio 2 (current release 2.3.x). Compared with v1: promises stored in a proxy are no longer resolved for you, `proxy(obj)` wraps the object you pass instead of copying it, and `derive` is no longer part of `valtio/utils`.

## When to Use

- Want the simplest possible state management
- Tired of Redux boilerplate or Zustand's `set()` function
- Sharing state between components without prop drilling
- State that's accessed/modified outside React (event handlers, WebSocket callbacks)
- Team prefers mutable patterns over immutable

## Instructions

### Setup

```bash
npm install valtio
```

### Basic Store

```typescript
// store/app.ts — Define state as a plain object
import { proxy } from "valtio";

export const appState = proxy({
  user: null as { name: string; email: string } | null,
  theme: "light" as "light" | "dark",
  notifications: [] as Array<{ id: string; text: string; read: boolean }>,
  sidebar: { open: true, width: 280 },
  // Computed value: an object getter that reads sibling properties through `this`
  get unreadCount() {
    return this.notifications.filter((n) => !n.read).length;
  },
});

// Mutate directly — React components auto-update
export function login(user: { name: string; email: string }) {
  appState.user = user;
}

export function toggleTheme() {
  appState.theme = appState.theme === "light" ? "dark" : "light";
}

export function addNotification(text: string) {
  appState.notifications.push({ id: crypto.randomUUID(), text, read: false });
}

export function markAllRead() {
  appState.notifications.forEach((n) => { n.read = true; });
}

export function toggleSidebar() {
  appState.sidebar.open = !appState.sidebar.open;
}
```

### Use in Components

Read from the snapshot while rendering; write to the proxy (and read from it inside callbacks).

```tsx
// components/Header.tsx — Read state with useSnapshot
import { useSnapshot } from "valtio";
import { appState, toggleTheme, toggleSidebar, markAllRead } from "../store/app";

export function Header() {
  // useSnapshot creates a read-only snapshot
  // Component ONLY re-renders when `user`, `theme` or `unreadCount` changes
  // Changes to `sidebar` don't trigger a re-render here
  const snap = useSnapshot(appState);

  return (
    <header>
      <button onClick={toggleSidebar}>Menu</button>
      <span>{snap.user?.name ?? "Guest"}</span>
      <button onClick={markAllRead}>Inbox ({snap.unreadCount})</button>
      <button onClick={toggleTheme}>{snap.theme === "light" ? "Dark" : "Light"} mode</button>
    </header>
  );
}

export function SearchBox({ form }: { form: { query: string } }) {
  // `form` is a proxy; sync: true turns off update batching, which controlled inputs need
  const snap = useSnapshot(form, { sync: true });
  return <input value={snap.query} onChange={(e) => { form.query = e.target.value; }} />;
}
```

### Computed Values

A getter can only read properties of its own object (siblings via `this`). On the proxy it is recalculated on every access; in a snapshot the value is captured once. In v1 this job was often done with `derive` from `valtio/utils`; that export was removed in v2, and both its successor package `derive-valtio` and the built-in `watch` util are now deprecated in favour of `valtio-reactive` (`computed`, `effect`, `batch`). For a value that depends on another proxy, keep it in sync with `subscribe`:

```typescript
// store/greeting.ts — derive from a different proxy
import { proxy, subscribe } from "valtio";
import { appState } from "./app";

export const greeting = proxy({ text: "Hello, Guest" });

subscribe(appState, () => {
  greeting.text = `Hello, ${appState.user?.name ?? "Guest"}`;
});
```

### Subscribe Outside React

```typescript
// store/effects.ts — Listen to state changes outside components
import { subscribe, snapshot } from "valtio";
import { subscribeKey } from "valtio/utils";
import { appState } from "./app";

// Any change in the tree; mutations in the same tick are batched into one call
const unsubscribe = subscribe(appState, () => {
  console.log("State changed:", JSON.stringify(snapshot(appState)));
});

// A nested object can be subscribed to on its own
subscribe(appState.sidebar, () => {
  localStorage.setItem("sidebar-open", String(appState.sidebar.open));
});

// A primitive property needs subscribeKey — subscribe() only accepts proxy objects
subscribeKey(appState, "theme", (theme) => {
  document.documentElement.dataset.theme = theme;
});

// Mutate from any callback, for example a WebSocket handler
const socket = new WebSocket("wss://api.northwind.dev/notifications");
socket.addEventListener("message", (event) => {
  appState.notifications.push(JSON.parse(event.data));  // Components auto-update
});
unsubscribe();  // stop listening when the owner goes away
```

### Async Values, Maps and Non-Proxied Objects

```tsx
// components/Release.tsx — a promise in state is unwrapped with React 19's use()
import { Suspense, use } from "react";
import { proxy, ref, useSnapshot } from "valtio";
import { proxyMap, proxySet } from "valtio/utils";

const releaseState = proxy({
  latest: fetch("https://registry.npmjs.org/valtio/latest").then(
    (res) => res.json() as Promise<{ version: string }>,
  ),
  drafts: proxyMap<string, { title: string }>(),   // a native Map or Set is not tracked
  selected: proxySet<string>(),
  canvas: ref({ context: null as CanvasRenderingContext2D | null }),  // stored as-is, never tracked
});

function Version() {
  const snap = useSnapshot(releaseState);
  return <span>valtio {use(snap.latest).version}</span>;
}

export function Release() {
  return <Suspense fallback={<span>Loading</span>}><Version /></Suspense>;
}
```

On React 18, import `use` from the `react18-use` shim instead.

### Devtools

```typescript
// store/devtools.ts — needs the Redux DevTools browser extension
import type {} from "@redux-devtools/extension";   // types only: npm install -D @redux-devtools/extension
import { devtools } from "valtio/utils";
import { appState } from "./app";

export const disconnect = devtools(appState, { name: "appState", enabled: process.env.NODE_ENV !== "production" });
```

## Examples

### Example 1: Build a shopping cart

**User prompt:** "Build a shopping cart with add/remove/update quantity using simple state management."

```tsx
// store/cart.tsx
import { proxy, useSnapshot } from "valtio";

interface CartItem { sku: string; name: string; price: number; qty: number }

export const cart = proxy({
  items: [] as CartItem[],
  get total() {
    return this.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  },
});

export function addItem(item: Omit<CartItem, "qty">) {
  const existing = cart.items.find((i) => i.sku === item.sku);
  if (existing) existing.qty += 1;
  else cart.items.push({ ...item, qty: 1 });
}

export function setQty(sku: string, qty: number) {
  const item = cart.items.find((i) => i.sku === sku);
  if (item) item.qty = Math.max(1, qty);
}

export function removeItem(sku: string) {
  cart.items = cart.items.filter((i) => i.sku !== sku);
}

export function CartSummary() {
  const snap = useSnapshot(cart);
  return (
    <ul>
      {snap.items.map((item) => (
        <li key={item.sku}>
          {item.name} x {item.qty}
          <button onClick={() => setQty(item.sku, item.qty + 1)}>+</button>
          <button onClick={() => removeItem(item.sku)}>Remove</button>
        </li>
      ))}
      <li>Total: ${snap.total.toFixed(2)}</li>
    </ul>
  );
}
```

After `addItem({ sku: "TSHIRT-M", name: "T-shirt (M)", price: 24 })` twice and `addItem({ sku: "MUG-01", name: "Mug", price: 12 })`, the list shows "T-shirt (M) x 2", "Mug x 1" and "Total: $60.00"; the three calls in one tick cause a single re-render.

### Example 2: Theme and layout preferences

**User prompt:** "Store user preferences (theme, language, sidebar state) that persist across page loads."

```typescript
// store/preferences.ts
import { proxy, subscribe, snapshot } from "valtio";

const STORAGE_KEY = "preferences-v1";
const defaults = { theme: "light" as "light" | "dark", language: "en", sidebarOpen: true };

const saved = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);

export const preferences = proxy({ ...defaults, ...(saved ? JSON.parse(saved) : {}) } as typeof defaults);

subscribe(preferences, () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(preferences)));
});
```

After `preferences.theme = "dark"`, `localStorage.getItem("preferences-v1")` returns `{"theme":"dark","language":"en","sidebarOpen":true}`, and the next page load starts in dark mode. Components read it with `useSnapshot(preferences)`.

## Guidelines

- **`proxy()` for state, `useSnapshot()` for reading** — read from the snapshot in render, mutate and read the proxy in callbacks
- **Mutate directly** — `state.count++` works; no `setState` or `set()` needed
- **Automatic render optimization** — only re-renders when accessed properties change
- **`subscribe()` for side effects** — persist to localStorage, log, sync; use `subscribeKey()` for a primitive property
- **Getters for computed values** — they may only reference their own object; `derive` is gone from `valtio/utils` and `watch` is deprecated, use `valtio-reactive` for cross-proxy computeds and effects
- **Snapshot is read-only** — writing to `snap` throws a TypeError, and TypeScript marks it deeply `readonly`; mutate the original `proxy`
- **Mutating array methods trigger updates** — `push`, `splice`, `sort`; `filter` and `map` return new arrays, so assign the result back (`state.items = state.items.filter(...)`)
- **Don't replace the proxy itself** — `state = { ... }` drops tracking; and a component subscribed to `useSnapshot(state.profile)` stops updating if `state.profile` is reassigned, so snapshot the parent instead
- **Avoid `this` in actions** — `snap.increment()` runs against the frozen snapshot and fails; define actions as module functions that reference the proxy
- **Don't reuse the object passed to `proxy()`** — v2 wraps it in place; pass `deepClone(initial)` from `valtio/utils` when you need the original later (for example to reset state)
- **Only plain data is tracked** — use `proxyMap`/`proxySet` instead of `Map`/`Set`, and wrap DOM nodes, class instances from other libraries and large blobs in `ref()`
- **Component-scoped state** — a module-level proxy is one shared instance; for state that belongs to a single component tree, create it with `useRef(proxy({ ... })).current` and pass it through context
- **When not to use it** — teams that want explicit, immutable updates are better served by Zustand or Redux Toolkit; server data caching belongs in TanStack Query or SWR
