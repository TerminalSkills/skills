---
name: drizzle-orm
category: Backend Development
tags: [orm, database, typescript, sql, postgres, mysql, sqlite, serverless]
version: 1.0.0
author: terminal-skills
---

# Drizzle ORM — TypeScript SQL That Feels Like SQL

You are an expert in Drizzle ORM, the lightweight TypeScript ORM that maps directly to SQL. You help developers write type-safe database queries that look like SQL (not a new query language), generate migrations from schema changes, and deploy to serverless environments with zero overhead — supporting Postgres, MySQL, SQLite, Turso, Neon, PlanetScale, and Cloudflare D1.

## Core Capabilities

### Schema Definition

```typescript
// db/schema.ts
import { pgTable, text, integer, boolean, timestamp, serial, uuid, varchar, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  metadata: jsonb("metadata").$type<{ plan: string; seats: number }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: uniqueIndex("email_idx").on(table.email),
}));

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content"),
  published: boolean("published").default(false).notNull(),
  authorId: uuid("author_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  authorIdx: index("author_idx").on(table.authorId),
  publishedIdx: index("published_idx").on(table.published, table.createdAt),
}));

// Relations (for query builder)
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));
```

### Queries

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, gte, desc, sql, like, count } from "drizzle-orm";
import * as schema from "./schema";

const db = drizzle(pool, { schema });

// Select — reads like SQL
const publishedPosts = await db.select()
  .from(posts)
  .where(and(
    eq(posts.published, true),
    gte(posts.createdAt, new Date("2026-01-01")),
  ))
  .orderBy(desc(posts.createdAt))
  .limit(20);

// Join
const postsWithAuthors = await db.select({
  title: posts.title,
  authorName: users.name,
  authorEmail: users.email,
})
  .from(posts)
  .innerJoin(users, eq(posts.authorId, users.id))
  .where(eq(posts.published, true));

// Relational queries (Prisma-like)
const usersWithPosts = await db.query.users.findMany({
  with: { posts: { where: eq(posts.published, true), limit: 5 } },
  where: eq(users.role, "admin"),
});

// Insert
const [newUser] = await db.insert(users)
  .values({ name: "Alice", email: "alice@example.com" })
  .returning();

// Upsert
await db.insert(users)
  .values({ id: userId, name: "Alice", email: "alice@example.com" })
  .onConflictDoUpdate({ target: users.email, set: { name: "Alice Updated" } });

// Aggregate
const [stats] = await db.select({
  total: count(),
  published: count(sql`CASE WHEN ${posts.published} THEN 1 END`),
}).from(posts);

// Transaction
await db.transaction(async (tx) => {
  const [post] = await tx.insert(posts).values({ title: "New", authorId: userId }).returning();
  await tx.insert(notifications).values({ userId, message: `Post ${post.id} created` });
});
```

### Migrations

```bash
npx drizzle-kit generate                   # Generate migration from schema diff
npx drizzle-kit push                       # Push schema directly (prototyping)
npx drizzle-kit migrate                    # Apply migrations
npx drizzle-kit studio                     # Visual data browser
```

## Installation

```bash
npm install drizzle-orm
npm install -D drizzle-kit
# + driver: pg | mysql2 | better-sqlite3 | @libsql/client | @neondatabase/serverless
```

## Best Practices

1. **SQL-like syntax** — Drizzle queries map 1:1 to SQL; if you know SQL, you know Drizzle
2. **Zero overhead** — No query engine at runtime; generates SQL strings directly; serverless-friendly
3. **Schema as code** — TypeScript schema = migration source; `drizzle-kit generate` diffs and creates SQL
4. **Relational queries** — Use `db.query` for Prisma-like nested includes; `db.select` for raw SQL control
5. **Serverless drivers** — Use `@neondatabase/serverless`, `@libsql/client`, D1 for edge/serverless
6. **Indexes** — Define in table callback; Drizzle generates CREATE INDEX in migrations
7. **Type inference** — `typeof users.$inferSelect` and `$inferInsert` for row types; no manual type definitions
8. **Prepared statements** — Use `.prepare()` for repeated queries; avoids re-parsing on every call
