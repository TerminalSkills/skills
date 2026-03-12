---
name: mobx
category: Frontend Development
tags: [react, state-management, observable, reactive, proxy, automatic]
version: 1.0.0
author: terminal-skills
---

# MobX — Reactive State Management

You are an expert in MobX, the simple and scalable state management library based on transparent reactive programming. You help developers build React applications with observable state, automatic tracking of dependencies, computed values, actions for state mutations, and reactions for side effects — providing a natural, class-based or functional approach where the UI automatically updates when state changes without manual subscriptions.

## Core Capabilities

### Observable Store

```typescript
import { makeAutoObservable, runInAction, reaction, autorun } from "mobx";
import { observer } from "mobx-react-lite";

class TodoStore {
  todos: Todo[] = [];
  filter: "all" | "active" | "done" = "all";
  isLoading = false;

  constructor() {
    makeAutoObservable(this);             // Auto-detect observables, computeds, actions
  }

  // Computed (auto-cached, updates when dependencies change)
  get filteredTodos() {
    switch (this.filter) {
      case "active": return this.todos.filter(t => !t.done);
      case "done": return this.todos.filter(t => t.done);
      default: return this.todos;
    }
  }

  get stats() {
    return {
      total: this.todos.length,
      done: this.todos.filter(t => t.done).length,
      remaining: this.todos.filter(t => !t.done).length,
    };
  }

  // Actions (state mutations)
  addTodo(text: string) {
    this.todos.push({ id: crypto.randomUUID(), text, done: false });
  }

  toggleTodo(id: string) {
    const todo = this.todos.find(t => t.id === id);
    if (todo) todo.done = !todo.done;     // Direct mutation — MobX tracks it
  }

  removeTodo(id: string) {
    this.todos = this.todos.filter(t => t.id !== id);
  }

  // Async action
  async fetchTodos() {
    this.isLoading = true;
    try {
      const response = await fetch("/api/todos");
      const data = await response.json();
      runInAction(() => {                 // Wrap post-await mutations
        this.todos = data;
        this.isLoading = false;
      });
    } catch {
      runInAction(() => { this.isLoading = false; });
    }
  }
}

const todoStore = new TodoStore();

// Observer component — auto-tracks which observables are used
const TodoList = observer(() => {
  const { filteredTodos, stats, isLoading } = todoStore;

  if (isLoading) return <Spinner />;

  return (
    <div>
      <p>{stats.remaining} remaining</p>
      <ul>
        {filteredTodos.map(t => (
          <li key={t.id} onClick={() => todoStore.toggleTodo(t.id)}
            style={{ textDecoration: t.done ? "line-through" : "none" }}>
            {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
});

// Reactions (side effects when state changes)
reaction(
  () => todoStore.stats.remaining,
  (remaining) => { document.title = `${remaining} todos left`; },
);
```

## Installation

```bash
npm install mobx mobx-react-lite
```

## Best Practices

1. **makeAutoObservable** — Use in constructor; automatically makes properties observable, getters computed, methods actions
2. **observer()** — Wrap React components with `observer`; only re-renders when accessed observables change
3. **Direct mutations** — Mutate state directly in actions (`this.todos.push(...)`) — MobX uses Proxy to track changes
4. **runInAction** — Wrap state changes after `await` in `runInAction()`; required for async actions
5. **Computed values** — Use getters for derived data; MobX caches results and recalculates only when dependencies change
6. **Reaction for side effects** — Use `reaction()` or `autorun()` for logging, localStorage sync, API calls on state change
7. **Small stores** — Create multiple domain stores (AuthStore, CartStore, UIStore); inject via React context or import
8. **Don't destructure** — Don't destructure observables outside observer: `const { count } = store` breaks tracking; access via `store.count`
