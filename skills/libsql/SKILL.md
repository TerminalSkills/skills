---
name: libsql
description: >-
  libSQL — a fork of SQLite with replication, HTTP API, and embedded replicas
  (used by Turso). Use when you need embedded SQLite with remote sync, an
  edge-compatible database, or a Turso cloud database. Covers the
  @libsql/client SDK, local/in-memory/cloud connections, embedded replicas,
  batch queries, and transactions.
license: Apache-2.0
compatibility: "Node.js 18+, Bun, Deno (via npm:). @libsql/client 0.x."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: database
  tags: ["libsql", "sqlite", "turso", "edge-database", "embedded"]
  use-cases:
    - "Connect to a Turso cloud database from a Node.js or Bun app"
    - "Use an embedded replica for fast local reads with remote sync"
    - "Run SQLite over HTTP in edge environments"
    - "Execute batch queries and transactions with libSQL"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# libSQL

## Overview

libSQL is a fork of SQLite that adds replication, HTTP API access, and embedded replicas. It is the database engine behind Turso. Use the `@libsql/client` SDK to connect to local SQLite files, in-memory databases, or Turso cloud databases with the same API.

## Installation

```bash
npm install @libsql/client
# or
bun add @libsql/client
```

## Connection Modes

### Local SQLite File

```typescript
import { createClient } from "@libsql/client";

const db = createClient({
  url: "file:local.db",
});
```

### In-Memory (testing)

```typescript
const db = createClient({
  url: ":memory:",
});
```

### Turso Cloud

```typescript
const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,    // libsql://your-db.turso.io
  authToken: process.env.TURSO_AUTH_TOKEN!, // Generated from Turso CLI
});
```

### Embedded Replica

Local SQLite file that syncs from a remote Turso database. Reads hit the local file (fast), writes go to the remote and sync back:

```typescript
const db = createClient({
  url: "file:local-replica.db",            // Local replica path
  syncUrl: process.env.TURSO_DATABASE_URL!, // Remote Turso URL
  authToken: process.env.TURSO_AUTH_TOKEN!,
  syncInterval: 60,                         // Auto-sync every 60 seconds
});

// Manual sync
await db.sync();
```

### HTTP Mode (Edge)

For edge environments where native SQLite bindings are not available:

```typescript
const db = createClient({
  url: process.env.TURSO_DATABASE_URL!, // Use https:// URL for HTTP mode
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
// @libsql/client automatically uses HTTP when a remote URL is provided
```

## Basic Queries

