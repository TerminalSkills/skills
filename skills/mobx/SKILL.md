---
name: mobx
description: >-
  MobX is a state management library for JavaScript and React that makes state
  observable, so computed values and components update automatically when it
  changes. Use when a user asks to add MobX to a React app, create a store with
  makeAutoObservable, wrap components in observer, write computed values,
  actions, reactions or flow, fix a MobX component that does not re-render, or
  migrate from MobX 6 to MobX 7.
license: Apache-2.0
compatibility: 'MobX 7 with mobx-react-lite 5 (React 18 or 19); needs native Proxy support'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/mobxjs/mobx
  tags:
    - react
    - state-management
    - observable
    - reactive
    - proxy
---

# MobX — Reactive State Management

## Overview

MobX is a simple and scalable state management library based on transparent reactive programming. State is made observable, derived values are computed from it, actions mutate it, and reactions run side effects — the UI updates automatically when the state it read changes, without manual subscriptions. Stores can be classes or plain objects.

Current major version: **MobX 7** (July 2026) with `mobx-react-lite` 5 for function components and `mobx-react` 10 for class components. MobX 7 is a cleanup release: Proxy-only, Stage 3 decorators only, and several namespaced APIs became named exports (see "MobX 7 changes" below).

## Instructions

### Installation

```bash
npm install mobx mobx-react-lite
```

Use `mobx-react` instead of `mobx-react-lite` only when class components or the `@observer` class decorator are needed. With TypeScript, set `"useDefineForClassFields": true` in `tsconfig.json`; without spec-compliant class fields, a field declared without an initial value (`user?: User;`) cannot be made observable.

### Observable Store

```typescript
// stores/todo-store.ts
import { makeAutoObservable, runInAction } from "mobx";

export interface Todo { id: string; text: string; done: boolean }

export class TodoStore {
  todos: Todo[] = [];
  filter: "all" | "active" | "done" = "all";
  isLoading = false;

  constructor() {
    // Infers observables, computeds (getters), actions (methods), flows (generators).
    // autoBind lets methods be passed around as callbacks: onClick={store.addTodo}
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // Computed (cached, recalculated only when dependencies change)
  get filteredTodos() {
    switch (this.filter) {
      case "active": return this.todos.filter(t => !t.done);
      case "done": return this.todos.filter(t => t.done);
      default: return this.todos;
    }
  }

  get remaining() {
    return this.todos.filter(t => !t.done).length;
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

  // Async action: code after an await is no longer inside the action
  async fetchTodos() {
    this.isLoading = true;
    try {
      const response = await fetch("/api/todos");
      const data: Todo[] = await response.json();
      runInAction(() => { this.todos = data; });
    } finally {
      runInAction(() => { this.isLoading = false; });
    }
  }

  // Same thing as a flow: a generator needs no runInAction after each yield
  *syncTodos(): Generator<Promise<unknown>, number, any> {
    this.isLoading = true;
    try {
      const response = yield fetch("/api/todos");
      this.todos = yield response.json();
      return this.todos.length;
    } finally {
      this.isLoading = false;
    }
  }
}
```

Call a flow like a normal method; in TypeScript wrap it to get a typed promise: `const count = await flowResult(store.syncTodos())`.

### Observer Components

```tsx
import { createContext, useContext } from "react";
import { observer, useLocalObservable } from "mobx-react-lite";
import { TodoStore } from "./stores/todo-store";

const StoreContext = createContext<TodoStore | null>(null);
const useStore = () => {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreContext.Provider is missing");
  return store;
};

// observer tracks which observables the render read and re-renders only for those
const TodoList = observer(() => {
  const store = useStore();
  if (store.isLoading) return <p>Loading…</p>;
  return (
    <div>
      <p>{store.remaining} remaining</p>
      <ul>
        {store.filteredTodos.map(t => (
          <li key={t.id} onClick={() => store.toggleTodo(t.id)}
            style={{ textDecoration: t.done ? "line-through" : "none" }}>
            {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
});

// Component-local observable state
const Counter = observer(() => {
  const state = useLocalObservable(() => ({ count: 0, increment() { this.count++; } }));
  return <button onClick={state.increment}>Clicked {state.count} times</button>;
});

export const App = ({ store }: { store: TodoStore }) => (
  <StoreContext.Provider value={store}><TodoList /><Counter /></StoreContext.Provider>
);
```

### Reactions

```typescript
import { autorun, reaction, when } from "mobx";

// reaction: runs the effect when the tracked expression changes (not on creation)
const dispose = reaction(
  () => store.remaining,
  (remaining, previous) => { document.title = `${remaining} todos left (was ${previous})`; },
);

// autorun: runs once immediately, then whenever anything it read changes
const stopSaving = autorun(() => {
  localStorage.setItem("todos", JSON.stringify(store.todos));
});

await when(() => !store.isLoading);   // promise that resolves once the condition is true

dispose(); stopSaving();              // always dispose reactions you no longer need
```

