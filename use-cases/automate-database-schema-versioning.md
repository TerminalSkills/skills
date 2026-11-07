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

Using the **schema-versioning** skill, the agent sets up timestamped migration files with reversible up/down functions. The **cicd-pipeline** skill validates every migration in CI before it reaches production. The **docker-helper** skill runs a disposable shadow database for safe testing. Every schema change becomes a code-reviewed pull request with an automated test that proves it can apply and roll back cleanly.

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

Running `pg_dump --schema-only --no-owner` against the existing database captures everything: tables, indexes, constraints, sequences, custom types. The SQL file is committed next to a first migration, `migrations/20250217000000_baseline_schema.ts`, whose `up` runs it with `knex.raw(fs.readFileSync(...).toString())`. Production already contains these tables, so the baseline must never run there: before the first `migrate:latest` on production, record it as applied by inserting its file name into the `knex_migrations` table (`name`, `batch`, `migration_time`), or apply it only to fresh databases. Without that step, `migrate:latest` fails on the first production deploy with "relation already exists". The baseline's `down` runs a second file, `baseline.down.sql`, with a `DROP TABLE ... CASCADE` and `DROP TYPE` for each object in the dump, which is what lets CI roll the whole chain back on an empty database; the file must never be rolled back anywhere else. Do not use `DROP SCHEMA public CASCADE` here: it also drops the `knex_migrations` table, and Knex then fails with "relation knex_migrations does not exist" while recording the rollback.

Alongside it, three supporting files:

- **`compose.shadow-db.yaml`** spins up a disposable PostgreSQL instance for testing migrations, published on `127.0.0.1` only and with its data on `tmpfs`, so it leaves nothing behind:

```yaml
services:
  shadow-db:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: app_shadow
      POSTGRES_PASSWORD: ${SHADOW_DB_PASSWORD:?set it in .env}
    ports: ["127.0.0.1:5433:5432"]
    tmpfs: ["/var/lib/postgresql"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app_shadow"]
      interval: 2s
      retries: 15
```

  Start it with `docker compose -f compose.shadow-db.yaml up -d --wait`.
- **`knexfile.ts`** reads the connection from `DATABASE_URL` (Knex does not do that by itself) and picks the `migrations` directory with `extension: "ts"`. Knex needs a TypeScript loader for `.ts` files, so install `tsx` and run Knex with `NODE_OPTIONS="--import tsx" npx knex --knexfile knexfile.ts <command>`. Production and staging differ only in the `DATABASE_URL` the pipeline injects.
- **`seeds/development.ts`** holds sample data so new developers start with a populated database instead of empty tables.

The baseline migration is the anchor point. Every future change builds on top of it, and any developer can recreate the full schema from scratch by running `migrate:latest` against an empty database.

### Step 2: Generate a Migration for a New Feature

Now the team needs an `orders` table for a new feature. Under the old process, someone would write `CREATE TABLE orders (...)` in a SQL console. Under the new process, Elena describes what she needs:

```text
I need to add an orders table with: uuid primary key, foreign key to users,
decimal total, status enum (pending/paid/shipped/cancelled), and timestamps.
Also add a composite index on (user_id, status). Generate the migration with
a working rollback.
```

The generated migration `migrations/20250217143000_create_orders_table.ts` uses a native PostgreSQL enum. In Knex that must be requested explicitly (`useNative` with an `enumName`); by default `table.enu` creates a text column with a check constraint instead of a type:

```typescript
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("orders", (t) => {
    t.uuid("id").primary().defaultTo(knex.fn.uuid());
    t.uuid("user_id").notNullable().references("id").inTable("users");
    t.decimal("total", 10, 2).notNullable();
    t.enu("status", ["pending", "paid", "shipped", "cancelled"], {
      useNative: true,
      enumName: "order_status",
    }).notNullable().defaultTo("pending");
    t.timestamps(true, true);
    t.index(["user_id", "status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("orders");
  await knex.raw("DROP TYPE IF EXISTS order_status");
}
```

The detail that catches people: Knex creates the type in `up` but does not drop it in `down`. Without the explicit `DROP TYPE`, the type lingers as an orphan and the next from-scratch run fails with "type already exists". We ran this up, `rollback --all`, up cycle against PostgreSQL 18, and `\dT` showed no leftover type after the rollback.

Before the migration is committed, it is tested against the shadow database: apply it, roll back, check the table and type are gone, and apply again. The whole cycle takes a few seconds and catches rollback bugs that would otherwise surface during a production emergency.

### Step 3: Add CI Validation for Migrations

The shadow database catches bugs locally. CI catches them before they reach anyone else's environment.

```text
Add a GitLab CI job that validates every migration on merge requests.
It should: spin up a PostgreSQL container, apply all migrations from scratch,
verify rollback works for the entire chain, and re-apply to confirm clean state.
Fail the merge request if any step breaks, and also if an already-merged migration file is modified.
```

