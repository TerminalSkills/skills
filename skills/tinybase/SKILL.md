---
name: tinybase
description: >-
   You are an expert in TinyBase, the reactive data store for local-first
  applications. You help developers build offline-capable apps with structured
  tables, automatic reactivity, CRDT-based sync, persistence to
  IndexedDB/SQLite/Postgres, and relationship modeling — providing a complete
  client-side database that syncs across devices without a custom backend.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Frontend Development
  tags:
    - state-management
    - reactive
    - local-first
    - sync
    - crdt
    - offline
    - database
---

# TinyBase — Reactive Data Store for Local-First Apps

You are an expert in TinyBase, the reactive data store for local-first applications. You help developers build offline-capable apps with structured tables, automatic reactivity, CRDT-based sync, persistence to IndexedDB/SQLite/Postgres, and relationship modeling — providing a complete client-side database that syncs across devices without a custom backend.

## Core Capabilities

### Store

```typescript
import { createStore, createQueries, createRelationships } from "tinybase";
import { createLocalPersister } from "tinybase/persisters/persister-browser";

// Create store with tables
const store = createStore()
  .setTablesSchema({
    todos: {
      text: { type: "string" },
      done: { type: "boolean", default: false },
      priority: { type: "number", default: 0 },
      categoryId: { type: "string" },
    },
    categories: {
      name: { type: "string" },
      color: { type: "string" },
    },
  });

// Add data
store.setRow("todos", "t1", { text: "Build app", done: false, priority: 1, categoryId: "c1" });
store.setRow("todos", "t2", { text: "Ship it", done: false, priority: 2, categoryId: "c1" });
store.setRow("categories", "c1", { name: "Work", color: "#3b82f6" });

// Queries
const queries = createQueries(store);
queries.setQueryDefinition("activeTodos", "todos",
  ({ select, where, order }) => {
    select("text");
    select("priority");
    where("done", false);
    order("priority", true);              // Descending
  },
);

// Relationships
const relationships = createRelationships(store);
relationships.setRelationshipDefinition("todoCategory", "todos", "categories", "categoryId");

// Reactivity — listener fires on any change
store.addRowListener("todos", null, (store, tableId, rowId) => {
  console.log(`Todo ${rowId} changed:`, store.getRow(tableId, rowId!));
});

// Persist to IndexedDB
const persister = createLocalPersister(store, "my-app");
await persister.startAutoLoad();          // Load on startup
await persister.startAutoSave();          // Save on every change
```

### React Integration

```tsx
import { Provider, useRow, useTable, useResultTable, useCell } from "tinybase/ui-react";

function App() {
  return (
    <Provider store={store} queries={queries}>
      <TodoList />
    </Provider>
  );
}

function TodoList() {
  const activeTodos = useResultTable("activeTodos");  // Auto-updates on data change
  return (
    <ul>
      {Object.entries(activeTodos).map(([id, todo]) => (
        <TodoItem key={id} id={id} />
      ))}
    </ul>
  );
}

function TodoItem({ id }: { id: string }) {
  const done = useCell("todos", id, "done");          // Subscribes to single cell
  const text = useCell("todos", id, "text");
  return (
    <li onClick={() => store.setCell("todos", id, "done", !done)}
      style={{ textDecoration: done ? "line-through" : "none" }}>
      {text}
    </li>
  );
}
```

### CRDT Sync

```typescript
import { createWsSynchronizer } from "tinybase/synchronizers/synchronizer-ws-client";
import { createMergeableStore } from "tinybase";

// Mergeable store (CRDT-based, conflict-free)
const store = createMergeableStore();

// Sync via WebSocket
const synchronizer = createWsSynchronizer(store, new WebSocket("wss://sync.example.com"));
await synchronizer.startSync();

// Now any device with the same store syncs automatically
// Offline changes merge cleanly when reconnected
```

## Installation

```bash
npm install tinybase
```

## Best Practices

1. **Local-first** — Data lives on the client; works offline, syncs when online; instant UI responses
2. **Fine-grained reactivity** — Use `useCell` for single value subscriptions; only re-renders what changed
3. **CRDT sync** — Use MergeableStore for multi-device sync; conflicts resolve automatically
4. **Queries** — Define queries with select/where/order; reactive, auto-update when underlying data changes
5. **Relationships** — Model foreign keys with `setRelationshipDefinition`; navigate between tables
6. **Persistence** — Auto-save to IndexedDB, SQLite (via OPFS), or remote Postgres; seamless persistence
7. **Tiny bundle** — Core is ~5KB gzipped; add only the modules you need (queries, relationships, sync)
8. **Schema validation** — Define table schemas for type safety; rejects invalid data at write time
