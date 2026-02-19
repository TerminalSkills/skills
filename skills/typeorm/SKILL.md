---
name: typeorm
description: >-
  TypeScript ORM for SQL and NoSQL databases. Use when a user asks to use a decorator-based ORM, work with Active Record or Data Mapper patterns, or manage database entities in TypeScript.
license: Apache-2.0
compatibility: 'Node.js 16+, TypeScript'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: database
  tags:
    - typeorm
    - orm
    - typescript
    - sql
    - decorators
---

# TypeORM

## Overview
TypeORM is a TypeScript-first ORM using decorators for entity definition. Supports Active Record and Data Mapper patterns, migrations, relations, and PostgreSQL, MySQL, SQLite, MongoDB.

## Instructions

### Step 1: Setup
```bash
npm install typeorm reflect-metadata pg
```

### Step 2: Define Entity
```typescript
// entities/User.ts — Entity with decorators
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn } from 'typeorm'
import { Post } from './Post'

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  name: string

  @Column({ unique: true })
  email: string

  @OneToMany(() => Post, post => post.author)
  posts: Post[]

  @CreateDateColumn()
  createdAt: Date
}
```

### Step 3: Query
```typescript
const repo = dataSource.getRepository(User)
const users = await repo.find({ where: { name: 'John' }, relations: ['posts'], order: { createdAt: 'DESC' } })
await repo.save({ name: 'Jane', email: 'jane@example.com' })
```

### Step 4: Migrations
```bash
npx typeorm migration:generate -d src/data-source.ts src/migrations/AddUsers
npx typeorm migration:run -d src/data-source.ts
```

## Guidelines
- Requires `reflect-metadata` and `experimentalDecorators` in tsconfig.
- Data Mapper pattern is recommended for large apps — keeps entities clean.
- For new projects, consider Drizzle or Prisma — TypeORM has known performance issues with complex queries.
