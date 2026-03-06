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

Elena's team makes database changes by hand. Someone writes an `ALTER TABLE` statement, tests it locally, pastes it into a production SQL console, and hopes it works. There is no record of what changed when, no way to roll back cleanly, and no automated check that the migration is reversible. When a deploy breaks because a column rename didn't propagate to all app servers, the "rollback" is another hand-written SQL script cobbled together under pressure at 11 PM.

Last month, a developer dropped a column that another service still depended on. There was no way to know — schema changes weren't tracked alongside application code, so there was no PR to review, no diff to catch the dependency. The month before that, someone applied a migration manually to staging and forgot to tell the team. The next automated deploy failed because the column already existed, and debugging the "column already exists" error took an hour because nobody knew who had changed what.

The team spends Friday afternoons dreading Monday deploys. Deployments that should take seconds instead require a senior developer on a video call manually running SQL scripts while the team watches nervously.

## The Solution

Using the **schema-versioning** skill, the agent sets up timestamped migration files with reversible up/down functions. The **cicd-pipeline** skill validates every migration in CI before it reaches production. The **docker-helper** skill runs a shadow database for safe testing. Every schema change becomes a code-reviewed pull request with an automated test that proves it can apply and roll back cleanly.

## Step-by-Step Walkthrough

### Step 1: Initialize the Migration Infrastructure

Elena has a Node.js app with PostgreSQL and 12 tables — all created manually over the past two years through a mix of SQL console sessions and hasty `ALTER TABLE` commands. Nobody has a definitive record of the current schema. The first step is capturing what actually exists as a versioned baseline.

```text
Set up database migration infrastructure for my Node.js app using Knex.js and
PostgreSQL. I need: a migrations directory with timestamp-based naming, a shadow
database via Docker for testing, and a seed file for development data. We currently
have 12 tables created manually — generate an initial migration that captures the
current schema as the baseline.
```

Running `pg_dump --schema-only` against the existing database captures everything: tables, indexes, constraints, sequences, custom types. That output gets converted into `migrations/20250217000000_baseline_schema.ts` — a proper Knex migration file that can recreate the entire database from scratch.

Alongside it, three supporting files:

- **`docker-helper.shadow-db.yml`** — spins up a disposable PostgreSQL instance for testing migrations. It starts in 2 seconds and can be torn down without affecting any real data.
- **`knexfile.ts`** — configurations for four environments: development (local Postgres), shadow (Docker container), staging, and production. Each has its own connection string and migration table name.
- **`seeds/development.ts`** — sample data so new developers can start with a populated database instead of staring at empty tables.

The baseline migration is the anchor point. Every future change builds on top of it, and any developer can recreate the full schema from scratch by running `knex migrate:latest` against an empty database. No more "ask Elena for the SQL dump from last Thursday."

### Step 2: Generate a Migration for a New Feature

Now the team needs an `orders` table for a new feature. Under the old process, someone would write `CREATE TABLE orders (...)` in a SQL console. Under the new process, Elena describes what she needs:

```text
I need to add an orders table with: uuid primary key, foreign key to users,
decimal total, status enum (pending/paid/shipped/cancelled), and timestamps.
Also add a composite index on (user_id, status). Generate the migration with
a working rollback.
```

The generated migration file `migrations/20250217143000_create_orders_table.ts` has a `createTable` call in `up` and `dropTableIfExists` in `down`. But here is the detail that catches people off guard with PostgreSQL: the enum type. The `up` function creates a custom `order_status` type with `CREATE TYPE`, and the `down` function needs a separate `DROP TYPE` after dropping the table — otherwise the type lingers as an orphan in the database, and the next time someone tries to create the migration from scratch, it fails with "type already exists."

Before the migration is committed, it gets tested against the shadow database: apply the migration, verify the table exists with the right columns, roll back, verify the table and type are both gone, re-apply to confirm the full cycle is clean. This triple-check takes 3 seconds and catches rollback bugs that would otherwise only surface during a production emergency.

### Step 3: Add CI Validation for Migrations

