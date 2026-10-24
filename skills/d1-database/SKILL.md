---
name: d1-database
description: >-
  Cloudflare D1 is a serverless SQLite database for Cloudflare Workers. Use
  when someone asks for "Cloudflare D1", "SQLite at the edge", "database for
  Workers", "serverless SQL" or "D1 migrations". Covers wrangler setup, SQL
  migrations, queries from a Worker, Drizzle ORM, read replication and limits.
license: Apache-2.0
compatibility: "Cloudflare Workers; Node.js and Wrangler 4.x; Cloudflare account for remote databases"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["database", "cloudflare", "d1", "sqlite", "edge"]
---

# Cloudflare D1

## Overview

D1 is Cloudflare's managed SQLite database. A Worker reaches it through a binding (`env.DB`), so there are no connection strings or pools. You pay per row read and written, and an idle database costs nothing beyond storage. Each database holds up to 10 GB on the Workers Paid plan (500 MB on Free), so the intended pattern is many smaller databases (per tenant or per user) rather than one huge one. Tested with Wrangler 4.152.0 and drizzle-orm 0.45.4.

## When to Use

- A Cloudflare Worker needs relational storage
- Read-heavy apps such as blogs, content sites and APIs
- Per-tenant or per-user databases
- Not for large blobs (use R2) or for very write-heavy workloads on a single database

## Instructions

### Setup

```bash
npm install --save-dev wrangler
npx wrangler d1 create blog-db      # offers to add the binding to your Wrangler config
```

New projects use `wrangler.jsonc` (`wrangler.toml` still works). The binding looks like this; use the `database_id` printed by `d1 create`:

```jsonc
{
  "name": "blog-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-01",
  "d1_databases": [
    { "binding": "DB", "database_name": "blog-db", "database_id": "<printed by wrangler d1 create>" }
  ]
}
```

`npx wrangler types` generates `worker-configuration.d.ts` with the `Env` type. Without it, declare `interface Env { DB: D1Database }` yourself.

### Schema and migrations

```bash
npx wrangler d1 migrations create blog-db init    # creates migrations/0001_init.sql
npx wrangler d1 migrations apply blog-db --local  # local SQLite under .wrangler/state
npx wrangler d1 migrations apply blog-db --remote # the real database
npx wrangler d1 execute blog-db --local --command "SELECT count(*) FROM posts"
```

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id),
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_published_created ON posts(published, created_at);
```

SQLite has no boolean type: store `0`/`1` in an `INTEGER` column. Wrangler 4 targets the local database unless you pass `--remote`; always say which one you mean.

### Queries in a Worker

```typescript
interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/posts" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT posts.id, posts.title, posts.created_at, users.name AS author_name
         FROM posts JOIN users ON posts.author_id = users.id
         WHERE posts.published = 1
         ORDER BY posts.created_at DESC
         LIMIT ?`
      ).bind(20).all();
      return Response.json({ posts: results });
    }

    if (url.pathname === "/api/posts" && request.method === "POST") {
      const body = await request.json<{ title: string; content: string; authorId: number }>();
      const post = await env.DB.prepare(
        "INSERT INTO posts (title, content, author_id, published) VALUES (?, ?, ?, 1) RETURNING id, title"
      ).bind(body.title, body.content, body.authorId).first();
      return Response.json({ post }, { status: 201 });
    }

    return new Response("Not found", { status: 404 });
  },
};
```

Locally, `npx wrangler dev` serves the Worker against the local database. Always use `.bind()`; never concatenate user input into SQL. Use `.all()` for many rows, `.first()` for one row, `.run()` for writes without rows and `env.DB.batch([...])` to send several statements in one round trip (they run as a single transaction).

### Drizzle ORM

```bash
npm install drizzle-orm
npm install --save-dev drizzle-kit
```

```typescript
import { relations } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorId: integer("author_id").notNull().references(() => users.id),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
});

// Relations are required for db.query.*.findMany({ with: ... })
export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));
```

```typescript
import { drizzle } from "drizzle-orm/d1";
import { eq, desc } from "drizzle-orm";
import * as schema from "./db/schema";

interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = drizzle(env.DB, { schema });

    const publishedPosts = await db.query.posts.findMany({
      where: eq(schema.posts.published, true),
      with: { author: true },
      orderBy: desc(schema.posts.id),
      limit: 20,
    });

    return Response.json({ posts: publishedPosts });
  },
};
```

`drizzle-kit generate` needs a `drizzle.config.ts` (`defineConfig({ dialect: "sqlite", schema: "./src/db/schema.ts", out: "./migrations" })`) and writes SQL that `wrangler d1 migrations apply` can run. Drizzle writes each migration in its own folder in some layouts; then set `migrations_pattern` next to `migrations_dir` in the D1 binding.

### Read replication (opt-in)

Replication is off by default. Enable it per database (dashboard: database, Settings, Enable Read Replication) and use the Sessions API; without `withSession`, every query goes to the primary.

```typescript
const session = env.DB.withSession("first-unconstrained"); // or "first-primary", or a bookmark
const { results } = await session.prepare("SELECT id, title FROM posts WHERE published = 1").all();
const bookmark = session.getBookmark(); // pass to the next request to keep reads in order
```

## Examples

### Example 1: Blog API on Workers

**User prompt:** "Create a blog API with Cloudflare Workers and D1 for posts and authors."

The agent runs `wrangler d1 create blog-db`, writes `migrations/0001_init.sql` with `users` and `posts`, applies it with `--local`, implements the GET and POST handlers above, and checks them with `wrangler dev` and curl:

```console
$ curl -s -X POST localhost:8787/api/posts -H 'content-type: application/json' -d '{"title":"Edge SQL","content":"Hello","authorId":1}'
{"post":{"id":1,"title":"Edge SQL"}}
$ curl -s localhost:8787/api/posts
{"posts":[{"id":1,"title":"Edge SQL","created_at":"2026-10-24 14:43:23","author_name":"Maria Lopez"}]}
```

It applies the migration with `--remote` and deploys with `npx wrangler deploy` only after the user agrees.

### Example 2: Move a prototype to Drizzle

**User prompt:** "I wrote raw SQL against D1 and want type-safe queries."

The agent adds `src/db/schema.ts` matching the existing tables, defines the relations, switches the handlers to `drizzle(env.DB, { schema })`, and verifies that the output matches the earlier JSON.

## Guidelines

- D1 is SQLite: SQLite syntax and types; `datetime('now')` returns UTC text.
- Limits (Workers Paid / Free): 10 GB / 500 MB per database; 2 MB maximum row, string or BLOB; 100 columns per table; 100 bound parameters and 100 KB per statement; 30 s per query; 1,000 / 50 queries per Worker invocation.
- Free plan: 5 million rows read and 100,000 rows written per day, 5 GB total storage; queries fail once the daily limit is hit. Paid plan includes 25 billion reads and 50 million writes a month. Rows scanned count as reads, so add indexes for your `WHERE` and `ORDER BY` columns.
- Writes always go to the primary database. Reads are only served from replicas when read replication is enabled and the Sessions API is used.
- Time Travel restores a database to any point in the last 30 days (7 on Free): `npx wrangler d1 time-travel info blog-db`.
- Keep the API token for CI in the `CLOUDFLARE_API_TOKEN` environment variable, never in the Wrangler config.
