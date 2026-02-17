---
name: schema-versioning
description: >-
  Set up and manage database schema versioning with migration files, automated
  rollback capabilities, and CI/CD integration. Use when you need to version
  database changes, generate migration files from schema diffs, safely roll back
  failed deployments, or audit schema history. Trigger words: migration, schema
  change, rollback, database versioning, ALTER TABLE, Prisma migrate, Knex
  migrations, Flyway, Liquibase.
license: Apache-2.0
compatibility: "PostgreSQL 14+, MySQL 8+, or SQLite 3.35+. Node.js 18+ or Python 3.10+."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["database", "migrations", "schema", "rollback"]
---

# Schema Versioning

## Overview
This skill helps you establish a reliable database schema versioning workflow: generating timestamped migration files, testing them against a shadow database, integrating schema checks into CI/CD, and rolling back safely when deployments fail. It works with any migration tool (Prisma, Knex, TypeORM, Flyway, Alembic) and focuses on patterns rather than vendor lock-in.

## Instructions

### 1. Initialize migration infrastructure
Set up the migration directory structure and configuration:

```bash
# For Knex.js
npx knex init
npx knex migrate:make initial_schema

# For Prisma
npx prisma init
npx prisma migrate dev --name initial_schema

# For Alembic (Python)
alembic init migrations
alembic revision --autogenerate -m "initial_schema"
```

Create a shadow database for testing migrations before applying to production:

```yaml
# docker-compose.shadow-db.yml
services:
  shadow-db:
    image: postgres:16
    environment:
      POSTGRES_DB: app_shadow
      POSTGRES_PASSWORD: shadow_test
    ports:
      - "5433:5432"
```

### 2. Generate migration files from schema changes
When models change, generate the migration diff:

```typescript
// Knex migration example: 20250217_add_orders_table.ts
import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("orders", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.uuid("user_id").notNullable().references("id").inTable("users");
    table.decimal("total", 10, 2).notNullable();
    table.enum("status", ["pending", "paid", "shipped", "cancelled"]).defaultTo("pending");
    table.timestamps(true, true);
    table.index(["user_id", "status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("orders");
}
```

### 3. Test migrations safely
Always test against a shadow database before production:

```bash
# Apply all pending migrations to shadow database
DATABASE_URL="postgres://localhost:5433/app_shadow" npx knex migrate:latest

# Verify the migration is reversible
DATABASE_URL="postgres://localhost:5433/app_shadow" npx knex migrate:rollback

# Re-apply to confirm idempotency
DATABASE_URL="postgres://localhost:5433/app_shadow" npx knex migrate:latest
```

### 4. Implement rollback procedures
Create a rollback script that handles both schema and data rollbacks:

```bash
#!/bin/bash
# rollback.sh — Roll back the last N migrations
set -euo pipefail

ROLLBACK_COUNT=${1:-1}
ENVIRONMENT=${2:-staging}

echo "Rolling back $ROLLBACK_COUNT migration(s) on $ENVIRONMENT..."

# Capture current state for audit
npx knex migrate:currentVersion --env "$ENVIRONMENT" > /tmp/pre_rollback_version.txt

# Execute rollback
npx knex migrate:rollback --count "$ROLLBACK_COUNT" --env "$ENVIRONMENT"

# Verify post-rollback state
npx knex migrate:currentVersion --env "$ENVIRONMENT" > /tmp/post_rollback_version.txt

echo "Rolled back from $(cat /tmp/pre_rollback_version.txt) to $(cat /tmp/post_rollback_version.txt)"
```

### 5. CI/CD integration
Add migration checks to your pipeline:

```yaml
# .github/workflows/migration-check.yml
migration-check:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_DB: test_db
        POSTGRES_PASSWORD: test
      ports: ["5432:5432"]
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - name: Apply all migrations from scratch
      run: npx knex migrate:latest
      env:
        DATABASE_URL: postgres://postgres:test@localhost:5432/test_db
    - name: Verify rollback works
      run: npx knex migrate:rollback --all
      env:
        DATABASE_URL: postgres://postgres:test@localhost:5432/test_db
    - name: Re-apply to confirm clean state
      run: npx knex migrate:latest
      env:
        DATABASE_URL: postgres://postgres:test@localhost:5432/test_db
```

## Examples

### Example 1: Adding a column with backfill
**Prompt:** "Generate a migration that adds an `email_verified` boolean column to the users table, defaulting to false, and backfills it to true for all users who have logged in within the last 90 days."

**Agent output:**
- Creates `migrations/20250217143000_add_email_verified_to_users.ts`
- The `up` function adds the column with a default, then runs a data backfill query using `last_login_at > NOW() - INTERVAL '90 days'`
- The `down` function drops the column
- Includes a note: "Backfill runs in batches of 1,000 to avoid locking the table"

### Example 2: Renaming a table safely
**Prompt:** "I need to rename the `customers` table to `clients` without breaking the app during deployment. Generate a zero-downtime migration strategy."

**Agent output:**
- Migration 1: Create `clients` table, add trigger to sync writes from `customers` to `clients`
- Migration 2: Backfill existing data from `customers` to `clients`
- Migration 3: Create a view `customers` pointing to `clients` (backwards compatibility)
- Migration 4: Drop the view and old table after all application code references `clients`
- Each migration has a working `down` function

## Guidelines

- **Every migration must have a working `down` function** — untested rollbacks fail when you need them most.
- **Never modify a migration that has been applied** to any shared environment — create a new migration instead.
- **Use transactions** for DDL when your database supports it (PostgreSQL does, MySQL does not for most DDL).
- **Test the full sequence**: migrate up, roll back, migrate up again — this catches hidden state dependencies.
- **Keep migrations small** — one logical change per file. A 500-line migration is a red flag.
- **Add indexes in separate migrations** from table creation to avoid long locks on large tables.
- **Timestamp your migration filenames** — sequential integers cause merge conflicts in teams.
