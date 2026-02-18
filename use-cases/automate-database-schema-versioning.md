---
title: "Set Up Automated Database Schema Versioning and Rollback"
slug: automate-database-schema-versioning
description: "Establish a migration workflow with version-controlled schema changes, CI validation, and one-command rollback for failed deployments."
skills: [schema-versioning, cicd-pipeline, docker-helper]
category: development
tags: [database, migrations, rollback, schema, devops]
---

# Set Up Automated Database Schema Versioning and Rollback

## The Problem

Your team makes database changes by hand. Someone writes an ALTER TABLE statement, tests it locally, pastes it into a production SQL console, and hopes it works. There's no record of what changed when, no way to roll back cleanly, and no automated check that the migration is reversible. When a deploy breaks because a column rename didn't propagate to all app servers, the "rollback" is another hand-written SQL script cobbled together under pressure. Last month a developer dropped a column that another service still depended on — there was no way to know because schema changes weren't tracked alongside application code. The team spends Friday afternoons dreading Monday deploys.

## The Solution

Use the **schema-versioning** skill to set up timestamped migration files with reversible up/down functions, **cicd-pipeline** to validate every migration in CI before it reaches production, and **docker-helper** to run a shadow database for safe testing. Every schema change becomes a code-reviewed pull request with an automated test that proves it can apply and roll back cleanly.

```bash
npx terminal-skills install schema-versioning cicd-pipeline docker-helper
```

## Step-by-Step Walkthrough

### 1. Initialize the migration infrastructure

```text
Set up database migration infrastructure for my Node.js app using Knex.js and
PostgreSQL. I need: a migrations directory with timestamp-based naming, a shadow
database via Docker for testing, and a seed file for development data. We currently
have 12 tables created manually — generate an initial migration that captures the
current schema as the baseline.
```

The agent runs `pg_dump --schema-only` against the existing database, converts the output into a Knex migration file `20250217000000_baseline_schema.ts`, creates `docker-compose.shadow-db.yml` for a test PostgreSQL instance, and adds `knexfile.ts` with configurations for development, shadow, staging, and production environments.

### 2. Generate a migration for a new feature

```text
I need to add an orders table with: uuid primary key, foreign key to users,
decimal total, status enum (pending/paid/shipped/cancelled), and timestamps.
Also add a composite index on (user_id, status). Generate the migration with
a working rollback.
```

The agent creates `migrations/20250217143000_create_orders_table.ts` with a `createTable` call in `up` and `dropTableIfExists` in `down`. It tests the migration against the shadow database: applies it, rolls back, re-applies — confirming the full cycle works. It flags that the enum type needs a separate `DROP TYPE` in the down function for PostgreSQL.

### 3. Add CI validation for migrations

```text
Add a GitHub Actions workflow that validates every migration on pull requests.
It should: spin up a PostgreSQL container, apply all migrations from scratch,
verify rollback works for the entire chain, and re-apply to confirm clean state.
Fail the PR if any step breaks.
```

The agent creates `.github/workflows/migration-check.yml` with a PostgreSQL service container. The workflow runs three steps: `migrate:latest`, `migrate:rollback --all`, `migrate:latest` again. If any step fails, the PR is blocked. It also adds a step that checks for migration files modified after they were already applied (a common source of production bugs).

### 4. Create a rollback runbook

```text
Create a rollback script and runbook for production. I need: a one-command rollback
that reverts the last N migrations, captures the before/after state for audit,
and sends a notification to our team channel. Also document the manual rollback
procedure for when automation fails.
```

The agent generates `scripts/rollback.sh` with argument parsing, pre-rollback state capture, migration rollback execution, post-rollback verification, and a curl-based webhook notification. It also creates `docs/ROLLBACK_RUNBOOK.md` with step-by-step manual procedures, a decision tree for "should I roll back or fix forward?", and contact escalation paths.

## Real-World Example

Elena, lead developer on a six-person team building a logistics platform, inherits a PostgreSQL database with 40 tables and zero migration history. Deployments require a senior developer to manually run SQL scripts while the team watches nervously on a video call. Last sprint, a migration to add a `tracking_number` column to the shipments table failed halfway through because the column already existed on staging — someone had applied it manually weeks earlier and forgotten to tell the team.

1. Elena asks the agent to dump the current schema as a baseline migration and initialize the Knex migration infrastructure
2. The agent generates the baseline, shadow database config, and CI workflow in one pass
3. She asks the agent to create the `tracking_number` migration properly — with idempotent checks and a tested rollback
4. The agent generates the migration with `IF NOT EXISTS` guard and a clean down function, then validates it against the shadow database
5. She asks the agent to add the CI validation workflow so no migration reaches production without automated testing
6. The next deploy: Elena runs `npx knex migrate:latest` — it takes 2 seconds, the new column appears, and if anything goes wrong, `npx knex migrate:rollback` is one command away

The team goes from "Friday dread" to deploying schema changes three times a week with confidence.
