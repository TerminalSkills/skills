---
name: neon
description: >-
  Neon is serverless PostgreSQL with scale-to-zero compute and copy-on-write database branching. Use when setting up
  serverless databases, creating branches for development workflows, integrating with edge
  runtimes, or configuring Prisma/Drizzle with Neon. Trigger words: neon, serverless postgres,
  database branching, neon serverless driver, pgvector, neon database.
license: Apache-2.0
compatibility: "Any PostgreSQL client; @neondatabase/serverless 1.x for edge runtimes; neonctl 8.x (Node.js >= 20.19)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/neondatabase/neonctl
  category: data-ai
  tags: ["neon", "postgresql", "serverless", "database", "branching"]
---

# Neon

## Overview

Neon provides serverless PostgreSQL with scale-to-zero compute, database branching, and an HTTP-based driver for edge runtimes. It offers full PostgreSQL compatibility including extensions like pgvector, with features like copy-on-write branching for development workflows and automatic preview deployment databases.

## Instructions

- Connection strings: use the pooled one (host contains `-pooler`) for serverless functions and many short-lived clients; use the direct one for migrations, `pg_dump` and long-lived servers. Get either with `neonctl connection-string --pooled`.
- Branching: create one branch per feature or pull request with `neonctl branches create --name pr-142 --parent main --expires-at 2026-11-30T00:00:00Z`; the branch inherits schema and data from the parent and is deleted with `neonctl branches delete pr-142`. Add `--schema-only` when data must not be copied. `--project-id` can be set once with `neonctl set-context --project-id patient-sky-12345678` or taken from the `.neon` file.
- Authentication for CI: set the `NEON_API_KEY` environment variable; interactive use starts with `neonctl auth` (alias of `neonctl login`).
- Edge runtimes (Cloudflare Workers, Vercel Edge): `@neondatabase/serverless` talks HTTP for one-shot queries (`neon()`, plus `sql.transaction([...])` for non-interactive transactions) and WebSockets for sessions and interactive transactions (`Pool`/`Client`, which must be opened and closed inside one request handler).
- ORMs: Drizzle uses `drizzle-orm/neon-http` (HTTP, one query per request) or `drizzle-orm/neon-serverless` (WebSocket, supports interactive transactions); Prisma uses `@prisma/adapter-neon` with `new PrismaNeon({ connectionString })`.
- pgvector: run `CREATE EXTENSION IF NOT EXISTS vector;` in the database when you need embeddings; it is not required at project creation.
- Scaling: scale to zero suspends the compute after 5 minutes of inactivity. On the Free plan this is fixed; paid plans can change it (`--suspend-timeout` in `neonctl branches create`, where `-1` means never suspend and `0` means the default). The autoscaling range may span at most 8 CU between minimum and maximum.
- Migrations: run them against the direct connection of the branch you are working on, then let child branches be recreated or reset from the parent when they must pick up new schema.

## Examples

### Example 1: Drizzle on Neon in a Next.js route handler

**User request:** "Connect my Next.js project to Neon using Drizzle ORM"

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
neonctl connection-string --pooled   # copy into DATABASE_URL in .env.local
```

```typescript
// db/index.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

export const db = drizzle({ client: neon(process.env.DATABASE_URL!) });
```

**Result:** `db.select().from(users)` works in server components and edge routes, one HTTP request per query. Use `drizzle-orm/neon-serverless` with a `Pool` if you need interactive transactions.

### Example 2: A database branch for every pull request

**User request:** "Give each PR its own copy of the production database"

```bash
export NEON_API_KEY="$NEON_API_KEY"   # set as a CI secret, never committed
neonctl branches create --project-id "$NEON_PROJECT_ID" --name "pr-$PR_NUMBER" \
  --parent main --expires-at 2026-12-31T00:00:00Z
neonctl connection-string "pr-$PR_NUMBER" --project-id "$NEON_PROJECT_ID" --pooled
```

Pass the printed URL to the preview deployment as `DATABASE_URL`, and in the "PR closed" job run `neonctl branches delete "pr-$PR_NUMBER" --project-id "$NEON_PROJECT_ID"`.

**Result:** every PR runs against an isolated, copy-on-write branch that costs almost nothing until it diverges.

## Guidelines

- The CLI binary is `neonctl` (package `neonctl`), not `neon`.
- Pooled connections (PgBouncer, transaction mode) do not support session state such as `SET`, advisory locks held across statements or `LISTEN`; use the direct string for those and for schema migrations.
- Never commit connection strings; read them from environment variables and rotate a role password if one leaks.
- Develop against branches, not the default branch; protected branches (paid plans) cannot be deleted or reset.
- The first query after a scale-to-zero suspend takes a few hundred milliseconds.
- Cloudflare Workers with a TCP driver should use Hyperdrive rather than the WebSocket `Pool`.