Following **cicd-pipeline**, the job in `.gitlab-ci.yml` uses a PostgreSQL service container and runs the apply, roll back, re-apply cycle plus a file-modification check on merge request pipelines:

```yaml
migration-check:
  stage: test
  image: node:24
  services:
    - name: postgres:18-alpine
      alias: postgres
  variables:
    POSTGRES_DB: test_db
    POSTGRES_PASSWORD: ci_only_password   # throwaway database inside the job
    DATABASE_URL: postgres://postgres:ci_only_password@postgres:5432/test_db
    NODE_OPTIONS: "--import tsx"
    GIT_DEPTH: "0"
  script:
    - npm ci
    - npx knex --knexfile knexfile.ts migrate:latest
    - npx knex --knexfile knexfile.ts migrate:rollback --all
    - npx knex --knexfile knexfile.ts migrate:latest
    - |
      git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
      CHANGED=$(git diff --name-only --diff-filter=MD "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME...HEAD" -- migrations/)
      if [ -n "$CHANGED" ]; then
        echo "Migration files modified or deleted after merge: $CHANGED"
        echo "Create a new migration instead."
        exit 1
      fi
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

If any step fails, the merge request is blocked. This catches a common class of bugs: migrations that apply but fail to roll back because `down` was never tested, or that work once and break on re-apply.

The last step enforces the most important rule: once a migration has been merged to the default branch it is treated as applied in a shared environment, so its file must never change. Any modification or deletion of an existing migration file fails the check; if a migration needs fixing, add a new one. Editing an applied migration is how you get "works in dev, breaks in production" bugs.

### Step 4: Create a Rollback Runbook

Automation covers 95% of cases. The runbook covers the other 5% — the ones that happen at 2 AM when the on-call engineer is half-awake and the database is in an inconsistent state.

```text
Create a rollback script and runbook for production. I need: a one-command rollback
that reverts the last N migrations, captures the before/after state for audit,
and sends a notification to our team channel. Also document the manual rollback
procedure for when automation fails.
```

`knex migrate:rollback` reverts the whole last *batch*, not N migrations, and has no count option. To undo exactly N migrations, the script `scripts/rollback.sh` loops over `migrate:down`, which reverts one file per call:

1. Parse arguments (how many migrations to revert, which environment)
2. Take a schema snapshot (`pg_dump --schema-only`) and record `migrate:currentVersion`
3. Run `npx knex migrate:down --env "$ENVIRONMENT"` N times, stopping at the first failure (`set -euo pipefail`)
4. Take a second snapshot and diff it against the first
5. Post the diff summary to the team channel through the incoming-webhook URL in `$SLACK_WEBHOOK_URL`, a CI/CD variable and never part of the repository

Take a backup or snapshot before any production rollback: a `down` function cannot restore data that an earlier migration dropped.

The runbook `docs/ROLLBACK_RUNBOOK.md` covers the manual path for when `knex migrate:rollback` itself fails:

- **Decision tree:** "Should I roll back or fix forward?" If the migration only added things (new table, new column), fixing forward is usually safer and faster. If it changed or dropped existing structures, roll back.
- **Step-by-step manual procedure** using raw SQL for when the migration framework is the problem
- **Contact escalation paths** — who to call at 3 AM when the database is in a state that neither the script nor the manual procedure can handle

## Real-World Example

Elena initializes the infrastructure on a Thursday. The baseline migration captures every table in the database, the shadow database spins up in seconds, and the CI workflow goes live with the first PR.

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

The `up` function adds the column with an index. The `down` function removes both in the correct order (index first, then column). The CI job applies it to a fresh PostgreSQL container, rolls it back, and re-applies.

The deploy applies it with `migrate:latest`. The column appears. No video call needed. And if anything goes wrong, `npx knex migrate:rollback` is one command away instead of a frantic Slack thread asking who remembers what the original schema looked like.

The team goes from "Friday dread" to deploying schema changes three times a week with confidence. The first time someone edits a migration that is already merged, the CI check catches it and blocks the merge request with a clear message: "Migration files modified or deleted after merge. Create a new migration instead." The developer creates a corrective migration, the PR passes, and what would have been a production incident under the old process becomes a short non-event.

## Related Skills

- [schema-versioning](/skills/schema-versioning) — Provides the Knex migration workflow, the shadow-database test cycle, and the rollback-by-`migrate:down` script used here.
- [cicd-pipeline](/skills/cicd-pipeline) — Generates the GitLab CI job that applies, rolls back and re-applies every migration on merge requests.
- [docker-helper](/skills/docker-helper) — Writes the disposable PostgreSQL shadow-database Compose file with a health check and loopback-only port.
