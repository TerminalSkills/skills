---
name: kysely
description: >-
  Write type-safe SQL with Kysely query builder. Use when a user asks to write
  raw SQL with TypeScript safety, build queries without an ORM, use a lightweight
  SQL builder, or migrate from Knex with type safety.
license: Apache-2.0
compatibility: 'PostgreSQL, MySQL, SQLite, MSSQL'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: database
  tags:
    - kysely
    - sql
    - query-builder
    - typescript
    - database
---

# Kysely

## Overview

Kysely is a type-safe TypeScript SQL query builder. Unlike ORMs, it doesn't abstract away SQL — it gives you full SQL power with TypeScript autocompletion and type checking. Every query is validated at compile time. Zero overhead: Kysely generates SQL strings, nothing more.

## Instructions

### Step 1: Define Types

```typescript
// db/types.ts — Database type definitions
import { Generated, Insertable, Selectable, Updateable } from 'kysely'

interface Database {
  users: UsersTable
  posts: PostsTable
  comments: CommentsTable
}

interface UsersTable {
  id: Generated<number>
  name: string
  email: string
  created_at: Generated<Date>
}

interface PostsTable {
  id: Generated<number>
  title: string
  body: string
  author_id: number
  published: boolean
  created_at: Generated<Date>
}

// Helper types for insert/update (Generated fields are optional)
type NewUser = Insertable<UsersTable>
type UserUpdate = Updateable<UsersTable>
type User = Selectable<UsersTable>
```

### Step 2: Queries

```typescript
// db/queries.ts — Type-safe SQL queries
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'

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
  .values({ name: 'Alice', email: 'alice@example.com' })
  .returningAll()
  .executeTakeFirstOrThrow()

// Transaction
await db.transaction().execute(async (trx) => {
  const user = await trx.insertInto('users')
    .values({ name: 'Bob', email: 'bob@example.com' })
    .returningAll()
    .executeTakeFirstOrThrow()

  await trx.insertInto('posts')
    .values({ title: 'First Post', body: 'Hello!', author_id: user.id, published: true })
    .execute()
})
```

### Step 3: Migrations

```typescript
// migrations/001_create_users.ts — Kysely migration
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

## Guidelines

- Kysely is a query builder, not an ORM — no relations, no lazy loading, no magic. Just SQL with types.
- Use Kysely when you want SQL control with type safety. Use Drizzle or Prisma when you want ORM features.
- Kysely works with serverless databases (Neon, PlanetScale) via custom dialects.
- The `Insertable`/`Updateable` types automatically make `Generated` fields optional.
