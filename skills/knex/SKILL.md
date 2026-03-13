---
name: knex
description: >-
  You are an expert in Knex.js, the flexible SQL query builder for Node.js
  that supports PostgreSQL, MySQL, SQLite, and MSSQL. You help developers
  write type-safe queries with a chainable API, manage database migrations and
  seeds, build complex joins and subqueries, and use transactions — providing
  direct SQL control without the overhead of a full ORM.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - query-builder
    - sql
    - database
    - migrations
    - postgres
    - mysql
    - node
---

# Knex.js — SQL Query Builder for Node.js

You are an expert in Knex.js, the flexible SQL query builder for Node.js that supports PostgreSQL, MySQL, SQLite, and MSSQL. You help developers write type-safe queries with a chainable API, manage database migrations and seeds, build complex joins and subqueries, and use transactions — providing direct SQL control without the overhead of a full ORM.

## Core Capabilities

### Query Building

```typescript
import knex from "knex";

const db = knex({
  client: "pg",
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 20 },
});

// Select with joins
const posts = await db("posts")
  .join("users", "posts.author_id", "users.id")
  .select("posts.*", "users.name as author_name")
  .where("posts.published", true)
  .orderBy("posts.created_at", "desc")
  .limit(10)
  .offset(20);

// Insert
const [user] = await db("users")
  .insert({ name: "Alice", email: "alice@example.com", role: "user" })
  .returning("*");

// Update
await db("users").where({ id: 42 }).update({ name: "Alice Updated" });

// Delete
await db("users").where({ id: 42 }).del();

// Aggregation
const stats = await db("orders")
  .select(db.raw("DATE_TRUNC('month', created_at) as month"))
  .sum("amount as total")
  .count("* as count")
  .groupByRaw("DATE_TRUNC('month', created_at)")
  .orderBy("month", "desc");

// Subquery
const activeUsers = await db("users")
  .whereIn("id", db("posts").select("author_id").where("created_at", ">", thirtyDaysAgo))
  .select("*");

// Transaction
await db.transaction(async (trx) => {
  const [order] = await trx("orders").insert({ user_id: 1, total: 99.99 }).returning("*");
  await trx("order_items").insert(items.map(i => ({ ...i, order_id: order.id })));
  await trx("users").where({ id: 1 }).decrement("balance", 99.99);
});

// Raw SQL when needed
const result = await db.raw(`
  SELECT u.*, COUNT(p.id) as post_count
  FROM users u LEFT JOIN posts p ON u.id = p.author_id
  WHERE u.created_at > ?
  GROUP BY u.id
  HAVING COUNT(p.id) > ?
`, [startDate, minPosts]);
```

### Migrations

```bash
npx knex migrate:make create_users_table
npx knex migrate:latest
npx knex migrate:rollback
npx knex seed:make seed_users
npx knex seed:run
```

```typescript
// migrations/20260101_create_users.ts
export async function up(knex) {
  await knex.schema.createTable("users", (t) => {
    t.increments("id").primary();
    t.string("name", 100).notNullable();
    t.string("email").notNullable().unique();
    t.enum("role", ["user", "admin"]).defaultTo("user");
    t.jsonb("profile").defaultTo("{}");
    t.timestamps(true, true);
  });
  await knex.schema.createTable("posts", (t) => {
    t.increments("id").primary();
    t.string("title").notNullable();
    t.text("body").notNullable();
    t.boolean("published").defaultTo(false);
    t.integer("author_id").unsigned().references("id").inTable("users").onDelete("CASCADE");
    t.timestamps(true, true);
    t.index(["author_id", "published"]);
  });
}
export async function down(knex) {
  await knex.schema.dropTable("posts");
  await knex.schema.dropTable("users");
}
```

## Installation

```bash
npm install knex pg                       # PostgreSQL
```

## Best Practices

1. **Knex over raw SQL** — Use the query builder for parameterized queries (prevents SQL injection); fall back to `knex.raw()` for complex cases
2. **Migrations for schema** — Never modify schema manually; use migrations for reproducible, version-controlled changes
3. **Transactions for consistency** — Wrap multi-table operations in `db.transaction()`; auto-rollback on error
4. **Connection pooling** — Set pool `min/max` based on expected concurrency and database connection limits
5. **Seeds for test data** — Create seed files for development/testing; separate from migrations
6. **Returning for inserts** — Use `.returning("*")` on PostgreSQL to get inserted rows without a second query
7. **Knex + TypeScript** — Use generic types: `db<User>("users")` for type-safe select results
8. **Knex as foundation** — Knex powers Objection.js and Bookshelf; learn Knex first, add ORM features as needed
