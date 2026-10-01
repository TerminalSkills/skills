---
name: typeorm
description: >-
  TypeORM is an ORM for TypeScript and JavaScript that maps decorated classes
  to tables in PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle and
  other databases. Use when a user asks to define entities and relations,
  query with repositories or QueryBuilder, set up a DataSource, generate and
  run migrations, or upgrade a project from TypeORM 0.3 to 1.x — for example
  "add a column with a migration", "migration:generate cannot open my
  data-source.ts", or "findOneBy throws on an undefined value after the
  upgrade".
license: Apache-2.0
compatibility: "TypeORM 1.x needs Node.js 20.19+, 22.13+ or 24.11+ and TypeScript 4.5+ with experimentalDecorators and emitDecoratorMetadata"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/typeorm/typeorm
  tags: ["orm", "typescript", "database", "sql", "migrations"]
---

# TypeORM — TypeScript ORM for SQL Databases

## Overview

TypeORM maps TypeScript classes to database tables with decorators and gives you repositories, a QueryBuilder, transactions and a migration CLI on top. It supports PostgreSQL, MySQL/MariaDB, SQLite, SQL Server, Oracle, CockroachDB, SAP HANA, Spanner and MongoDB. This skill targets TypeORM 1.x (1.0 shipped in May 2026 and removed the APIs deprecated during 0.3); the 0.3 line still gets fixes under the npm `legacy` tag.

## Instructions

### Install and configure

```bash
npm install typeorm reflect-metadata
npm install pg                                    # driver: pg, mysql2, better-sqlite3, mssql, oracledb or mongodb
npm install -D typescript@5 ts-node @types/node   # ts-node runs the CLI against .ts files
npx typeorm init --name blog-api --database postgres   # or scaffold: package.json, tsconfig.json, src/data-source.ts, src/entities/User.ts
```

`tsconfig.json` must set `"experimentalDecorators": true` and `"emitDecoratorMetadata": true`. All access goes through one `DataSource` instance — the global `createConnection()` / `getRepository()` helpers no longer exist.

```typescript
// src/data-source.ts
import "reflect-metadata";
import { DataSource } from "typeorm";
import { User, Post, Tag } from "./entities";   // one file or an index re-exporting each entity

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [User, Post, Tag],
  migrations: [__dirname + "/migrations/*{.ts,.js}"],
  synchronize: false,          // schema changes go through migrations
  poolSize: 20,                // max connections in the pool
});
// At startup: await AppDataSource.initialize();   On shutdown: await AppDataSource.destroy();
```

### Entity Definition

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, ManyToMany, JoinTable, Index, BeforeInsert } from "typeorm";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ length: 100 })
  name: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ type: "enum", enum: ["user", "admin"], default: "user" })
  role: "user" | "admin";

  @Column({ type: "jsonb", nullable: true })
  profile: { bio?: string; avatar?: string };

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];

  @ManyToMany(() => Tag)
  @JoinTable()
  interests: Tag[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  normalizeEmail() {
    this.email = this.email.toLowerCase().trim();
  }
}

@Entity("posts")
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: "text" })
  body: string;

  @Column({ default: false })
  published: boolean;

  @ManyToOne(() => User, (user) => user.posts)
  author: User;

  @Column()
  authorId: string;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity("tags")
