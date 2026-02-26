---
name: drizzle-kit
description: >-
  Manage database migrations and schema with Drizzle Kit. Use when someone asks
  to "run database migrations", "generate migration files", "push schema to
  database", "introspect existing database", "set up Drizzle migrations",
  "manage database schema changes", or "use drizzle-kit". Covers drizzle-kit
  push, generate, migrate, introspect, studio, and schema-first workflows
  for Postgres, MySQL, and SQLite.
license: Apache-2.0
compatibility: "Node.js 18+ or Bun. drizzle-orm + drizzle-kit packages."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["database", "migrations", "schema", "drizzle", "postgres"]
---

# Drizzle Kit

## Overview

Drizzle Kit is the migration and schema management CLI for Drizzle ORM. Define your schema in TypeScript, generate SQL migrations automatically, push schema changes directly to dev databases, introspect existing databases into Drizzle schema, and browse data with Drizzle Studio.

## When to Use

- Managing database schema changes and migrations in a TypeScript project
- Need to generate SQL migration files from schema changes
- Quick schema push to dev/staging without migration files
- Introspecting an existing database to generate Drizzle schema
- Browsing and editing data visually with Drizzle Studio

## Instructions

### Setup

```bash
# Install both ORM and Kit
npm install drizzle-orm
npm install -D drizzle-kit

# Create config
touch drizzle.config.ts
```

```typescript
// drizzle.config.ts — Configuration for Drizzle Kit
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",           // "postgresql" | "mysql" | "sqlite"
  schema: "./src/db/schema.ts",    // Path to your schema file(s)
  out: "./drizzle",                // Migration output directory
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,                   // Log SQL statements
  strict: true,                    // Require confirmation for destructive changes
});
```

### Define Schema

```typescript
// src/db/schema.ts — Database schema defined in TypeScript
/**
 * Schema-first approach: define tables here, Drizzle Kit
 * generates migrations from changes. Types are inferred
 * automatically — no separate type definitions needed.
 */
import { pgTable, uuid, text, timestamp, integer, boolean, index, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["user", "admin", "moderator"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: roleEnum("role").default("user").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ([
  index("users_email_idx").on(table.email),
]));

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  published: boolean("published").default(false).notNull(),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  viewCount: integer("view_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ([
  index("posts_author_idx").on(table.authorId),
  index("posts_published_idx").on(table.published),
]));

// Relations (for query builder, not SQL)
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));
```

### Commands

```bash
# Generate migration from schema changes
npx drizzle-kit generate
# Output: drizzle/0001_add_posts_table.sql

# Apply migrations to database
npx drizzle-kit migrate

# Push schema directly (dev only — no migration file)
npx drizzle-kit push

# Introspect existing database → generate schema
npx drizzle-kit introspect

# Open Drizzle Studio (visual data browser)
npx drizzle-kit studio
```

### Migration Workflow

```bash
# 1. Edit schema.ts (add column, table, index)
# 2. Generate migration
npx drizzle-kit generate

# 3. Review the generated SQL
cat drizzle/0002_add_view_count.sql

# 4. Apply to dev database
npx drizzle-kit migrate

# 5. Commit migration files
git add drizzle/ src/db/schema.ts
git commit -m "Add view_count to posts"
```

### Custom Migration (Data Migration)

```typescript
// drizzle/custom/0003_backfill_view_counts.ts
/**
 * Custom migration for data backfill.
 * Run with: npx tsx drizzle/custom/0003_backfill_view_counts.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { posts } from "../../src/db/schema";
import { sql } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function migrate() {
  // Backfill view_count from analytics table
  await db.execute(sql`
    UPDATE posts SET view_count = COALESCE(
      (SELECT count FROM analytics WHERE analytics.post_id = posts.id), 0
    )
  `);

  console.log("✅ Backfilled view counts");
  await client.end();
}

migrate();
```

### Multi-Schema Setup

```typescript
// drizzle.config.ts — Multiple schema files
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/db/schema/users.ts",
    "./src/db/schema/posts.ts",
    "./src/db/schema/billing.ts",
  ],
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

## Examples

### Example 1: Set up migrations for a new project

**User prompt:** "I'm starting a new SaaS with Postgres. Set up Drizzle with schema and migrations."

The agent will create drizzle.config.ts, define schema with users/teams/subscriptions tables, generate the initial migration, and show how to apply it.

### Example 2: Introspect an existing database

**User prompt:** "I have an existing Postgres database. Generate Drizzle schema from it."

The agent will run `drizzle-kit introspect` to generate TypeScript schema matching the existing tables, then review and adjust the output.

## Guidelines

- **`generate` for production, `push` for development** — generate creates migration files for version control; push applies directly
- **Always review generated SQL** — check destructive changes before applying
- **Use `strict: true`** — Drizzle Kit will ask for confirmation on column drops or type changes
- **Commit migration files** — they're part of your codebase, like code
- **One schema file per domain** — users.ts, billing.ts, content.ts keeps things organized
- **Relations are separate** — define them after tables for circular reference support
- **Index naming matters** — use descriptive names for debugging query plans
- **Custom migrations for data** — Drizzle Kit handles schema; write scripts for data migrations
- **Studio for debugging** — `drizzle-kit studio` lets you browse and edit data without SQL
