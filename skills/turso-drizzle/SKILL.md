---
name: turso-drizzle
description: >-
  Turso + Drizzle ORM — type-safe SQLite at the edge with replication. Use
  when building edge-compatible applications with type-safe SQL, SQLite in
  production, multi-region databases, or Cloudflare Workers with a managed DB.
  Covers Turso setup, Drizzle schema definition, migrations with drizzle-kit,
  and edge deployment patterns.
license: Apache-2.0
compatibility: "drizzle-orm 0.x, drizzle-kit 0.x, @libsql/client 0.x. Node.js 18+, Bun, Cloudflare Workers."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: database
  tags: ["turso", "drizzle", "sqlite", "edge", "orm", "type-safe"]
  use-cases:
    - "Set up a type-safe SQLite database with Turso and Drizzle ORM"
    - "Run SQLite in production on Cloudflare Workers with Turso replication"
    - "Define a Drizzle schema and generate migrations for a Turso database"
    - "Query a Turso database with fully typed Drizzle queries"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Turso + Drizzle ORM

## Overview

Turso is a globally distributed SQLite database (powered by libSQL) with low-latency reads via edge replicas. Drizzle ORM is a lightweight, type-safe SQL query builder and ORM for TypeScript. Together they enable type-safe, edge-compatible SQLite in production.

## Installation

```bash
npm install drizzle-orm @libsql/client
npm install -D drizzle-kit

# or Bun
bun add drizzle-orm @libsql/client
bun add -d drizzle-kit
```

## Turso Setup

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Authenticate
turso auth login

# Create a database
turso db create my-app

# Get the database URL
turso db show my-app --url
# libsql://my-app-yourname.turso.io

# Create an auth token
turso db tokens create my-app
# eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
```

Store credentials in `.env`:

```bash
TURSO_DATABASE_URL=libsql://my-app-yourname.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
```

## Database Client

```typescript
// src/db/client.ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
```

## Schema Definition

```typescript
// src/db/schema.ts
import { integer, sqliteTable, text, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Users table
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["admin", "user", "guest"] }).notNull().default("user"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Posts table
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  body: text("body").notNull().default(""),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Comments table
export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Relations (for joins)
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

// Export inferred types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
```

## drizzle-kit Configuration

```typescript
// drizzle.config.ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
} satisfies Config;
```

## Migrations

```bash
# Generate migration files from schema changes
npx drizzle-kit generate

# Apply migrations to the database
npx drizzle-kit migrate

# Push schema directly (dev only — no migration files)
npx drizzle-kit push

# Open Drizzle Studio (visual DB browser)
npx drizzle-kit studio
```

## Queries

### Insert

```typescript
import { db } from "./db/client";
import { users, posts } from "./db/schema";

// Insert single row
const [user] = await db
  .insert(users)
  .values({ name: "Alice", email: "alice@example.com" })
  .returning();

// Insert multiple rows
await db.insert(users).values([
  { name: "Bob", email: "bob@example.com" },
  { name: "Carol", email: "carol@example.com" },
]);

// Upsert (insert or update)
await db
  .insert(users)
  .values({ name: "Alice", email: "alice@example.com" })
  .onConflictDoUpdate({
    target: users.email,
    set: { name: "Alice Updated" },
  });
```

### Select

```typescript
import { eq, and, or, like, desc, count } from "drizzle-orm";

// Select all
const allUsers = await db.select().from(users);

// With condition
const admins = await db
  .select()
  .from(users)
  .where(eq(users.role, "admin"));

// Multiple conditions
const activeAdmins = await db
  .select({ id: users.id, name: users.name })
  .from(users)
  .where(and(eq(users.role, "admin"), like(users.email, "%@company.com")))
  .orderBy(desc(users.createdAt))
  .limit(10);

// Count
const [{ total }] = await db
  .select({ total: count() })
  .from(users);
```

### Join

```typescript
// Inner join
const postsWithAuthors = await db
  .select({
    postId: posts.id,
    title: posts.title,
    authorName: users.name,
  })
  .from(posts)
  .innerJoin(users, eq(posts.authorId, users.id))
  .where(eq(posts.published, true))
  .orderBy(desc(posts.createdAt));

// With relations (using query API)
const usersWithPosts = await db.query.users.findMany({
  with: {
    posts: {
      where: eq(posts.published, true),
      orderBy: desc(posts.createdAt),
    },
  },
});
```

### Update and Delete

```typescript
import { eq } from "drizzle-orm";

// Update
const [updated] = await db
  .update(users)
  .set({ role: "admin" })
  .where(eq(users.id, 1))
  .returning();

// Delete
await db.delete(posts).where(eq(posts.authorId, 1));
```

## Cloudflare Workers Pattern

In Cloudflare Workers, create the client per request (no persistent connections):

```typescript
// src/index.ts
import { Hono } from "hono";
import { createClient } from "@libsql/client/http"; // Use HTTP client for edge
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./db/schema";
import { eq } from "drizzle-orm";

type Env = {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
};

const app = new Hono<{ Bindings: Env }>();

// Middleware: attach db to context
app.use("*", async (c, next) => {
  const client = createClient({
    url: c.env.TURSO_DATABASE_URL,
    authToken: c.env.TURSO_AUTH_TOKEN,
  });
  c.set("db", drizzle(client, { schema }));
  await next();
});

app.get("/users", async (c) => {
  const db = c.get("db");
  const allUsers = await db.select().from(schema.users);
  return c.json({ users: allUsers });
});

app.get("/users/:id", async (c) => {
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id));

  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json({ user });
});

export default app;
```

```toml
# wrangler.toml
name = "my-api"
main = "src/index.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[vars]
TURSO_DATABASE_URL = "libsql://my-app-yourname.turso.io"
# Set TURSO_AUTH_TOKEN via: wrangler secret put TURSO_AUTH_TOKEN
```

## Embedded Replica Pattern

For maximum read performance with Turso:

```typescript
// src/db/client.ts — Node.js / Bun only (not edge)
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const client = createClient({
  url: "file:./local-replica.db",
  syncUrl: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
  syncInterval: 60, // Sync every 60s
});

// Initial sync on startup
await client.sync();

export const db = drizzle(client, { schema });
```

## Guidelines

- Use `drizzle-orm/libsql` adapter for both local SQLite and Turso cloud.
- Use `@libsql/client/http` (not the default) on Cloudflare Workers — native bindings are not supported.
- Always use `.returning()` after insert/update to get the created/updated row.
- Define `relations()` for clean join queries with the Drizzle query API.
- Run `drizzle-kit generate` then `drizzle-kit migrate` for production migrations — never `push` in production.
- Store `TURSO_AUTH_TOKEN` as a secret (`wrangler secret put`) — never in `wrangler.toml`.
- Use embedded replicas for Node.js/Bun apps that need fast reads with global replication.
- Export `$inferSelect` and `$inferInsert` types from the schema for use in application code.
