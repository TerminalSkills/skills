---
name: neon-serverless
category: Cloud & Serverless
tags: [postgres, serverless, database, branching, edge, autoscaling]
version: 1.0.0
author: terminal-skills
---

# Neon — Serverless Postgres

You are an expert in Neon, the serverless Postgres platform. You help developers use fully managed PostgreSQL with instant database branching, autoscaling to zero, edge-compatible HTTP driver, connection pooling, and point-in-time recovery — enabling development workflows where each PR gets its own database branch and production scales automatically based on load.

## Core Capabilities

### Connection

```typescript
// Standard Postgres driver (Node.js)
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const { rows } = await pool.query(
  "SELECT * FROM users WHERE email = $1",
  ["alice@example.com"],
);

// HTTP driver (works on Edge/Serverless — no TCP needed)
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// Tagged template queries
const users = await sql`SELECT * FROM users WHERE role = ${role} LIMIT ${limit}`;
const [user] = await sql`INSERT INTO users (name, email) VALUES (${name}, ${email}) RETURNING *`;

// Transaction
const results = await sql.transaction([
  sql`INSERT INTO orders (user_id, total) VALUES (${userId}, ${total}) RETURNING id`,
  sql`UPDATE users SET order_count = order_count + 1 WHERE id = ${userId}`,
]);
```

### With Drizzle ORM

```typescript
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { users, posts } from "./schema";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

// Type-safe queries
const allUsers = await db.select().from(users).where(eq(users.role, "admin"));

const userWithPosts = await db
  .select()
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId))
  .where(eq(users.id, userId));
```

### Database Branching

```bash
# Create branch for PR (instant, copy-on-write)
neonctl branches create --name pr-42 --parent main

# Each branch gets its own connection string
DATABASE_URL=$(neonctl connection-string pr-42)

# Run migrations on branch
npx drizzle-kit push --url $DATABASE_URL

# Delete after PR merge
neonctl branches delete pr-42

# Point-in-time restore
neonctl branches create --name recovery --parent main --restore-point "2026-03-12T10:00:00Z"
```

## Installation

```bash
npm install @neondatabase/serverless
npm install -g neonctl                    # CLI for branch management
```

## Best Practices

1. **HTTP driver on edge** — Use `@neondatabase/serverless` HTTP driver on Vercel Edge, CF Workers; no TCP needed
2. **Branch per PR** — Create database branches for preview environments; instant, zero-cost copies
3. **Autoscale to zero** — Neon suspends compute after inactivity; pay only when queries run
4. **Connection pooling** — Use pooled connection string (`-pooler` suffix) for serverless; prevents connection exhaustion
5. **Drizzle integration** — Use Drizzle ORM with Neon HTTP driver; full type safety, edge-compatible
6. **Point-in-time recovery** — Branch from any point in history; debug production issues on isolated copy
7. **Postgres extensions** — Use pgvector, PostGIS, pg_trgm; Neon supports standard Postgres extensions
8. **Free tier** — 0.5 GB storage, autoscaling compute; enough for side projects and prototyping