export class Tag { @PrimaryGeneratedColumn() id: number; @Column({ unique: true }) name: string; }
```

### Repositories and find options

```typescript
import { In, IsNull } from "typeorm";
import { AppDataSource as dataSource } from "./data-source";
const users = dataSource.getRepository(User);
// select and relations take objects — the string-array form was removed in 1.0
const admins = await users.find({
  select: { id: true, name: true, posts: { id: true, title: true } },
  relations: { posts: true },
  where: { role: "admin" },
  order: { name: "ASC" },     // with take + relations, order by a column that is in select
  take: 20,
});
const maya = await users.findOneBy({ email: "maya.okafor@northwind.dev" }); // replaces findOneById
const picked = await users.findBy({ id: In(userIds) });                     // replaces findByIds
const noProfile = await users.find({ where: { profile: IsNull() } });       // `profile: null` throws
const hasAdmins = await users.exists({ where: { role: "admin" } });         // replaces exist()
await users.upsert(
  { name: "Maya Okafor", email: "maya.okafor@northwind.dev", passwordHash: hash },
  ["email"],                                                                // conflict target
);
// Custom repository methods: extend() replaces @EntityRepository / getCustomRepository
const UserRepository = users.extend({
  findByEmail(email: string) {
    return this.findOneBy({ email: email.toLowerCase().trim() });
  },
});
```

### QueryBuilder

```typescript
const posts = await dataSource
  .getRepository(Post)
  .createQueryBuilder("post")
  .leftJoinAndSelect("post.author", "author")
  .where("post.published = :published", { published: true })
  .andWhere("author.role = :role", { role: "admin" })
  .orderBy("post.createdAt", "DESC")
  .skip(20)
  .take(10)
  .getMany();

// Subquery
const topAuthors = await dataSource
  .getRepository(User)
  .createQueryBuilder("user")
  .addSelect((subQuery) =>
    subQuery
      .select("COUNT(post.id)", "postCount")
      .from(Post, "post")
      .where("post.authorId = user.id"),
    "postCount"
  )
  .orderBy("postCount", "DESC")
  .limit(10)
  .getRawMany();

// A select: false column is only loaded when asked for
const withHash = await dataSource.getRepository(User).createQueryBuilder("user")
  .addSelect("user.passwordHash").where("user.email = :email", { email: loginEmail }).getOne();

