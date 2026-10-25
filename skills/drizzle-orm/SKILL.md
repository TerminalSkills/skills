---
name: drizzle-orm
description: >-
  Drizzle ORM is a lightweight, type-safe TypeScript ORM whose query builder maps directly to SQL, with a companion CLI (drizzle-kit) that generates and applies migrations. Use when a user asks to define a database schema in TypeScript, write typed Postgres, MySQL or SQLite queries, run drizzle-kit generate, migrate or push, or connect Drizzle to Neon, Turso, Cloudflare D1, PGlite or node-postgres.
license: Apache-2.0
compatibility: "Node.js 18+ or Bun, TypeScript 5+. drizzle-orm 0.45.x and drizzle-kit 0.31.x (stable); a v1 release candidate exists on the rc tag."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "orm, typescript, sql, postgres, migrations"
  repository: https://github.com/drizzle-team/drizzle-orm
---

# Drizzle ORM — TypeScript SQL That Feels Like SQL

## Overview

Drizzle is a TypeScript ORM with no runtime query engine: the schema is plain TypeScript, queries compile to SQL strings, and result types are inferred from the schema. It supports PostgreSQL, MySQL, SQLite and SingleStore families, including serverless drivers (Neon, Turso/libSQL, Cloudflare D1, PGlite). Two query styles exist side by side: the SQL-like builder (`db.select().from()`) and the relational API (`db.query.users.findMany({ with })`).

`drizzle-orm` (runtime) and `drizzle-kit` (CLI for migrations and Studio) are versioned separately. This skill covers the stable line, `drizzle-orm@0.45` and `drizzle-kit@0.31`. A 1.0 release candidate is published under the `rc` npm tag (it changes the relational API, "RQB v2"); do not install it unless the project already uses it.

## Instructions

### Install

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit tsx @types/pg
# other drivers: mysql2, better-sqlite3, @libsql/client, @neondatabase/serverless, @electric-sql/pglite
```

### Schema

Column names can be omitted when `casing` is set (camelCase key becomes snake_case column). Index and constraint callbacks return an **array**; the older object-returning form is deprecated.

```typescript
// src/schema.ts
import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull(),
  role: varchar({ length: 20 }).notNull().default("user"),
  metadata: jsonb().$type<{ plan: string; seats: number }>(),
  createdAt: timestamp().defaultNow().notNull(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export const posts = pgTable("posts", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: varchar({ length: 500 }).notNull(),
  content: text(),
  published: boolean().default(false).notNull(),
  authorId: uuid().references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp().defaultNow().notNull(),
}, (t) => [
  index("posts_author_idx").on(t.authorId),
  index("posts_published_idx").on(t.published, t.createdAt),
]);

// Relations are only needed for db.query (relational API)
export const usersRelations = relations(users, ({ many }) => ({ posts: many(posts) }));
export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Connect

`drizzle()` accepts a connection string, or an object with `client`/`connection`. Pass `schema` to enable `db.query`, and the same `casing` as in the config.

```typescript
// src/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export const db = drizzle(process.env.DATABASE_URL!, { schema, casing: "snake_case" });
// existing pool: drizzle({ client: pool, schema, casing: "snake_case" })
```

Driver import paths: `drizzle-orm/node-postgres`, `postgres-js`, `neon-http`, `neon-serverless`, `mysql2`, `better-sqlite3`, `libsql`, `d1`, `pglite`, `bun-sql`.

### Queries

```typescript
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { posts, users } from "./schema";

const recent = await db.select().from(posts)
  .where(and(eq(posts.published, true), gte(posts.createdAt, new Date("2026-01-01"))))
  .orderBy(desc(posts.createdAt)).limit(20);

const withAuthors = await db.select({ title: posts.title, author: users.name })
  .from(posts).innerJoin(users, eq(posts.authorId, users.id));

// Relational API (needs schema passed to drizzle())
const admins = await db.query.users.findMany({
  where: eq(users.role, "admin"),
  with: { posts: { where: eq(posts.published, true), limit: 5 } },
});

const [created] = await db.insert(users).values({ name: "Alice Novak", email: "alice@novak.dev" }).returning();

await db.insert(users).values({ name: "Alice Novak", email: "alice@novak.dev" })
  .onConflictDoUpdate({ target: users.email, set: { name: "Alice N." } });

const [stats] = await db.select({
  total: count(),
  published: count(sql`CASE WHEN ${posts.published} THEN 1 END`),
}).from(posts);

await db.transaction(async (tx) => {
  await tx.update(posts).set({ published: true }).where(eq(posts.title, "Draft"));
});

// Prepared statement with a named placeholder
const byAuthor = db.select().from(posts).where(eq(posts.authorId, sql.placeholder("authorId"))).prepare("posts_by_author");
await byAuthor.execute({ authorId: created.id });
```

### Migrations with drizzle-kit

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",          // postgresql | mysql | sqlite | turso | singlestore
  schema: "./src/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

```bash
npx drizzle-kit generate   # diff schema against the last snapshot, write SQL to ./drizzle
npx drizzle-kit migrate    # apply pending SQL files to the database
npx drizzle-kit push       # sync the schema straight to the database, no files (prototyping)
npx drizzle-kit pull       # introspect an existing database into a schema.ts
npx drizzle-kit check      # detect conflicting migrations (after merging branches)
npx drizzle-kit studio     # browse data in a local web UI
```

To apply migrations from application code (serverless, tests) use the driver's migrator, for example `import { migrate } from "drizzle-orm/node-postgres/migrator"; await migrate(db, { migrationsFolder: "./drizzle" });`.

## Examples

### Example 1: Add a table and ship the migration

Request: "Add a comments table linked to posts and create the migration."

Add to `src/schema.ts`:

```typescript
export const comments = pgTable("comments", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  postId: integer().references(() => posts.id, { onDelete: "cascade" }).notNull(),
  body: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
}, (t) => [index("comments_post_idx").on(t.postId)]);
```

```bash
npx drizzle-kit generate --name add_comments
npx drizzle-kit migrate
```

Result: `drizzle/0001_add_comments.sql` contains `CREATE TABLE "comments" ...` plus the foreign key and index, and `migrate` applies it. Commit the SQL file and the `drizzle/meta` snapshot together.

### Example 2: Typed query for a dashboard

Request: "Show each author with their count of published posts, most active first."

```typescript
const rows = await db
  .select({ author: users.name, published: count(posts.id) })
  .from(users)
  .leftJoin(posts, and(eq(posts.authorId, users.id), eq(posts.published, true)))
  .groupBy(users.id)
  .orderBy(desc(count(posts.id)));
// [{ author: "Alice N.", published: 1 }, ...]  typed as { author: string; published: number }[]
```

## Guidelines

- Use `generate` + `migrate` for anything shared or deployed; `push` skips migration files and can drop data when a column changes, so keep it for local prototypes.
- `db.query` works only when `schema` is passed to `drizzle()` and the `relations()` are exported from that module; the SQL-builder needs neither.
- Keep `casing` identical in `drizzle()` and `drizzle.config.ts`, otherwise generated column names and runtime queries disagree.
- Prefer the array form for index callbacks and `generatedAlwaysAsIdentity()` over `serial` in new Postgres schemas.
- Do not mix the 0.x and 1.0-rc packages: `drizzle-orm` and `drizzle-kit` must come from the same line.
- Edge runtimes need an HTTP/WebSocket driver (`neon-http`, `libsql`, `d1`), not `pg` over TCP.
- Keep `DATABASE_URL` in the environment; never commit it or put it in `drizzle.config.ts` literally.
