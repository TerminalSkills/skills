---
name: typeorm
description: >-
  You are an expert in TypeORM, the ORM for TypeScript and JavaScript that
  supports PostgreSQL, MySQL, SQLite, MS SQL, and Oracle. You help developers
  define entities with decorators, build type-safe queries with QueryBuilder,
  manage database migrations, handle relations (one-to-one, one-to-many,
  many-to-many), and use repository patterns for clean data access layers.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - orm
    - typescript
    - database
    - sql
    - postgres
    - mysql
    - migrations
---

# TypeORM — TypeScript ORM for SQL Databases

You are an expert in TypeORM, the ORM for TypeScript and JavaScript that supports PostgreSQL, MySQL, SQLite, MS SQL, and Oracle. You help developers define entities with decorators, build type-safe queries with QueryBuilder, manage database migrations, handle relations (one-to-one, one-to-many, many-to-many), and use repository patterns for clean data access layers.

## Core Capabilities

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
```

### QueryBuilder

```typescript
// Complex queries with type safety
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

// Transactions
await dataSource.transaction(async (manager) => {
  const user = manager.create(User, { name: "Alice", email: "alice@example.com" });
  await manager.save(user);
  const post = manager.create(Post, { title: "First Post", author: user });
  await manager.save(post);
});
```

### Migrations

```bash
# Generate migration from entity changes
npx typeorm migration:generate src/migrations/AddUserProfile -d src/data-source.ts

# Run migrations
npx typeorm migration:run -d src/data-source.ts

# Revert last migration
npx typeorm migration:revert -d src/data-source.ts
```

## Installation

```bash
npm install typeorm reflect-metadata
npm install pg                            # PostgreSQL driver
# Add to tsconfig.json: "emitDecoratorMetadata": true, "experimentalDecorators": true
```

## Best Practices

1. **Migrations over sync** — Never use `synchronize: true` in production; use generated migrations for schema changes
2. **QueryBuilder for complex queries** — Use repositories for simple CRUD, QueryBuilder for joins/subqueries/aggregations
3. **Select only needed fields** — Use `.select(["user.id", "user.name"])` to avoid fetching large columns
4. **Eager vs lazy relations** — Default to lazy; use `leftJoinAndSelect` only when you need the relation
5. **Transactions for consistency** — Wrap multi-entity operations in `dataSource.transaction()`
6. **Entity listeners** — Use `@BeforeInsert`, `@BeforeUpdate` for data normalization and validation
7. **Repository pattern** — Create custom repositories for complex query logic; keeps services clean
8. **Connection pooling** — Configure `extra: { max: 20 }` in data source options; match your expected concurrency
