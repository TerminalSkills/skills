---
name: preact
description: >-
  Preact is a 3kB alternative to React with the same modern API — components,
  hooks, and JSX — plus first-class fine-grained reactivity through
  `@preact/signals`. Use when a user wants to build a performance-critical web
  app, embedded widget, or mobile-first site with a smaller bundle than React,
  wants to add reactive signals state, or wants to reuse an existing React
  component library on top of Preact via the `preact/compat` layer.
license: Apache-2.0
compatibility: "Preact 10.x or 11.x, Node.js 18+ for tooling"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - preact
    - react-alternative
    - signals
    - jsx
    - frontend
  repository: https://github.com/preactjs/preact
---

# Preact — Fast 3kB Alternative to React

## Overview

Preact implements the same component model and hooks API as React in roughly 3kB (minified + gzipped), against React+ReactDOM's ~40kB+. It ships its own virtual DOM diffing, so most React code — `useState`, `useEffect`, `useRef`, `useMemo`, JSX — runs unchanged. On top of that, `@preact/signals` adds fine-grained reactive state: a signal's value can be read directly in JSX, and only the DOM text node that depends on it updates, skipping Preact's own diffing for that subtree. `preact/compat` is a shim that maps `react` and `react-dom` imports onto Preact, so most React component libraries (synthetic-event quirks aside) work without modification.

## Instructions

### Install

```bash
npm init preact my-app        # scaffold a new Vite + Preact project (TS/router/ESLint prompts)
cd my-app && npm install
npm run dev
```

To add Preact to an existing Vite project instead:

```bash
npm install preact
npm install -D @preact/preset-vite
```

```js
// vite.config.js
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
});
```

`@preact/preset-vite` configures the JSX pragma and automatically aliases `react`/`react-dom` to `preact/compat`, so React libraries work without a manual alias entry. Other bundlers (webpack, Rollup, Parcel, Jest) need the alias set by hand in their own config (`resolve.alias`, `moduleNameMapper`, etc.) pointing `react` and `react-dom` at `preact/compat`.

### Components and Hooks

```tsx
import { render } from "preact";
import { useState, useRef, useMemo } from "preact/hooks";

function TodoApp() {
  const [todos, setTodos] = useState<{ id: number; text: string; done: boolean }[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = useMemo(() => todos.filter((t) => !t.done).length, [todos]);

  const addTodo = () => {
    if (!input.trim()) return;
    setTodos([...todos, { id: Date.now(), text: input, done: false }]);
    setInput("");
    inputRef.current?.focus();
  };

  const toggle = (id: number) =>
    setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return (
    <div>
      <h1>Todos ({remaining} remaining)</h1>
      <input
        ref={inputRef}
        value={input}
        onInput={(e) => setInput((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => e.key === "Enter" && addTodo()}
      />
      <button onClick={addTodo}>Add</button>
      <ul>
        {todos.map((t) => (
          <li
            key={t.id}
            style={{ textDecoration: t.done ? "line-through" : "none" }}
            onClick={() => toggle(t.id)}
          >
            {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

render(<TodoApp />, document.getElementById("app")!);
```

### Signals

```bash
npm install @preact/signals
```

```tsx
import { signal, computed, effect, batch } from "@preact/signals";

// Global reactive state — no context provider needed
const count = signal(0);
const doubled = computed(() => count.value * 2);

effect(() => {
  document.title = `Count: ${count.value}`;
});

function Counter() {
  // Pass the signal itself in JSX: only this text node updates, the
  // Counter component never re-renders on count changes.
  return (
    <div>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <button
        onClick={() =>
          batch(() => {
            count.value++;
          })
        }
      >
        +
      </button>
    </div>
  );
}
```

Inside a component, `useSignal`, `useComputed`, and `useSignalEffect` (from `@preact/signals`) create component-scoped equivalents of `signal`, `computed`, and `effect`.

## Examples

### Example 1: "Add a fine-grained reactive counter without re-rendering the whole app"

```tsx
import { signal } from "@preact/signals";
import { render } from "preact";

const seconds = signal(0);
setInterval(() => seconds.value++, 1000);

function Clock() {
  return <p>Elapsed: {seconds}s</p>;
}

render(<Clock />, document.getElementById("app")!);
```

The `<Clock>` component itself never re-renders; Preact's signals binding patches only the text node inside the `<p>`.

### Example 2: "Use a React charting library (Recharts) inside a Preact app"

```js
// vite.config.js — alias is automatic with @preact/preset-vite
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
});
```

```tsx
import { LineChart, Line, XAxis, YAxis } from "recharts";

const data = [
  { month: "Jan", revenue: 4200 },
  { month: "Feb", revenue: 5100 },
  { month: "Mar", revenue: 4800 },
];

function RevenueChart() {
  return (
    <LineChart width={400} height={240} data={data}>
      <XAxis dataKey="month" />
      <YAxis />
      <Line type="monotone" dataKey="revenue" stroke="#22c55e" />
    </LineChart>
  );
}
```

Recharts imports `react`/`react-dom`; with the Vite preset's automatic `preact/compat` alias it renders through Preact's DOM diffing with no code changes.

## Guidelines

- Preact dispatches native DOM events, not React's synthetic event system — event objects and a few event-timing edge cases differ from React.
- Reading `signal.value` inside JSX text content avoids a full component re-render; destructuring a signal's `.value` into a local variable first loses that benefit and re-renders normally.
- `preact/compat` covers most React libraries but not all — anything relying on React internals (`react-reconciler`, legacy context, some portals/suspense edge cases) may still break.
- For server-side rendering, use `preact-render-to-string`, or a Preact-based meta-framework; don't assume a Node.js SSR setup built for React works unchanged.
- Don't add `@preact/signals` to a project that only needs plain hooks — it's an additional dependency and mental model; reach for it when cross-component reactive state or avoiding re-renders is the actual problem.
