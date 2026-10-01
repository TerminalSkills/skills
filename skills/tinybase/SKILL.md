---
name: tinybase
description: >-
  TinyBase is a reactive in-memory data store for local-first JavaScript and
  TypeScript apps, with tables, key-value data, queries, persistence and CRDT
  sync. Use when a user asks to build an offline-capable or local-first app,
  keep app state in a TinyBase store, persist it to localStorage, IndexedDB,
  SQLite or Postgres, sync data between devices or tabs with a MergeableStore
  and WebSockets, or bind a store to React with tinybase/ui-react.
license: Apache-2.0
compatibility: 'Browsers, Node.js, Bun and Cloudflare Workers; tinybase/ui-react declares React 19 as its peer dependency'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/tinyplex/tinybase
  tags:
    - state-management
    - local-first
    - reactive
    - sync
    - crdt
---

# TinyBase — Reactive Data Store for Local-First Apps

## Overview

TinyBase keeps an app's data in memory as tables (table → row → cell) and key-value pairs, and notifies listeners about exactly what changed. Around that core it offers optional schemas, queries, indexes, relationships and metrics, **Persisters** that load and save the store (browser storage, files, SQLite, PostgreSQL and more), and **Synchronizers** that merge a CRDT-based `MergeableStore` between clients and servers. It has no runtime dependencies; the `store` module alone is about 7 kB gzipped. It is a client-side library, not a hosted database.

This skill targets TinyBase v10 (September 2026).

## Instructions

### Install or scaffold

```bash
npm install tinybase            # add `ws` for a Node sync server, `react` (19) for ui-react

# or generate a complete app (asks for framework, persistence and sync type)
npm create tinybase@latest
npm create tinybase@latest -- --list-options    # machine-readable list of options
```

Core modules come from the `tinybase` root (`createStore`, `createMergeableStore`, `createQueries`, `createRelationships`, `createIndexes`, `createMetrics`, `createCheckpoints`). Every persister, synchronizer and UI binding has its own subpath, for example `tinybase/persisters/persister-indexed-db`.

### Store, schema and listeners

```typescript
import { createStore } from "tinybase";

const store = createStore().setTablesSchema({
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

store.setRow("categories", "c1", { name: "Work", color: "#3b82f6" });
store.setRow("todos", "t1", { text: "Build app", priority: 1, categoryId: "c1" });
store.setRow("todos", "t2", { text: "Ship it", priority: 2, categoryId: "c1" });
store.getRow("todos", "t2");   // { text: "Ship it", priority: 2, categoryId: "c1", done: false }

store.setValue("theme", "dark");            // key-value data lives next to the tables

// Listeners fire per table, row or cell; null is a wildcard
const listenerId = store.addRowListener("todos", null, (store, tableId, rowId) => {
  console.log(`Todo ${rowId} changed:`, store.getRow(tableId, rowId));
});
store.setCell("todos", "t1", "done", true);  // logs: Todo t1 changed: { ... done: true }
store.delListener(listenerId);
```

### Queries and relationships

```typescript
import { createQueries, createRelationships } from "tinybase";

const queries = createQueries(store);
queries.setQueryDefinition("activeTodos", "todos", ({ select, join, where }) => {
  select("text");
  select("priority");
  select("categories", "name").as("category");   // column from the joined table
  join("categories", "categoryId");
  where("done", false);
});
queries.getResultTable("activeTodos");
// { t2: { text: "Ship it", priority: 2, category: "Work" } }

// Sorting and paging happen when reading, not in the definition
queries.getResultSortedRowIds("activeTodos", "priority", true, 0, 20);   // descending, first 20

const relationships = createRelationships(store);
relationships.setRelationshipDefinition("todoCategory", "todos", "categories", "categoryId");
relationships.getRemoteRowId("todoCategory", "t1");   // "c1"
relationships.getLocalRowIds("todoCategory", "c1");   // ["t1", "t2"]
```

The query builder provides `select`, `join`, `where`, `group` and `having`. Results are reactive: `queries.addResultTableListener("activeTodos", ...)` fires when the underlying rows change.

### Persistence

