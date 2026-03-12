---
name: zustand
category: Frontend Development
tags: [react, state-management, lightweight, hooks, typescript, store]
version: 1.0.0
author: terminal-skills
---

# Zustand — Minimal React State Management

You are an expert in Zustand, the small, fast, and scalable state management library for React. You help developers manage global state without boilerplate using Zustand's hook-based stores, selectors for performance, middleware (persist, devtools, immer), computed values, and async actions — replacing Redux complexity with a simple, un-opinionated API in under 1KB.

## Core Capabilities

### Store

```typescript
import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface Todo { id: string; text: string; done: boolean }

interface TodoStore {
  todos: Todo[];
  filter: "all" | "active" | "done";
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  setFilter: (filter: "all" | "active" | "done") => void;
  fetchTodos: () => Promise<void>;
}

const useTodoStore = create<TodoStore>()(
  devtools(
    persist(
      immer((set) => ({
        todos: [],
        filter: "all",

        addTodo: (text) => set((state) => {
          state.todos.push({ id: crypto.randomUUID(), text, done: false });
        }),

        toggleTodo: (id) => set((state) => {
          const todo = state.todos.find(t => t.id === id);
          if (todo) todo.done = !todo.done;
        }),

        removeTodo: (id) => set((state) => {
          state.todos = state.todos.filter(t => t.id !== id);
        }),

        setFilter: (filter) => set({ filter }),

        fetchTodos: async () => {
          const response = await fetch("/api/todos");
          const todos = await response.json();
          set({ todos });
        },
      })),
      { name: "todo-storage" },           // localStorage persistence
    ),
    { name: "TodoStore" },                // Redux DevTools label
  ),
);

// Usage in components — automatic re-render only when selected state changes
function TodoList() {
  const todos = useTodoStore((s) => s.todos);
  const filter = useTodoStore((s) => s.filter);
  const toggleTodo = useTodoStore((s) => s.toggleTodo);

  const filtered = todos.filter(t =>
    filter === "all" ? true : filter === "done" ? t.done : !t.done
  );

  return (
    <ul>
      {filtered.map(t => (
        <li key={t.id} onClick={() => toggleTodo(t.id)}
          style={{ textDecoration: t.done ? "line-through" : "none" }}>
          {t.text}
        </li>
      ))}
    </ul>
  );
}

// Access outside React
const { addTodo, todos } = useTodoStore.getState();
useTodoStore.subscribe((state) => console.log("State changed:", state.todos.length));
```

## Installation

```bash
npm install zustand
```

## Best Practices

1. **Selectors** — Always select specific fields: `useStore(s => s.count)`; prevents unnecessary re-renders
2. **Immer middleware** — Use immer for nested state updates; mutate draft instead of spreading
3. **Persist** — Use `persist` middleware for localStorage/sessionStorage; automatic hydration on page load
4. **DevTools** — Wrap with `devtools()` in development; inspect state changes in Redux DevTools extension
5. **Async actions** — Define async actions directly in the store; `set()` works inside async functions
6. **Outside React** — Use `getState()` and `subscribe()` for non-React code (API clients, WebSocket handlers)
7. **Multiple stores** — Create separate stores per domain (auth, cart, ui); keeps each store focused
8. **No providers** — Zustand doesn't need Context providers; stores are global singletons, import and use anywhere
