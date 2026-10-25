---
name: trpc
description: >-
  tRPC builds end-to-end type-safe TypeScript APIs without schemas or code
  generation: the server defines procedures, the client calls them with full
  type inference. Use when someone asks to "add tRPC", "set up a tRPC router",
  "call my API with type safety", "use tRPC with React Query or Next.js", or
  to migrate a tRPC v10 app to v11.
license: Apache-2.0
compatibility: "Node.js 18+, TypeScript 5.7+ (strict mode), @trpc/* 11.x, @tanstack/react-query 5.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "trpc, typescript, api, react, nextjs"
  repository: https://github.com/trpc/trpc
---

# tRPC — End-to-End Type-Safe APIs

## Overview

tRPC lets a TypeScript server export a router type and a TypeScript client import only that type, so every call is checked at compile time with no REST routes, OpenAPI spec or code generation. Inputs are validated at runtime with a schema library (Zod, Valibot, ArkType, or anything with a Standard Schema). This skill targets tRPC v11 (`@trpc/*` 11.x). Both client and server must be on the same major version.

## Instructions

### 1. Install

```bash
npm install @trpc/server @trpc/client zod
# React apps: the TanStack Query integration (recommended in v11)
npm install @trpc/tanstack-react-query @tanstack/react-query
```

TypeScript needs `"strict": true`. The legacy `@trpc/react-query` (`createTRPCReact`, `trpc.x.useQuery()`) and `@trpc/next` packages still ship in 11.x, but the docs steer new React code to `@trpc/tanstack-react-query`.

### 2. Define the server

```typescript
// server/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

export type Context = { user?: { id: string }; db: Db }; // Db: your Prisma/Drizzle client type

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { user: ctx.user } }); // narrows ctx.user to non-optional downstream
});

// server/routers/users.ts
export const usersRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.id } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      return user;
    }),

  list: publicProcedure
    .input(z.object({ cursor: z.string().nullish(), limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db.user.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
      });
      const nextCursor = rows.length > input.limit ? rows.pop()!.id : undefined;
      return { items: rows, nextCursor };
    }),

  rename: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ input, ctx }) => ctx.db.user.update({ where: { id: ctx.user.id }, data: input })),
});

// server/routers/_app.ts
export const appRouter = router({ users: usersRouter });
export type AppRouter = typeof appRouter; // the only thing the client imports
```

Name the cursor field `cursor` in the input and return `nextCursor`; the infinite-query helpers rely on that.

### 3. Serve it

Pick an adapter from `@trpc/server/adapters/*`. Each one takes `router` and `createContext`:

- Standalone Node: `createHTTPServer({ router: appRouter, createContext })` from `@trpc/server/adapters/standalone`, then `.listen(3000)`.
- Express, Fastify, AWS Lambda: `.../adapters/express`, `.../fastify`, `.../aws-lambda`.
- Next.js App Router and other fetch runtimes: `fetchRequestHandler({ endpoint: "/api/trpc", req, router: appRouter, createContext })` from `@trpc/server/adapters/fetch`, exported as both `GET` and `POST` in `app/api/trpc/[trpc]/route.ts`.

### 4. Call it from any TypeScript client

```typescript
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/routers/_app";

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "http://localhost:3000", headers: () => ({ authorization: `Bearer ${process.env.API_TOKEN}` }) })],
});
const user = await client.users.getById.query({ id: "usr_42" });
```

Calls made in the same tick are batched into one HTTP request by `httpBatchLink`. A transformer (superjson, for `Date`/`Map`) is set with `initTRPC.create({ transformer })` on the server and `transformer` on the link in v11, not on the client constructor.

### 5. React with TanStack Query

```tsx
// utils/trpc.ts
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../server/routers/_app";
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
```

Wrap the app in `<QueryClientProvider client={queryClient}><TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>`, where `trpcClient` is the `createTRPCClient` above, created once (for example with `useState`). In Next.js, create a fresh `QueryClient` per request on the server and reuse one in the browser.

```tsx
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";

function Profile({ userId }: { userId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const user = useQuery(trpc.users.getById.queryOptions({ id: userId }));
  const rename = useMutation(trpc.users.rename.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries(trpc.users.getById.queryFilter({ id: userId })),
  }));
  return <button onClick={() => rename.mutate({ name: "Ana Petrova" })}>{rename.isPending ? "Saving..." : user.data?.name}</button>;
}

function UserList() {
  const trpc = useTRPC();
  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery(
    trpc.users.list.infiniteQueryOptions({ limit: 20 }, { getNextPageParam: (last) => last.nextCursor }),
  );
  return <>{data?.pages.flatMap((p) => p.items).map((u) => <p key={u.id}>{u.name}</p>)}{hasNextPage && <button onClick={() => fetchNextPage()}>More</button>}</>;
}
```

`queryFilter(input)` matches one query, `pathFilter()` matches every query under a router (`trpc.users.pathFilter()`).

## Examples

### Example 1: "Add a protected endpoint"

Request: "Only logged-in users may change their display name." Add `rename` with `protectedProcedure` as above, build `ctx.user` in `createContext` from the session cookie or bearer token. Result: an unauthenticated call rejects with `TRPCError` code `UNAUTHORIZED` (HTTP 401), and `ctx.user.id` is typed as `string` inside the handler.

### Example 2: "Call my API from a script"

Request: "Fetch user usr_42 from a Node script, typed." Use the vanilla client from step 4 with `import type { AppRouter }`. Verified against `@trpc/server`/`@trpc/client` 11.19: `client.users.getById.query(...)` returns the server's exact return type, and a call without the auth header to a protected procedure throws `UNAUTHORIZED`.

## Guidelines

- Import `AppRouter` with `import type` so no server code reaches the client bundle.
- Always give inputs a schema and set `.max()` on lists and strings; tRPC does not limit sizes for you.
- Throw `TRPCError` with a code (`NOT_FOUND`, `FORBIDDEN`, `BAD_REQUEST`) instead of plain errors; plain errors become `INTERNAL_SERVER_ERROR`.
- Do authorization inside procedures or middleware, not only in the UI. Never trust client-sent user ids.
- Subscriptions in v11 use `httpSubscriptionLink` (server-sent events) or `wsLink`; the procedure is an async generator.
- Upgrading from v10: change all `@trpc/*` packages together, move `transformer` into the links, and replace `useContext()` with `useUtils()`. If you use `@trpc/tanstack-react-query`, `trpc.x.useQuery()` becomes `useQuery(trpc.x.queryOptions())`.
- tRPC is for a TypeScript client and server in one codebase. For public or non-TypeScript consumers, expose REST or OpenAPI instead.
