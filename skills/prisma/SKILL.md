---
name: prisma
description: >-
  You are an expert in Prisma, the TypeScript ORM with a declarative schema,
  auto-generated type-safe client, migrations, and studio GUI. You help
  developers model databases with Prisma Schema Language, generate a fully
  typed client that catches query errors at compile time, run zero-downtime
  migrations, and integrate with Postgres, MySQL, SQLite, MongoDB,
  CockroachDB, and PlanetScale.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - orm
    - database
    - typescript
    - postgres
    - mysql
    - sqlite
    - schema
    - migrations
---

# Prisma — Next-Generation TypeScript ORM

You are an expert in Prisma, the TypeScript ORM with a declarative schema, auto-generated type-safe client, migrations, and studio GUI. You help developers model databases with Prisma Schema Language, generate a fully typed client that catches query errors at compile time, run zero-downtime migrations, and integrate with Postgres, MySQL, SQLite, MongoDB, CockroachDB, and PlanetScale.

## Core Capabilities

### Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  role      Role     @default(USER)
  posts     Post[]
  profile   Profile?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
  @@map("users")
}

model Post {
  id          String     @id @default(cuid())
  title       String
  content     String?
  published   Boolean    @default(false)
  author      User       @relation(fields: [authorId], references: [id])
  authorId    String
  categories  Category[]
  createdAt   DateTime   @default(now())
  
  @@index([authorId])
  @@index([published, createdAt])
}

model Profile {
  id     String @id @default(cuid())
  bio    String?
  avatar String?
  user   User   @relation(fields: [userId], references: [id])
  userId String @unique
}

model Category {
  id    String @id @default(cuid())
  name  String @unique
  posts Post[]
}

enum Role {
  USER
  ADMIN
  MODERATOR
}
```

### Queries

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Create with relations
const user = await prisma.user.create({
  data: {
    name: "Alice",
    email: "alice@example.com",
    profile: { create: { bio: "Developer" } },
    posts: {
      create: [
        { title: "First Post", content: "Hello world", published: true },
        { title: "Draft", content: "Work in progress" },
      ],
    },
  },
  include: { posts: true, profile: true },
});

// Complex queries — fully typed
const publishedPosts = await prisma.post.findMany({
  where: {
    published: true,
    author: { role: "ADMIN" },
    createdAt: { gte: new Date("2026-01-01") },
  },
  include: {
    author: { select: { name: true, email: true } },
    categories: true,
  },
  orderBy: { createdAt: "desc" },
  take: 20,
  skip: 0,
});

// Aggregate
const stats = await prisma.post.aggregate({
  _count: true,
  _avg: { createdAt: true },
  where: { published: true },
});

// Transaction
const [updatedPost, newNotification] = await prisma.$transaction([
  prisma.post.update({ where: { id: "..." }, data: { published: true } }),
  prisma.notification.create({ data: { userId: "...", message: "Post published!" } }),
]);

// Raw SQL when needed
const result = await prisma.$queryRaw`
  SELECT u.name, COUNT(p.id) as post_count
  FROM users u LEFT JOIN posts p ON p."authorId" = u.id
  GROUP BY u.name ORDER BY post_count DESC LIMIT 10
`;
```

### Migrations

```bash
npx prisma migrate dev --name add-categories    # Create + apply migration
npx prisma migrate deploy                       # Apply in production
npx prisma db push                              # Push schema without migration (prototyping)
npx prisma studio                               # GUI for browsing data
npx prisma generate                             # Regenerate client after schema change
```

## Installation

```bash
npm install prisma @prisma/client
npx prisma init                            # Creates schema.prisma + .env
```

## Best Practices

1. **Type-safe queries** — Every query is fully typed; wrong field names or types caught at compile time
2. **Relations** — Define in schema with `@relation`; query with `include` or `select` for eager loading
3. **Migrations** — Use `prisma migrate dev` in development; `migrate deploy` in CI/production
4. **Indexes** — Add `@@index` for fields you filter/sort by; Prisma warns about missing indexes
5. **Select vs Include** — Use `select` to pick specific fields (smaller payloads); `include` for full relations
6. **Transactions** — Use `$transaction` for atomic multi-table operations; auto-rollback on failure
7. **Connection pooling** — Use `prisma-accelerate` or pgbouncer for serverless; Lambda needs pooling
8. **Prisma Studio** — `npx prisma studio` for visual data browser; great for debugging and manual edits
