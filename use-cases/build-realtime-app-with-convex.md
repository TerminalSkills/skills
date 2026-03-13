---
title: Build a Real-Time App with Convex
slug: build-realtime-app-with-convex
description: >-
  Build a collaborative task board with Convex — real-time database syncing,
  server functions, file storage, scheduled jobs, and authentication without
  managing any infrastructure.
skills:
  - convex
  - authjs
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

Ava is building a collaborative task board where team members see changes instantly — no refresh, no polling. Traditional stacks need WebSockets, a real-time database layer, and careful cache invalidation. Convex replaces all of that: define your schema and server functions in TypeScript, and every query automatically subscribes to live updates. When data changes, connected clients update in milliseconds.

## Step 1: Set Up Convex

```bash
npm create convex@latest -- --template react-vite
cd my-app
npx convex dev  # Starts dev server, syncs functions to cloud
```

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  boards: defineTable({
    name: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
  }),
  columns: defineTable({
    boardId: v.id("boards"),
    name: v.string(),
    position: v.number(),
  }).index("by_board", ["boardId"]),
  tasks: defineTable({
    columnId: v.id("columns"),
    boardId: v.id("boards"),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeId: v.optional(v.string()),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    position: v.number(),
    createdAt: v.number(),
  })
    .index("by_column", ["columnId", "position"])
    .index("by_board", ["boardId"]),
});
```

## Step 2: Server Functions (Queries and Mutations)

```typescript
// convex/boards.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const board = await ctx.db.get(boardId);
    if (!board) throw new Error("Board not found");

    const columns = await ctx.db
      .query("columns")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();

    const columnsWithTasks = await Promise.all(
      columns.sort((a, b) => a.position - b.position).map(async (col) => {
        const tasks = await ctx.db
          .query("tasks")
          .withIndex("by_column", (q) => q.eq("columnId", col._id))
          .collect();
        return { ...col, tasks: tasks.sort((a, b) => a.position - b.position) };
      })
    );

    return { ...board, columns: columnsWithTasks };
  },
});

export const createTask = mutation({
  args: {
    columnId: v.id("columns"),
    boardId: v.id("boards"),
    title: v.string(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_column", (q) => q.eq("columnId", args.columnId))
      .collect();

    return ctx.db.insert("tasks", {
      ...args,
      description: undefined,
      assigneeId: undefined,
      position: existing.length,
      createdAt: Date.now(),
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
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");

    // Reorder tasks in target column
    const targetTasks = await ctx.db
      .query("tasks")
      .withIndex("by_column", (q) => q.eq("columnId", targetColumnId))
      .collect();

    const filtered = targetTasks
      .filter((t) => t._id !== taskId)
      .sort((a, b) => a.position - b.position);

    // Update positions
    for (let i = 0; i < filtered.length; i++) {
      const newPos = i >= targetPosition ? i + 1 : i;
      if (filtered[i].position !== newPos) {
        await ctx.db.patch(filtered[i]._id, { position: newPos });
      }
    }

    await ctx.db.patch(taskId, {
      columnId: targetColumnId,
      position: targetPosition,
    });
  },
});
```

## Step 3: React Frontend with Live Updates

```tsx
// src/components/Board.tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";

export function Board({ boardId }: { boardId: Id<"boards"> }) {
  // This query automatically re-renders when ANY task/column changes
  const board = useQuery(api.boards.get, { boardId });
  const createTask = useMutation(api.boards.createTask);
  const moveTask = useMutation(api.boards.moveTask);

  if (!board) return <div className="animate-pulse">Loading...</div>;

  return (
    <div className="flex gap-4 p-6 overflow-x-auto min-h-screen bg-gray-50">
      <h1 className="sr-only">{board.name}</h1>
      {board.columns.map((column) => (
        <Column
          key={column._id}
          column={column}
          onAddTask={async (title, priority) => {
            await createTask({ columnId: column._id, boardId, title, priority });
          }}
          onDropTask={async (taskId, position) => {
            await moveTask({ taskId, targetColumnId: column._id, targetPosition: position });
          }}
        />
      ))}
    </div>
  );
}

function Column({ column, onAddTask, onDropTask }: {
  column: any;
  onAddTask: (title: string, priority: "low" | "medium" | "high") => Promise<void>;
  onDropTask: (taskId: Id<"tasks">, position: number) => Promise<void>;
}) {
  const [newTitle, setNewTitle] = useState("");

  return (
    <div className="w-72 flex-shrink-0 bg-white rounded-lg shadow p-3">
      <h2 className="font-semibold text-gray-700 mb-3 flex justify-between">
        {column.name}
        <span className="text-gray-400 text-sm">{column.tasks.length}</span>
      </h2>

      <div className="space-y-2 mb-3">
        {column.tasks.map((task: any) => (
          <div
            key={task._id}
            draggable
            className="bg-gray-50 rounded p-3 cursor-grab active:cursor-grabbing border hover:shadow"
          >
            <p className="text-sm font-medium">{task.title}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              task.priority === "high" ? "bg-red-100 text-red-700" :
              task.priority === "medium" ? "bg-yellow-100 text-yellow-700" :
              "bg-green-100 text-green-700"
            }`}>
              {task.priority}
            </span>
          </div>
        ))}
      </div>

      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        await onAddTask(newTitle, "medium");
        setNewTitle("");
      }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add task..."
          className="w-full text-sm px-2 py-1.5 border rounded"
        />
      </form>
    </div>
  );
}
```

## Step 4: Scheduled Jobs and Actions

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily cleanup of completed tasks older than 30 days
crons.daily("cleanup-old-tasks", { hourUTC: 3, minuteUTC: 0 }, internal.tasks.archiveOld);

// Weekly activity summary
crons.weekly("weekly-summary", { dayOfWeek: "monday", hourUTC: 9, minuteUTC: 0 }, internal.notifications.sendWeeklySummary);

export default crons;
```

```typescript
// convex/tasks.ts
import { internalMutation } from "./_generated/server";

export const archiveOld = internalMutation({
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    // Query and delete old completed tasks
    const old = await ctx.db.query("tasks").collect();
    let archived = 0;
    for (const task of old) {
      if (task.createdAt < thirtyDaysAgo) {
        await ctx.db.delete(task._id);
        archived++;
      }
    }
    console.log(`Archived ${archived} old tasks`);
  },
});
```

## Summary

Ava's task board syncs in real-time across all connected users — when someone drags a task to a new column, everyone sees it move instantly. No WebSocket setup, no cache invalidation, no optimistic update bugs. Convex handles the reactive data layer: `useQuery` automatically subscribes to changes, mutations are ACID-transactional, and scheduled jobs handle cleanup. The entire backend is TypeScript functions deployed to Convex's cloud — no servers, no database admin, no infrastructure. The board went from idea to production in a weekend.
