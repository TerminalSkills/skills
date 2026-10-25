---
name: prisma
description: >-
  Prisma ORM is a TypeScript database toolkit with a declarative schema, a generated type-safe client, and a migration system for PostgreSQL, MySQL/MariaDB, SQLite, SQL Server, CockroachDB and MongoDB. Use when someone asks to "set up Prisma", "write a Prisma schema", "run a Prisma migration", "query with Prisma Client", "fix Prisma 7 adapter errors", or "upgrade from prisma-client-js".
license: Apache-2.0
compatibility: "Node.js 20.19+, 22.12+ or 24+ (Prisma 7); a database or a SQLite file"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/prisma/prisma
  tags: "orm, database, typescript, migrations, schema"
---

# Prisma — TypeScript ORM

## Overview

Prisma ORM turns a `schema.prisma` file into a typed query client and SQL migrations. This skill targets the Prisma 7 line (7.10.1 was the last stable 7.x when checked on 2026-10-24). On that date the npm `latest` tag already pointed to the 8.0.0 release candidate, so a plain `npm install prisma` installs a release candidate: pin `prisma@7` / `@prisma/client@7` (the docs use `prisma@prev` for the CLI) unless you want Prisma 8.

What changed in Prisma 7, and what trips up code written for 6 or earlier:

- The connection URL no longer lives in `schema.prisma`. The `datasource` block has only `provider`; the URL goes in `prisma.config.ts`.
- `PrismaClient` needs a driver adapter (`@prisma/adapter-pg`, `adapter-mariadb`, `adapter-better-sqlite3`, and so on). `new PrismaClient()` with no adapter throws.
- The default generator is `prisma-client` and `output` is required. The client is plain TypeScript in your source tree, not in `node_modules`. `prisma-client-js` is the old generator.
- `.env` is no longer loaded for you; import `dotenv/config` or set variables yourself. The project must be ESM (`"type": "module"`).
- `prisma migrate dev` does not run `generate` any more; run `npx prisma generate` yourself.

## Instructions

### 1. Install (PostgreSQL shown)

```bash
npm install --save-dev prisma@7 tsx typescript
npm install @prisma/client@7 @prisma/adapter-pg@7 pg dotenv
npx prisma init --datasource-provider postgresql
```

Other adapters: MySQL/MariaDB `@prisma/adapter-mariadb` + `mariadb`; SQLite `@prisma/adapter-better-sqlite3` + `better-sqlite3`. `init` creates `prisma/schema.prisma`, a config file and `.env`. In 7.10.1 the config file is named `prisma7.config.ts`; delete it and create `prisma.config.ts` as in step 2, or keep it and use the same content.

### 2. Config and schema

```ts
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
```

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  role      Role     @default(USER)
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}

model Post {
  id        String   @id @default(cuid())
  title     String
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())

  @@index([authorId])
  @@index([published, createdAt])
}

enum Role {
  USER
  ADMIN
}
```

Add `src/generated/` to `.gitignore` if you generate in CI, or commit it; both work.

### 3. Migrate and generate

```bash
npx prisma migrate dev --name add-posts   # create + apply a migration in development
npx prisma generate                       # rebuild the client after every schema change
npx prisma migrate deploy                 # apply committed migrations in CI/production
npx prisma migrate status                 # which migrations are applied
npx prisma db push                        # prototype without migration files
npx prisma db seed                        # runs migrations.seed from prisma.config.ts
npx prisma studio                         # data browser
```

### 4. Client setup (one instance per process)

```ts
// src/db.ts
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
```

Model and enum types come from `./generated/prisma/models` and `./generated/prisma/enums`; browser-safe enums from `./generated/prisma/browser`.

### 5. Queries

```ts
import { prisma } from "./db";

const author = await prisma.user.create({
  data: {
    name: "Maria Lopez",
    email: "maria@shipyard.dev",
    posts: { create: [{ title: "Release notes 2.4", published: true }] },
  },
  include: { posts: true },
});

const page = await prisma.post.findMany({
  where: { published: true, author: { role: "ADMIN" } },
  select: { id: true, title: true, author: { select: { name: true } } },
  orderBy: { createdAt: "desc" },
  take: 20,
  skip: 0,
});

const counts = await prisma.post.aggregate({ _count: true, where: { published: true } });

// Independent writes in one transaction
const [published, total] = await prisma.$transaction([
  prisma.post.update({ where: { id: page[0].id }, data: { published: false } }),
  prisma.post.count(),
]);

// Interactive transaction
await prisma.$transaction(async (tx) => {
  const user = await tx.user.findUniqueOrThrow({ where: { email: "maria@shipyard.dev" } });
  await tx.post.create({ data: { title: "Follow-up", authorId: user.id } });
});

// Raw SQL, parameterised by the tagged template (never string-concatenate input)
const top = await prisma.$queryRaw`
  SELECT u.name, COUNT(p.id) AS post_count
  FROM users u LEFT JOIN "Post" p ON p."authorId" = u.id
  GROUP BY u.name ORDER BY post_count DESC LIMIT 10`;
```

Note: model `User` is mapped to table `users` by `@@map`; `Post` keeps its name, hence the quoted `"Post"` above.

## Examples

### Example 1: "Start a new SQLite project with Prisma"

```bash
npm init -y && npm pkg set type=module
npm install --save-dev prisma@7 tsx typescript @types/node
npm install @prisma/client@7 @prisma/adapter-better-sqlite3 better-sqlite3 dotenv
npx prisma init --datasource-provider sqlite
```

Set `provider = "prisma-client"` with `output = "../src/generated/prisma"` in the generator, make sure `.env` has `DATABASE_URL="file:./dev.db"`, then:

```console
$ npx prisma migrate dev --name init
Applying migration `20261024143503_init`
Your database is now in sync with your schema.
$ npx prisma generate
✔ Generated Prisma Client (7.10.1) to ./src/generated/prisma
```

Create the client with `new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }) })`. Running a create-with-nested-posts query printed the user with its `posts` array, and `$queryRaw` returned `[ { n: 1n } ]` (counts are `bigint`).

### Example 2: "My app says PrismaClient needs an adapter after I upgraded"

Install the adapter for your database, move `url = env("DATABASE_URL")` out of the `datasource` block into `prisma.config.ts`, switch the generator to `prisma-client` with an `output`, run `npx prisma generate`, and change the import from `@prisma/client` to your generated `./generated/prisma/client`. Pass the adapter to the constructor as in step 4. Keep `import "dotenv/config"` at the top of `prisma.config.ts`.

## Guidelines

- Create one `PrismaClient` per process; more instances open more connection pools and end in "too many clients" errors. In serverless, keep the pool small or use an external pooler such as PgBouncer.
- Commit `prisma/migrations/`. Use `migrate dev` locally and `migrate deploy` in CI/production; never run `migrate dev` or `migrate reset` against a production database, `reset` drops data.
- `db push` skips migration history; use it for prototypes only.
- Add `@@index` on foreign keys and on fields you filter or sort by; Prisma does not add indexes for relation scalar fields on its own.
- Prefer `select` over `include` for smaller payloads; `$queryRaw` with the tagged template is safe, `$queryRawUnsafe` is not for user input.
- Run `npx prisma generate` in your build step (and after pulling schema changes), or types will be stale.
- MongoDB: Prisma Migrate is not used; sync the schema with `db push`.
- Use `prisma@7`/`@prisma/client@7` for the setup above; check Prisma's upgrade guide before moving to 8.
