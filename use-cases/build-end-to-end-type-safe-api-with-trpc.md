---
title: Build an End-to-End Type-Safe API with tRPC
slug: build-end-to-end-type-safe-api-with-trpc
description: >
  Replace REST endpoints with tRPC for full-stack type safety —
  eliminating API contract bugs, generating zero-effort client SDKs,
  and cutting API development time by 40%.
skills:
  - typescript
  - trpc
  - zod
  - prisma
  - authjs
  - vitest
category: Full-Stack Development
tags:
  - trpc
  - type-safety
  - api
  - full-stack
  - typescript
  - prisma
---

# Build an End-to-End Type-Safe API with tRPC

## The Problem

A Next.js SaaS app has 120 REST endpoints. Every API change requires updating 3 places: the backend handler, the OpenAPI spec, and the frontend fetch wrapper. Type mismatches between frontend and backend cause 30% of all bugs — `user.firstName` on the backend but `user.first_name` on the frontend. The team generates TypeScript types from OpenAPI but the spec is always outdated. Two engineers spend a combined 10 hours/week maintaining API documentation and client code.

## Step 1: tRPC Router with Zod Validation

```typescript
// src/server/trpc/router.ts
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Context {
  userId: string | null;
  tenantId: string | null;
}

const t = initTRPC.context<Context>().create();

// Middleware: require authentication
const authed = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { userId: ctx.userId, tenantId: ctx.tenantId! } });
});

const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(authed);

// ---- Users ----
const userRouter = t.router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true },
    });
    return user;
  }),

  update: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100).optional(),
      avatarUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return prisma.user.update({
        where: { id: ctx.userId },
        data: input,
        select: { id: true, name: true, avatarUrl: true },
      });
    }),
});

// ---- Projects ----
const projectRouter = t.router({
  list: protectedProcedure
    .input(z.object({
      cursor: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.enum(['active', 'archived', 'all']).default('active'),
    }))
    .query(async ({ ctx, input }) => {
      const where: any = { tenantId: ctx.tenantId };
      if (input.status !== 'all') where.status = input.status;

      const projects = await prisma.project.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, description: true, status: true, createdAt: true,
          _count: { select: { tasks: true, members: true } },
        },
      });

      const hasMore = projects.length > input.limit;
      const items = hasMore ? projects.slice(0, -1) : projects;

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1].id : null,
      };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return prisma.project.create({
        data: {
          ...input,
          tenantId: ctx.tenantId,
          ownerId: ctx.userId,
          status: 'active',
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await prisma.project.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          tasks: { orderBy: { createdAt: 'desc' }, take: 50 },
          members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        },
      });

      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      return project;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const project = await prisma.project.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId, ownerId: ctx.userId },
      });

      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });

      await prisma.project.update({
        where: { id: input.id },
        data: { status: 'archived' },
      });

      return { success: true };
    }),
});

// ---- Tasks ----
const taskRouter = t.router({
  create: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      title: z.string().min(1).max(500),
      description: z.string().max(5000).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
      assigneeId: z.string().uuid().optional(),
      dueDate: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify project access
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, tenantId: ctx.tenantId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });

      return prisma.task.create({
        data: { ...input, createdById: ctx.userId, status: 'todo' },
      });
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['todo', 'in_progress', 'review', 'done']),
    }))
    .mutation(async ({ ctx, input }) => {
      return prisma.task.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),
});

// Root router
export const appRouter = t.router({
  user: userRouter,
  project: projectRouter,
  task: taskRouter,
});

export type AppRouter = typeof appRouter;
```

## Step 2: Type-Safe Client

```typescript
// src/client/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/trpc/router';

// React hooks — fully typed, zero codegen
export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      headers: () => {
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

// Usage in components — TypeScript knows every field
// const { data } = trpc.project.list.useQuery({ status: 'active' });
// data?.items[0].name  ← fully typed, autocompleted
// data?.items[0].nme   ← TypeScript error! Caught at compile time
```

## Step 3: Testing with Full Type Safety

```typescript
// src/server/trpc/__tests__/project.test.ts
import { describe, test, expect } from 'vitest';
import { appRouter } from '../router';

describe('Project router', () => {
  const caller = appRouter.createCaller({
    userId: 'test-user-1',
    tenantId: 'test-tenant-1',
  });

  test('creates and lists projects', async () => {
    const created = await caller.project.create({
      name: 'Test Project',
      description: 'A test',
    });

    expect(created.name).toBe('Test Project');
    expect(created.status).toBe('active');

    const { items } = await caller.project.list({ status: 'active' });
    expect(items.length).toBeGreaterThan(0);
    // TypeScript knows items[0] has: id, name, description, status, createdAt, _count
  });

  test('rejects unauthenticated access', async () => {
    const anonCaller = appRouter.createCaller({ userId: null, tenantId: null });
    await expect(anonCaller.project.list({})).rejects.toThrow('UNAUTHORIZED');
  });
});
```

## Results

- **API contract bugs**: zero (was 30% of all bugs)
- **API development time**: 40% faster — no OpenAPI spec, no client codegen, no type wrappers
- **Documentation maintenance**: 0 hours/week (was 10 hours combined)
- **Compile-time safety**: rename a field on the backend → TypeScript errors everywhere it's used on the frontend, instantly
- **Autocomplete**: every API response fully autocompleted in the IDE
- **Testing**: `createCaller` makes integration tests trivial
- **Bundle size**: tRPC client adds 2KB gzipped — lighter than most REST client libraries
