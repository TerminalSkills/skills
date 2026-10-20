---
name: turso-drizzle
description: >-
  Turso is a hosted SQLite-compatible (libSQL) database and Drizzle ORM is a
  type-safe TypeScript query builder; together they give typed SQLite in
  production. Use when setting up Turso with Drizzle, defining a Drizzle SQLite
  schema, running drizzle-kit migrations against a Turso database, connecting
  from Cloudflare Workers or other edge runtimes, or reading from an embedded
  replica.
license: Apache-2.0
compatibility: "drizzle-orm 0.45, drizzle-kit 0.31, @libsql/client 0.18. Node.js 18+, Bun, Cloudflare Workers."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/drizzle-team/drizzle-orm
  tags: ["turso", "drizzle", "sqlite", "libsql", "edge"]
---

# Turso + Drizzle ORM

## Overview

Turso is a managed database built on libSQL (a SQLite fork) that you reach over `libsql://` URLs with an auth token. Drizzle ORM talks to it through the `@libsql/client` driver and the `drizzle-orm/libsql` adapter; `drizzle-kit` generates and applies migrations. Checked against drizzle-orm 0.45.4, drizzle-kit 0.31.11 and @libsql/client 0.18.0 (October 2026); Drizzle 1.0 is only on the `beta` and `rc` tags (not `latest`), so pin the stable 0.x line unless the user asks for the beta.

Turso's own newer engine ships separate packages (`@tursodatabase/database`, `@tursodatabase/sync`, `@tursodatabase/serverless`). For a remote libSQL database with an ORM, Turso's docs still point to `@libsql/client`, which is what this skill uses.

## Instructions

### Install

```bash
npm install drizzle-orm @libsql/client
npm install -D drizzle-kit tsx
```

### Create the database (Turso CLI)

```bash
brew install tursodatabase/tap/turso      # macOS; Linux: use the install script from docs.turso.tech/cli/installation
turso auth login
turso db create orders-prod
turso db show orders-prod --url           # libsql://orders-prod-<org>.turso.io
turso db tokens create orders-prod        # prints the auth token
```

On Linux the docs offer `curl -sSfL https://get.tur.so/install.sh`; download and read the script before running it rather than piping it into a shell. Put the values in `.env` (never commit it):

```bash
TURSO_DATABASE_URL=libsql://orders-prod-acmeshop.turso.io
TURSO_AUTH_TOKEN=paste-the-output-of-turso-db-tokens-create
```

### Client

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
// equivalent shorthand: drizzle({ connection: { url, authToken }, schema })
```

`TURSO_DATABASE_URL=file:local.db` works with the same code for local development and tests, with no token.

### Schema

```typescript
// src/db/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["admin", "user", "guest"] }).notNull().default("user"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const usersRelations = relations(users, ({ many }) => ({ posts: many(posts) }));
export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

SQLite has no native boolean or date type: `mode: "boolean"` and `mode: "timestamp"` map them onto integers (timestamps are stored in seconds).

### drizzle-kit and migrations

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
```

drizzle-kit does not read `.env` by itself: export the variables, use `node --env-file=.env`, or import `dotenv/config` at the top of the config.

```bash
npx drizzle-kit generate   # write SQL migration files from schema changes
npx drizzle-kit migrate    # apply them to the database
npx drizzle-kit push       # sync schema directly, no files (development only)
npx drizzle-kit studio     # browse data in Drizzle Studio
```

### Queries

```typescript
import { and, count, desc, eq, like } from "drizzle-orm";
import { db } from "./db/client";
import { posts, users } from "./db/schema";

const [author] = await db
  .insert(users)
  .values({ name: "Alice Novak", email: "alice@acmeshop.dev" })
  .returning();

await db.insert(users)
  .values({ name: "Alice Novak", email: "alice@acmeshop.dev" })
  .onConflictDoUpdate({ target: users.email, set: { name: "Alice N." } });