```typescript
import { createClient } from "@libsql/client";

const db = createClient({ url: "file:app.db" });

// Execute DDL
await db.execute(`
  CREATE TABLE IF NOT EXISTS posts (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body  TEXT,
    slug  TEXT UNIQUE NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

// Insert
await db.execute({
  sql: "INSERT INTO posts (title, body, slug) VALUES (?, ?, ?)",
  args: ["Hello World", "First post content", "hello-world"],
});

// Select all
const result = await db.execute("SELECT * FROM posts ORDER BY created_at DESC");
console.log(result.rows); // Row[]
console.log(result.columns); // string[]

// Select with parameters
const post = await db.execute({
  sql: "SELECT * FROM posts WHERE slug = ?",
  args: ["hello-world"],
});
console.log(post.rows[0]); // First row

// Update
await db.execute({
  sql: "UPDATE posts SET title = ? WHERE id = ?",
  args: ["Updated Title", 1],
});

// Delete
await db.execute({
  sql: "DELETE FROM posts WHERE id = ?",
  args: [1],
});
```

## Batch Queries

Execute multiple statements in a single round trip:

```typescript
// All statements in a batch run atomically (like a transaction)
const results = await db.batch([
  {
    sql: "INSERT INTO posts (title, slug) VALUES (?, ?)",
    args: ["Post 1", "post-1"],
  },
  {
    sql: "INSERT INTO posts (title, slug) VALUES (?, ?)",
    args: ["Post 2", "post-2"],
  },
  "SELECT COUNT(*) as total FROM posts",
]);

console.log(results[2].rows[0]); // { total: 2 }
```

## Transactions

```typescript
import { createClient } from "@libsql/client";

const db = createClient({ url: "file:app.db" });

// Interactive transaction
const tx = await db.transaction("write");

try {
  await tx.execute({
    sql: "INSERT INTO accounts (user_id, balance) VALUES (?, ?)",
    args: [1, 1000],
  });

  await tx.execute({
    sql: "INSERT INTO accounts (user_id, balance) VALUES (?, ?)",
    args: [2, 500],
  });

  // Transfer
  await tx.execute({
    sql: "UPDATE accounts SET balance = balance - ? WHERE user_id = ?",
    args: [100, 1],
  });
  await tx.execute({
    sql: "UPDATE accounts SET balance = balance + ? WHERE user_id = ?",
    args: [100, 2],
  });

  await tx.commit();
  console.log("Transfer complete");
} catch (err) {
  await tx.rollback();
  console.error("Transfer failed:", err);
}
```

Transaction modes:
- `"write"` — read-write transaction
- `"read"` — read-only transaction (faster on replicas)
- `"deferred"` — SQLite deferred transaction

## Result Row Access

```typescript
const result = await db.execute("SELECT id, title, created_at FROM posts");

// Access by column name
for (const row of result.rows) {
  console.log(row.id, row.title, row.created_at);
}

// Column metadata
console.log(result.columns); // ["id", "title", "created_at"]

// Last insert ID
const insert = await db.execute({
  sql: "INSERT INTO posts (title, slug) VALUES (?, ?)",
  args: ["New Post", "new-post"],
});
console.log(insert.lastInsertRowid); // bigint
console.log(insert.rowsAffected);    // number
```

## Setting Up Turso

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create database
turso db create my-app-db

# Get connection URL
turso db show my-app-db --url
# → libsql://my-app-db-yourname.turso.io

# Create auth token
turso db tokens create my-app-db
# → eyJhbGciOi...

# List databases
turso db list

# Open shell
turso db shell my-app-db
```

## Environment Setup

```bash
# .env
TURSO_DATABASE_URL=libsql://my-app-db-yourname.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
```

```typescript
// src/db.ts — singleton client
import { createClient } from "@libsql/client";

if (!process.env.TURSO_DATABASE_URL) {
  throw new Error("TURSO_DATABASE_URL is required");
}

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
```

## Full Example: Blog API

```typescript
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

// Initialize schema
await db.execute(`
  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    slug       TEXT UNIQUE NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    published  INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

// Create
async function createPost(title: string, slug: string, body: string) {
  const result = await db.execute({
    sql: "INSERT INTO posts (title, slug, body) VALUES (?, ?, ?) RETURNING *",
    args: [title, slug, body],
  });
  return result.rows[0];
}

// Read
async function getPosts(publishedOnly = true) {
  const sql = publishedOnly
    ? "SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC"
    : "SELECT * FROM posts ORDER BY created_at DESC";
  const result = await db.execute(sql);
  return result.rows;
}

// Update
async function publishPost(id: number) {
  await db.execute({
    sql: "UPDATE posts SET published = 1 WHERE id = ?",
    args: [id],
  });
}

// Delete
async function deletePost(id: number) {
  await db.execute({
    sql: "DELETE FROM posts WHERE id = ?",
    args: [id],
  });
}
```

## Guidelines

- Always use parameterized queries with `args` — never string-concatenate SQL.
- Use `batch()` for multiple related inserts/updates to reduce round trips.
- Prefer `transaction("write")` for operations that must be atomic.
- Use embedded replicas when you need fast reads and can tolerate eventual consistency.
- Call `db.sync()` manually after writes when using embedded replicas for immediate read consistency.
- Use `":memory:"` for tests — fast and isolated.
- Store `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in environment variables, never in code.
- `lastInsertRowid` is a `bigint` — convert with `Number()` when needed.
