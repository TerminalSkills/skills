---
name: jotai
description: >-
  You are an expert in Jotai, the primitive and flexible state management
  library for React based on atomic state. You help developers build React
  applications with fine-grained reactivity using atoms (state primitives),
  derived atoms (computed values), async atoms (data fetching), and atom
  families — providing bottom-up state management where only components
  subscribing to changed atoms re-render.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Frontend Development
  tags:
    - react
    - state-management
    - atomic
    - typescript
    - minimal
    - bottom-up
---

# Jotai — Atomic State Management for React

You are an expert in Jotai, the primitive and flexible state management library for React based on atomic state. You help developers build React applications with fine-grained reactivity using atoms (state primitives), derived atoms (computed values), async atoms (data fetching), and atom families — providing bottom-up state management where only components subscribing to changed atoms re-render.

## Core Capabilities

### Atoms

```tsx
import { atom, useAtom, useAtomValue, useSetAtom, Provider } from "jotai";
import { atomWithStorage, atomFamily, selectAtom } from "jotai/utils";

// Primitive atoms
const countAtom = atom(0);
const nameAtom = atom("Alice");
const darkModeAtom = atomWithStorage("darkMode", false);  // localStorage

// Derived (computed) atom
const doubledAtom = atom((get) => get(countAtom) * 2);

// Writable derived atom
const uppercaseNameAtom = atom(
  (get) => get(nameAtom).toUpperCase(),
  (get, set, newName: string) => set(nameAtom, newName),
);

// Async atom (data fetching)
const userAtom = atom(async (get) => {
  const id = get(userIdAtom);
  const response = await fetch(`/api/users/${id}`);
  return response.json();
});

// Atom family (parameterized atoms)
const todoAtomFamily = atomFamily((id: string) =>
  atom(async () => {
    const res = await fetch(`/api/todos/${id}`);
    return res.json();
  })
);

// Usage
function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const doubled = useAtomValue(doubledAtom);   // Read-only hook

  return (
    <div>
      <p>{count} × 2 = {doubled}</p>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}

function UserProfile() {
  const user = useAtomValue(userAtom);     // Suspends until loaded
  return <div>{user.name} — {user.email}</div>;
}

// App with Suspense for async atoms
function App() {
  return (
    <Provider>
      <Counter />
      <Suspense fallback={<Loading />}>
        <UserProfile />
      </Suspense>
    </Provider>
  );
}
```

### Complex State Patterns

```tsx
// Shopping cart with atoms
const cartItemsAtom = atom<CartItem[]>([]);

const cartTotalAtom = atom((get) => {
  const items = get(cartItemsAtom);
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
});

const addToCartAtom = atom(null, (get, set, product: Product) => {
  const items = get(cartItemsAtom);
  const existing = items.find(i => i.id === product.id);
  if (existing) {
    set(cartItemsAtom, items.map(i =>
      i.id === product.id ? { ...i, qty: i.qty + 1 } : i
    ));
  } else {
    set(cartItemsAtom, [...items, { ...product, qty: 1 }]);
  }
});

function AddToCartButton({ product }: { product: Product }) {
  const addToCart = useSetAtom(addToCartAtom);  // Write-only hook
  return <button onClick={() => addToCart(product)}>Add to Cart</button>;
}
```

## Installation

```bash
npm install jotai
```

## Best Practices

1. **Atoms are primitives** — Start with small atoms; compose into derived atoms; bottom-up architecture
2. **useAtomValue / useSetAtom** — Use read-only or write-only hooks when you don't need both; prevents extra re-renders
3. **Derived atoms** — Use `atom((get) => ...)` for computed values; re-computes only when dependencies change
4. **Async atoms + Suspense** — Use async atoms with React Suspense; clean loading states without manual flags
5. **atomWithStorage** — Use for preferences (theme, language, sidebar state); persists to localStorage automatically
6. **Atom families** — Use `atomFamily` for parameterized state (per-item, per-user); creates atoms on demand
7. **Provider scope** — Use `<Provider>` for testing or sub-tree state isolation; optional for global state
8. **No boilerplate** — No actions, reducers, selectors, or context providers; just atoms and hooks
