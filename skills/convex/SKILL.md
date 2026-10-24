---
name: convex
description: >-
  Convex is a reactive backend where the database, server functions and file
  storage are written in TypeScript and query results update live in every
  connected client. Use when building a Convex app: schema and indexes,
  queries, mutations and actions, useQuery and useMutation in React, auth,
  pagination, file uploads, scheduled functions and cron jobs, full-text and
  vector search. Trigger words: convex, reactive backend, convex schema,
  convex functions, npx convex dev.
license: Apache-2.0
compatibility: "Node.js with npm; React, Next.js, Remix, React Native or any JavaScript client; a free Convex account for cloud deployments"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/get-convex/convex-backend
  tags: ["convex", "real-time", "reactive", "backend", "database"]
---

# Convex

## Overview

Convex runs your TypeScript server functions next to a transactional document database. Queries are reactive: a `useQuery` subscription re-renders when the data it read changes, with no WebSocket, polling or cache-invalidation code. Mutations are ACID transactions with optimistic concurrency control. Functions live in the `convex/` folder and are called through the generated `api` object.

Three function kinds: `query` (read-only, reactive, deterministic), `mutation` (transactional writes), `action` (may call external APIs, not transactional, can run queries and mutations through `ctx.runQuery` and `ctx.runMutation`). Use `internalQuery`, `internalMutation` and `internalAction` for functions that only other Convex functions may call.

## Instructions

### Step 1: Create the project

```console
$ npm create convex@latest          # new app with Convex wired in
$ npm install convex                # or add to an existing app
$ npx convex dev                    # logs in, creates a deployment, syncs convex/ and writes convex/_generated
```

`npx convex dev` keeps running and pushes every change to your dev deployment; it writes the deployment URL to `.env.local` (for Vite, `VITE_CONVEX_URL`). Never commit deploy keys; production deploys use `npx convex deploy` with `CONVEX_DEPLOY_KEY` set in CI.

### Step 2: Schema and indexes

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    channel: v.string(),
    author: v.string(),
    body: v.string(),
    imageId: v.optional(v.id("_storage")),
  })
    .index("by_channel", ["channel"])
    .searchIndex("search_body", { searchField: "body", filterFields: ["channel"] }),
});
```

Every document also gets `_id` and `_creationTime`; `by_channel` implicitly ends with `_creationTime`, so results come back in creation order. Use `.withIndex(...)` rather than `.filter(...)` for anything that must scale.

### Step 3: Functions

Functions take an object with `args` validators and a `handler`.

```typescript
// convex/messages.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const list = query({
  args: { channel: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) =>
    ctx.db.query("messages").withIndex("by_channel", (q) => q.eq("channel", args.channel)).order("desc").paginate(args.paginationOpts),
});

export const send = mutation({
  args: { channel: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not signed in");
    await ctx.db.insert("messages", {
      channel: args.channel,
      author: identity.name ?? identity.tokenIdentifier,
      body: args.body,
    });
  },
});
```

### Step 4: Use it from React

```tsx
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function Channel({ name }: { name: string }) {
  const { results, status, loadMore } = usePaginatedQuery(api.messages.list, { channel: name }, { initialNumItems: 25 });
  const send = useMutation(api.messages.send);
  return (
    <>
      {results.map((m) => <p key={m._id}>{m.author}: {m.body}</p>)}
      {status === "CanLoadMore" && <button onClick={() => loadMore(25)}>Older</button>}
      <button onClick={() => send({ channel: name, body: "deploy finished" })}>Post</button>
    </>
  );
}
```

Wrap the app in `ConvexProvider` with `new ConvexReactClient(import.meta.env.VITE_CONVEX_URL)`. Use `useQuery(api.x.y, args)` for non-paginated reads, and `useMutation(...).withOptimisticUpdate((localStore, args) => ...)` to show a change before the server confirms.

### Step 5: Auth, files, scheduling, search

- **Auth**: integrate Clerk, Auth0 or WorkOS AuthKit, or use Convex Auth (`@convex-dev/auth`, documented as beta). In functions call `ctx.auth.getUserIdentity()`; it returns `null` when not signed in.
- **File upload**: a mutation returns `await ctx.storage.generateUploadUrl()` (valid one hour); the client POSTs the file to it and receives `{ storageId }`, which another mutation saves. Serve with `await ctx.storage.getUrl(storageId)`. `ctx.storage.store(blob)` exists only in actions and HTTP actions.
- **Scheduling**: `await ctx.scheduler.runAfter(60_000, internal.billing.retryCharge, { orderId })` from a mutation or action. Recurring jobs go in `convex/crons.ts` using `cronJobs()` with `crons.interval`, `crons.daily`, `crons.cron`; avoid minute 0 of the hour.
- **Full-text search**: `ctx.db.query("messages").withSearchIndex("search_body", (q) => q.search("body", "deploy failed").eq("channel", "ops")).take(10)`.
- **Vector search**: declare `.vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1536, filterFields: ["cuisine"] })` on the table, then call `ctx.vectorSearch("foods", "by_embedding", { vector, limit: 10 })` inside an action only; it returns `_id` and `_score`, so load the documents with a follow-up query.

## Examples

### Example 1: Real-time chat

User: "Create a real-time chat app with Convex and React."

Run `npm create convex@latest`, add the `messages` table, `list` and `send` from Steps 2 and 3, and the `Channel` component from Step 4. `send` throws "Not signed in" until an auth provider is configured (Step 5); to try the loop without one, drop the identity check and set `author` from an argument. Open the app in two browser windows: a message posted in one appears in the other without a refresh.

### Example 2: Keyword search for support articles

User: "Add search over my articles table."

Add `.searchIndex("search_body", { searchField: "body", filterFields: ["category"] })` to `articles`, then a query that calls `withSearchIndex("search_body", (q) => q.search("body", term).eq("category", "billing")).take(20)`. The search query is reactive like any other. For semantic search, add a `vectorIndex`, create embeddings in an action, and call `ctx.vectorSearch`.

## Guidelines

- Always index the fields you filter on; `.filter()` scans the table range it is given. Convex rejects reads that exceed per-function limits, so paginate big result sets.
- Queries must be deterministic: no `fetch`, no `Date.now()` semantics you rely on staying fixed. Do external calls in actions and write back through a mutation.
- Keep mutations short. Conflicting concurrent transactions are retried, so heavy work belongs in an action or a scheduled function.
- Check `ctx.auth.getUserIdentity()` in every public function that reads or writes private data; put server-only logic in `internal*` functions.
- Validate `args` with `v` validators on every function, and keep `defineSchema` strict in production so bad writes fail.
- Do not use Convex when you need a relational SQL engine with ad hoc joins and existing SQL tooling.