### MobX 7 changes (upgrading from MobX 6)

| MobX 6 | MobX 7 |
|--------|--------|
| `observable.ref` / `.shallow` / `.deep` / `.struct` | `observableRef`, `observableShallow`, `observableDeep`, `observableStruct` |
| `computed.struct`, `action.bound`, `flow.bound` | `computedStruct`, `actionBound`, `flowBound` |
| `comparer.structural` / `.shallow` / `.default` / `.identity` | `compareStructural`, `compareShallow`, `compareDefault`, `compareIdentity` |
| `configure({ useProxies })`, `{ proxy: false }` | removed — Proxy is always used |
| `trace()` | removed — use `getDependencyTree`, `getObserverTree`, `spy` |
| Legacy decorators (`experimentalDecorators`) | Stage 3 decorators only: `@observable accessor title = ""`, no `makeObservable(this)` |
| `Provider`, `inject` (mobx-react) | `React.createContext` |
| `useLocalStore`, `useObserver`, `useStaticRendering` | `useLocalObservable`, `observer` / `<Observer>`, `enableStaticRendering` |

`mobx-react-lite` 5 and `mobx-react` 10 require MobX 7 and React 18+. Projects that must keep legacy decorators stay on MobX 6.

## Examples

### Example 1: Cart store with decorators

**User request:** "Add a MobX cart store to our checkout — the total should update when items or the coupon change."

Stage 3 decorators need TypeScript 5+ with `experimentalDecorators` off (or Babel's `@babel/plugin-proposal-decorators` with `version: "2023-05"`).

```typescript
import { observable, computed, action, actionBound, autorun } from "mobx";

class CartStore {
  @observable accessor items: { sku: string; price: number; qty: number }[] = [];
  @observable accessor coupon: string | null = null;

  @computed get total() {
    const sum = this.items.reduce((s, i) => s + i.price * i.qty, 0);
    return this.coupon === "WELCOME10" ? sum * 0.9 : sum;
  }

  @action add(sku: string, price: number, qty = 1) {
    this.items.push({ sku, price, qty });
  }

  @actionBound applyCoupon(code: string) { this.coupon = code; }
}

const cart = new CartStore();
const stop = autorun(() => console.log("total", cart.total));
cart.add("TSHIRT-M", 24, 2);
cart.applyCoupon("WELCOME10");
stop();
```

Output — the autorun fires once at start and once per change:

```
total 0
total 48
total 43.2
```

### Example 2: Upgrade a store from MobX 6 to MobX 7

**User request:** "We bumped mobx to 7 and the session store throws on `observable.ref`. Fix it."

```bash
npm install mobx@7 mobx-react-lite@5
```

```typescript
// Before (MobX 6): makeObservable(this, { user: observable.ref, signIn: action.bound })
import { makeObservable, observableRef, actionBound, autorun } from "mobx";

class SessionStore {
  user: { id: string; name: string } | null = null;

  constructor() {
    makeObservable(this, { user: observableRef, signIn: actionBound });
  }

  signIn(user: { id: string; name: string }) { this.user = user; }
}

const session = new SessionStore();
autorun(() => console.log("user", session.user?.name));
session.signIn({ id: "u_81", name: "Priya Nair" });
```

Output: `user undefined`, then `user Priya Nair`. Also remove `useProxies` from any `configure()` call and replace `Provider`/`inject` with a React context as shown above.

## Guidelines

1. **makeAutoObservable** — Use in the constructor; it makes properties observable, getters computed, methods actions and generators flows. It cannot be used in classes that extend another class or are subclassed — use `makeObservable` with explicit annotations there
2. **observer()** — Wrap every React component that reads observables with `observer`; it only re-renders when the observables it read change
3. **Direct mutations** — Mutate state directly in actions (`this.todos.push(...)`) — MobX uses Proxy to track changes
4. **runInAction or flow** — State changes after an `await` must be wrapped in `runInAction()`, or write the method as a generator (`flow`). Changing observed state outside an action logs a strict-mode warning (`enforceActions: "observed"` is the default)
5. **Computed values** — Use getters for derived data; MobX caches results and recalculates only when dependencies change. Keep them free of side effects
6. **Reactions for side effects** — Use `reaction()` or `autorun()` for logging, localStorage sync, API calls on state change, and call the returned disposer when done; inside components create them in `useEffect` and return the disposer
7. **Small stores** — Create multiple domain stores (AuthStore, CartStore, UIStore); share them through React context or a module import
8. **Don't destructure too early** — `const { count } = store` outside an `observer` component or reaction copies the value and loses tracking; read `store.count` where it is used
9. **Serializing** — Use `toJS(store.todos)` to get a plain, non-observable copy. Fields declared with `@observable accessor` are not enumerable, so `JSON.stringify(store)` and `Object.keys(store)` skip them unless the class defines `toJSON`
10. **When not to use it** — MobX 7 needs native `Proxy`, so it cannot run on engines without it; for a couple of local values plain React state is enough
