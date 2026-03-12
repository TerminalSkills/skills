---
name: mikro-orm
category: Backend Development
tags: [orm, typescript, database, unit-of-work, identity-map, sql, mongodb]
version: 1.0.0
author: terminal-skills
---

# MikroORM — TypeScript ORM with Unit of Work

You are an expert in MikroORM, the TypeScript ORM built on Unit of Work and Identity Map patterns. You help developers build data layers with decorator-based entities, automatic change tracking, lazy/eager loading, embeddables, query builder, migrations, and seeding — supporting PostgreSQL, MySQL, SQLite, and MongoDB with a DDD-friendly architecture.

## Core Capabilities

### Entity Definition

```typescript
import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection,
  Enum, Index, Unique, Embeddable, Embedded, Filter } from "@mikro-orm/core";
import { v4 } from "uuid";

@Embeddable()
class Address {
  @Property()
  street: string;

  @Property()
  city: string;

  @Property()
  country: string;
}

@Entity()
@Filter({ name: "active", cond: { deletedAt: null }, default: true })
export class User {
  @PrimaryKey()
  id: string = v4();

  @Property()
  name: string;

  @Index()
  @Unique()
  @Property()
  email: string;

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

enum UserRole { USER = "user", ADMIN = "admin" }

@Entity()
export class Post {
  @PrimaryKey()
  id: string = v4();

  @Property()
  title: string;

  @Property({ type: "text" })
  body: string;

  @Property()
  published: boolean = false;

  @ManyToOne(() => User)
  author: User;

  @Property()
  createdAt: Date = new Date();
}
```

### Unit of Work (Auto Change Tracking)

```typescript
import { MikroORM, RequestContext } from "@mikro-orm/core";

const orm = await MikroORM.init({
  entities: [User, Post],
  dbName: "myapp",
  type: "postgresql",
  debug: process.env.NODE_ENV === "development",
});

// Express middleware — one EntityManager per request
app.use((req, res, next) => {
  RequestContext.create(orm.em, next);
});

// Usage — automatic change tracking
app.put("/users/:id", async (req, res) => {
  const em = orm.em;
  const user = await em.findOneOrFail(User, req.params.id);

  user.name = req.body.name;              // Just modify the entity
  user.email = req.body.email;

  await em.flush();                       // MikroORM detects changes, generates UPDATE
  res.json(user);
});

// Identity Map — same entity loaded twice returns same reference
const user1 = await em.findOne(User, "abc");
const user2 = await em.findOne(User, "abc");
console.log(user1 === user2);             // true — same object in memory

// QueryBuilder
const topAuthors = await em.createQueryBuilder(User, "u")
  .select(["u.*", "count(p.id) as post_count"])
  .leftJoin("u.posts", "p")
  .where({ role: UserRole.ADMIN })
  .groupBy("u.id")
  .orderBy({ post_count: "DESC" })
  .limit(10)
  .getResultList();
```

## Installation

```bash
npm install @mikro-orm/core @mikro-orm/postgresql @mikro-orm/cli
npx mikro-orm migration:create
npx mikro-orm migration:up
```

## Best Practices

1. **Unit of Work** — Modify entities directly; call `em.flush()` once to batch all changes into minimal SQL
2. **Identity Map** — Same entity loaded twice returns same reference; prevents inconsistency in a request
3. **RequestContext** — Use `RequestContext.create()` middleware; gives each request its own EntityManager
4. **Filters** — Use `@Filter` for soft deletes, multi-tenancy; applied automatically to all queries
5. **Embeddables** — Use `@Embedded` for value objects (Address, Money); stored in same table, typed as objects
6. **Populate** — Explicitly populate relations: `em.find(User, {}, { populate: ['posts'] })`; no implicit lazy loading
7. **Migrations** — Use CLI to generate migrations from entity changes; review SQL before running
8. **Serialization** — Use `wrap(entity).toJSON()` or custom serializers; control what's exposed in API responses
