---
title: Build a Full-Stack App with TanStack Start
slug: build-fullstack-app-with-tanstack-start
description: >-
  Build a full-stack React app with TanStack Start — type-safe server functions,
  file-based routing, SSR with streaming, and seamless integration with
  TanStack Router and TanStack Query.
skills:
  - tanstack-start
  - tanstack-router
  - tanstack
  - drizzle-orm
  - zod
category: development
tags:
  - tanstack
  - fullstack
  - react
  - ssr
  - type-safety
---

# Build a Full-Stack App with TanStack Start

Kian uses TanStack Router for client routing and TanStack Query for data fetching. But wiring them to a backend means separate API routes, manual type definitions, and duplicated validation. TanStack Start unifies everything: server functions called directly from route loaders, type-safe from database to UI, with SSR and streaming out of the box. It's the missing piece that connects the TanStack ecosystem into a full-stack framework.

## Step 1: Project Setup

```bash
npx create-start@latest my-app
cd my-app
npm install drizzle-orm @libsql/client zod
npm install -D drizzle-kit
```

## Step 2: Server Functions

```typescript
// src/server/functions/todos.ts
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { db } from "../db";
import { todos } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export const getTodos = createServerFn({ method: "GET" })
  .validator(z.object({
    filter: z.enum(["all", "active", "completed"]).optional(),
  }))
  .handler(async ({ data }) => {
    const where = data.filter === "active"
      ? eq(todos.completed, false)
      : data.filter === "completed"
        ? eq(todos.completed, true)
        : undefined;

    return db.query.todos.findMany({
      where,
      orderBy: [desc(todos.createdAt)],
    });
  });

export const createTodo = createServerFn({ method: "POST" })
  .validator(z.object({
    title: z.string().min(1).max(500),
  }))
  .handler(async ({ data }) => {
    const [todo] = await db.insert(todos).values({
      id: crypto.randomUUID(),
      title: data.title,
      completed: false,
      createdAt: new Date(),
    }).returning();
    return todo;
  });

export const toggleTodo = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const todo = await db.query.todos.findFirst({ where: eq(todos.id, data.id) });
    if (!todo) throw new Error("Not found");
    const [updated] = await db.update(todos)
      .set({ completed: !todo.completed })
      .where(eq(todos.id, data.id))
      .returning();
    return updated;
  });

export const deleteTodo = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await db.delete(todos).where(eq(todos.id, data.id));
  });
```

## Step 3: Route with Loader

```typescript
// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { getTodos, createTodo, toggleTodo, deleteTodo } from "../server/functions/todos";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export const Route = createFileRoute("/")({
  validateSearch: (search) => ({
    filter: (search.filter as string) || "all",
  }),
  loaderDeps: ({ search }) => ({ filter: search.filter }),
  loader: async ({ deps }) => {
    return getTodos({ data: { filter: deps.filter as any } });
  },
  component: TodoApp,
});

function TodoApp() {
  const todos = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");

  const addMutation = useMutation({
    mutationFn: (title: string) => createTodo({ data: { title } }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setNewTitle("");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => toggleTodo({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTodo({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  return (
    <main className="max-w-lg mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Todos</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newTitle.trim()) addMutation.mutate(newTitle);
        }}
        className="flex gap-2 mb-6"
      >
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="What needs to be done?"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button
          type="submit"
          disabled={addMutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {["all", "active", "completed"].map((f) => (
          <button
            key={f}
            onClick={() => navigate({ search: { filter: f } })}
            className={`px-3 py-1 rounded ${search.filter === f ? "bg-blue-100 text-blue-700" : "text-gray-600"}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-center gap-3 p-3 bg-white rounded border">
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleMutation.mutate(todo.id)}
              className="w-5 h-5"
            />
            <span className={`flex-1 ${todo.completed ? "line-through text-gray-400" : ""}`}>
              {todo.title}
            </span>
            <button
              onClick={() => deleteMutation.mutate(todo.id)}
              className="text-red-400 hover:text-red-600"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <p className="text-sm text-gray-500 mt-4">
        {todos.filter((t) => !t.completed).length} items left
      </p>
    </main>
  );
}
```

## Step 4: Authentication Middleware

```typescript
// src/server/middleware/auth.ts
import { createMiddleware } from "@tanstack/start";

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  const session = await getSession(request);

  if (!session) {
    throw new Error("Unauthorized");
  }

  return next({ context: { user: session.user } });
});

// Use in server functions:
export const getProtectedData = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    // context.user is typed and guaranteed to exist
    return db.query.projects.findMany({
      where: eq(projects.ownerId, context.user.id),
    });
  });
```

## Summary

Kian has a full-stack app where server functions are called directly from route loaders — no API routes to write, no fetch calls to wire up, no type definitions to duplicate. `createServerFn` validates input with Zod on the server and infers the return type for the client. Route loaders prefetch data during SSR, so the page arrives fully rendered. TanStack Query handles mutations with optimistic updates and cache invalidation. The entire data flow from database to UI is type-checked at compile time — change a database column and TypeScript errors propagate all the way to the component that renders it.