```typescript
import { createLocalPersister } from "tinybase/persisters/persister-browser";      // localStorage
import { createIndexedDbPersister } from "tinybase/persisters/persister-indexed-db";

const persister = createIndexedDbPersister(store, "todo-app");
await persister.startAutoPersisting();   // loads first, then saves on every change

// Seed the store only when storage is empty: [tables, values]
// await persister.startAutoPersisting([{ categories: { c1: { name: "Work" } } }, {}]);

await persister.destroy();               // on teardown
```

Other persisters follow the same pattern: `persister-file` (Node), `persister-sqlite-node` (`node:sqlite`), `persister-better-sqlite3`, `persister-sqlite-wasm`, `persister-pg`, `persister-postgres`, `persister-pglite`, `persister-libsql`, `persister-supabase`, `persister-expo-sqlite`. Database persisters store either one JSON blob or map tables to real database tables.

### React bindings

```tsx
import { createStore, createQueries } from "tinybase";
import { createIndexedDbPersister } from "tinybase/persisters/persister-indexed-db";
import {
  Provider, useCell, useCreatePersister, useCreateQueries, useCreateStore,
  useResultSortedRowIds, useSetCellCallback,
} from "tinybase/ui-react";

export function App() {
  const store = useCreateStore(() => createStore());
  const queries = useCreateQueries(store, (store) =>
    createQueries(store).setQueryDefinition("activeTodos", "todos", ({ select, where }) => {
      select("text");
      select("priority");
      where("done", false);
    }),
  );
  useCreatePersister(
    store,
    (store) => createIndexedDbPersister(store, "todo-app"),
    [],
    (persister) => persister.startAutoPersisting(),
  );
  return (
    <Provider store={store} queries={queries}>
      <TodoList />
    </Provider>
  );
}

function TodoList() {
  const ids = useResultSortedRowIds("activeTodos", "priority", true);
  return <ul>{ids.map((id) => <TodoItem key={id} id={id} />)}</ul>;
}

function TodoItem({ id }: { id: string }) {
  const text = useCell("todos", id, "text") as string;   // re-renders only when this cell changes
  const done = useCell("todos", id, "done");
  const toggle = useSetCellCallback("todos", id, "done", () => (cell) => !cell);
  return (
    <li onClick={toggle} style={{ textDecoration: done ? "line-through" : "none" }}>{text}</li>
  );
}
```

Solid and Svelte bindings live in `tinybase/ui-solid` and `tinybase/ui-svelte`.

### Synchronization

Sync needs a `MergeableStore` on every side. `createWsSynchronizer` returns a promise and does not start by itself:

```typescript
import { createMergeableStore } from "tinybase";
import { createWsSynchronizer } from "tinybase/synchronizers/synchronizer-ws-client";

const store = createMergeableStore();
const synchronizer = await createWsSynchronizer(store, new WebSocket("wss://sync.northwind.io/shopping-list"));
await synchronizer.startSync();
// later: await synchronizer.destroy();
```

The URL path (`/shopping-list`) is the room: clients on the same path share data. For tabs of one browser use `createBroadcastChannelSynchronizer(store, "todo-app")` from `tinybase/synchronizers/synchronizer-broadcast-channel` — no server needed.

## Examples

### Example 1: Offline todo app that survives a reload

**User prompt:** "Build a todo list in React that works offline and keeps its data when I refresh the page."

Use the React component above with `createIndexedDbPersister(store, "todo-app")`, and add todos with a row callback:

```tsx
import { useAddRowCallback } from "tinybase/ui-react";

function NewTodo() {
  const addTodo = useAddRowCallback("todos", (text: string) => ({ text, done: false, priority: 1 }));
  return <input placeholder="What needs doing?" onKeyDown={(e) => {
    if (e.key === "Enter") { addTodo(e.currentTarget.value); e.currentTarget.value = ""; }
  }} />;
}
```

Typing "Renew passport" and pressing Enter adds a row with a generated id; the list re-renders, and after a reload the item is still there because `startAutoPersisting()` loaded it from the `todo-app` IndexedDB database before saving resumed.

### Example 2: Sync a shopping list between devices