const admins = await db
  .select({ id: users.id, name: users.name })
  .from(users)
  .where(and(eq(users.role, "admin"), like(users.email, "%@acmeshop.dev")))
  .orderBy(desc(users.createdAt))
  .limit(10);

const [{ total }] = await db.select({ total: count() }).from(users);

const feed = await db
  .select({ title: posts.title, authorName: users.name })
  .from(posts)
  .innerJoin(users, eq(posts.authorId, users.id))
  .where(eq(posts.published, true));

// relational query API (needs `schema` passed to drizzle())
const usersWithPosts = await db.query.users.findMany({
  with: { posts: { where: eq(posts.published, true), orderBy: desc(posts.createdAt) } },
});

await db.update(users).set({ role: "admin" }).where(eq(users.id, author.id));
await db.delete(posts).where(eq(posts.authorId, author.id));
```

Batch several statements into one round trip (one transaction) with `db.batch([...])`, which matters on a network database.

### Cloudflare Workers and other edge runtimes

Import the client from `@libsql/client/web` (no native bindings, no `file:` URLs), and read credentials from the Worker bindings:

```typescript
// src/index.ts
import { Hono } from "hono";
import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./db/schema";

type Env = { TURSO_DATABASE_URL: string; TURSO_AUTH_TOKEN: string };

const app = new Hono<{ Bindings: Env }>();

app.get("/users", async (c) => {
  const db = drizzle(
    createClient({ url: c.env.TURSO_DATABASE_URL, authToken: c.env.TURSO_AUTH_TOKEN }),
    { schema },
  );
  return c.json({ users: await db.select().from(schema.users) });
});

export default app;
```

```jsonc
// wrangler.jsonc
{ "name": "orders-api", "main": "src/index.ts", "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "vars": { "TURSO_DATABASE_URL": "libsql://orders-prod-acmeshop.turso.io" } }
```

Set the token with `npx wrangler secret put TURSO_AUTH_TOKEN`.

### Embedded replica (Node.js or Bun on a long-running server)

```typescript
const client = createClient({
  url: "file:./local-replica.db",
  syncUrl: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
  syncInterval: 60,
});
await client.sync();
export const db = drizzle(client, { schema });
```

Reads are served from the local file; writes go to the cloud primary. It needs a persistent writable disk, so it does not suit serverless or edge functions. For new projects that need sync, Turso's docs now recommend Turso Sync (`@tursodatabase/sync`) over embedded replicas.

## Examples

### Example 1: Add Turso to an existing Hono API

**Request:** "Our API uses an in-memory array for users. Move it to Turso with Drizzle."

Install the packages, create `orders-prod` with the CLI, add the schema above, run `npx drizzle-kit generate && npx drizzle-kit migrate`, and replace the array with `db.select().from(users)` and `db.insert(users).values(body).returning()`. Result: a `drizzle/0000_*.sql` migration, tables in Turso, and typed rows (`User[]`) in the handlers.

### Example 2: Develop locally, deploy to Turso

**Request:** "I want tests against a local SQLite file and production on Turso."

Set `TURSO_DATABASE_URL=file:test.db` in `.env.test` and keep the code unchanged; run `npx drizzle-kit migrate` with each env. Result: identical queries run against the file in tests and against `libsql://` in production.

## Guidelines

- Use `generate` then `migrate` for production; `push` can drop columns and skips the migration history.
- Keep the auth token in a secret store (`wrangler secret put`, CI secrets), never in `wrangler.jsonc` or git. Create separate tokens per environment; tokens can be given read-only access (`--read-only`).
- Edge runtimes need `@libsql/client/web`; the default import loads native code that Workers cannot run.
- Always use `.returning()` to get inserted or updated rows back.
- Turso is not a place for heavy concurrent writes to one hot table; one primary handles all writes.
- `@libsql/client` tracks libSQL; if the user asks for the new Turso Database engine, follow Turso's docs for those packages instead.
