---
name: solid-js
description: >-
  SolidJS — fine-grained reactive UI library without a virtual DOM. Use when
  building high-performance UIs, choosing a React alternative with better
  reactivity primitives, or using SolidStart for full-stack apps with SSR and
  server functions. Covers signals, effects, memos, stores, and migration
  patterns from React.
license: Apache-2.0
compatibility: "SolidJS 1.9 (stable; 2.0 is a release candidate). Vite 8 needs Node.js 20.19+ or 22.12+; SolidStart 2 needs Node.js 24+."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["solidjs", "reactive", "signals", "performance", "frontend"]
  repository: https://github.com/solidjs/solid
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

## Instructions

### Installation

```bash
# Official scaffolder — prompts for template, TypeScript and SolidStart
npm create solid@latest
# Same thing without prompts: a client-rendered Solid + Vite app
npm create solid@latest price-table -- --vanilla --ts -t basic
# Or the Vite template
npm create vite@latest price-table -- --template solid-ts
cd price-table && npm install && npm run dev
```

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
```

### createEffect — Side Effects

```typescript
import { createSignal, createEffect, onCleanup } from "solid-js";

const [name, setName] = createSignal("Alice");
// First run happens after the component has rendered, then again whenever name() changes
createEffect(() => {
  document.title = `Hello, ${name()}!`;
});

// Cleanup goes through onCleanup; a returned value is passed to the next run, not called
createEffect(() => {
  const id = setInterval(() => console.log(name()), 1000);
  onCleanup(() => clearInterval(id)); // Runs before the next run and on dispose
});
```

### createMemo — Derived State

```typescript
import { createSignal, createMemo } from "solid-js";

const [price, setPrice] = createSignal(100);
const [quantity, setQuantity] = createSignal(3);
// Computed value — only recalculates when dependencies change
const total = createMemo(() => price() * quantity()); // 300
setPrice(120); // total() is now 360
```

### Control Flow

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

### Stores — Complex State

```typescript
import { createStore, produce } from "solid-js/store";

const [state, setState] = createStore({
  users: [{ id: 1, name: "Alice", active: true }],
  loading: false,
});
// Update nested properties
setState("loading", true);
setState("users", 0, "active", false);
// Immer-like mutations with produce
setState(
  produce((s) => {
    s.users.push({ id: 4, name: "Diana", active: true });
    s.loading = false;
  })
);
```

### Resources — Async Data Fetching

```typescript
import { createSignal, createResource, ErrorBoundary, Show, Suspense } from "solid-js";

async function fetchUser(id: number) {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error("User not found");
  return res.json();
}

function UserProfile() {
  const [userId, setUserId] = createSignal(1);
  // Refetches automatically when userId() changes
  const [user, { refetch, mutate }] = createResource(userId, fetchUser);
  // A rejected fetcher surfaces in the nearest ErrorBoundary and as user.error; user.loading is also available
  return (
    <ErrorBoundary fallback={(err) => <p>Failed: {err.message}</p>}>
      <Suspense fallback={<p>Loading...</p>}>
        <Show when={user()}>{(u) => <h1>{u().name}</h1>}</Show>
      </Suspense>
    </ErrorBoundary>
  );
}
```

### SolidStart — Full-Stack

SolidStart adds file-based routing, SSR, and server functions. SolidStart 2 (August 2026) builds with Vite and Nitro 3 instead of Vinxi and requires Node.js 24 or newer:

```bash
npm create solid@latest task-board -- --solidstart --v2 --ts -t basic
cd task-board && npm install && npm run dev
```

Routes are files: `src/routes/index.tsx` → `/`, `src/routes/users/[id].tsx` → `/users/:id`, with the shell in `src/app.tsx`. Configuration lives in `vite.config.ts` (`plugins: [solidStart(), nitro()]`, imported from `@solidjs/start/config` and `nitro/vite`).

Data loading and mutations come from `@solidjs/router`: wrap reads in `query`, read them with `createAsync`, and wrap writes in `action` (Example 2). Upgrading a v1 app: replace the `vinxi` scripts with `vite dev` / `vite build`, move `app.config.ts` settings into `solidStart()` in `vite.config.ts`, and import HTTP helpers from `@solidjs/start/http` instead of `vinxi/http`.

### Context (Dependency Injection)

```typescript
import { createContext, useContext, type ParentComponent } from "solid-js";
import { createStore } from "solid-js/store";
const AuthContext = createContext<{ user: () => User | null; login: (u: User) => void }>();

export const AuthProvider: ParentComponent = (props) => {
  const [state, setState] = createStore<{ user: User | null }>({ user: null });
  const value = { user: () => state.user, login: (u: User) => setState("user", u) };
  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext)!;
