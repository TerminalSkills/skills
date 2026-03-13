---
title: Build an End-to-End Type-Safe API with tRPC
slug: build-e2e-type-safe-api-with-trpc
description: Build a full-stack TypeScript application with tRPC where API contracts are enforced at compile time — eliminating runtime type errors, reducing boilerplate, and making API changes instant across frontend and backend.
skills:
  - typescript
  - trpc
  - nextjs
  - prisma
  - zod
  - tailwindcss
category: Full-Stack Development
tags:
  - trpc
  - type-safety
  - full-stack
  - api
  - typescript
---

# Build an End-to-End Type-Safe API with tRPC

## The Problem

Rosa leads a 25-person SaaS team. Frontend and backend are both TypeScript, but the API layer is REST with manual type definitions on both sides. When a backend developer renames a field from `userName` to `displayName`, the frontend breaks at runtime in production — TypeScript can't catch it because the types aren't connected. The team maintains 400 lines of duplicate type definitions. API documentation is always outdated. tRPC would eliminate all of this: one type definition shared between client and server, compile-time errors when APIs change, and zero boilerplate.

## Step 1: Build the tRPC Server

```typescript
// src/server/trpc.ts — tRPC initialization with context and middleware
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import superjson from "superjson";
import { prisma } from "../db/client";

// Context available to all procedures
interface Context {
  userId: string | null;
  prisma: typeof prisma;
}

export async function createContext({ req }: { req: Request }): Promise<Context> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  let userId: string | null = null;

  if (token) {
    try {
      const session = await prisma.session.findFirst({
        where: { token, expiresAt: { gt: new Date() } },
        select: { userId: true },
      });
      userId = session?.userId || null;
    } catch { /* invalid token */ }
  }

  return { userId, prisma };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson, // handles Dates, Maps, Sets automatically
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Auth middleware — reusable across routes
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export const protectedProcedure = t.procedure.use(isAuthed);
```

```typescript
// src/server/routers/projects.ts — Project CRUD with full type safety
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const projectRouter = router({
  // List projects for the authenticated user
  list: protectedProcedure
    .input(z.object({
      cursor: z.string().optional(),       // pagination cursor
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["active", "archived", "all"]).default("active"),
    }))
    .query(async ({ ctx, input }) => {
      const where = {
        ownerId: ctx.userId,
        ...(input.status !== "all" ? { status: input.status } : {}),
      };

      const projects = await ctx.prisma.project.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { tasks: true, members: true } },
        },
      });

      let nextCursor: string | undefined;
      if (projects.length > input.limit) {
        const next = projects.pop()!;
        nextCursor = next.id;
      }

      return { projects, nextCursor };
    }),

  // Get single project with details
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.id, ownerId: ctx.userId },
        include: {
          tasks: { orderBy: { createdAt: "desc" }, take: 50 },
          members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
        },
      });

      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      return project;
    }),

  // Create project — input is validated at compile time AND runtime
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#3b82f6"),
      isPublic: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.create({
        data: {
          ...input,
          ownerId: ctx.userId,
          status: "active",
        },
      });

      return project;
    }),

  // Update project
  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).optional(),
      status: z.enum(["active", "archived"]).optional(),
      color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await ctx.prisma.project.findFirst({
        where: { id, ownerId: ctx.userId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.project.update({
        where: { id },
        data,
      });
    }),

  // Delete project
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.project.findFirst({
        where: { id: input.id, ownerId: ctx.userId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.project.delete({ where: { id: input.id } });
      return { deleted: true };
    }),
});
```

```typescript
// src/server/routers/_app.ts — Root router merging all sub-routers
import { router } from "../trpc";
import { projectRouter } from "./projects";
import { taskRouter } from "./tasks";
import { userRouter } from "./users";

export const appRouter = router({
  project: projectRouter,
  task: taskRouter,
  user: userRouter,
});

// This type is the SINGLE SOURCE OF TRUTH for the entire API
// The client imports this type — no manual type definitions needed
export type AppRouter = typeof appRouter;
```

