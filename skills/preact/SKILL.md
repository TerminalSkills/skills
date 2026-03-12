---
name: preact
category: Frontend Development
tags: [react-alternative, lightweight, fast, jsx, signals, 3kb]
version: 1.0.0
author: terminal-skills
---

# Preact — Fast 3kB Alternative to React

You are an expert in Preact, the lightweight React alternative with the same modern API in just 3kB. You help developers build performant web applications using Preact's component model, hooks, signals for reactive state, and compat layer for React ecosystem compatibility — ideal for performance-critical apps, embedded widgets, and mobile web where bundle size matters.

## Core Capabilities

### Components and Hooks

```tsx
import { h, render } from "preact";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";

function TodoApp() {
  const [todos, setTodos] = useState<{ id: number; text: string; done: boolean }[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = useMemo(() => todos.filter(t => !t.done).length, [todos]);

  const addTodo = () => {
    if (!input.trim()) return;
    setTodos([...todos, { id: Date.now(), text: input, done: false }]);
    setInput("");
    inputRef.current?.focus();
  };

  const toggle = (id: number) => {
    setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  return (
    <div>
      <h1>Todos ({remaining} remaining)</h1>
      <input ref={inputRef} value={input} onInput={e => setInput((e.target as HTMLInputElement).value)}
        onKeyDown={e => e.key === "Enter" && addTodo()} />
      <button onClick={addTodo}>Add</button>
      <ul>
        {todos.map(t => (
          <li key={t.id} style={{ textDecoration: t.done ? "line-through" : "none" }}
            onClick={() => toggle(t.id)}>{t.text}</li>
        ))}
      </ul>
    </div>
  );
}

render(<TodoApp />, document.getElementById("app")!);
```

### Signals (Fine-Grained Reactivity)

```tsx
import { signal, computed, effect } from "@preact/signals";

// Global reactive state — no context providers needed
const count = signal(0);
const doubled = computed(() => count.value * 2);

// Effects run when dependencies change
effect(() => {
  document.title = `Count: ${count.value}`;
});

function Counter() {
  // Signal directly in JSX — only this text node updates, not entire component
  return (
    <div>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <button onClick={() => count.value++}>+</button>
    </div>
  );
}

// No re-render of Counter component — signal updates the DOM text node directly
```

### React Compatibility

```tsx
// preact/compat provides React-compatible API
// In package.json or bundler config:
// "alias": { "react": "preact/compat", "react-dom": "preact/compat" }

// Now React libraries work with Preact:
import { useQuery } from "@tanstack/react-query";  // Works!
import { motion } from "framer-motion";            // Works!

// Most React component libraries work out of the box with the compat layer
```

## Installation

```bash
# New project
npm create preact                          # Official CLI

# Add to existing Vite project
npm install preact
# vite.config.ts: alias { "react": "preact/compat", "react-dom": "preact/compat" }

# Signals
npm install @preact/signals
```

## Best Practices

1. **Signals for state** — Use `@preact/signals` for shared state; no Context needed, fine-grained DOM updates
2. **React compat for ecosystem** — Alias `react` to `preact/compat`; use React component libraries without modification
3. **3kB advantage** — Preact shines in performance-critical contexts: embedded widgets, mobile web, slow connections
4. **Same API as React** — useState, useEffect, useRef, useMemo all work identically; easy migration
5. **No synthetic events** — Preact uses native DOM events; slightly different from React's event system
6. **Prerender for SSG** — Use `preact-render-to-string` for server rendering; or use Fresh (Deno) for full SSR
7. **HTM for no-build** — Use `htm` tagged template literals instead of JSX; works without a build step
8. **Bundle analysis** — Compare with React: Preact (3kB) vs React+ReactDOM (42kB); Preact wins on initial load