```

### Migrating from React

| React | SolidJS |
|---|---|
| `useState(0)` | `createSignal(0)` |
| `useEffect(() => {}, [dep])` | `createEffect(() => { dep(); })` — dependencies are tracked automatically |
| effect cleanup `return () => …` | `onCleanup(() => …)` inside the effect |
| `useMemo(() => calc, [dep])` | `createMemo(() => calc())` |
| `useReducer` | `createStore` |
| `useContext` | `useContext` (same API) |
| `React.memo` | Not needed — no re-renders |
| `key` prop in lists | Use `<For>` instead of `map()` |
| `useRef` | `let el!: HTMLDivElement` with `<div ref={el}>` |

## Examples

### Example 1: Port a React component

User request: "Port our React cart to Solid — it keeps the lines in useState, the subtotal in useMemo, and a useEffect sets the page title."

```typescript
import { createEffect, createMemo, For } from "solid-js";
import { createStore } from "solid-js/store";
type Line = { sku: string; title: string; price: number; qty: number };

export function Cart(props: { lines: Line[]; taxRate: number }) {
  const [lines, setLines] = createStore(props.lines);
  const subtotal = createMemo(() => lines.reduce((sum, l) => sum + l.price * l.qty, 0));
  const total = () => subtotal() * (1 + props.taxRate);
  createEffect(() => {
    document.title = `Cart (${lines.length}) — $${total().toFixed(2)}`;
  });
  return (
    <section>
      <For each={lines} fallback={<p>Your cart is empty.</p>}>
        {(line, i) => (
          <label>
            {line.title}
            <input type="number" min="0" value={line.qty}
              onInput={(e) => setLines(i(), "qty", e.currentTarget.valueAsNumber || 0)} />
          </label>
        )}
      </For>
      <p>Total: ${total().toFixed(2)}</p>
    </section>
  );
}
```

Result: `Cart` runs once. Changing a quantity updates that line's `qty`, the total text node and the document title — nothing else is re-created, and no dependency arrays are needed.

### Example 2: Server-backed page in SolidStart

User request: "Add a /tasks page to the SolidStart app that lists tasks from the server and has a form to add one."

```typescript
// src/lib/tasks.ts
import { action, query, redirect } from "@solidjs/router";
type Task = { id: number; title: string; done: boolean };
const tasks: Task[] = [{ id: 1, title: "Write release notes", done: false }]; // stand-in for a database

export const getTasks = query(async () => {
  "use server"; // inside the function, not at the top of the file, when wrapped in query/action
  return tasks;
}, "tasks");

export const addTask = action(async (formData: FormData) => {
  "use server";
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required");
  tasks.push({ id: tasks.length + 1, title, done: false });
  throw redirect("/tasks");
}, "addTask");
```

```typescript
// src/routes/tasks.tsx
import { For, Show } from "solid-js";
import { createAsync, useSubmission, type RouteDefinition } from "@solidjs/router";
import { addTask, getTasks } from "~/lib/tasks";

export const route = { preload: () => getTasks() } satisfies RouteDefinition;
export default function TasksPage() {
  const tasks = createAsync(() => getTasks());
  const adding = useSubmission(addTask);
  return (
    <main>
      <ul><For each={tasks()}>{(task) => <li>{task.title}</li>}</For></ul>
      <form action={addTask} method="post">
        <input name="title" required />
        <button disabled={adding.pending}>Add task</button>
      </form>
      <Show when={adding.error}>{(err) => <p>{err().message}</p>}</Show>
    </main>
  );
}
```

Result: `/tasks` is server-rendered with the `Write release notes` list item already in the HTML (the `<li>` carries a `data-hk` hydration attribute). Submitting the form posts to a generated `/_server?id=…` endpoint, answers `302` with `location: /tasks`, and the list re-renders with the new task; it also works before JavaScript has loaded.

## Guidelines

- Never destructure props or stores: `const { x } = props` reads the value once and breaks reactivity. Use `props.x`, `splitProps`, or `createMemo`.
- Use `<For>` instead of `Array.map` in JSX for efficient list rendering.
- Components run once — put reactive reads inside JSX, memos, or effects, not in the component body.
- `createMemo` is cached — prefer it over a `createEffect` that writes to another signal.
- Effects never run during server rendering; data needed for SSR belongs in a resource or a router `query`.
- `"use server"` code runs only on the server, but each function becomes a public HTTP endpoint — check the session and validate arguments inside it.
- Solid 2.0 is still a release candidate (`solid-js@next`) and is not a drop-in upgrade: DOM APIs move to `@solidjs/web`, store helpers move into `solid-js`, `createEffect` splits into compute and apply functions, `Suspense`/`ErrorBoundary` become `Loading`/`Errored`, `Index` becomes `<For keyed={false}>`, and `createResource` is replaced by async memos. Everything above targets 1.9; read the 2.0 migration guide in the `next` branch before adopting it.
- React component libraries do not work in Solid; if a project depends on them, stay on React or look for a Solid port first.