The shadow database catches bugs locally. CI catches them before they reach anyone else's environment.

```text
Add a GitHub Actions workflow that validates every migration on pull requests.
It should: spin up a PostgreSQL container, apply all migrations from scratch,
verify rollback works for the entire chain, and re-apply to confirm clean state.
Fail the PR if any step breaks.
```

The workflow `.github/workflows/migration-check.yml` uses a PostgreSQL service container and runs three steps in sequence:

```yaml
steps:
  - name: Apply all migrations
    run: npx knex migrate:latest

  - name: Roll back entire chain
    run: npx knex migrate:rollback --all

  - name: Re-apply to confirm clean state
    run: npx knex migrate:latest
```

If any step fails, the PR is blocked. This catches a surprisingly common class of bugs: migrations that apply correctly but fail to roll back because the `down` function was never tested, or migrations that work the first time but break on re-apply because they create something without an `IF NOT EXISTS` guard.

There is also a check that flags migration files modified after they were already applied to staging or production. This is a subtle but important rule: once a migration has run in a shared environment, its file should never change. If the migration needs fixing, create a new migration instead. Editing a previously-applied migration is how you get "works in dev, breaks in production" bugs.

### Step 4: Create a Rollback Runbook

Automation covers 95% of cases. The runbook covers the other 5% — the ones that happen at 2 AM when the on-call engineer is half-awake and the database is in an inconsistent state.

```text
Create a rollback script and runbook for production. I need: a one-command rollback
that reverts the last N migrations, captures the before/after state for audit,
and sends a notification to our team channel. Also document the manual rollback
procedure for when automation fails.
```

The script `scripts/rollback.sh` handles the automated path:

1. Parse arguments (how many migrations to revert)
2. Capture pre-rollback state: table counts, schema snapshot, current migration version
3. Execute `knex migrate:rollback` for the specified number of steps
4. Capture post-rollback state and diff against pre-rollback
5. Send a webhook notification to the team Slack channel with the diff

The runbook `docs/ROLLBACK_RUNBOOK.md` covers the manual path for when `knex migrate:rollback` itself fails:

- **Decision tree:** "Should I roll back or fix forward?" If the migration only added things (new table, new column), fixing forward is usually safer and faster. If it changed or dropped existing structures, roll back.
- **Step-by-step manual procedure** using raw SQL for when the migration framework is the problem
- **Contact escalation paths** — who to call at 3 AM when the database is in a state that neither the script nor the manual procedure can handle

## Real-World Example

Elena initializes the infrastructure on a Thursday. The baseline migration captures all 12 tables (which have grown to 40 over two years of manual changes), the shadow database spins up in seconds, and the CI workflow goes live with the first PR.

The following Tuesday, a developer needs to add a `tracking_number` column to the shipments table. Under the old process, this would have been `ALTER TABLE shipments ADD COLUMN tracking_number VARCHAR(50)` pasted into a production SQL console during a "deploy call" — a video call where the team watches nervously while a senior developer types SQL. This time, the developer creates a migration file:

```typescript
// migrations/20250224091500_add_tracking_number.ts
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('shipments', (table) => {
    table.string('tracking_number', 50).nullable();
    table.index('tracking_number');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('shipments', (table) => {
    table.dropIndex('tracking_number');
    table.dropColumn('tracking_number');
  });
}
```

The `up` function adds the column with an index. The `down` function removes both in the correct order (index first, then column). The CI workflow applies it to a fresh PostgreSQL container, rolls it back, and re-applies — all green in 8 seconds.

The deploy takes 2 seconds. The column appears. No video call needed. And if anything goes wrong, `npx knex migrate:rollback` is one command away instead of a frantic Slack thread asking who remembers what the original schema looked like.

The team goes from "Friday dread" to deploying schema changes three times a week with confidence. The first time someone accidentally applies a migration to staging and then opens a PR that modifies the migration file, the CI check catches it immediately and blocks the PR with a clear message: "Migration file was modified after being applied. Create a new migration instead." The developer creates a corrective migration, the PR passes, and what would have been a production incident under the old process becomes a 5-minute non-event.
