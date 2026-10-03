---
name: knex
description: >-
  Knex.js is a SQL query builder for Node.js with a chainable API, schema migrations, seeds and transactions for PostgreSQL, MySQL, MariaDB, SQLite and MSSQL. Use when writing queries without a full ORM, setting up knexfile.js and migrations, running knex migrate:latest, building joins, subqueries and transactions, or typing results with TypeScript.
license: Apache-2.0
compatibility: "Node.js 16+, knex 3.x plus one database driver (pg, mysql2, better-sqlite3, sqlite3, tedious)"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/knex/knex
  tags:
    - query-builder
    - sql
    - database
    - migrations
    - node
---

# Knex.js — SQL Query Builder for Node.js

## Overview

Knex ([knexjs.org](https://knexjs.org), `knex/knex`) builds parameterized SQL through a chainable API and ships a migration and seed CLI. It is the layer under Objection.js and Bookshelf. Checked against knex 3.3.0 (26 June 2026; 3.0 dropped Node < 16, 3.2 added migration lifecycle hooks, 3.3 added MariaDB driver support). Queries below were run against SQLite with the same builder calls.

## Instructions

### Install and connect

```bash
npm install knex pg            # PostgreSQL; other drivers: mysql2, better-sqlite3, sqlite3, tedious (MSSQL)
npx knex init -x ts            # creates knexfile.ts (use `npx knex init` for knexfile.js)
```

```typescript
import knex from "knex";

export const db = knex({
  client: "pg",
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 20 },
});
```

Use `client: "better-sqlite3"` with `useNullAsDefault: true` for SQLite. Call `await db.destroy()` when a script finishes, or the process hangs on the open pool.

### Queries

```typescript
interface User { id: number; name: string; email: string; role: string }

const posts = await db("posts")
  .join("users", "posts.author_id", "users.id")
  .select("posts.*", "users.name as author_name")
  .where("posts.published", true)
  .orderBy("posts.created_at", "desc")
  .limit(10).offset(20);

const [user] = await db<User>("users")
  .insert({ name: "Alice Morgan", email: "alice.morgan@northwind.io" })
  .returning("*");                              // PostgreSQL, SQLite 3.35+, MSSQL; not MySQL

await db("users").where({ id: user.id }).update({ name: "Alice M." });
await db("users").where({ id: user.id }).del();

const recent = await db("users")
  .whereIn("id", db("posts").select("author_id").where("created_at", ">", thirtyDaysAgo));

const monthly = await db("orders")
  .select(db.raw("DATE_TRUNC('month', created_at) as month"))   // PostgreSQL function
  .sum("amount as total").count("* as orders")
  .groupByRaw("DATE_TRUNC('month', created_at)")
  .orderBy("month", "desc");
```

`db<User>("users")` types the result rows. On PostgreSQL `count` and `sum` come back as strings (bigint/numeric); cast in the query or in code. `db.raw(sql, [values])` returns the driver's native result (for `pg`, read `result.rows`). Inspect SQL with `.toQuery()` or `.toSQL()`.

### Transactions

```typescript
await db.transaction(async (trx) => {
  const [order] = await trx("orders").insert({ user_id: 1, total: 99.99 }).returning("*");
  await trx("order_items").insert(items.map((i) => ({ ...i, order_id: order.id })));
  await trx("users").where({ id: 1 }).decrement("balance", 99.99);
});   // commits when the callback resolves, rolls back when it throws
```

Every statement inside must use `trx`, not `db`, or it runs outside the transaction.

### Migrations and seeds

```bash
npx knex migrate:make create_users_table -x ts   # timestamped file in ./migrations
npx knex migrate:latest                          # run all pending
npx knex migrate:status                          # list applied / pending
npx knex migrate:rollback                        # undo the last batch
npx knex seed:make seed_users && npx knex seed:run
npx knex migrate:latest --env production         # pick a knexfile environment
```

```typescript
// migrations/20261002120000_create_users_table.ts
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (t) => {
    t.increments("id");
    t.string("name", 100).notNullable();
    t.string("email").notNullable().unique();
    t.enu("role", ["user", "admin"]).defaultTo("user");
    t.timestamps(true, true);                    // created_at / updated_at defaulting to now
  });
  await knex.schema.createTable("posts", (t) => {
    t.increments("id");
    t.string("title").notNullable();
    t.boolean("published").defaultTo(false);
    t.integer("author_id").unsigned().references("id").inTable("users").onDelete("CASCADE");
    t.index(["author_id", "published"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("posts");
  await knex.schema.dropTable("users");
}
```

TypeScript migrations need a loader the CLI can find: install `tsx` and run `NODE_OPTIONS="--import tsx" npx knex migrate:latest` (ts-node also works), and set `migrations: { extension: "ts" }` in the knexfile. Confirmed with tsx on Node 24.

## Examples

### Example 1: "Add a users table and apply it"

```bash
npm install knex pg
npx knex init -x ts
npx knex migrate:make create_users_table -x ts
# paste the up/down functions above, then
NODE_OPTIONS="--import tsx" npx knex migrate:latest
```

Output: `Batch 1 run: 1 migrations`. `migrate:status` then lists `20261002120000_create_users_table.ts` as completed.

### Example 2: "Move money between two accounts atomically"

```typescript
await db.transaction(async (trx) => {
  const { balance } = await trx("accounts").where({ id: 7 }).forUpdate().first();
  if (balance < 250) throw new Error("insufficient funds");   // triggers rollback
  await trx("accounts").where({ id: 7 }).decrement("balance", 250);
  await trx("accounts").where({ id: 12 }).increment("balance", 250);
});
```

Either both updates persist or neither does. `forUpdate()` locks the row on PostgreSQL and MySQL.

## Guidelines

- Pass user input as bindings (`where({ email })`, `raw("... ?", [value])`), never by string concatenation. Identifiers in `raw` need `??`.
- Change schema only through migrations; never edit a migration that has already run in shared environments, add a new one.
- Keep one `knex` instance per process; a new pool per request exhausts connections.
- Match `pool.max` to the database's connection limit divided by app instances.
- Knex does not map rows to classes or manage relations; use Objection.js or an ORM if you need that.
- MySQL has no `returning`; read `insertId` from the result instead.
