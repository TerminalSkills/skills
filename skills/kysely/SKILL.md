---
name: kysely
description: >-
  Write type-safe SQL with Kysely query builder. Use when a user asks to write
  raw SQL with TypeScript safety, build queries without an ORM, use a lightweight
  SQL builder, or migrate from Knex with type safety.
license: Apache-2.0
compatibility: 'Kysely 0.29, Node.js 22+, TypeScript 5.4+, PostgreSQL, MySQL, SQLite, MSSQL'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/kysely-org/kysely
  category: data-ai
  tags:
    - kysely
    - sql
    - query-builder
    - typescript
    - database
---

# Kysely

## Overview

Kysely is a type-safe TypeScript SQL query builder. Unlike ORMs, it doesn't abstract away SQL — it gives you full SQL power with TypeScript autocompletion and type checking. Every query is validated at compile time. Kysely generates SQL and hands it to your driver, nothing more.

Kysely 0.29 is ESM-only and needs Node.js 22 or newer (`engines` in its package.json) and TypeScript 5.4+. Install the driver yourself: `npm install kysely pg` (PostgreSQL), `mysql2`, `better-sqlite3`, or `tedious tarn` (MSSQL). Dialects ship in the package: `PostgresDialect`, `MysqlDialect`, `SqliteDialect`, `MssqlDialect`, `PGliteDialect`.

## Instructions

### Step 1: Define Types

```typescript
// db/types.ts — Database type definitions
import type { Generated, Insertable, Selectable, Updateable } from 'kysely'

export interface Database {
  users: UsersTable
  posts: PostsTable
}

interface UsersTable {
  id: Generated<number>
  name: string
  email: string
  created_at: Generated<Date>   // node-postgres returns timestamps as Date
}

interface PostsTable {
  id: Generated<number>
  title: string
  body: string
  author_id: number
  published: boolean
  created_at: Generated<Date>
}

// Helper types: Generated columns are optional on insert and update.
// Use ColumnType<Select, Insert, Update> for a column that differs per operation,
// e.g. ColumnType<Date, string | undefined, never> for a created_at nobody may change.
type NewUser = Insertable<UsersTable>
type UserUpdate = Updateable<UsersTable>
type User = Selectable<UsersTable>
```

To generate these interfaces from a live database instead of writing them, install `kysely-codegen` (0.20) as a dev dependency and run `npx kysely-codegen --out-file ./src/db/db.d.ts` with `DATABASE_URL` set; it reads the schema and picks the dialect from the URL.

### Step 2: Queries

```typescript
// db/queries.ts — Type-safe SQL queries
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import type { Database } from './types'

const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
})

// Select with joins — fully typed result
const postsWithAuthor = await db
  .selectFrom('posts')
  .innerJoin('users', 'users.id', 'posts.author_id')
  .select(['posts.id', 'posts.title', 'users.name as author_name'])
  .where('posts.published', '=', true)
  .orderBy('posts.created_at', 'desc')
  .limit(20)
  .execute()
// postsWithAuthor is { id: number, title: string, author_name: string }[]

// Subquery
const activeAuthors = await db
  .selectFrom('users')
  .select(['users.name', 'users.email'])
  .where('users.id', 'in',
    db.selectFrom('posts')
      .select('posts.author_id')
      .where('posts.published', '=', true)
      .groupBy('posts.author_id')
  )
  .execute()

// Insert
const newUser = await db
  .insertInto('users')
  .values({ name: 'Alice Moreau', email: 'alice.moreau@northwind.io' })
  .returningAll()
  .executeTakeFirstOrThrow()

// Transaction
await db.transaction().execute(async (trx) => {
  const user = await trx.insertInto('users')
    .values({ name: 'Bob Okafor', email: 'bob.okafor@northwind.io' })
    .returningAll()
    .executeTakeFirstOrThrow()

  await trx.insertInto('posts')
    .values({ title: 'First Post', body: 'Hello!', author_id: user.id, published: true })
    .execute()
})   // commits when the callback resolves, rolls back when it throws

// Update and delete: always add a where(); without one every row changes
await db.updateTable('users').set({ name: 'Alice M.' }).where('id', '=', newUser.id).execute()
await db.deleteFrom('posts').where('author_id', '=', newUser.id).execute()

// Count: PostgreSQL returns bigint as a string, so convert it
const { total } = await db.selectFrom('posts')
  .select((eb) => eb.fn.countAll<string>().as('total'))
  .executeTakeFirstOrThrow()
console.log(Number(total))
```

### Step 3: Migrations

Put one file per migration in a folder (`001_create_users.ts`, `002_...`; they run in name order) and run them with the `Migrator`. In 0.29 import it from `kysely/migration`; the root `kysely` export of `Migrator` and `FileMigrationProvider` is a type error (checked).

```typescript
// migrate.ts — run with: npx tsx migrate.ts
import * as path from 'node:path'
import { promises as fs } from 'node:fs'
import { Migrator, FileMigrationProvider } from 'kysely/migration'

const migrator = new Migrator({
  db,   // the Kysely instance from Step 2
  provider: new FileMigrationProvider({ fs, path, migrationFolder: path.join(process.cwd(), 'migrations') }),
})
const { error, results } = await migrator.migrateToLatest()
results?.forEach((r) => console.log(`${r.status}: ${r.migrationName}`))
if (error) { console.error(error); process.exit(1) }
await db.destroy()
```

```typescript
// migrations/001_create_users.ts
import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>) {
  await db.schema
    .createTable('users')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('email', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`).notNull())
    .execute()
}

export async function down(db: Kysely<any>) {
  await db.schema.dropTable('users').execute()
}
```

## Examples

### Example 1: Paginated posts with author names
**User prompt:** "List the 20 newest published posts with the author's name, using Kysely on our Postgres database."

The agent adds `PostsTable` and `UsersTable` to the `Database` interface, then runs the join from Step 2. The inferred type is `{ id: number; title: string; author_name: string }[]`; a typo such as `'posts.titel'` fails `tsc` before anything runs. For page 3 it adds `.limit(20).offset(40)`.

### Example 2: Add a table and apply it
**User prompt:** "Add a comments table with a foreign key to posts and run the migration."

The agent writes `migrations/002_create_comments.ts` with `db.schema.createTable('comments')`, an `integer` `post_id` column using `.references('posts.id').onDelete('cascade')`, a matching `down` that drops it, then runs `npx tsx migrate.ts`. The output is `Success: 002_create_comments`. It then adds `CommentsTable` to `Database`, or regenerates the types with `kysely-codegen`.

## Guidelines

- Kysely is a query builder, not an ORM — no relations, no lazy loading, no magic. Just SQL with types.
- Use Kysely when you want SQL control with type safety. Use Drizzle or Prisma when you want ORM features.
- Create one `Kysely` instance per process and share it; call `db.destroy()` on shutdown. Never build SQL by string concatenation: use the `sql` template tag, which keeps interpolated values as bound parameters.
- Serverless databases work through their own drivers or community dialects; check that the driver supports transactions before relying on them.
- Column names in `.select()`, `.where()` and `.orderBy()` are type-checked, but the real schema is not: keep `Database` in sync with migrations (kysely-codegen helps).
- The `Insertable`/`Updateable` types automatically make `Generated` fields optional.
