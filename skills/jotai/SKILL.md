---
name: jotai
description: >-
  Jotai is a small state management library for React built on atoms:
  pieces of state that components subscribe to individually, so only the
  components reading a changed atom re-render. Use it when asked to add
  Jotai, replace useState prop drilling or Context, build derived or async
  state with atoms, persist a preference with atomWithStorage, or migrate
  Jotai v2 to v3.
license: Apache-2.0
compatibility: 'Jotai 3.x needs React 18+, TypeScript 5.5+ (if used) and Node.js 22.12+ for tooling; Jotai 2.x supports React 17'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/pmndrs/jotai
  tags: "react, state-management, typescript"
---

# Jotai — Atomic State Management for React

## Overview

Jotai (current release 3.0.1) keeps state in small atoms. An atom config is just a definition; the value lives in a store. Components read atoms through hooks and re-render only when those atoms change. No Provider is needed for global state (the default store is used), and there are no reducers or actions.

Jotai v3 keeps the public hooks API of v2 but is ESM-only and requires React 18+, TypeScript 5.5+ and Node.js >=22.12. It removed `atomFamily` from `jotai/utils` (now the separate `jotai-family` package), `loadable` (use `unwrap`), `jotai/babel` (now `jotai-babel`), the `setSelf` read option and the `delay` hook option.

## Instructions

### Install

```bash
npm install jotai
npm install jotai-family   # only if you use atomFamily
```

### Atoms and hooks

```tsx
import { Suspense } from "react";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

const countAtom = atom(0);                                  // primitive
const doubledAtom = atom((get) => get(countAtom) * 2);      // read-only derived
const darkModeAtom = atomWithStorage("darkMode", false);    // localStorage

const userIdAtom = atom(1);
const userAtom = atom(async (get) => {                      // async derived
  const res = await fetch(`/api/users/${get(userIdAtom)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as { name: string; email: string };
});

function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const doubled = useAtomValue(doubledAtom);                // read-only hook
  return <button onClick={() => setCount((c) => c + 1)}>{count} x 2 = {doubled}</button>;
}

function UserProfile() {
  const user = useAtomValue(userAtom);                      // suspends until resolved
  return <p>{user.name} ({user.email})</p>;
}

export function App() {
  return (
    <Suspense fallback={<p>Loading user...</p>}>
      <Counter />
      <UserProfile />
    </Suspense>
  );
}
```

Hook choice: `useAtom` for read and write, `useAtomValue` for read only, `useSetAtom` for write only (the component does not re-render when the value changes).

### Writable derived and write-only atoms

```tsx
const nameAtom = atom("Alice");
const upperNameAtom = atom(
  (get) => get(nameAtom).toUpperCase(),
  (_get, set, newName: string) => set(nameAtom, newName),
);

type Product = { id: string; title: string; price: number };
type CartItem = Product & { qty: number };

const cartItemsAtom = atom<CartItem[]>([]);
const cartTotalAtom = atom((get) =>
  get(cartItemsAtom).reduce((sum, i) => sum + i.price * i.qty, 0),
);
const addToCartAtom = atom(null, (get, set, product: Product) => {   // write-only: first arg null
  const items = get(cartItemsAtom);
  const existing = items.find((i) => i.id === product.id);
  set(
    cartItemsAtom,
    existing
      ? items.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i))
      : [...items, { ...product, qty: 1 }],
  );
});
```

### Atom families (v3: separate package)

```tsx
import { atom } from "jotai";
import { atomFamily } from "jotai-family";   // v2 only: import from "jotai/utils"

const todoAtomFamily = atomFamily((id: string) =>
  atom(async () => (await fetch(`/api/todos/${id}`)).json()),
);
const todoAtom = todoAtomFamily("42");        // same param returns the cached atom
todoAtomFamily.remove("42");                  // free a param you no longer need
```

### Persisting with atomWithStorage

`atomWithStorage(key, initialValue, storage?, { getOnInit })` uses `localStorage` and JSON by default and syncs across tabs. In a client-only app, pass `{ getOnInit: true }` as the fourth argument if the stored value must be read on first render; otherwise the first render shows `initialValue`. Set an atom to `RESET` (from `jotai/utils`) to delete the key. For `sessionStorage` or server rendering, build the storage with `createJSONStorage(() => typeof window !== "undefined" ? window.sessionStorage : undefined)`.

### Provider and stores

A `<Provider>` gives a subtree its own store; use it for tests, isolation, or per-request state in SSR. To read or write outside React, `const store = createStore(); store.get(countAtom); store.set(countAtom, 5);` and pass `<Provider store={store}>`.

## Examples

### Example 1: "Replace prop drilling for a theme toggle that survives reloads"

```tsx
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const themeAtom = atomWithStorage<"light" | "dark">("theme", "light", undefined, { getOnInit: true });

export function ThemeToggle() {
  const [theme, setTheme] = useAtom(themeAtom);
  return <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>Theme: {theme}</button>;
}
```

Any component can import `themeAtom`; the choice is stored under the `theme` key and is shared between tabs.

### Example 2: "Add to cart button that does not re-render on every cart change"

```tsx
import { useAtomValue, useSetAtom } from "jotai";

export function AddToCartButton({ product }: { product: Product }) {
  const addToCart = useSetAtom(addToCartAtom);
  return <button onClick={() => addToCart(product)}>Add {product.title}</button>;
}

export function CartBadge() {
  const total = useAtomValue(cartTotalAtom);
  return <span>${total.toFixed(2)}</span>;
}
```

Clicking updates `cartItemsAtom`; only `CartBadge` re-renders, the button does not.

### Example 3: "Replace loadable after upgrading to v3"

```tsx
import { atom } from "jotai";
import { unwrap } from "jotai/utils";

const LOADING = { state: "loading" } as const;
const unwrappedUserAtom = unwrap(userAtom, () => LOADING);   // no Suspense; fallback while pending
```

`useAtomValue(unwrappedUserAtom)` returns `LOADING` until the promise resolves, then the user. Wrap in try/catch inside a derived atom if you also need an error state.

## Guidelines

- Create atoms at module level. An atom created inside a component must be stabilized with `useMemo`, or it is recreated every render and can loop.
- `get` inside a write function does not track dependencies; only `get` in the read function does.
- A rejected async atom throws on read: put an error boundary around components that read it.
- `atomFamily` leaks memory when the parameter set is unbounded: call `remove(param)` or `setShouldRemove`.
- Moving v2 to v3: replace `jotai/utils` `atomFamily` imports with `jotai-family`, swap `loadable` for `unwrap`, install `jotai-babel` if you used its plugins, and delete uses of `setSelf` and the `delay` option.
- Do not store derived values in a primitive atom and sync them by hand; derive them with a read function.
- Use `Provider` for isolation in tests; do not wrap the whole app in it just to make atoms work.
