---
name: sequelize
description: >-
  Node.js ORM for SQL databases. Use when a user asks to use an ORM with PostgreSQL, MySQL, or SQLite, define models, run migrations, handle associations, or manage database schemas.
license: Apache-2.0
compatibility: 'Node.js 14+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: database
  tags:
    - sequelize
    - orm
    - sql
    - postgresql
    - mysql
---

# Sequelize

## Overview
Sequelize is a mature, feature-rich ORM for Node.js supporting PostgreSQL, MySQL, MariaDB, SQLite, and MS SQL. It provides model definition, migrations, associations, transactions, and raw SQL.

## Instructions

### Step 1: Setup
```bash
npm install sequelize pg pg-hstore
npx sequelize-cli init
```

### Step 2: Define Models
```javascript
// models/user.js — Sequelize model definition
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, unique: true, validate: { isEmail: true } },
    role: { type: DataTypes.ENUM('admin', 'user'), defaultValue: 'user' },
  })
  User.associate = (models) => {
    User.hasMany(models.Post, { foreignKey: 'authorId' })
  }
  return User
}
```

### Step 3: Query
```javascript
const users = await User.findAll({ where: { role: 'admin' }, include: 'Posts', order: [['createdAt', 'DESC']], limit: 10 })
await User.create({ name: 'John', email: 'john@example.com' })
await User.update({ role: 'admin' }, { where: { id: 1 } })
```

### Step 4: Migrations
```bash
npx sequelize-cli migration:generate --name add-users
npx sequelize-cli db:migrate
npx sequelize-cli db:migrate:undo
```

## Guidelines
- Use migrations (not sync) for production schema changes.
- Sequelize v7+ supports TypeScript natively.
- For new projects, consider Drizzle or Prisma — they have better TypeScript support.
