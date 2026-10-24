---
name: turso
description: >-
  Turso is a managed SQLite-compatible database platform (Turso Cloud) built on libSQL, with an HTTP/WebSocket API, embedded replicas, native vector search and database branching. Use this skill to connect a TypeScript app with @libsql/client, create databases and tokens with the turso CLI, run batched transactions, add vector similarity search, use Drizzle ORM, or keep a local read replica synced from the cloud.
license: Apache-2.0
compatibility: 'Node.js 18+ with @libsql/client 0.18; the turso CLI via Homebrew (macOS or Linux); a Turso Cloud account for remote databases'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/tursodatabase/libsql
  tags:
    - database
    - sqlite
    - libsql
    - vector-search
    - embedded-replicas
---

# Turso

## Overview

Turso is SQLite for networked and edge apps. Turso Cloud hosts databases on two engines: libSQL (a production fork of SQLite, used by `@libsql/client`) and the newer Turso Database, a ground-up Rust rewrite of SQLite with concurrent writes that is in early preview on the cloud (`turso db create --tursodb`). This skill covers the libSQL path with `@libsql/client`, which is what most apps use today. The Turso Database engine has its own packages (`@tursodatabase/database`, `@tursodatabase/sync`) and docs; new projects that need local-first sync are pointed there by the vendor's embedded-replicas page.

## Instructions

### 1. Install the CLI and create a database

```bash
brew install tursodatabase/tap/turso     # macOS, and Linux with Homebrew
turso auth login
turso db create orders-prod
turso db show orders-prod --url          # libsql://orders-prod-<org>.turso.io
turso db tokens create orders-prod       # database token; add --read-only or --expiration 7d as needed
```

Put the URL and token in environment variables (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`), never in source. The docs also offer an installer script; prefer Homebrew, or download that script, read it, and only then run it.

### 2. Connect and query

```typescript
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,   // libsql://orders-prod-acme.turso.io
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const active = await db.execute("SELECT id, name FROM users WHERE active = 1");
console.log(active.rows);                  // [{ id: 1, name: "Maria" }]

const user = await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [userId] });

await db.execute({
  sql: "INSERT INTO users (name, email, created_at) VALUES (?, ?, datetime('now'))",
  args: ["Dmitri", "dmitri@acme-shop.io"],
});
```

`file:local.db` as the URL opens a local SQLite file with the same API, which is how to develop and test without a cloud database. Always pass user input through `args`.

### 3. Transactions

`db.batch()` runs statements in one implicit transaction: all succeed or all roll back. Use `db.transaction("write")` when later statements depend on earlier results, and close it.

```typescript
await db.batch([
  { sql: "UPDATE accounts SET balance = balance - ? WHERE id = ?", args: [100, fromAccount] },
  { sql: "UPDATE accounts SET balance = balance + ? WHERE id = ?", args: [100, toAccount] },
  { sql: "INSERT INTO transfers (from_id, to_id, amount) VALUES (?, ?, ?)", args: [fromAccount, toAccount, 100] },
], "write");

const tx = await db.transaction("write");
try {
  const { rows } = await tx.execute({ sql: "SELECT balance FROM accounts WHERE id = ?", args: [fromAccount] });
  if (Number(rows[0].balance) < 100) { await tx.rollback(); }
  else { await tx.execute({ sql: "UPDATE accounts SET balance = balance - 100 WHERE id = ?", args: [fromAccount] }); await tx.commit(); }
} finally { tx.close(); }
```

### 4. Vector search

Vector search is built in: no extension. Column types are `F32_BLOB(n)` (4 bytes per dimension) and others (`F64_BLOB`, `F16_BLOB`, `F8_BLOB`, ...). Insert with `vector32(?)` and a JSON array string.

```typescript
await db.execute(`CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, embedding F32_BLOB(1536))`);
await db.execute("CREATE INDEX IF NOT EXISTS documents_idx ON documents (libsql_vector_idx(embedding))");

await db.execute({
  sql: "INSERT INTO documents (content, embedding) VALUES (?, vector32(?))",
  args: [text, JSON.stringify(embedding)],         // number[] with exactly 1536 values
});

// exact scan, no index needed
const exact = await db.execute({
  sql: `SELECT content, vector_distance_cos(embedding, vector32(?)) AS distance
        FROM documents ORDER BY distance ASC LIMIT 10`,
  args: [JSON.stringify(queryEmbedding)],
});

// approximate nearest neighbours through the index (must be queried explicitly)
const near = await db.execute({
  sql: `SELECT d.content FROM vector_top_k('documents_idx', vector32(?), 10) AS v
        JOIN documents d ON d.rowid = v.id`,
  args: [JSON.stringify(queryEmbedding)],
});
```

The query vector must have the same type and dimension as the column. The index requires a table with a rowid or a single-column primary key.

### 5. Embedded replica

A local file serves reads; writes go to the cloud primary and are then reflected locally. Vendor status: fully supported in production; for new projects that need local writes and push/pull the docs recommend Turso Sync.

```typescript
const replica = createClient({
  url: "file:local-replica.db",
  syncUrl: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
  syncInterval: 60,            // seconds
});
await replica.sync();          // pull now
```

The replica needs a writable disk; it does not work on serverless platforms without persistent storage.

### 6. Drizzle ORM

```typescript
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { asc, lt } from "drizzle-orm";

const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  price: real("price").notNull(),
});

const orm = drizzle(db);   // db from createClient above
const cheap = await orm.select().from(products).where(lt(products.price, 50)).orderBy(asc(products.price));
```

### 7. Branch for a migration test

```bash
turso db create orders-migration-test --from-db orders-prod
turso db tokens create orders-migration-test
```

A branch is a separate copy; it needs its own token (or a group token), counts toward your database quota, and must be deleted by hand when finished. Schema changes are not merged back automatically.

## Examples

### Example 1: Move money between accounts atomically

Request: "Transfer 100 from account 7 to account 12 and log it, all or nothing."

Run the `db.batch([...], "write")` call from step 3 with `fromAccount = 7` and `toAccount = 12`. Result: both balance updates and the `transfers` row are committed together, or none of them is if any statement fails.

### Example 2: Semantic search over support articles

Request: "Store article embeddings and return the five closest articles to a question."

Create the `documents` table and index from step 4 (use the dimension your embedding model returns), insert each article with `vector32(?)`, embed the question with the same model, and run the `vector_top_k('documents_idx', vector32(?), 5)` query. Result: the five nearest articles, closest first.

## Guidelines

- Keep the database token server-side. Create a read-only or expiring token (`--read-only`, `--expiration 7d`) for anything less trusted.
- A bad dimension or vector type fails at insert time; keep the model and `F32_BLOB(n)` size in sync.
- Embedded replicas read stale data until the next sync, except for writes made by the same replica (read-your-writes).
- Branches and databases count toward plan quotas; delete test databases.
- Check the Turso docs before choosing between the libSQL and Turso Database engines for a new project.
