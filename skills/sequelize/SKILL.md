---
name: sequelize
category: Backend Development
tags: [orm, javascript, database, sql, postgres, mysql, migrations, node]
version: 1.0.0
author: terminal-skills
---

# Sequelize — Node.js SQL ORM

You are an expert in Sequelize, the promise-based ORM for Node.js supporting PostgreSQL, MySQL, MariaDB, SQLite, and MS SQL. You help developers define models, build queries, manage migrations, handle associations, use transactions, and configure connection pooling — providing a mature, battle-tested data access layer for production Node.js applications.

## Core Capabilities

### Model Definition

```typescript
import { Model, DataTypes, Sequelize, InferAttributes, InferCreationAttributes } from "sequelize";

const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: "postgres",
  pool: { max: 20, min: 5, acquire: 30000, idle: 10000 },
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: number;
  declare name: string;
  declare email: string;
  declare role: "user" | "admin";
  declare createdAt: Date;
  declare updatedAt: Date;
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
  declare id: number;
  declare title: string;
  declare body: string;
  declare published: boolean;
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

// Raw query for complex operations
const [results] = await sequelize.query(`
  SELECT u.name, COUNT(p.id) as post_count
  FROM users u LEFT JOIN posts p ON u.id = p."authorId"
  GROUP BY u.id ORDER BY post_count DESC LIMIT 10
`);

// Transaction
await sequelize.transaction(async (t) => {
  const user = await User.create({ name: "Alice", email: "alice@example.com" }, { transaction: t });
  await Post.create({ title: "First Post", body: "Hello", authorId: user.id }, { transaction: t });
});

// Bulk operations
await User.bulkCreate(usersData, { validate: true, updateOnDuplicate: ["name"] });
```

## Installation

```bash
npm install sequelize
npm install pg pg-hstore                  # PostgreSQL
npm install sequelize-cli                 # Migrations CLI
npx sequelize init                        # Generate config/migrations/models dirs
```

## Best Practices

1. **Migrations** — Use `sequelize-cli` for migrations; never use `sync()` in production
2. **TypeScript** — Use `InferAttributes` / `InferCreationAttributes` for full type inference
3. **Scopes** — Define reusable query scopes: `User.scope('active').findAll()` for common filters
4. **Transactions** — Wrap related operations in transactions; use `CLS` for automatic transaction propagation
5. **Paranoid mode** — Enable `paranoid: true` for soft deletes; adds `deletedAt` column automatically
6. **Eager loading** — Use `include` for joins; set `required: false` for LEFT JOIN behavior
7. **Hooks** — Use `beforeCreate`, `afterUpdate` for business logic; keep models self-validating
8. **Connection pool** — Set `max` to match expected concurrency; `idle` to release unused connections
