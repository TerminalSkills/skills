---
name: recoil
description: >-
   You are an expert in Recoil, the state management library by Meta for React
  applications. You help developers manage application state with atoms
  (shared state units), selectors (derived/async state), and atom families —
  providing a graph-based state model that integrates naturally with React's
  concurrent features, avoids unnecessary re-renders, and handles async data
  fetching as first-class state.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Frontend Development
  tags:
    - state-management
    - react
    - atoms
    - selectors
    - meta
    - async
    - graph
---

# Recoil — State Management for React

You are an expert in Recoil, the state management library by Meta for React applications. You help developers manage application state with atoms (shared state units), selectors (derived/async state), and atom families — providing a graph-based state model that integrates naturally with React's concurrent features, avoids unnecessary re-renders, and handles async data fetching as first-class state.

## Core Capabilities

### Atoms and Selectors

```tsx
import { atom, selector, useRecoilState, useRecoilValue, RecoilRoot } from "recoil";

// Atoms — units of state
const todosAtom = atom<Todo[]>({
  key: "todos",
  default: [],
});

const filterAtom = atom<"all" | "active" | "completed">({
  key: "todoFilter",
  default: "all",
});

// Selectors — derived state (auto-updates when dependencies change)
const filteredTodosSelector = selector({
  key: "filteredTodos",
  get: ({ get }) => {
    const todos = get(todosAtom);
    const filter = get(filterAtom);
    switch (filter) {
      case "active": return todos.filter((t) => !t.done);
      case "completed": return todos.filter((t) => t.done);
      default: return todos;
    }
  },
});

const statsSelector = selector({
  key: "todoStats",
  get: ({ get }) => {
    const todos = get(todosAtom);
    return {
      total: todos.length,
      completed: todos.filter((t) => t.done).length,
      percent: todos.length ? Math.round(todos.filter((t) => t.done).length / todos.length * 100) : 0,
    };
  },
});

// Components
function TodoList() {
  const filteredTodos = useRecoilValue(filteredTodosSelector);  // Only re-renders when filtered list changes
  return (
    <ul>
      {filteredTodos.map((todo) => <TodoItem key={todo.id} id={todo.id} />)}
    </ul>
  );
}

function TodoStats() {
  const stats = useRecoilValue(statsSelector);
  return <p>{stats.completed}/{stats.total} done ({stats.percent}%)</p>;
}

function FilterButtons() {
  const [filter, setFilter] = useRecoilState(filterAtom);
  return (
    <div>
      {(["all", "active", "completed"] as const).map((f) => (
        <button key={f} onClick={() => setFilter(f)}
          style={{ fontWeight: filter === f ? "bold" : "normal" }}>
          {f}
        </button>
      ))}
    </div>
  );
}

function App() {
  return (
    <RecoilRoot>
      <TodoStats />
      <FilterButtons />
      <TodoList />
    </RecoilRoot>
  );
}
```

### Async Selectors and Atom Families

```tsx
// Async selector — fetches data, integrates with Suspense
const userProfileSelector = selector({
  key: "userProfile",
  get: async ({ get }) => {
    const userId = get(currentUserIdAtom);
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  },
});

// Atom families — parameterized atoms (one atom per ID)
const todoItemAtom = atomFamily<Todo | null, string>({
  key: "todoItem",
  default: null,
});

// Selector families — parameterized selectors
const userByIdSelector = selectorFamily<User, string>({
  key: "userById",
  get: (userId) => async ({ get }) => {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  },
});

// Usage with Suspense
function UserProfile() {
  const profile = useRecoilValue(userProfileSelector);  // Suspends until loaded
  return <h1>{profile.name}</h1>;
}

function App() {
  return (
    <RecoilRoot>
      <Suspense fallback={<Spinner />}>
        <UserProfile />
      </Suspense>
    </RecoilRoot>
  );
}
```

## Installation

```bash
npm install recoil
```

## Best Practices

1. **Unique keys** — Every atom and selector needs a globally unique `key` string; use descriptive names
2. **Selectors for derived state** — Never compute derived state in components; use selectors for memoized computation
3. **Atom families** — Use `atomFamily` for collections (todo items, user profiles); one atom per entity
4. **Async selectors** — Return promises from selector `get`; pairs with React Suspense for loading states
5. **Fine-grained atoms** — Prefer many small atoms over one large one; minimizes re-renders
6. **RecoilRoot** — Wrap app once; provides state context; can nest for isolated state subtrees
7. **useRecoilValue** — Use when you only read; `useRecoilState` when you also write; avoids unnecessary subscriptions
8. **Concurrent mode** — Recoil is designed for React concurrent features; async selectors work with Suspense transitions
