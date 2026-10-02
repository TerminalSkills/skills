---
name: sequelize
description: >-
  Sequelize is a promise-based ORM for Node.js supporting PostgreSQL, MySQL,
  MariaDB, SQLite, and MS SQL. Use when a user asks to define Sequelize models,
  write queries with associations and eager loading, create or run migrations
  with sequelize-cli, use transactions, or tune connection pooling in a Node.js
  or TypeScript backend.
license: Apache-2.0
compatibility: 'current Node.js LTS, sequelize 6.x, and a driver package for your database (pg, mysql2, mariadb, sqlite3, tedious)'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/sequelize/sequelize
  category: development
  tags:
    - sequelize
    - orm
    - node
    - sql
    - migrations
---

# Sequelize — Node.js SQL ORM

## Overview

Sequelize is a mature, promise-based ORM for Node.js supporting PostgreSQL, MySQL, MariaDB, SQLite, and MS SQL Server. The stable line is v6 (`sequelize` 6.37.x on npm, with `sequelize-cli` 6.6.x for migrations). Version 7 is published as `@sequelize/core` but is still an alpha (7.0.0-alpha.x): it has a different package layout (one `@sequelize/<dialect>` package per database) and decorator-based models, so use v6 for production unless the user asks for v7. Docs: https://sequelize.org/docs/v6/.

## Instructions

## Core Capabilities

### Model Definition

```typescript
import { Model, DataTypes, Sequelize, QueryTypes, InferAttributes, InferCreationAttributes, CreationOptional } from "sequelize";

const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: "postgres",
  pool: { max: 20, min: 5, acquire: 30000, idle: 10000 },
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare email: string;
  declare role: CreationOptional<"user" | "admin">;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

User.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false, validate: { len: [2, 100] } },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  role: { type: DataTypes.ENUM("user", "admin"), defaultValue: "user" },
}, {
  sequelize, tableName: "users", timestamps: true,
  hooks: {
    beforeCreate: (user) => { user.email = user.email.toLowerCase(); },
  },
});

class Post extends Model<InferAttributes<Post>, InferCreationAttributes<Post>> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare body: string;
  declare published: CreationOptional<boolean>;
  declare authorId: number;
}

Post.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  published: { type: DataTypes.BOOLEAN, defaultValue: false },
  authorId: { type: DataTypes.INTEGER, allowNull: false },
}, { sequelize, tableName: "posts" });

// Associations
User.hasMany(Post, { foreignKey: "authorId", as: "posts" });
Post.belongsTo(User, { foreignKey: "authorId", as: "author" });
```

### Queries

```typescript
// Find with eager loading
const users = await User.findAll({
  where: { role: "user" },
  include: [{ model: Post, as: "posts", where: { published: true }, required: false }],
  order: [["createdAt", "DESC"]],
  limit: 10, offset: 20,
});

// Raw query for complex operations; pass values with replacements/bind, never string concatenation
const rows = await sequelize.query(`
  SELECT u.name, COUNT(p.id) AS post_count
  FROM users u LEFT JOIN posts p ON u.id = p."authorId" AND p.published = :published
  GROUP BY u.id ORDER BY post_count DESC LIMIT 10
`, { replacements: { published: true }, type: QueryTypes.SELECT });

// Transaction
// Managed transaction: commits on return, rolls back on throw
await sequelize.transaction(async (t) => {
  const user = await User.create({ name: "Alice Moreau", email: "alice@northwind.io" }, { transaction: t });
  await Post.create({ title: "First Post", body: "Hello", authorId: user.id }, { transaction: t });
});

// Bulk operations
await User.bulkCreate(usersData, { validate: true, updateOnDuplicate: ["name"] });   // upsert on the unique key (not supported on every dialect)
```

## Installation

```bash
npm install sequelize
npm install pg pg-hstore                  # PostgreSQL (or mysql2, mariadb, sqlite3, tedious)
npm install --save-dev sequelize-cli      # Migrations CLI
npx sequelize-cli init                    # Creates config/, models/, migrations/, seeders/
```

Migrations with the CLI (`npx sequelize-cli ...`; the default `config/config.json` is created with mysql, so edit `dialect` and credentials first):

```bash
npx sequelize-cli model:generate --name Task --attributes title:string,done:boolean
npx sequelize-cli db:migrate              # apply pending migrations
npx sequelize-cli db:migrate:status
npx sequelize-cli db:migrate:undo         # revert the last one
```

## Examples

### Example 1: Blog backend with users and posts

**User request:** "Set up Sequelize with Postgres for a blog: users have many posts, I want the latest 10 users with their published posts."

The agent installs `sequelize pg pg-hstore`, creates the `User` and `Post` models and the `hasMany`/`belongsTo` pair above, generates migrations with `sequelize-cli` instead of `sync()`, and runs `User.findAll({ include: [{ model: Post, as: "posts", where: { published: true }, required: false }], order: [["createdAt", "DESC"]], limit: 10 })`. Result: an array of `User` instances, each with a `posts` array (empty when the author has nothing published).

### Example 2: Add a column safely

**User request:** "Add a nullable `bio` text column to users in production without losing data."

The agent runs `npx sequelize-cli migration:generate --name add-bio-to-users`, fills in `up` with `queryInterface.addColumn("users", "bio", { type: Sequelize.TEXT, allowNull: true })` and `down` with `queryInterface.removeColumn("users", "bio")`, adds `declare bio: string | null` to the model, then runs `db:migrate`. A failed migration can be reverted with `db:migrate:undo`.

## Guidelines

1. **Migrations, not `sync()`** — use `sequelize-cli` migrations in production; `sync({ alter: true })` and `sync({ force: true })` can drop or rewrite data
2. **TypeScript** — use `InferAttributes` / `InferCreationAttributes` with `declare` fields and `CreationOptional` for generated columns; do not use class field initializers (they shadow Sequelize getters)
3. **Scopes** — define reusable filters with `defaultScope`/`scopes` and call `User.scope('active').findAll()`
4. **Transactions** — managed transactions (callback form) roll back automatically; pass `{ transaction: t }` to every query in them, or enable CLS (`npm install cls-hooked`, then `Sequelize.useCLS(namespace)`) for automatic propagation
5. **Paranoid mode** — `paranoid: true` gives soft deletes through a `deletedAt` column
6. **Eager loading** — `include` loads associations; `required: false` gives a LEFT JOIN, and large nested includes with `limit` can produce heavy queries (use `separate: true` for hasMany)
7. **Hooks** — `beforeCreate`/`afterUpdate` are skipped by `bulkCreate`/`update` unless `individualHooks: true`
8. **Connection pool** — set `pool.max` below the database's connection limit divided by app instances
9. **SQL injection** — never interpolate user input into `sequelize.query`; use `replacements` or `bind`
