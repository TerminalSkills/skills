---
name: turso
category: Backend Development
tags: [database, sqlite, edge, serverless, libsql, embedded, sync]
version: 1.0.0
author: terminal-skills
---

# Turso — SQLite for Production

You are an expert in Turso, the SQLite-based database platform for production workloads. You help developers use libSQL (Turso's SQLite fork) as a primary database with features like embedded replicas (SQLite file synced from cloud), multi-region replication, vector search, branching, and edge deployment — providing sub-millisecond reads with the simplicity of SQLite and the durability of a cloud database.

## Core Capabilities

### Client Setup

```typescript
import { createClient } from "@libsql/client";

// Remote database
const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,    // libsql://my-db-org.turso.io
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

// Embedded replica (local SQLite file synced from cloud)
const db = createClient({
  url: "file:local-replica.db",            // Local file for reads
  syncUrl: process.env.TURSO_DATABASE_URL!, // Cloud for writes + sync
  authToken: process.env.TURSO_AUTH_TOKEN!,
  syncInterval: 60,                        // Sync every 60 seconds
});
await db.sync();                           // Manual sync

// Queries
const users = await db.execute("SELECT * FROM users WHERE active = 1");
console.log(users.rows);                   // [{id: 1, name: "Alice", ...}]

// Parameterized queries (safe from SQL injection)
const user = await db.execute({
  sql: "SELECT * FROM users WHERE id = ?",
  args: [userId],
});

// Insert
await db.execute({
  sql: "INSERT INTO users (name, email, created_at) VALUES (?, ?, datetime('now'))",
  args: ["Bob", "bob@example.com"],
});

// Transactions
await db.batch([
  { sql: "UPDATE accounts SET balance = balance - ? WHERE id = ?", args: [100, fromAccount] },
  { sql: "UPDATE accounts SET balance = balance + ? WHERE id = ?", args: [100, toAccount] },
  { sql: "INSERT INTO transfers (from_id, to_id, amount) VALUES (?, ?, ?)", args: [fromAccount, toAccount, 100] },
], "write");
```

### Vector Search

```typescript
// Create table with vector column
await db.execute(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    embedding F32_BLOB(1536)
  )
`);

// Insert with embedding
await db.execute({
  sql: "INSERT INTO documents (content, embedding) VALUES (?, vector32(?))",
  args: [text, JSON.stringify(embedding)],  // 1536-dim float array
});

// Vector similarity search
const similar = await db.execute({
  sql: `SELECT content, vector_distance_cos(embedding, vector32(?)) AS distance
        FROM documents
        ORDER BY distance ASC
        LIMIT 10`,
  args: [JSON.stringify(queryEmbedding)],
});
```

### Drizzle ORM Integration

```typescript
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  price: real("price").notNull(),
  category: text("category"),
});

const orm = drizzle(db);

const cheapProducts = await orm.select()
  .from(products)
  .where(lt(products.price, 50))
  .orderBy(asc(products.price));
```

## Installation

```bash
npm install @libsql/client

# CLI
brew install tursodatabase/tap/turso       # macOS
curl -sSfL https://get.tur.so/install.sh | bash  # Linux

turso db create my-app
turso db tokens create my-app              # Get auth token
```

## Best Practices

1. **Embedded replicas** — Use local SQLite file for reads (<1ms); sync from cloud; best for read-heavy apps
2. **Edge deployment** — Create replicas in multiple regions; reads are local, writes route to primary
3. **Batch transactions** — Use `db.batch()` for multi-statement transactions; atomic execution
4. **Vector search** — Use `F32_BLOB` type for embeddings; built-in cosine distance without extensions
5. **Parameterized queries** — Always use `args` for user input; never string interpolation
6. **Sync interval** — Tune `syncInterval` based on freshness needs; lower = more current, higher = less bandwidth
7. **Branching** — Use `turso db create --from-db` for dev/staging copies; test migrations safely
8. **Drizzle integration** — Use Drizzle ORM for type-safe queries; `drizzle-orm/libsql` driver available
