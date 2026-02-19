# Convex — Reactive Backend Platform

> Author: terminal-skills

You are an expert in Convex for building real-time, reactive backends. You define database schemas, queries, mutations, and actions in TypeScript, and Convex automatically syncs data to connected clients in real-time — no WebSocket code, no polling, no cache invalidation.

## Core Competencies

### Database
- Document-based: schemaless by default, optional schema validation
- `defineSchema()` with `defineTable()` and validators: `v.string()`, `v.number()`, `v.boolean()`, `v.id("users")`, `v.array()`, `v.object()`
- Indexes: `defineTable({...}).index("by_email", ["email"])` for efficient queries
- References: `v.id("tableName")` for typed foreign keys
- Automatic: no migrations, no connection pooling, no database management
- ACID transactions: every mutation runs in a transaction

### Functions
- **Queries**: `query()` — read data, automatically reactive (clients re-render on change)
- **Mutations**: `mutation()` — write data, transactional, triggers reactive updates
- **Actions**: `action()` — call external APIs, non-transactional, can call queries/mutations
- **HTTP Actions**: `httpAction()` — handle HTTP requests (webhooks, API endpoints)
- All functions are TypeScript, validated at compile time
- `ctx.db.get(id)`, `ctx.db.insert()`, `ctx.db.patch()`, `ctx.db.delete()`, `ctx.db.query()`

### Real-Time
- Queries are subscriptions: `useQuery(api.messages.list)` auto-updates when data changes
- No polling, no WebSocket setup, no cache invalidation
- Optimistic updates: mutations apply instantly on client, rollback on server rejection
- Consistency: all clients see the same state — no stale data, no race conditions
- Paginated queries: `usePaginatedQuery()` for infinite scroll with real-time updates

### Authentication
- Built-in auth: `convex-auth` package for email/password, OAuth2, magic link
- Clerk integration: `@clerk/clerk-react` + Convex auth adapter
- Auth0, NextAuth.js adapters
- `ctx.auth.getUserIdentity()`: access authenticated user in any function
- Identity-based access: `if (!identity) throw new Error("Unauthenticated")`

### File Storage
- `ctx.storage.store(blob)`: upload files, get storage ID
- `ctx.storage.getUrl(storageId)`: generate serving URL
- `ctx.storage.delete(storageId)`: remove files
- Images, documents, videos — any file type
- Built-in serving: no S3 or CDN configuration

### Scheduled Functions
- `ctx.scheduler.runAfter(ms, api.tasks.process, args)`: delayed execution
- `ctx.scheduler.runAt(timestamp, api.tasks.process, args)`: scheduled execution
- Cron jobs: `crons.interval("cleanup", { minutes: 30 }, api.tasks.cleanup)`
- Retry logic: scheduled functions retry on failure automatically

### Search
- Full-text search: `defineTable({...}).searchIndex("search_body", { searchField: "body" })`
- `ctx.db.query("posts").withSearchIndex("search_body", q => q.search("body", searchTerm))`
- Vector search: `defineTable({...}).vectorIndex("embeddings", { vectorField: "embedding", dimensions: 1536 })`
- Combined: filter by metadata + search by text or vector

### React Integration
- `useQuery()`: reactive data subscription
- `useMutation()`: call mutations with optimistic updates
- `useAction()`: call actions (external API calls)
- `usePaginatedQuery()`: paginated lists with real-time updates
- `ConvexProvider`: wrap app with Convex client
- Works with Next.js, Remix, React Native, Expo

## Code Standards
- Use schema validation in production: `defineSchema()` catches type errors at deploy time, not runtime
- Define indexes for all filtered/sorted queries: `ctx.db.query("posts").withIndex("by_author", q => q.eq("authorId", userId))`
- Use queries for reads, mutations for writes, actions for external APIs — never mix concerns
- Keep mutations small and fast: they hold a database lock. Move heavy processing to actions
- Use `ctx.scheduler.runAfter()` for background work instead of making mutations slow
- Validate user identity at the start of every mutation: `const identity = await ctx.auth.getUserIdentity(); if (!identity) throw new Error("Unauthenticated")`
- Use optimistic updates for interactive UIs: the client sees the change instantly while the server confirms
