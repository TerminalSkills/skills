---
name: xata
description: >-
  Xata is a managed PostgreSQL platform with instant copy-on-write database branching, zero-downtime schema migrations (pgroll), data anonymization and scale to zero. Use when the user wants to create a Xata project or branch, get a Postgres connection string, give a coding agent or pull request its own isolated database, run `xata roll` migrations, clone a production database, or asks about the old Xata TypeScript SDK (retired February 2026).
license: Apache-2.0
compatibility: "Linux or macOS (glibc) for the xata CLI, a Xata account, and a PostgreSQL client such as psql"
metadata:
  author: terminal-skills
  version: 2.0.0
  category: development
  repository: https://github.com/xataio/xata
  tags:
  - database
  - postgres
  - branching
  - migrations
  - serverless
---

# Xata — Branching PostgreSQL Platform

## Overview

Xata is a hosted PostgreSQL platform. Its main idea is the branch: a full Postgres database created from a parent in seconds with copy-on-write storage, so every developer, pull request or coding agent can have an isolated copy of real schema and data. Compute scales to zero on idle branches, schema changes run through pgroll without locking tables, and `xata clone` copies an existing database into Xata with anonymization.

**The old product is gone.** The earlier Xata (a serverless data platform with `@xata.io/client`, `@xata.io/cli`, `getXataClient()`, `xata.db.<table>.search()`, `.ask()`, file columns and `.xata/schema.json`) was retired on 28 February 2026; the `xataio/client-ts` repository is an archive and `@xata.io/client` is deprecated on npm. Do not generate code against it. Today you talk to Xata with plain SQL and any Postgres driver or ORM, and use the `xata` CLI (a standalone binary, not an npm package) for projects, branches and migrations.

## Instructions

### Concepts

- Organization contains projects; a project contains branches.
- A branch is a running Postgres cluster. A base branch (no parent) starts empty and you pick its region, instance type and Postgres version. A child branch starts as an exact copy of its parent and runs in the parent's region. `main` is only a naming convention.
- Branches are independent after creation: nothing replicates between them.
- A branch has its own connection string. Child branches start with one primary and no replicas; use at least one replica for production.

### Install and sign in

The documented installer is a shell script. Download it, read it, then run it (it checks a SHA-256 of the binary it fetches and puts `xata` in `~/.config/xata/bin`):

```bash
curl -fsSL -o /tmp/xata-install.sh https://xata.io/install.sh
less /tmp/xata-install.sh
bash /tmp/xata-install.sh
export PATH="$HOME/.config/xata/bin:$PATH"
xata auth login
```

Alternatively run the CLI from the container image, which supports PostgreSQL 16, 17 and 18 (`ghcr.io/xataio/xata:latest-pg18`) and takes `XATA_API_KEY` from the environment. There are no musl (Alpine) Linux binaries, and `xata clone` does not work with the native Windows install (use WSL).

### Project, branch, connection string

Create the organization and project in the console (console.xata.io) or with `xata organization` / `xata project`, then link the working folder:

```bash
xata init                      # writes .xata/ with org, project, branch
xata branch create --name staging --no-parent --region us-east-1 --replicas 1
xata branch create --name feature-checkout --parent-branch staging
xata branch wait-ready
xata branch url                # connection string of the checked-out branch
psql "$(xata branch url)"
```

`xata branch create` checks out the new branch in the folder when org and project are known. Useful siblings: `xata branch list`, `tree`, `checkout`, `describe`, `logs`, `metrics`, `rotate-password`, `delete <name> --yes`, and `xata branch query-insights list` for slow queries (`pg_stat_statements`). Most commands accept `--json`, which is on by default when an AI agent runs them.

Put the string in the app as `DATABASE_URL`; any Postgres client works.

### Zero-downtime schema changes

`xata roll` embeds pgroll. Migrations are YAML files in `.xata/migrations/`:

```bash
xata roll init                  # once per branch
xata roll migrate --complete    # apply outstanding files, then finish them
xata roll pull                  # write the branch's migration history to disk
xata roll status
xata roll rollback              # undo a migration that is still in progress
```

Without `--complete`, `migrate` leaves the migration in progress so old and new schema versions are both served; finish it with `xata roll complete` or undo it with `xata roll rollback`. Convert plain SQL with `xata roll convert`; adopt an existing schema with `xata roll baseline`. Ordinary SQL migrations (Drizzle Kit, Prisma, Flyway) also work, but they lose the no-lock guarantees.

### Search, vectors, files

There is no built-in search or ask API any more; use Postgres. The `vector` (pgvector 0.8.1), `pg_trgm` and `unaccent` extensions are available on PostgreSQL 14 to 18. Built-in full-text search (`tsvector`, GIN indexes) needs no extension. Store files in object storage (S3, R2) and keep the URL in a column.

### Edge and serverless

Xata implements the Neon serverless driver protocol, so `@neondatabase/serverless` connects over HTTP (single queries) or WebSocket (transactions, sessions). Hostnames without a suffix go through PgBouncer; add `-rw` to the branch id to reach the primary directly, `-ro` for replicas.

### Agents and MCP

The hosted MCP server is `https://api.xata.tech/mcp` (Streamable HTTP, OAuth or `Authorization: Bearer` API key; nothing to install). It also serves Xata's own agent skills through `list_skills` and `get_skill`. The CLI can install them: `xata skill list`, `xata skill install --agent claude-code`.

## Examples

### Example 1: Isolated database for a pull request

**User request:** "Make a Xata branch for the checkout-redesign work and run the migrations on it, don't touch main."

```bash
xata branch create --name checkout-redesign --parent-branch main --scale-to-zero true --inactivity-period 30
xata branch wait-ready
export DATABASE_URL="$(xata branch url)"
npx drizzle-kit migrate
```

The branch contains main's schema and data as of now, so the migration runs against realistic rows. When the PR merges, switch away first (`xata branch checkout main`), because the checked-out branch cannot be deleted, then run `xata branch delete checkout-redesign --yes`.

### Example 2: Change a column type without downtime

**User request:** "Make order_items.qty a numeric type on production, with a way back."

```bash
mkdir -p .xata/migrations
cat > .xata/migrations/002_qty_numeric.yaml <<'YAML'
operations:
  - alter_column:
      table: order_items
      column: qty
      type: numeric(8,2)
      up: qty::numeric
      down: round(qty)::int
YAML
xata roll init               # once per branch, skip if already done
xata roll migrate            # starts the migration, both schema versions are live
xata roll status
xata roll complete           # or: xata roll rollback
```

The first command leaves the migration in progress; the application keeps working on the old version, then `complete` removes it.

## Guidelines

1. Treat any code using `@xata.io/client`, `xata.db`, `getXataClient`, `.ask()` or `xata schema edit` as obsolete and port it to SQL plus a normal driver or ORM.
2. A branch of production data contains production data. Branch from an anonymized staging copy (`xata clone config`, `xata clone start`) for development.
3. Region is fixed at creation; to move, create a base branch elsewhere and copy with `xata clone`.
4. A branch with zero replicas has no failover target; do not use it for production.
5. Scale to zero and manual hibernation cannot be combined on one branch; hibernated branches reject connections until they wake.
6. API keys are scoped. A key with only `branch:read` gets 401 on `xata branch url`, `rotate-password`, `query-insights`, `roll url`, `clone start` (all need `credentials:read`) and on `xata branch logs` (`logs:read`). Create a separate key for MCP or CI and keep it in an environment variable.
7. `xata branch delete` destroys the database irreversibly; the checked-out branch cannot be deleted.
8. HTTP mode of the serverless driver has no transactions; use WebSocket for those.
