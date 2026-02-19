---
name: kysely
description: >-
  Type-safe SQL query builder for TypeScript. Use when a user asks to write SQL queries with type safety, build a query builder, or use a lightweight ORM alternative.
license: Apache-2.0
compatibility: 'Node.js 18+, Deno, Bun'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: database
  tags:
    - kysely
    - sql
    - typescript
    - query-builder
    - database
---

# Kysely

## Overview
Kysely is a type-safe SQL query builder for TypeScript. Unlike ORMs, it generates raw SQL — you get full control with type checking. Supports PostgreSQL, MySQL, SQLite.

## Instructions

### Step 1: Setup
```bash
npm install kysely pg
```

### Step 2: Define Types
```typescript
// db/types.ts — Database schema types
interface Database {
  users: { id: number; name: string; email: string; created_at: Date }
  posts: { id: number; title: string; body: string; author_id: number; published: boolean }
}
```

### Step 3: Query
```typescript
// db/index.ts — Type-safe queries
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) })

// Select with type inference
const users = await db.selectFrom('users').select(['id', 'name', 'email']).where('email', 'like', '%@gmail.com').orderBy('created_at', 'desc').limit(10).execute()

// Insert
await db.insertInto('posts').values({ title: 'Hello', body: 'World', author_id: 1, published: true }).execute()

// Join
const postsWithAuthors = await db.selectFrom('posts').innerJoin('users', 'users.id', 'posts.author_id').select(['posts.title', 'users.name as author']).where('posts.published', '=', true).execute()
```

## Guidelines
- Kysely provides type safety without runtime overhead — queries compile to plain SQL.
- Use migrations for schema changes — Kysely has a built-in migrator.
- Choose Kysely over Prisma/Drizzle when you need full SQL control with type safety.
