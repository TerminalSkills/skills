---
name: solid-js
description: >-
  SolidJS — fine-grained reactive UI library without a virtual DOM. Use when
  building high-performance UIs, choosing a React alternative with better
  reactivity primitives, or using SolidStart for full-stack apps with SSR and
  server functions. Covers signals, effects, memos, stores, and migration
  patterns from React.
license: Apache-2.0
compatibility: "SolidJS 1.x / 2.x. SolidStart 1.x. Requires Node.js 18+ for build tooling."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: frontend
  tags: ["solidjs", "reactive", "signals", "performance", "frontend"]
  use-cases:
    - "Build a high-performance UI without virtual DOM overhead"
    - "Migrate a React component to SolidJS for better reactivity"
    - "Use SolidStart for a full-stack app with SSR and server functions"
    - "Manage complex application state with SolidJS stores"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# SolidJS

## Overview

SolidJS is a declarative UI library that compiles JSX to real DOM operations — no virtual DOM, no diffing. Reactivity is fine-grained: only the exact DOM nodes that depend on changed data update. The result is near-native performance with a React-like authoring experience.

## Installation

```bash
# New SolidJS project
npx degit solidjs/templates/ts my-app
cd my-app
npm install
npm run dev

# Or with Vite
npm create vite@latest my-app -- --template solid-ts
```

## Reactivity Primitives

### createSignal — Reactive State

```typescript
import { createSignal } from "solid-js";

// Signals are getter/setter pairs
const [count, setCount] = createSignal(0);

// Read: call as function
console.log(count()); // 0

// Write: call setter
setCount(1);
setCount((prev) => prev + 1); // Updater function

// Signals with objects
const [user, setUser] = createSignal({ name: "Alice", age: 30 });
setUser((prev) => ({ ...prev, age: 31 }));
```

### createEffect — Side Effects

```typescript
import { createSignal, createEffect } from "solid-js";

const [name, setName] = createSignal("Alice");

// Runs immediately, then reruns whenever dependencies change
createEffect(() => {
  console.log("Name changed:", name());
  document.title = `Hello, ${name()}!`;
});

// Cleanup function
createEffect(() => {
  const id = setInterval(() => console.log(name()), 1000);
  return () => clearInterval(id); // Runs before next effect or on dispose
});
```

### createMemo — Derived State

```typescript
import { createSignal, createMemo } from "solid-js";

const [price, setPrice] = createSignal(100);
const [quantity, setQuantity] = createSignal(3);

// Computed value — only recalculates when dependencies change
const total = createMemo(() => price() * quantity());

console.log(total()); // 300
setPrice(120);
console.log(total()); // 360 — recalculated
```

## Components

SolidJS components are functions that run once — not re-rendered like React:

```typescript
import { createSignal, For, Show, type Component } from "solid-js";

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

const TodoApp: Component = () => {
  const [todos, setTodos] = createSignal<TodoItem[]>([]);
  const [input, setInput] = createSignal("");

  const addTodo = () => {
    if (!input().trim()) return;
    setTodos((prev) => [
      ...prev,
      { id: Date.now(), text: input(), done: false },
    ]);
    setInput("");
  };

  const toggle = (id: number) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  // <Show> renders conditionally
  // <For> renders lists — keyed by item (not index)
  return (
    <div>
      <input
        value={input()}
        onInput={(e) => setInput(e.currentTarget.value)}
        placeholder="New todo..."
      />
      <button onClick={addTodo}>Add</button>

      <Show when={todos().length > 0} fallback={<p>No todos yet.</p>}>
        <For each={todos()}>
          {(todo) => (
            <div
              style={{ "text-decoration": todo.done ? "line-through" : "none" }}
              onClick={() => toggle(todo.id)}
            >
              {todo.text}
            </div>
          )}
        </For>
      </Show>
    </div>
  );
};

export default TodoApp;
```

## Control Flow

```typescript
import { Show, For, Switch, Match, Index } from "solid-js";

// Show — conditional rendering
<Show when={isLoggedIn()} fallback={<LoginForm />}>
  <Dashboard />
</Show>

// For — list rendering (efficient keyed updates)
<For each={items()}>
  {(item, index) => <div>{index()} - {item.name}</div>}
</For>

// Index — list rendering when items change in place (not reorder)
<Index each={items()}>
  {(item, index) => <div>{index} - {item().name}</div>}
</Index>

// Switch/Match — multi-branch conditional
<Switch fallback={<p>Unknown status</p>}>
  <Match when={status() === "loading"}><Spinner /></Match>
  <Match when={status() === "error"}><ErrorView /></Match>
  <Match when={status() === "success"}><DataView /></Match>
</Switch>
```

