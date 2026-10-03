---
name: libsql
description: >-
  Connects JavaScript and TypeScript apps to libSQL, the open-source SQLite fork behind Turso, with the @libsql/client SDK: local files, in-memory databases, remote Turso databases over libsql:// or HTTP, and embedded replicas that sync from the cloud. Use when a user asks for SQLite with remote sync, an edge-friendly SQL database, a Turso setup, or batches, transactions and parameterized queries with libSQL.
license: Apache-2.0
compatibility: "Node.js 18+, Bun, Deno (via npm:). @libsql/client 0.18.x. Turso CLI for cloud databases."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["libsql", "sqlite", "turso", "edge-database", "embedded"]
  repository: https://github.com/tursodatabase/libsql-client-ts
---

# libSQL

## Overview

libSQL is an open-source fork of SQLite that adds network access, replication and embedded replicas; Turso hosts it as a cloud database. The `@libsql/client` package (0.18.0 at the time of writing) talks to local SQLite files, in-memory databases and remote libSQL servers through one async API: `execute`, `batch`, `transaction`.

Turso also ships newer packages built on its Rust rewrite of SQLite: `@tursodatabase/database` (local, with concurrent writes), `@tursodatabase/serverless` (remote, no native dependencies) and `@tursodatabase/sync`. Turso's docs point to `@libsql/client` for ORM integration (Drizzle, Prisma) and for remote libSQL databases, and to `@tursodatabase/sync` instead of embedded replicas for new offline or bidirectional-sync work. Concurrent writes are not supported by `@libsql/client`.

## Instructions

### Installation and connection modes

```bash
npm install @libsql/client       # or: bun add @libsql/client
```

```typescript
import { createClient } from "@libsql/client";

// Local SQLite file
const local = createClient({ url: "file:app.db" });

// In-memory (tests)
const memory = createClient({ url: ":memory:" });

// Turso cloud over libsql:// (WebSocket) or https:// (HTTP)
const cloud = createClient({
  url: process.env.TURSO_DATABASE_URL!,     // libsql://orders-prod-acme.turso.io
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
```
Close a client with `db.close()` when finished. In edge runtimes without native bindings (Workers, Vercel Edge) import from `@libsql/client/web`, which supports only remote URLs, not `file:`.

### Embedded replica

A local file that syncs from a remote Turso database: reads are local and fast, writes are sent to the remote primary.

```typescript
const db = createClient({
  url: "file:replica.db",
  syncUrl: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
  syncInterval: 60,        // seconds between automatic syncs
});
await db.sync();           // pull the latest changes now
```
Embedded replicas need a persistent filesystem, so they do not fit serverless functions or Workers.

### Queries

```typescript
await db.execute(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);

const ins = await db.execute({
  sql: "INSERT INTO posts (title, slug) VALUES (?, ?)",
  args: ["Hello World", "hello-world"],
});
console.log(ins.lastInsertRowid, ins.rowsAffected);   // 1n 1

const found = await db.execute({ sql: "SELECT * FROM posts WHERE slug = :slug", args: { slug: "hello-world" } });
console.log(found.columns, found.rows[0].title);
```
Arguments are positional (`?` with an array) or named (`:name` with an object). A result has `rows`, `columns`, `rowsAffected` and `lastInsertRowid`. `executeMultiple(sqlScript)` runs a semicolon-separated script without parameters (migrations, seed files).

### Batch and transactions

```typescript
// One round trip, implicit transaction: all statements succeed or none do
const results = await db.batch([
  { sql: "INSERT INTO posts (title, slug) VALUES (?, ?)", args: ["Post 1", "post-1"] },
  { sql: "INSERT INTO posts (title, slug) VALUES (?, ?)", args: ["Post 2", "post-2"] },
  "SELECT COUNT(*) AS total FROM posts",
], "write");
console.log(results[2].rows[0].total);

// Interactive transaction: use when later statements depend on earlier results
const tx = await db.transaction("write");
try {
  await tx.execute({ sql: "UPDATE accounts SET balance = balance - ? WHERE user_id = ?", args: [100, 1] });
  await tx.execute({ sql: "UPDATE accounts SET balance = balance + ? WHERE user_id = ?", args: [100, 2] });
  await tx.commit();
} catch (err) {
  await tx.rollback();
  throw err;
} finally {
  tx.close();
}
```
Modes for `batch` and `transaction`: `"write"`, `"read"` (read-only) and `"deferred"` (starts as a read, upgrades on first write). An interactive transaction holds a lock on the database, with a 5-second timeout on Turso, so keep it short.

### Turso CLI

```bash
brew install tursodatabase/tap/turso          # macOS; Linux/WSL installer: docs.turso.tech/cli/installation
turso auth login
turso db create orders-prod
turso db show orders-prod --url               # libsql://orders-prod-<org>.turso.io
turso db tokens create orders-prod --read-only --expiration 7d
turso db shell orders-prod
```
`turso db tokens create` without flags makes a full-access token; prefer `--read-only` for read paths and an expiration for anything shared.

## Examples

### Example 1: "Add a Turso database to my Next.js app"

```bash
npm install @libsql/client
turso db create storefront-prod
turso db show storefront-prod --url
turso db tokens create storefront-prod
```
```typescript
// lib/db.ts
import { createClient } from "@libsql/client";

if (!process.env.TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL is required");

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
```
Put both values in `.env.local`. A query such as `db.execute("SELECT COUNT(*) AS n FROM products")` returns `{ n: 42 }` in `rows[0]`.

### Example 2: "Insert a row and get it back"

```typescript
const created = await db.execute({
  sql: "INSERT INTO posts (title, slug) VALUES (?, ?) RETURNING id, title, slug",
  args: ["Launch notes", "launch-notes"],
});
console.log(created.rows[0]);   // { id: 7, title: 'Launch notes', slug: 'launch-notes' }
```
With `RETURNING`, the new row comes back in `rows`; `lastInsertRowid` is undefined and `rowsAffected` is 0 on a local file (checked on 0.18.0), so read the id from the row.

## Guidelines

- Always pass values through `args`; never concatenate user input into SQL.
- `lastInsertRowid` is a `bigint` for plain inserts; use `Number()` for small ids. Integers above 2^53 in a result throw `RangeError` unless the client is created with `intMode: "bigint"` (or `"string"`).
- Errors are `LibsqlError` with a `code` such as `SQLITE_CONSTRAINT`; check `err.code`, for example to turn a duplicate slug into a 409 response.
- Use `batch()` for independent writes that must succeed together; use an interactive `transaction()` only when a later statement depends on an earlier result.
- Keep `TURSO_AUTH_TOKEN` in the environment or a secrets manager, never in source or a browser bundle.
- Embedded replicas are eventually consistent; call `db.sync()` before a read that must see recent remote writes.
- Remote databases take one writer at a time; for write-heavy or multi-writer workloads, check Turso's newer `@tursodatabase/*` packages first.
- `":memory:"` gives every test an isolated database.