// Transactions
await dataSource.transaction(async (manager) => {
  const user = manager.create(User, { name: "Maya Okafor", email: "maya.okafor@northwind.dev", passwordHash: hash });
  await manager.save(user);
  const post = manager.create(Post, { title: "Zero-downtime migrations", body: draft, author: user });
  await manager.save(post);
});
```

### Migrations

Plain `npx typeorm` only loads JavaScript. With a `.ts` data source, use the bundled ts-node wrapper (`typeorm-ts-node-esm` in ESM projects), or compile and point `-d` at the built file.

```bash
# Generate a migration from the difference between entities and the database
npx typeorm-ts-node-commonjs migration:generate src/migrations/AddPostSlug -d src/data-source.ts
# Create an empty migration to fill in by hand
npx typeorm migration:create src/migrations/BackfillPostSlugs
# Run pending migrations, list their status, revert the last one
npx typeorm-ts-node-commonjs migration:run -d src/data-source.ts
npx typeorm-ts-node-commonjs migration:show -d src/data-source.ts
npx typeorm-ts-node-commonjs migration:revert -d src/data-source.ts
# CI guard: exit code 1 when entities and schema have drifted, nothing is written
npx typeorm-ts-node-commonjs migration:generate src/migrations/Drift --check -d src/data-source.ts
# Production: run the compiled output (dist/ = your tsconfig outDir; `typeorm init` sets ./build)
npx tsc && npx typeorm migration:run -d dist/data-source.js
```

### Upgrading from 0.3 to 1.x

Run the official codemod first (`npx @typeorm/codemod v1 --dry src/` to preview, then without `--dry`). It rewrites what it can and leaves `TODO(typeorm-v1)` comments where a decision is needed. The changes that break most projects:

| 0.3 | 1.x |
|-----|-----|
| `Connection`, `createConnection()`, global `getRepository()` / `getManager()` | `DataSource`, `dataSource.initialize()`, `dataSource.getRepository()` |
| `findOneById(id)`, `findByIds(ids)`, `exist()` | `findOneBy({ id })`, `findBy({ id: In(ids) })`, `exists()` |
| `select: ["id"]`, `relations: ["posts"]` | `select: { id: true }`, `relations: { posts: true }` |
| `where: { col: null }` or `undefined` was ignored | throws `TypeORMError`; use `IsNull()` or set `invalidWhereValuesBehavior` |
| `type: "sqlite"` (`sqlite3`), `mysql` package | `type: "better-sqlite3"`, `mysql2` |
| `@EntityRepository`, `getCustomRepository()` | `repository.extend({...})` |
| `TYPEORM_*` environment variables, `ormconfig.env` | a data source file that reads `process.env` itself |
| `qb.printSql()`, `qb.onConflict()` | `qb.getSql()`, `orIgnore()` / `orUpdate()` |

NestJS projects need `@nestjs/typeorm` 11.0.1 or later. Full list: https://typeorm.io/docs/releases/1.0/upgrading-from-0.3

## Examples

### Example 1: Add a column and ship it as a migration

**User request:** "Add an optional slug to posts and create the migration for it."

Add the column to the `Post` entity, then generate and apply the migration:

```typescript
@Column({ type: "varchar", length: 160, nullable: true })
slug: string | null;
```

```bash
npx typeorm-ts-node-commonjs migration:generate src/migrations/AddPostSlug -d src/data-source.ts
npx typeorm-ts-node-commonjs migration:run -d src/data-source.ts
```

The first command writes `src/migrations/1790847921068-AddPostSlug.ts` (the prefix is the current timestamp) whose `up()` runs `ALTER TABLE "posts" ADD "slug" character varying(160)` and whose `down()` drops the column. The second prints `Migration AddPostSlug1790847921068 has been executed successfully.`, and `migration:show` then lists it as `[X]`. If nothing changed, generate reports `No changes in database schema were found`.

### Example 2: Upgrade a 0.3 service to TypeORM 1.x

**User request:** "Bump our billing service from typeorm 0.3.20 to the current version."

```bash
npx @typeorm/codemod v1 --dry src/     # lists the transforms that would apply
npx @typeorm/codemod v1 src/
npm install
```

The codemod turns this:

```typescript
const repo = getRepository(Invoice);
const one = await repo.findOneById(invoiceId);
const list = await repo.find({ select: ["id", "total"], relations: ["customer"] });
```

into this, and bumps `typeorm` to `^1.0.0`, `@nestjs/typeorm` to `^11.0.1` and replaces `sqlite3` with `better-sqlite3` in `package.json`:

```typescript
// TODO(typeorm-v1): `dataSource` is not defined — inject or import your DataSource instance
const repo = dataSource.getRepository(Invoice);
const one = await repo.findOneBy({ id: invoiceId });
const list = await repo.find({ select: { id: true, total: true }, relations: { customer: true } });
```

Resolve each `TODO(typeorm-v1)` by hand and grep for leftover `findOneById(`, `findByIds(` and `.exist(` — the codemod skips them in a file whose only `typeorm` import was a removed global helper. Then run the test suite and look for `Undefined value encountered in property … of a where condition` — every hit is a query that used to return unfiltered rows.

## Guidelines

1. **Migrations over sync** — Never use `synchronize: true` in production; it can drop columns. Generate migrations and read the SQL before running it.
2. **Guard where values** — In 1.x a `null` or `undefined` in find options throws instead of matching every row. Validate ids before querying; do not switch `invalidWhereValuesBehavior` back to `ignore` just to silence the error.
3. **QueryBuilder for complex queries** — Use repositories for simple CRUD, QueryBuilder for joins, subqueries and aggregations. Always bind values with `:name` parameters, never string interpolation.
4. **Select only needed fields** — Use object `select` or `.select(["user.id", "user.name"])` to avoid fetching large columns.
5. **Load relations explicitly** — Relations are not loaded unless you ask (`relations: { posts: true }` or a join). Avoid `eager: true` on large graphs; Promise-based lazy relations are documented as experimental.
6. **Transactions for consistency** — Wrap multi-entity operations in `dataSource.transaction()` and use the `manager` it passes in, not the outer repositories.
7. **`nullable: false` relations join with INNER JOIN in 1.x** — rows whose foreign key points nowhere disappear from results; fix the data or mark the relation nullable.
8. **CLI and TypeScript version** — The `typeorm-ts-node-*` wrappers depend on ts-node, which crashes under TypeScript 7; keep TypeScript 5 for the CLI (what `typeorm init` pins) or run the CLI against compiled JavaScript.
9. **Connection pooling** — Set `poolSize` to match expected concurrency; driver-specific settings go in `extra`.
