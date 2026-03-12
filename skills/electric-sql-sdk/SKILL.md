---
name: electric-sql-sdk
category: Backend Development
tags: [local-first, sync, postgres, realtime, offline, crdt]
version: 1.0.0
author: terminal-skills
---

# Electric SQL — Sync Engine for Postgres

You are an expert in Electric SQL, the sync engine that streams Postgres data to local apps in real-time. You help developers build local-first applications where data syncs from Postgres to client-side SQLite/PGlite automatically — enabling instant reads, offline support, and real-time multi-user collaboration using Postgres as the single source of truth with Shape-based partial replication.

## Core Capabilities

### Shape Subscriptions

```typescript
import { ShapeStream, Shape } from "@electric-sql/client";

// Stream a subset of Postgres data to the client
const stream = new ShapeStream({
  url: "http://localhost:3000/v1/shape",
  params: {
    table: "tasks",
    where: `workspace_id = '${workspaceId}'`,  // Only sync relevant data
    columns: ["id", "title", "status", "assignee", "updated_at"],
  },
});

// Shape keeps a local copy in sync with Postgres
const shape = new Shape(stream);

// Get current data (instant — no network)
const tasks = shape.currentValue;
console.log([...tasks.values()]);          // Map<string, Task>

// React to changes
shape.subscribe((data) => {
  console.log("Tasks updated:", [...data.values()]);
  // Fires whenever Postgres data changes (insert, update, delete)
});
```

### React Integration

```tsx
import { useShape } from "@electric-sql/react";

function TaskList({ workspaceId }: { workspaceId: string }) {
  // Automatically syncs with Postgres in real-time
  const { data: tasks, isLoading } = useShape<Task>({
    url: `${import.meta.env.VITE_ELECTRIC_URL}/v1/shape`,
    params: {
      table: "tasks",
      where: `workspace_id = '${workspaceId}'`,
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>
          <span>{task.title}</span>
          <span className={`badge badge-${task.status}`}>{task.status}</span>
        </li>
      ))}
    </ul>
  );
}

// Writes go through your API → Postgres → Electric syncs to all clients
async function createTask(title: string, workspaceId: string) {
  await fetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title, workspaceId }),
  });
  // Electric automatically syncs the new task to all connected clients
}
```

### Server Setup

```typescript
// Electric sync service (Docker)
// docker run -e DATABASE_URL=postgresql://... -p 3000:3000 electricsql/electric

// Your API — writes go to Postgres as normal
app.post("/api/tasks", async (req, res) => {
  const task = await db.query(
    `INSERT INTO tasks (title, workspace_id, status, assignee)
     VALUES ($1, $2, 'todo', $3) RETURNING *`,
    [req.body.title, req.body.workspaceId, req.user.id],
  );
  res.json(task.rows[0]);
  // Electric detects the change via Postgres logical replication
  // and syncs to all subscribed clients automatically
});
```

## Installation

```bash
npm install @electric-sql/client @electric-sql/react

# Server
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  electricsql/electric
```

## Best Practices

1. **Shapes for partial sync** — Only sync data the user needs; `where` clause filters at the server
2. **Postgres is truth** — Write to Postgres normally; Electric handles replication to clients
3. **Instant reads** — Data is local; no network roundtrip for reads; UI updates in <1ms
4. **Real-time updates** — Changes in Postgres stream to all subscribed clients automatically
5. **Column selection** — Specify `columns` to minimize data transfer; don't sync large text fields
6. **Write-through** — Writes go to your API → Postgres; don't write directly to the shape
7. **Offline support** — Cache shape data in IndexedDB/SQLite; app works without network
8. **Multi-tenant** — Use `where` clause to scope shapes per workspace/user; secure data isolation
