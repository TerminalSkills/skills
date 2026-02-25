---
title: Build a Type-Safe Full-Stack API with tRPC
slug: build-type-safe-fullstack-api-with-trpc
description: Create a fully type-safe API layer using tRPC, Zod, and Prisma where backend changes instantly propagate to the frontend — no code generation, no REST boilerplate, no runtime surprises.
skills:
  - trpc
  - zod
  - prisma
category: development
tags:
  - typescript
  - api
  - type-safety
  - next.js
  - validation
---

# Build a Type-Safe Full-Stack API with tRPC

Marta runs engineering at a 15-person SaaS startup building a project management tool. Their Next.js app has 47 REST endpoints, and every sprint brings the same pain: someone renames a field on the backend, the frontend keeps sending the old name, and the bug doesn't surface until a customer reports it three days later. She wants an API layer where a backend schema change immediately shows a red squiggle in the frontend code — before anyone pushes a commit.

## Step 1 — Define the Prisma Schema and Core Zod Schemas

The data model covers projects, tasks, and team members. Zod schemas mirror the Prisma types but add validation rules that the database can't enforce — email format, string length limits, and business constraints like due dates being in the future.

```typescript
// src/schemas/project.ts — Shared validation schemas for the project domain.
// These are imported by both tRPC procedures and frontend forms,
// so a single change here propagates everywhere.

import { z } from "zod";

export const CreateProjectInput = z.object({
  name: z
    .string()
    .min(3, "Project name must be at least 3 characters")
    .max(100, "Project name must not exceed 100 characters"),
  description: z.string().max(2000).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex code")
    .default("#6366f1"),
  visibility: z.enum(["private", "team", "public"]).default("team"),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const UpdateProjectInput = CreateProjectInput.partial().extend({
  id: z.string().cuid(),
});

export const ProjectFilters = z.object({
  visibility: z.enum(["private", "team", "public"]).optional(),
  search: z.string().max(200).optional(),
  cursor: z.string().cuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
```

The `CreateProjectInput` schema does double duty. On the backend, `trpc` uses it to validate incoming requests. On the frontend, `react-hook-form` uses the same schema to validate form fields before they even leave the browser. One source of truth, zero drift.

## Step 2 — Set Up the tRPC Server with Context and Auth Middleware

The tRPC initialization creates a context factory that pulls the user session from the request, and middleware layers that enforce authentication and role-based access.

```typescript
// src/server/trpc.ts — tRPC initialization with typed context and middleware.
// The context factory runs on every request and makes the database client
// and authenticated user available to all procedures.

import { initTRPC, TRPCError } from "@trpc/server";
import { type CreateNextContextOptions } from "@trpc/server/adapters/next";
import superjson from "superjson";  // Handles Date, Map, Set serialization
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";

export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const session = await getServerSession(opts.req);
  return {
    prisma,               // Database client — available in every procedure
    session,              // null for unauthenticated requests
    requestId: crypto.randomUUID(),  // Trace ID for logging
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Expose Zod validation errors in a frontend-friendly format
        zodError:
          error.cause instanceof z.ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Auth middleware — rejects unauthenticated requests before the procedure runs
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.session.user,  // Narrows type from `User | null` to `User`
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
```

The `enforceAuth` middleware does something subtle but powerful: it narrows the `ctx.session.user` type from `User | null` to `User`. Every `protectedProcedure` handler gets a guaranteed non-null user without any type casting.

## Step 3 — Build the Project Router with CRUD Procedures

Each procedure declares its input schema, and TypeScript enforces that the handler only accesses fields that the schema defines. If someone adds a field to the Prisma model but forgets to update the Zod schema, the procedure won't accidentally expose it.

```typescript
// src/server/routers/project.ts — Project domain router.
// Procedures are thin orchestrators: validate input, call Prisma, return data.
// Business logic beyond simple CRUD belongs in src/services/.

import { router, protectedProcedure } from "../trpc";
import { CreateProjectInput, UpdateProjectInput, ProjectFilters } from "@/schemas/project";
import { TRPCError } from "@trpc/server";

export const projectRouter = router({
  list: protectedProcedure
    .input(ProjectFilters)
    .query(async ({ ctx, input }) => {
      const { cursor, limit, search, visibility } = input;

      const projects = await ctx.prisma.project.findMany({
        where: {
          teamId: ctx.user.teamId,
          ...(visibility && { visibility }),
          ...(search && {
            name: { contains: search, mode: "insensitive" },
          }),
        },
        take: limit + 1,        // Fetch one extra to detect "has next page"
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,               // Skip the cursor item itself
        }),
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { tasks: true } },  // Task count without fetching tasks
        },
      });

      // Cursor-based pagination: if we got limit+1 items, there's a next page
      let nextCursor: string | undefined;
      if (projects.length > limit) {
        const nextItem = projects.pop();
        nextCursor = nextItem?.id;
      }

      return { projects, nextCursor };
    }),

  create: protectedProcedure
    .input(CreateProjectInput)
    .mutation(async ({ ctx, input }) => {
      // Check team project limit before creating
      const projectCount = await ctx.prisma.project.count({
        where: { teamId: ctx.user.teamId },
      });

      if (projectCount >= 50) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Team project limit reached (50). Archive unused projects to create new ones.",
        });
      }

      return ctx.prisma.project.create({
        data: {
          ...input,
          teamId: ctx.user.teamId,
          createdById: ctx.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(UpdateProjectInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Verify the user's team owns this project
      const existing = await ctx.prisma.project.findUnique({
        where: { id },
        select: { teamId: true },
      });

      if (!existing || existing.teamId !== ctx.user.teamId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return ctx.prisma.project.update({ where: { id }, data });
    }),
});
```