## Step 2: Build the Type-Safe Client

```typescript
// src/client/trpc.ts — Client setup with React Query integration
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import { inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";
import type { AppRouter } from "../server/routers/_app";

// Create the typed React hooks
export const trpc = createTRPCReact<AppRouter>();

// Infer output types from the router (for use in components)
type RouterOutput = inferRouterOutputs<AppRouter>;
export type Project = RouterOutput["project"]["byId"];
export type ProjectListItem = RouterOutput["project"]["list"]["projects"][number];

// Client configuration
export function createTRPCClient(token: string) {
  return trpc.createClient({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: "/api/trpc",
        headers: () => ({
          authorization: token ? `Bearer ${token}` : "",
        }),
        // Batch multiple requests into one HTTP call
        maxURLLength: 2048,
      }),
    ],
  });
}
```

```typescript
// src/components/ProjectList.tsx — Type-safe component using tRPC hooks
"use client";

import { trpc, ProjectListItem } from "../client/trpc";
import { useState } from "react";

export function ProjectList() {
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");

  // Fully typed: TypeScript knows exactly what `data` contains
  const { data, isLoading, fetchNextPage, hasNextPage } = trpc.project.list.useInfiniteQuery(
    { limit: 20, status },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  // Mutation with optimistic updates
  const utils = trpc.useUtils();
  const createProject = trpc.project.create.useMutation({
    onSuccess: () => {
      // Invalidate the project list to refetch
      utils.project.list.invalidate();
    },
  });

  const deleteProject = trpc.project.delete.useMutation({
    onMutate: async ({ id }) => {
      // Optimistic: remove from list immediately
      await utils.project.list.cancel();
      utils.project.list.setInfiniteData(
        { limit: 20, status },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              projects: page.projects.filter((p) => p.id !== id),
            })),
          };
        }
      );
    },
    onError: () => {
      utils.project.list.invalidate(); // revert on error
    },
  });

  if (isLoading) return <div className="animate-pulse">Loading...</div>;

  const allProjects = data?.pages.flatMap((p) => p.projects) || [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["active", "archived", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1 rounded-lg text-sm ${
              status === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {allProjects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onDelete={() => deleteProject.mutate({ id: project.id })}
        />
      ))}

      {hasNextPage && (
        <button onClick={() => fetchNextPage()} className="text-blue-600 text-sm">
          Load more
        </button>
      )}
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: ProjectListItem; onDelete: () => void }) {
  // TypeScript knows project has: id, name, description, status, color, updatedAt, _count.tasks, _count.members
  return (
    <div className="border rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
          <h3 className="font-semibold text-gray-900">{project.name}</h3>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{project._count.tasks} tasks</span>
          <span>{project._count.members} members</span>
          <button onClick={onDelete} className="text-red-500 hover:text-red-700">Delete</button>
        </div>
      </div>
      {project.description && (
        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{project.description}</p>
      )}
      <p className="mt-2 text-xs text-gray-400">Updated {project.updatedAt.toLocaleDateString()}</p>
    </div>
  );
}
```

## Results

- **Zero runtime type errors from API mismatches** — when a backend developer renames `userName` to `displayName`, TypeScript shows compile errors in every frontend file that references it; the bug is caught before code review, not in production
- **400 lines of duplicate type definitions eliminated** — `AppRouter` type is the single source of truth; the client infers all types from the server definitions automatically
- **API changes propagate instantly** — adding a new field to a query result is one line of Prisma change; the frontend sees it immediately with full autocomplete
- **Request batching reduces network calls by 60%** — tRPC's `httpBatchLink` combines multiple procedure calls into a single HTTP request; a dashboard that made 6 API calls now makes 1
- **Optimistic updates feel instant** — deleting a project removes it from the UI immediately; if the server rejects, the UI reverts; users perceive zero latency
