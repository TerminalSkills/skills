---
name: electric-sql
description: >-
  Build local-first applications with ElectricSQL — sync Postgres data to client
  devices in real-time. Use when someone asks to "sync database to client",
  "local-first app", "ElectricSQL", "offline-first sync", "real-time Postgres
  sync", "sync Postgres to SQLite", or "build an app that works offline".
  Covers shape-based sync, real-time subscriptions, offline support, and
  conflict resolution.
license: Apache-2.0
compatibility: "PostgreSQL. Clients: React, React Native, Expo, any HTTP client."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["sync", "local-first", "offline", "postgres", "real-time"]
---

# ElectricSQL

## Overview

ElectricSQL syncs Postgres data to client applications in real-time. Instead of fetching data from an API, the data lives locally on the device — queries are instant, the app works offline, and changes sync automatically when connectivity returns. Think "Postgres replication to the browser." Define shapes (subsets of your data) and Electric keeps them in sync.

## When to Use

- Apps that must work offline (field service, mobile, travel)
- Real-time collaborative features (shared lists, dashboards)
- Low-latency reads — querying local data is instant
- Reducing API calls — data is already on the client
- Multi-device sync (phone, tablet, desktop see same data)

## Instructions

### Setup

```bash
# Server: Electric sync service
docker run -e DATABASE_URL=postgresql://... -p 3000:3000 electricsql/electric

# Client
npm install @electric-sql/react
```

### Define Shapes (What to Sync)

```typescript
// shapes.ts — Define what data to sync to the client
/**
 * Shapes are "live queries" — subsets of your Postgres data
 * that stay in sync on the client. Only sync what the user needs.
 */
import { ShapeStream } from "@electric-sql/client";

// Sync all todos for a specific user
const stream = new ShapeStream({
  url: "http://localhost:3000/v1/shape",
  params: {
    table: "todos",
    where: `user_id = '${userId}'`,
  },
});

// Stream delivers initial data + real-time updates
stream.subscribe((messages) => {
  for (const msg of messages) {
    if (msg.headers.operation === "insert") {
      console.log("New todo:", msg.value);
    }
  }
});
```

### React Integration

```tsx
// components/TodoList.tsx — Real-time synced todo list
import { useShape } from "@electric-sql/react";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
}

export function TodoList({ userId }: { userId: string }) {
  // Data syncs automatically — no loading states for reads
  const { data: todos, isLoading } = useShape<Todo>({
    url: "http://localhost:3000/v1/shape",
    params: {
      table: "todos",
      where: `user_id = '${userId}'`,
      columns: ["id", "title", "completed", "created_at"],
    },
  });

  if (isLoading) return <div>Loading initial sync...</div>;

  // Reads are instant — data is local
  const active = todos.filter((t) => !t.completed);
  const done = todos.filter((t) => t.completed);

  return (
    <div>
      <h2>Active ({active.length})</h2>
      {active.map((todo) => (
        <div key={todo.id}>
          <input
            type="checkbox"
            onChange={() => toggleTodo(todo.id)}
          />
          {todo.title}
        </div>
      ))}

      <h2>Completed ({done.length})</h2>
      {done.map((todo) => (
        <div key={todo.id} style={{ textDecoration: "line-through" }}>
          {todo.title}
        </div>
      ))}
    </div>
  );
}

// Writes go through your API (Electric syncs the result back)
async function toggleTodo(id: string) {
  await fetch(`/api/todos/${id}/toggle`, { method: "PATCH" });
  // No need to refetch — Electric syncs the update automatically
}
```

### Offline Support

```typescript
// offline.ts — Electric handles offline automatically
/**
 * When the device goes offline, reads still work (data is local).
 * When connectivity returns, Electric syncs missed changes.
 * 
 * For writes during offline, queue them and replay on reconnect:
 */
const writeQueue: Array<() => Promise<void>> = [];

async function createTodo(title: string) {
  const action = () => fetch("/api/todos", {
    method: "POST",
    body: JSON.stringify({ title }),
  });

  if (navigator.onLine) {
    await action();
  } else {
    writeQueue.push(action);  // Queue for later
  }
}

// Replay queued writes when back online
window.addEventListener("online", async () => {
  while (writeQueue.length > 0) {
    const action = writeQueue.shift()!;
    await action();
  }
});
```

## Examples

### Example 1: Build an offline-capable task manager

**User prompt:** "Build a task manager that works without internet and syncs when back online."

The agent will set up Electric with shapes for user tasks, local reads with React hooks, write queue for offline mutations, and automatic sync on reconnect.

### Example 2: Real-time dashboard

**User prompt:** "Build a dashboard that shows live data from our Postgres database without polling."

The agent will configure Electric shapes for dashboard metrics, subscribe to real-time updates, and render charts that update instantly as the database changes.

## Guidelines

- **Shapes define what syncs** — sync subsets of data, not entire tables
- **Reads are instant** — data is local, no network round-trip
- **Writes go through your API** — Electric syncs the result back to all clients
- **`where` for filtering** — only sync data the user should see
- **`columns` for projection** — reduce sync payload to needed fields
- **Postgres is the source of truth** — Electric reads the WAL (Write-Ahead Log)
- **No schema changes needed** — works with your existing Postgres schema
- **Shape streams are resumable** — reconnects sync from where they left off
- **For offline writes, queue locally** — replay when connectivity returns
- **Use with any framework** — React hook is convenient, but the core client works anywhere