**User prompt:** "I need two clients to edit the same list and see each other's changes, with the server keeping a copy."

```javascript
// server.mjs — npm install tinybase ws
import { WebSocketServer } from "ws";
import { createMergeableStore } from "tinybase";
import { createFilePersister } from "tinybase/persisters/persister-file";
import { createWsServer } from "tinybase/synchronizers/synchronizer-ws-server";

const server = createWsServer(
  new WebSocketServer({ port: 8048 }),
  (pathId) => createFilePersister(createMergeableStore(), `./data-${pathId.replace(/[^\w-]/g, "_")}.json`),
);
server.addClientIdsListener(null, (server, pathId) =>
  console.log(`${pathId}: ${server.getClientIds(pathId).length} client(s)`),
);
```

```javascript
// client.mjs
import { WebSocket } from "ws";
import { createMergeableStore } from "tinybase";
import { createWsSynchronizer } from "tinybase/synchronizers/synchronizer-ws-client";

const connect = async () => {
  const store = createMergeableStore();
  const synchronizer = await createWsSynchronizer(store, new WebSocket("ws://localhost:8048/shopping-list"));
  await synchronizer.startSync();
  return { store, synchronizer };
};
const phone = await connect();
const laptop = await connect();

phone.store.setRow("items", "milk", { name: "Oat milk", bought: false });
laptop.store.setRow("items", "eggs", { name: "Eggs", bought: false });
laptop.store.setCell("items", "milk", "bought", true);

await new Promise((resolve) => setTimeout(resolve, 300));
console.log(JSON.stringify(phone.store.getTable("items")));
await phone.synchronizer.destroy();    // closes the socket; without it the script never exits
await laptop.synchronizer.destroy();
```

`node server.mjs` logs `shopping-list: 2 client(s)` once both stores are connected; `node client.mjs` prints both rows on the phone store, with the laptop's edit merged: `{"milk":{"name":"Oat milk","bought":true},"eggs":{"name":"Eggs","bought":false}}`. The server writes `data-shopping-list.json`, so a client that connects after a restart receives the same list.

## Guidelines

1. **Load before you save** — `startAutoSave()` on an empty store overwrites what is in storage. Use `startAutoPersisting()`, or `await persister.load()` followed by `startAutoSave()`, never the reverse.
2. **Sync requires `createMergeableStore()`** — passing a plain store to a synchronizer fails with the error `tinybase:0` (codes are listed at tinybase.org/guides/error-codes). A MergeableStore carries CRDT metadata, so use a plain store when nothing is ever merged.
3. **Always `await` and `startSync()`** — `createWsSynchronizer` resolves to a synchronizer that is not yet syncing. Call `destroy()` on unmount; otherwise sockets leak and React strict mode syncs twice.
4. **Raw WebSockets do not reconnect** — wrap the socket with `reconnecting-websocket` in browsers and re-run `synchronizer.load()` then `save()` on `open`.
5. **Queries have no `order`** — sort with `getResultSortedRowIds` / `useResultSortedRowIds`. `queries.setQueryDefinition` builders that call `order()` throw.
6. **Schemas drop, they do not throw** — a cell of the wrong type or an unknown cell is silently discarded and the default applied; check the stored row when a write seems to vanish.
7. **Subscribe narrowly** — `useCell` and `useValue` re-render on one cell; `useTable` re-renders on any change in the table.
8. **The whole store lives in memory** — fine for thousands of rows per user, wrong for an unbounded server-side dataset. Pair it with a real database when the authoritative data is large.
9. **`createLocalPersister` is localStorage** (a few MB, synchronous); use the IndexedDB, OPFS or SQLite-WASM persisters for larger browser data.
10. **v10 removals** — the `persister-sqlite3`, `persister-cr-sqlite-wasm` and `persister-electric-sql` modules are gone. Use `persister-sqlite-node` (`node:sqlite`) or `persister-better-sqlite3`; `persister-libsql` now needs `@libsql/client` 0.18+.
11. **WebSocket sync has no built-in authentication** — anyone who knows the path can read and write the room. Authenticate the upgrade request in your server before handing the socket to TinyBase.
