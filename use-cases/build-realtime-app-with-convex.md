---
title: Build a Real-Time App with Convex
slug: build-realtime-app-with-convex
description: >-
  Build a collaborative task board with Convex — real-time database syncing,
  server functions, scheduled jobs and a Tailwind UI without managing any
  infrastructure.
skills:
  - convex
  - tailwindcss
category: development
tags:
  - convex
  - realtime
  - backend
  - fullstack
  - serverless
---

# Build a Real-Time App with Convex

## The Problem

Ava is building a collaborative task board where team members see changes instantly, with no refresh and no polling. A traditional stack needs a WebSocket layer, a database, and careful cache invalidation to get there, and each piece is another thing to host and keep consistent.

## The Solution

Convex replaces that stack. You define the schema and server functions in TypeScript, and every `useQuery` call subscribes to live updates: when the data a query read changes, connected clients get the new result. Mutations run as transactions, and cron jobs live in the same project. Tailwind (the `tailwindcss` skill) styles the UI; the official Vite template already wires it in.

## Step-by-Step Walkthrough

### Step 1: Create the project and schema

```bash
npm create convex@latest      # pick the React (Vite) template, then:
cd my-app
npm run dev                   # runs `convex dev` (syncs functions) and Vite together
```

The first `npx convex dev` asks you to log in and creates a free development deployment. It writes `convex/_generated/`, which gives the functions below their types.

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  boards: defineTable({ name: v.string(), ownerId: v.string() }),
  columns: defineTable({
    boardId: v.id("boards"),
    name: v.string(),
    position: v.number(),
  }).index("by_board", ["boardId", "position"]),
  tasks: defineTable({
    columnId: v.id("columns"),
    boardId: v.id("boards"),
    title: v.string(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    position: v.number(),
    done: v.boolean(),
    doneAt: v.optional(v.number()),
  })
    .index("by_column", ["columnId", "position"])
    .index("by_done_at", ["done", "doneAt"]),
});
```

Indexes list the equality fields first and the sort field last, so `by_column` returns tasks already ordered by `position` and no in-memory sort is needed.

### Step 2: Write queries and mutations

```typescript
// convex/boards.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const board = await ctx.db.get("boards", boardId);
    if (!board) return null;
    const columns = await ctx.db
      .query("columns")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect(); // already ordered by position (second index field)
    const withTasks = await Promise.all(
      columns.map(async (col) => ({
        ...col,
        tasks: await ctx.db
          .query("tasks")
          .withIndex("by_column", (q) => q.eq("columnId", col._id))
          .collect(),
      })),
    );
    return { ...board, columns: withTasks };
  },
});

export const createTask = mutation({
  args: {
    columnId: v.id("columns"),
    title: v.string(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  },
  handler: async (ctx, { columnId, title, priority }) => {
    const column = await ctx.db.get("columns", columnId);
    if (!column) throw new Error("Column not found");
    const last = await ctx.db
      .query("tasks")
      .withIndex("by_column", (q) => q.eq("columnId", columnId))
      .order("desc")
      .first();
    return ctx.db.insert("tasks", {
      columnId,
      boardId: column.boardId,
      title,
      priority,
      position: last ? last.position + 1 : 0,
      done: false,
    });
  },
});

export const moveTask = mutation({
  args: {
    taskId: v.id("tasks"),
    targetColumnId: v.id("columns"),
    targetPosition: v.number(),
  },
  handler: async (ctx, { taskId, targetColumnId, targetPosition }) => {
    const task = await ctx.db.get("tasks", taskId);
    if (!task) throw new Error("Task not found");
    const siblings = (
      await ctx.db
        .query("tasks")
        .withIndex("by_column", (q) => q.eq("columnId", targetColumnId))
        .collect()
    ).filter((t) => t._id !== taskId);
    siblings.splice(Math.min(targetPosition, siblings.length), 0, task);
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i]._id === taskId) {
        await ctx.db.patch("tasks", taskId, { columnId: targetColumnId, position: i });
      } else if (siblings[i].position !== i) {
        await ctx.db.patch("tasks", siblings[i]._id, { position: i });
      }
    }
  },
});

