---
name: mikro-orm
description: >-
  MikroORM is a TypeScript ORM for Node.js built on the Data Mapper, Unit of
  Work, and Identity Map patterns, supporting PostgreSQL, MySQL, MariaDB,
  SQLite, and MongoDB. Use when a user asks to define decorator-based
  entities, set up automatic change tracking and batched flushes, write
  query-builder queries, generate or run migrations, seed a database, or
  build a DDD-friendly data layer in TypeScript.
license: Apache-2.0
compatibility: "Node.js 18+, MikroORM 6.x or 7.x, TypeScript with experimentalDecorators or native class decorators"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - orm
    - typescript
    - database
    - unit-of-work
    - sql
  repository: https://github.com/mikro-orm/mikro-orm
---

# MikroORM — TypeScript ORM with Unit of Work

## Overview

MikroORM is a TypeScript ORM for Node.js based on the Data Mapper, Unit of Work, and Identity Map patterns (inspired by Doctrine and Hibernate). Entities are plain classes decorated with `@Entity()`/`@Property()`; the `EntityManager` tracks changes in memory and batches them into minimal SQL on `em.flush()`. It supports PostgreSQL, MySQL/MariaDB, SQLite, and MongoDB.

## Instructions

### 1. Install the core package and one driver package

```bash
npm install @mikro-orm/core @mikro-orm/postgresql @mikro-orm/cli reflect-metadata
# or @mikro-orm/mysql, @mikro-orm/sqlite, @mikro-orm/mongodb
```

Each driver package re-exports `MikroORM` and `defineConfig` pre-wired to that driver — import from the driver package, not from `@mikro-orm/core`, so driver-specific features (like `QueryBuilder` on SQL drivers) are typed correctly. There is no `type: "postgresql"` config key in current MikroORM; the driver import itself selects the backend.

### 2. Define entities

```typescript
import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection,
  Enum, Index, Unique, Embeddable, Embedded, Filter } from "@mikro-orm/core";
import { v4 } from "uuid";

@Embeddable()
class Address {
  @Property()
  street!: string;

  @Property()
  city!: string;

  @Property()
  country!: string;
}

enum UserRole { USER = "user", ADMIN = "admin" }

@Entity()
@Filter({ name: "active", cond: { deletedAt: null }, default: true })
export class User {
  @PrimaryKey()
  id: string = v4();

  @Property()
  name!: string;

  @Index()
  @Unique()
  @Property()
  email!: string;

  @Enum(() => UserRole)
  role: UserRole = UserRole.USER;

  @Embedded(() => Address, { nullable: true })
  address?: Address;

  @OneToMany(() => Post, (post) => post.author)
  posts = new Collection<Post>(this);

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Property({ nullable: true })
  deletedAt?: Date;
}

@Entity()
export class Post {
  @PrimaryKey()
  id: string = v4();

  @Property()
  title!: string;

  @Property({ type: "text" })
  body!: string;

  @Property()
  published: boolean = false;

  @ManyToOne(() => User)
  author!: User;

  @Property()
  createdAt: Date = new Date();
}
```

### 3. Initialize the ORM and use the Unit of Work

```typescript
import { MikroORM, defineConfig } from "@mikro-orm/postgresql";
import { RequestContext } from "@mikro-orm/core";

const orm = await MikroORM.init(defineConfig({
  entities: [User, Post],
  dbName: "orders_app",
  debug: process.env.NODE_ENV === "development",
}));

// Express middleware — one EntityManager fork per request, so concurrent
// requests don't share Identity Map state
app.use((req, res, next) => {
  RequestContext.create(orm.em, next);
});

app.put("/users/:id", async (req, res) => {
  const em = orm.em;
  const user = await em.findOneOrFail(User, req.params.id);

  user.name = req.body.name;              // just modify the entity
  user.email = req.body.email;

  await em.flush();                       // MikroORM diffs changes, generates UPDATE
  res.json(user);
});

// Identity Map — same entity loaded twice in one context returns the same reference
const user1 = await orm.em.findOne(User, "7f5b2e10-...-aa31");
const user2 = await orm.em.findOne(User, "7f5b2e10-...-aa31");
console.log(user1 === user2); // true

// QueryBuilder (available because MikroORM was imported from the driver package)
const topAuthors = await orm.em.createQueryBuilder(User, "u")
  .select(["u.*", "count(p.id) as post_count"])
  .leftJoin("u.posts", "p")
  .where({ role: UserRole.ADMIN })
  .groupBy("u.id")
  .orderBy({ post_count: "DESC" })
  .limit(10)
  .getResultList();
```