The cursor-based pagination pattern fetches `limit + 1` rows and checks whether the extra row exists. This avoids a separate `COUNT(*)` query and works efficiently even with millions of rows.

## Step 4 — Wire Up the Frontend with Type-Safe React Hooks

The frontend client infers all types from the router definition. Renaming a field in the Prisma schema, updating the Zod schema, and adjusting the procedure is all it takes — TypeScript immediately flags every frontend reference that needs updating.

```typescript
// src/lib/trpc-client.ts — tRPC React client setup.
// httpBatchLink combines multiple simultaneous requests into a single HTTP call,
// reducing network overhead when a page loads several queries at once.

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers/_app";

export const trpc = createTRPCReact<AppRouter>();

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === "development" ||
          (opts.direction === "down" && opts.result instanceof Error),
      }),
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
      }),
    ],
  });
}
```

```tsx
// src/components/ProjectList.tsx — Project list with infinite scroll.
// The trpc hook returns fully typed data — hover over `project.name`
// and TypeScript knows it's a string between 3-100 characters.

import { trpc } from "@/lib/trpc-client";

export function ProjectList({ search }: { search?: string }) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
  } = trpc.project.list.useInfiniteQuery(
    { limit: 20, search },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 30_000,  // 30 seconds before background refetch
    },
  );

  const projects = data?.pages.flatMap((page) => page.projects) ?? [];

  if (isLoading) return <ProjectListSkeleton />;

  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          name={project.name}
          taskCount={project._count.tasks}
          color={project.color}
        />
      ))}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()}>Load more</button>
      )}
    </div>
  );
}
```

## Step 5 — Add Optimistic Updates for Instant UI Feedback

When a user creates a project, the UI shouldn't wait 200ms for the server round-trip. Optimistic updates write to the React Query cache immediately and roll back if the server rejects the request.

```typescript
// src/hooks/useCreateProject.ts — Optimistic mutation with rollback.
// The cache is updated instantly, giving the user sub-10ms feedback.
// If the server returns an error, onError restores the previous state.

import { trpc } from "@/lib/trpc-client";
import type { CreateProjectInput } from "@/schemas/project";

export function useCreateProject() {
  const utils = trpc.useUtils();

  return trpc.project.create.useMutation({
    onMutate: async (newProject: CreateProjectInput) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await utils.project.list.cancel();

      // Snapshot current cache for potential rollback
      const previousData = utils.project.list.getInfiniteData({ limit: 20 });

      // Optimistically insert the new project at the top of the list
      utils.project.list.setInfiniteData({ limit: 20 }, (old) => {
        if (!old) return old;
        const optimisticProject = {
          id: `temp-${Date.now()}`,  // Temporary ID, replaced on server response
          ...newProject,
          createdAt: new Date(),
          _count: { tasks: 0 },
        };
        return {
          ...old,
          pages: [
            {
              projects: [optimisticProject, ...old.pages[0].projects],
              nextCursor: old.pages[0].nextCursor,
            },
            ...old.pages.slice(1),
          ],
        };
      });

      return { previousData };
    },

    onError: (_err, _newProject, context) => {
      // Rollback to the snapshot if the mutation fails
      if (context?.previousData) {
        utils.project.list.setInfiniteData({ limit: 20 }, context.previousData);
      }
    },

    onSettled: () => {
      // Refetch after mutation to sync with server state
      utils.project.list.invalidate();
    },
  });
}
```

The pattern is snapshot → optimistic write → rollback on error → refetch on settle. The temporary ID (`temp-${Date.now()}`) gets replaced when `onSettled` triggers a refetch with the real server-generated ID.

## Results

Marta's team deployed the tRPC migration incrementally over two weeks, converting 5-8 endpoints per day. The measurable outcomes after the first month:

- **Zero type mismatch bugs** in production — down from 3-4 per sprint. Every schema change is caught at build time.
- **47 REST endpoints replaced with 23 tRPC procedures** — many REST endpoints were just variations (GET/POST/PUT) of the same resource, collapsed into single routers.
- **API response time dropped 18%** thanks to HTTP batching — pages that fired 6 parallel requests now send a single batched call.
- **Developer onboarding time cut from 2 weeks to 4 days** — new engineers navigate the codebase by following types from the UI component all the way to the database query with Cmd+Click.
- **Form validation code reduced by 60%** — shared Zod schemas between server and client eliminated duplicate validation logic.
