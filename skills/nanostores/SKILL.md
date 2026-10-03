---
name: nanostores
description: >-
  Nano Stores is a tiny, framework-agnostic state manager built from many small atomic stores (atoms, maps, computed stores) with lazy subscriptions. Use when the user wants shared state in React, Preact, Vue, Svelte, Solid, Lit, Angular or vanilla JS, needs derived or async data stores, wants to share state between islands in Astro, or asks how to migrate from Redux, Zustand or Context to nanostores.
license: Apache-2.0
compatibility: "Node.js 20+ and npm; ESM package. @nanostores/react 2.x needs React 18+ and nanostores 1.2+."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/nanostores/nanostores
  tags:
    - state-management
    - framework-agnostic
    - react
    - vue
    - svelte
---

# Nanostores — Tiny State Manager

## Overview

Nano Stores (package `nanostores`, currently 1.x) keeps state in many small stores instead of one big tree. The core is 351 to 844 bytes minified and brotlied depending on what you import, has no dependencies, and tree-shakes. Stores are lazy: a store has a "mount" mode while it has listeners and a "disabled" mode otherwise (it switches off one second after the last listener leaves), so network connections and timers run only while the UI needs them. Bindings exist for React, Preact, Vue, Svelte, Solid, Lit, Angular, and Alpine.js.

## Instructions

### Install

```bash
npm install nanostores
npm install @nanostores/react     # or @nanostores/preact | vue | solid | lit | angular | svelte-runes
npm install @nanostores/query     # optional: cached remote data fetching
npm install @nanostores/persistent  # optional: localStorage sync across tabs
```

### Atoms, maps, computed

```typescript
// stores/session.ts
import { atom, map, computed, onMount, batch } from "nanostores";

export const $theme = atom<"light" | "dark">("light");

export const $user = map<{ name: string; email: string; plan: "free" | "pro" }>({
  name: "",
  email: "",
  plan: "free",
});

export const $isPro = computed($user, (user) => user.plan === "pro");
export const $greeting = computed(
  [$user, $theme],
  (user, theme) => `${user.name || "Guest"} (${theme} mode)`,
);

// Lazy loading: runs when the first listener appears, cleanup when the last leaves
onMount($user, () => {
  fetch("/api/me").then((r) => r.json()).then((me) => $user.set(me));
  return () => { /* cleanup */ };
});

$user.setKey("plan", "pro");   // change one key; listenKeys() subscribers of other keys stay quiet
$theme.set("dark");
batch(() => {                  // several writes, one notification round
  $user.setKey("name", "Mara Lindqvist");
  $theme.set("light");
});
```

Useful API: `store.get()`, `store.set()`, `store.subscribe(cb)` (calls immediately), `store.listen(cb)` (only on change), `listenKeys(map, ["name"], cb)`, `effect([$a, $b], cb)` for side effects, `batched()` for computed values that update once per tick, `onSet(store, ({ newValue, abort }) => ...)` for validation. Values are compared with `Object.is`; set `store.eq` to a deep-equal function for objects.

### React

```tsx
import { useStore } from "@nanostores/react";
import { $user, $isPro } from "../stores/session";

export function UserProfile() {
  const user = useStore($user);
  const isPro = useStore($isPro);
  return (
    <div>
      <p>{user.email}</p>
      {isPro && <span className="badge">PRO</span>}
      <button onClick={() => $user.setKey("plan", "pro")}>Upgrade</button>
    </div>
  );
}
```

Other frameworks: Vue `useStore()` from `@nanostores/vue`; Solid `useStore()` returns an accessor (`profile().name`); Svelte components can use the `$` store contract directly (name stores without the `$` prefix there), or `useStore` from `@nanostores/svelte-runes` with `.current`.

### Remote data with @nanostores/query

```typescript
// stores/api.ts
import { atom } from "nanostores";
import { nanoquery } from "@nanostores/query";

export const [createFetcherStore, createMutatorStore] = nanoquery({
  fetcher: (...keys: (string | number)[]) => fetch(keys.join("")).then((r) => r.json()),
});

export const $projectId = atom<string | null>(null);

export const $projects = createFetcherStore<Project[]>(["/api/projects"]);
// A null key part means "do not fetch yet"; the store refetches when $projectId changes
export const $project = createFetcherStore<Project>(["/api/projects/", $projectId]);

export const $createProject = createMutatorStore<{ name: string }>(
  async ({ data, invalidate }) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    invalidate("/api/projects");   // dropped from cache after the request resolves
    return res.json();
  },
);
```

Fetcher state is `{ data, error, loading }`; before the first subscriber it is `{ loading: false }`. Mutators expose `mutate`. Options such as `dedupeTime` (4 s default), `cacheLifetime`, `revalidateOnFocus`, `revalidateInterval` go on `nanoquery()` or on each fetcher store.

### Server-side rendering and tests

Set initial values on the server (`$settings.set(initial)`), start loading with an empty listener, then `await allTasks()` before rendering. In tests call `keepMount(store)` to run `onMount`, and `cleanStores($user)` in `afterEach`.

## Examples

### Example 1: Shared cart between React and Vue islands

**Request:** "Share a shopping cart between my Astro React header and a Vue checkout island."

```typescript
// src/stores/cart.ts
import { computed } from "nanostores";
import { persistentMap } from "@nanostores/persistent";

export const $cart = persistentMap<Record<string, string>>("cart:", {});   // values are strings
export const $cartCount = computed($cart, (cart) =>
  Object.values(cart).reduce((sum, qty) => sum + Number(qty), 0),
);

export function addToCart(sku: string) {
  $cart.setKey(sku, String(Number($cart.get()[sku] ?? 0) + 1));
}
```

React header: `const count = useStore($cartCount);` Vue checkout: `const count = useStore($cartCount);` Clicking "Add" in either island updates both, and other browser tabs, because persistent stores sync through `localStorage`.

### Example 2: Search box that fetches only for real input

**Request:** "Query the API when the search text changes, but not for empty input."

```typescript
import { atom, computed } from "nanostores";
import { createFetcherStore } from "./api";

export const $query = atom("");
const $searchKey = computed($query, (q) => (q.length >= 2 ? encodeURIComponent(q) : null));

export const $results = createFetcherStore<Product[]>(["/api/products?q=", $searchKey]);
```

`$results` stays idle (`loading: false`, no data) until the text has two characters; then `$query.set("oat milk")` fetches `/api/products?q=oat%20milk` and caches it by key.

## Guidelines

- Name stores with a `$` prefix (except in Svelte) and keep actions as plain exported functions next to the store; move logic out of components.
- Prefer `useStore($computed)` over selecting inside the component so only the derived value triggers renders.
- Do not call `get()` in components or during render; it does not subscribe. Use it in actions and tests.
- Persistent store values are strings (or JSON with the `encode`/`decode` option); do not store secrets in `localStorage`.
- A fetcher key with a `null`, `undefined` or `false` part is skipped; use that for conditional fetching.
- Stores are module singletons: on the server, reset them per request or avoid per-user data in global stores.
- For heavy server-state needs (infinite queries, devtools, complex mutations) TanStack Query may fit better; nanostores shines for small, cross-framework state.