### 4. Migrations and seeding

```bash
npx mikro-orm migration:create          # generate from entity/schema diff
npx mikro-orm migration:create --initial
npx mikro-orm migration:up              # apply pending migrations
npx mikro-orm migration:down            # revert the last one
npx mikro-orm migration:pending         # list what hasn't run
npx mikro-orm seeder:run --class=UserSeeder
```

Review the generated SQL before running `migration:up` against a shared or production database.

## Examples

### Example 1: Add a request-scoped EntityManager to an Express API

**User request:** "Our Express routes are sharing one EntityManager and getting stale data between requests — fix it."

**Agent workflow:**
1. Wrap the app with `RequestContext.create(orm.em, next)` so every request gets its own forked `EntityManager` from `orm.em` instead of reusing one global instance.
2. In route handlers, keep calling `orm.em` (MikroORM resolves it to the per-request fork via `RequestContext`) rather than importing a shared `em` constant.
3. Confirm with a quick load test that two concurrent `PUT /users/:id` requests no longer see each other's unflushed changes.

**Output:** Each HTTP request has an isolated Identity Map and Unit of Work; no more cross-request state leaks.

### Example 2: Add a soft-delete filter and a value object

**User request:** "Add soft deletes to our User entity, and store the address as street/city/country without a separate table."

**Agent workflow:**
1. Add a nullable `deletedAt: Date` property to `User` and an `@Filter({ name: "active", cond: { deletedAt: null }, default: true })` class decorator, so normal queries automatically exclude soft-deleted rows.
2. Add an `@Embeddable()` `Address` class with `street`/`city`/`country` properties, and an `@Embedded(() => Address, { nullable: true })` field on `User` — this stores the fields inline on the `user` table, not in a separate table.
3. Generate a migration (`npx mikro-orm migration:create`) and review the SQL: it should add `deleted_at` plus the three `address_*` columns, no new table.

**Output:** Soft-deleted users disappear from default queries without extra `WHERE` clauses in application code, and addresses live as typed value objects with no join.

## Guidelines

- Call `em.flush()` once per logical unit of work after modifying entities; MikroORM batches all pending changes into the minimum number of SQL statements instead of one query per `set`.
- Relations are not lazy-loaded implicitly on SQL drivers — populate them explicitly (`em.find(User, {}, { populate: ["posts"] })`) or you'll get an unitialized `Collection`/reference.
- Use `RequestContext.create()` per request (web frameworks) so each request gets its own forked `EntityManager` and Identity Map; sharing one global `em` across concurrent requests causes the stale/cross-request bugs this skill's first example fixes.
- Use `@Filter` for soft deletes or multi-tenancy instead of repeating a `where` clause everywhere; filters apply automatically unless explicitly disabled per query.
- Use `@Embedded`/`@Embeddable` for value objects (address, money) that should live inline on the owning table rather than a joined table.
- Always review generated migration SQL before running it against data that matters; `migration:fresh` drops the database and is for local/dev use only.
- Import `MikroORM`/`defineConfig` from the driver package (`@mikro-orm/postgresql`, `@mikro-orm/sqlite`, etc.), not `@mikro-orm/core`, to get driver-specific typing such as `QueryBuilder`.
