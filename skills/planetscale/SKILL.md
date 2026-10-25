---
name: planetscale
description: >-
  PlanetScale is a managed database platform running Vitess (MySQL-compatible), Postgres and Neki (sharded Postgres), with Git-like database branches, deploy requests for non-blocking schema changes, and query insights. Use when asked to "set up PlanetScale", "create a PlanetScale branch", "run a deploy request", "use the pscale CLI", "connect to PlanetScale from serverless or edge functions", or "check slow queries on PlanetScale".
license: Apache-2.0
compatibility: pscale CLI 0.348 or newer; Node.js 22+ for the serverless driver; a PlanetScale account on a paid plan
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/planetscale/cli
  tags: "database, mysql, postgres, branching, schema-change"
---

# PlanetScale

## Overview

PlanetScale hosts three engines: Vitess (MySQL-compatible), Postgres and Neki (horizontally sharded Postgres), each on network-attached storage or Metal (local NVMe). For Vitess databases the signature workflow is: branch the database, change the schema on the branch, open a deploy request, and let PlanetScale apply it online to production without locking tables. Everything is scriptable with the `pscale` CLI (checked against v0.348.0, October 2026).

Facts that changed since early 2026 write-ups: there is no free Hobby plan (the Base plan is paid; Postgres single-node starts at $5/month), Postgres and Neki exist alongside Vitess, and foreign key constraints are supported on Vitess databases when you enable them in database settings.

## Instructions

### Install and sign in

```bash
brew install planetscale/tap/pscale        # macOS and Linux (Homebrew)
scoop bucket add pscale https://github.com/planetscale/scoop-bucket.git && scoop install pscale   # Windows
pscale auth login                          # opens a browser
pscale auth check --format json            # verify, for scripts and agents
```

On Debian or RPM systems, download the `.deb`/`.rpm` from the CLI's GitHub releases page and verify it against the release's checksums file first. In CI, skip login and use a service token: `--service-token-id` and `--service-token` (or `pscale service-token create`). Every command takes `--org` and `-f json|csv|human`. `pscale --skill` prints a ready-made agent skill from the CLI itself.

### Databases and branches

```bash
pscale database create storefront --engine mysql --wait
pscale database create billing-pg --engine postgresql --replicas 0 --wait   # single-node Postgres
pscale branch create storefront add-orders-table --wait
pscale branch schema storefront add-orders-table
pscale shell storefront add-orders-table          # uses the local mysql (or psql) client
pscale connect storefront add-orders-table --port 3307   # local proxy, no password
```

Run `pscale region list` for valid region slugs and `pscale size cluster list` for cluster sizes. `pscale connect` and `deploy-request` are Vitess-only; `shell` works for MySQL and Postgres and needs the matching client installed.

### Schema changes with deploy requests (Vitess)

The target branch must have safe migrations enabled (branch settings), otherwise you cannot deploy into it.

```bash
pscale deploy-request create storefront add-orders-table --notes "Add orders table"
pscale deploy-request diff storefront 12
pscale deploy-request deploy storefront 12 --wait
```

Useful flags: `create --into`, `--auto-delete-branch`, `--disable-auto-apply` (then run `deploy-request apply`), `deploy --instant` (MySQL `ALGORITHM=INSTANT`, faster but cannot be reverted). Subcommands also include `cancel`, `close` and `revert`.

### Connecting an app

Create a branch password (`pscale password create storefront main web-prod --role readwriter --ttl 720h`), put the values in environment variables, and connect. For Vitess over HTTP (Vercel Edge, Cloudflare Workers) use the serverless driver; for Node servers a regular `mysql2` pool works.

```typescript
// src/lib/db.ts
import { connect } from "@planetscale/database";

const db = connect({ url: process.env.DATABASE_URL }); // mysql://user:pass@host from the password page

export async function recentOrders(userId: number) {
  const { rows } = await db.execute(
    "SELECT id, amount, status FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
    [userId]
  );
  return rows;
}

export async function refund(orderId: number) {
  return db.transaction(async (tx) => {
    await tx.execute("UPDATE orders SET status = 'refunded' WHERE id = ? AND status = 'completed'", [orderId]);
    return tx.execute("SELECT id, status FROM orders WHERE id = ?", [orderId]);
  });
}
```

The serverless driver is for Vitess/MySQL only (`@planetscale/database` 2.x). For PlanetScale Postgres use a normal Postgres driver, or the Neon serverless driver for HTTP environments.

### Insights

```bash
pscale insights queries storefront main
pscale insights recommendations storefront main    # unused or missing indexes
pscale insights anomalies storefront main
pscale audit-log list --limit 20
```

## Examples

### Example 1: "Add an orders table to production without downtime"

```bash
pscale branch create storefront add-orders-table --wait
pscale shell storefront add-orders-table
# in the mysql prompt:
#   CREATE TABLE orders (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL,
#     amount DECIMAL(10,2) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending',
#     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_user (user_id));
pscale deploy-request create storefront add-orders-table
pscale deploy-request diff storefront 12
pscale deploy-request deploy storefront 12 --wait
```

Result: the diff shows one new table; after deploy the table exists on `main` and the schema was applied online.

### Example 2: "Run my migration tool against a branch"

```bash
pscale connect storefront add-orders-table --port 3309 --execute-protocol mysql --execute 'npx prisma db push'
```

`--execute` runs the command while the proxy is up and exposes `DATABASE_URL` (override the variable name with `--execute-env-url`). The URL scheme defaults to `mysql2://`; pass `--execute-protocol mysql` for tools such as Prisma that expect `mysql://`. Result: the ORM changes land on the branch only; review them with a deploy request.

## Guidelines

- Never change `main` directly; branch, then deploy request. Review the diff and lint warnings (data loss, charset, unique keys) before deploying.
- Foreign key constraints are off by default and PlanetScale does not recommend them at scale. Enable them per database in settings only if you need them (no open deploy requests allowed at that moment). Otherwise keep referential integrity in the application, and for Prisma set `relationMode = "prisma"`.
- Use least-privilege passwords: set `--role` and `--ttl`, one password per service, and keep them in environment variables or a secret manager, never in the repository.
- `pscale connect` binds to 127.0.0.1 by default; do not change `--host` to expose it.
- Reverting a deploy request is possible for a limited time without losing new data; `--instant` deploys cannot be reverted.
- Do not assume a free tier exists; check current plans at planetscale.com/docs/planetscale-plans before promising a cost.