## Stores — Complex State

```typescript
import { createStore, produce } from "solid-js/store";

interface AppState {
  users: { id: number; name: string; active: boolean }[];
  loading: boolean;
}

const [state, setState] = createStore<AppState>({
  users: [],
  loading: false,
});

// Update nested properties
setState("loading", true);
setState("users", 0, "active", false);

// Add items
setState("users", (users) => [...users, { id: 3, name: "Charlie", active: true }]);

// Immer-like mutations with produce
setState(
  produce((state) => {
    state.users.push({ id: 4, name: "Diana", active: true });
    state.users[0].active = false;
    state.loading = false;
  })
);

// Read nested values — fine-grained reactivity
function UserList() {
  return (
    <For each={state.users}>
      {(user) => (
        <div>
          {/* Only re-renders when user.name changes */}
          {user.name} — {user.active ? "active" : "inactive"}
        </div>
      )}
    </For>
  );
}
```

## Resources — Async Data Fetching

```typescript
import { createSignal, createResource, Suspense } from "solid-js";

// createResource — wraps async data fetching
async function fetchUser(id: number) {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error("User not found");
  return res.json();
}

function UserProfile() {
  const [userId, setUserId] = createSignal(1);

  // Refetches automatically when userId() changes
  const [user, { refetch, mutate }] = createResource(userId, fetchUser);

  return (
    <Suspense fallback={<p>Loading...</p>}>
      {/* user() is undefined while loading, the value when ready */}
      <Show when={user()} fallback={<p>Error loading user</p>}>
        {(u) => (
          <div>
            <h1>{u().name}</h1>
            <button onClick={refetch}>Refresh</button>
          </div>
        )}
      </Show>
    </Suspense>
  );
}
```

## SolidStart — Full-Stack

SolidStart adds file-based routing, SSR, and server functions:

```bash
npm create solid@latest
# Choose: SolidStart, TypeScript
```

File structure:

```
src/
  routes/
    index.tsx         → /
    about.tsx         → /about
    users/
      index.tsx       → /users
      [id].tsx        → /users/:id
  app.tsx
```

```typescript
// src/routes/users/[id].tsx
import { createAsync, useParams } from "@solidjs/router";
import { Show, Suspense } from "solid-js";
import { getUser } from "~/lib/users"; // server function

export default function UserPage() {
  const params = useParams();
  const user = createAsync(() => getUser(Number(params.id)));

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Show when={user()}>
        {(u) => (
          <article>
            <h1>{u().name}</h1>
            <p>{u().email}</p>
          </article>
        )}
      </Show>
    </Suspense>
  );
}
```

```typescript
// src/lib/users.ts — server functions
"use server";

export async function getUser(id: number) {
  const res = await fetch(`https://api.example.com/users/${id}`);
  return res.json();
}

export async function createUser(data: { name: string; email: string }) {
  // Runs on the server only — safe to access DB
  return db.insert(users).values(data).returning();
}
```

## Migrating from React

| React | SolidJS |
|---|---|
| `useState(0)` | `createSignal(0)` |
| `useEffect(() => {}, [dep])` | `createEffect(() => { dep(); })` |
| `useMemo(() => calc, [dep])` | `createMemo(() => calc())` |
| `useReducer` | `createStore` |
| `useContext` | `useContext` (same API) |
| `React.memo` | Not needed — no re-renders |
| `key` prop in lists | Use `<For>` instead of `map()` |
| `useRef` | `createSignal` or `let el!: HTMLElement` |

Key differences:
- **Components run once** — no "re-render" concept. Put reactive logic inside JSX or effects.
- **Access signals by calling them** — `count()` not `count`.
- **Use `<For>` for lists** — not `.map()` — for efficient keyed rendering.
- **Destructuring signals breaks reactivity** — pass signals or use stores.

## Guidelines

- Never destructure signals: `const { x } = state` breaks reactivity. Use `state.x` or `createMemo`.
- Use `<For>` instead of `Array.map` in JSX for efficient list rendering.
- Components run once — initialize logic at the top level, not in callbacks.
- Use `createStore` for objects/arrays that need fine-grained updates.
- Use `createResource` for async data — it integrates with `<Suspense>` automatically.
- `createMemo` is cached — prefer it over calling `createEffect` to compute derived values.
- SolidStart `"use server"` functions run exclusively on the server — safe for DB access.