export const setDone = mutation({
  args: { taskId: v.id("tasks"), done: v.boolean() },
  handler: async (ctx, { taskId, done }) => {
    await ctx.db.patch("tasks", taskId, { done, doneAt: done ? Date.now() : undefined });
  },
});
```

Every `ctx.db` call names the table (`ctx.db.get("tasks", id)`), which is the current form. `get` returns `null` for a missing board, so the UI can show "not found" instead of an error.

To get a board to render, add a seed mutation to `convex/boards.ts` and run it once with `npx convex run boards:seed '{"name":"Sprint 12"}'`. It returns the board id to pass to `<Board boardId=... />`.

```typescript
export const seed = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const boardId = await ctx.db.insert("boards", { name, ownerId: "demo" });
    for (const [i, col] of ["To do", "Doing", "Done"].entries()) {
      await ctx.db.insert("columns", { boardId, name: col, position: i });
    }
    return boardId;
  },
});
```

### Step 3: Render live data in React

```tsx
// src/Board.tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useState } from "react";

function AddTask({ columnId }: { columnId: Id<"columns"> }) {
  const createTask = useMutation(api.boards.createTask);
  const [title, setTitle] = useState(""); // one draft per column
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await createTask({ columnId, title, priority: "medium" });
        setTitle("");
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add task..." className="w-full border rounded px-2 py-1" />
    </form>
  );
}

export function Board({ boardId }: { boardId: Id<"boards"> }) {
  const board = useQuery(api.boards.get, { boardId });
  const moveTask = useMutation(api.boards.moveTask);

  if (board === undefined) return <div className="animate-pulse">Loading...</div>;
  if (board === null) return <div>Board not found</div>;

  return (
    <div className="flex gap-4 p-6 overflow-x-auto min-h-screen bg-gray-50">
      <h1 className="sr-only">{board.name}</h1>
      {board.columns.map((column) => (
        <div
          key={column._id}
          className="w-72 shrink-0 bg-white rounded-lg shadow p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const taskId = e.dataTransfer.getData("text/plain") as Id<"tasks">;
            void moveTask({ taskId, targetColumnId: column._id, targetPosition: column.tasks.length });
          }}
        >
          <h2 className="font-semibold mb-3">{column.name}</h2>
          {column.tasks.map((task) => (
            <div
              key={task._id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", task._id)}
              className="bg-gray-50 rounded p-3 mb-2 border cursor-grab"
            >
              {task.title} <span className="text-xs">({task.priority})</span>
            </div>
          ))}
          <AddTask columnId={column._id} />
        </div>
      ))}
    </div>
  );
}
```

`useQuery` returns `undefined` while loading and re-renders when any task or column on the board changes, so a card dragged by one user moves on everyone's screen. Open the board in two browser windows to see it.

### Step 4: Scheduled cleanup

Cron jobs are declared in `convex/crons.ts` and call an internal function, which clients cannot call.

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily("archive-done-tasks", { hourUTC: 3, minuteUTC: 0 }, internal.tasks.archiveDone);
export default crons;
```

```typescript
// convex/tasks.ts
import { internalMutation } from "./_generated/server";

export const archiveDone = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("tasks")
      .withIndex("by_done_at", (q) => q.eq("done", true).lt("doneAt", cutoff))
      .take(500); // bounded: a mutation has read/write limits
    for (const task of old) await ctx.db.delete("tasks", task._id);
    console.log(`Deleted ${old.length} tasks completed over 30 days ago`);
  },
});
```

The `by_done_at` index makes the job read only tasks that were completed over 30 days ago, not the whole table, and `take(500)` keeps one run inside Convex's per-mutation limits; the next daily run picks up any remainder.

### Step 5: Add sign-in before real use

The functions above accept any caller. Before inviting a team, configure an auth provider (Convex Auth, Clerk, Auth0 or WorkOS; see the Convex auth docs), then start each mutation with `const identity = await ctx.auth.getUserIdentity(); if (!identity) throw new Error("Not signed in");` and compare `identity.subject` with `board.ownerId`.

## Real-World Example

Ava's board syncs across all connected users: when someone drops a card into a new column, the other open windows update without any WebSocket code. The backend is one `convex/` folder of TypeScript functions deployed with `npx convex deploy`, with no servers or database to administer. She tested it by opening two windows side by side, then added sign-in and per-board ownership checks before sharing it with her team.

## Related Skills

- [convex](../skills/convex/SKILL.md): schema, queries, mutations and cron jobs
- [tailwindcss](../skills/tailwindcss/SKILL.md): styling the board
