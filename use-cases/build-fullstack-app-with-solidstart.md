---
title: Build a Full-Stack App with SolidStart
slug: build-fullstack-app-with-solidstart
description: >-
  Build a performant full-stack web app with SolidStart — fine-grained
  reactivity, server functions, streaming SSR, and zero virtual DOM for
  a fast-by-default experience.
skills:
  - solid
  - drizzle-orm
  - tailwindcss
  - zod
category: development
tags:
  - solidjs
  - fullstack
  - performance
  - ssr
  - typescript
---

# Build a Full-Stack App with SolidStart

Eli is frustrated with React's re-rendering performance. His dashboard with 500 rows of real-time data causes janky updates because React re-renders entire component trees. SolidJS uses fine-grained reactivity — only the exact DOM node that changed updates, nothing else. SolidStart adds server functions, SSR, and file-based routing. Same mental model as React, but fundamentally faster.

## Step 1: Project Setup

```bash
npm init solid@latest my-app -- --template basic --server
cd my-app
npm install @solidjs/router drizzle-orm @libsql/client zod
npm install -D drizzle-kit
```

## Step 2: Server Functions (RPC-style)

```typescript
// src/lib/server/db.ts
"use server";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DB_AUTH_TOKEN });
export const db = drizzle(client, { schema });
```

```typescript
// src/lib/server/tasks.ts
"use server";
import { db } from "./db";
import { tasks } from "./schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  priority: z.enum(["low", "medium", "high"]),
});

export async function getTasks() {
  return db.query.tasks.findMany({
    orderBy: [desc(tasks.createdAt)],
    limit: 100,
  });
}

export async function createTask(input: unknown) {
  const parsed = CreateTaskSchema.parse(input);
  const [task] = await db.insert(tasks).values({
    ...parsed,
    id: crypto.randomUUID(),
    completed: false,
    createdAt: new Date(),
  }).returning();
  return task;
}

export async function toggleTask(id: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) throw new Error("Task not found");
  await db.update(tasks).set({ completed: !task.completed }).where(eq(tasks.id, id));
}

export async function deleteTask(id: string) {
  await db.delete(tasks).where(eq(tasks.id, id));
}
```

## Step 3: Reactive UI with Fine-Grained Updates

```tsx
// src/routes/index.tsx
import { createSignal, For, Show, createResource, Suspense } from "solid-js";
import { createAsync, useAction, useSubmission } from "@solidjs/router";
import { getTasks, createTask, toggleTask, deleteTask } from "~/lib/server/tasks";

export default function Home() {
  const tasks = createAsync(() => getTasks());
  const [newTitle, setNewTitle] = createSignal("");
  const [priority, setPriority] = createSignal<"low" | "medium" | "high">("medium");

  const addAction = useAction(createTask);
  const adding = useSubmission(createTask);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!newTitle().trim()) return;
    await addAction({ title: newTitle(), priority: priority() });
    setNewTitle("");
  };

  return (
    <main class="max-w-2xl mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">Tasks</h1>

      <form onSubmit={handleSubmit} class="flex gap-2 mb-6">
        <input
          value={newTitle()}
          onInput={(e) => setNewTitle(e.currentTarget.value)}
          placeholder="New task..."
          class="flex-1 px-3 py-2 border rounded"
        />
        <select
          value={priority()}
          onChange={(e) => setPriority(e.currentTarget.value as any)}
          class="px-3 py-2 border rounded"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button
          type="submit"
          disabled={adding.pending}
          class="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {adding.pending ? "Adding..." : "Add"}
        </button>
      </form>

      <Suspense fallback={<div class="animate-pulse">Loading tasks...</div>}>
        <TaskList tasks={tasks() || []} />
      </Suspense>
    </main>
  );
}

function TaskList(props: { tasks: any[] }) {
  return (
    <div class="space-y-2">
      <For each={props.tasks}>
        {(task) => <TaskRow task={task} />}
      </For>
      <Show when={props.tasks.length === 0}>
        <p class="text-gray-500 text-center py-8">No tasks yet. Add one above!</p>
      </Show>
    </div>
  );
}

function TaskRow(props: { task: any }) {
  const toggle = useAction(toggleTask);
  const remove = useAction(deleteTask);

  const priorityColor = () => ({
    high: "bg-red-100 text-red-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-green-100 text-green-700",
  }[props.task.priority]);

  return (
    <div class="flex items-center gap-3 p-3 bg-white rounded border hover:shadow-sm transition-shadow">
      <input
        type="checkbox"
        checked={props.task.completed}
        onChange={() => toggle(props.task.id)}
        class="w-5 h-5 rounded"
      />
      <span
        class="flex-1"
        classList={{ "line-through text-gray-400": props.task.completed }}
      >
        {props.task.title}
      </span>
      <span class={`text-xs px-2 py-0.5 rounded ${priorityColor()}`}>
        {props.task.priority}
      </span>
      <button onClick={() => remove(props.task.id)} class="text-red-400 hover:text-red-600">
        ✕
      </button>
    </div>
  );
}
```

## Step 4: Streaming SSR with Error Boundaries

```tsx
// src/routes/dashboard.tsx
import { Suspense, ErrorBoundary } from "solid-js";
import { createAsync } from "@solidjs/router";

export default function Dashboard() {
  // These load in parallel, streaming to the client as they resolve
  const stats = createAsync(() => getStats());
  const recentActivity = createAsync(() => getRecentActivity());
  const teamMembers = createAsync(() => getTeamMembers());

  return (
    <div class="grid grid-cols-3 gap-6 p-6">
      <ErrorBoundary fallback={(err) => <div class="text-red-500">Failed to load stats</div>}>
        <Suspense fallback={<StatsSkeleton />}>
          <StatsPanel stats={stats()} />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={(err) => <div class="text-red-500">Failed to load activity</div>}>
        <Suspense fallback={<ActivitySkeleton />}>
          <ActivityFeed items={recentActivity()} />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={(err) => <div class="text-red-500">Failed to load team</div>}>
        <Suspense fallback={<TeamSkeleton />}>
          <TeamPanel members={teamMembers()} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
```

## Summary

Eli's dashboard renders 500 rows with zero jank. When a single cell updates, only that DOM text node changes — not the row, not the table, not the component. SolidStart's server functions give him type-safe RPC to the database without writing API routes. Streaming SSR sends the page shell immediately while data loads in parallel — each panel appears as its data resolves. The bundle is 30% smaller than the React equivalent because there's no virtual DOM runtime. Solid's `createSignal` and `For` components are familiar to React developers but fundamentally more efficient.
