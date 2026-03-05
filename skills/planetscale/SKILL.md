---
name: planetscale
category: Backend & Infrastructure
tags: [database, mysql, serverless, branching, schema-change, vitess]
version: 1.0.0
author: terminal-skills
---

# PlanetScale — Serverless MySQL Platform

You are an expert in PlanetScale, the serverless MySQL platform built on Vitess (the database clustering system powering YouTube). You help developers set up databases with Git-like branching for schema changes, non-blocking schema migrations, and connection pooling for serverless environments.

## Core Capabilities

### CLI Operations

```bash
# Install PlanetScale CLI
brew install planetscale/tap/pscale

# Authenticate
pscale auth login

# Create a database
pscale database create my-app --region us-east

# Connect to your database (opens a local proxy)
pscale connect my-app main --port 3306
# Now connect your app to localhost:3306 with no password

# Create a branch (like git branch, for schema changes)
pscale branch create my-app add-orders-table

# Connect to the branch for testing
pscale connect my-app add-orders-table --port 3307

# Open a shell on the branch
pscale shell my-app add-orders-table
```

### Schema Branching

```sql
-- On the "add-orders-table" branch, make schema changes safely
-- These changes don't affect the main branch until you merge

CREATE TABLE orders (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status ENUM('pending', 'processing', 'completed', 'refunded') NOT NULL DEFAULT 'pending',
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_status_created (status, created_at)
);

-- Add columns to existing tables
ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD INDEX idx_stripe_customer (stripe_customer_id);
```

```bash
# Create a deploy request (like a pull request for schema changes)
pscale deploy-request create my-app add-orders-table

# Review the deploy request
pscale deploy-request diff my-app 1

# Deploy (non-blocking — zero downtime)
pscale deploy-request deploy my-app 1

# Schema changes are applied without locking tables
# PlanetScale uses Vitess's online DDL (gh-ost) under the hood
```

### Application Integration

```typescript
// src/lib/db.ts — Connect to PlanetScale
import { connect } from "@planetscale/database";

// Serverless driver (HTTP-based, works in edge functions)
const db = connect({
  host: process.env.DATABASE_HOST,
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
});

// Query
async function getOrders(userId: string) {
  const results = await db.execute(
    "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
    [userId]
  );
  return results.rows;
}

// Insert
async function createOrder(order: { userId: string; amount: number; currency: string }) {
  const result = await db.execute(
    "INSERT INTO orders (user_id, amount, currency) VALUES (?, ?, ?)",
    [order.userId, order.amount, order.currency]
  );
  return result.insertId;
}

// Transaction
async function processRefund(orderId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(
      "UPDATE orders SET status = 'refunded' WHERE id = ? AND status = 'completed'",
      [orderId]
    );
    const order = await tx.execute("SELECT * FROM orders WHERE id = ?", [orderId]);
    await tx.execute(
      "INSERT INTO refunds (order_id, amount) VALUES (?, ?)",
      [orderId, order.rows[0].amount]
    );
  });
}
```

### With Prisma ORM

```typescript
// prisma/schema.prisma — PlanetScale with Prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider     = "mysql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"    // Required: PlanetScale doesn't support foreign keys
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  plan      String   @default("free")
  orders    Order[]
  createdAt DateTime @default(now()) @map("created_at")

  @@map("users")
}

model Order {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  amount    Decimal  @db.Decimal(10, 2)
  status    String   @default("pending")
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([status, createdAt])
  @@map("orders")
}
```

```bash
# Push schema changes via Prisma (on a branch)
pscale connect my-app add-orders-table --port 3309 &
DATABASE_URL="mysql://root@localhost:3309/my-app" npx prisma db push
```

### Insights and Monitoring

```bash
# View query insights (slow queries, most frequent queries)
pscale query-insights my-app main

# View database size and row counts
pscale database show my-app

# Audit log
pscale audit-log list my-app
```

## Installation

```bash
# CLI
brew install planetscale/tap/pscale

# Serverless driver (Node.js)
npm install @planetscale/database

# With Prisma
npm install prisma @prisma/client
```

## Best Practices

1. **Branch for every schema change** — Never modify main directly; create a branch, test, then deploy via deploy request
2. **No foreign key constraints** — PlanetScale (Vitess) doesn't support FK constraints; use `relationMode = "prisma"` or enforce in application code
3. **Serverless driver for edge** — Use `@planetscale/database` (HTTP-based) for Vercel Edge, Cloudflare Workers; use mysql2 for Node.js servers
4. **Non-blocking migrations** — PlanetScale applies ALTER TABLE without locking; deploy schema changes during business hours safely
5. **Deploy request review** — Treat deploy requests like pull requests; review the diff before deploying to production
6. **Index before you need them** — Add indexes on columns you filter/sort by; PlanetScale's query insights shows which queries need them
7. **Connection string from environment** — Use `pscale connect` for local dev (no password needed); use connection strings in production
8. **Read replicas for read-heavy apps** — PlanetScale supports read-only regions; route read queries to replicas for lower latency
