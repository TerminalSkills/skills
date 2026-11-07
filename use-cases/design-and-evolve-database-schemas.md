---
title: "Design, Migrate, and Optimize Database Schemas"
slug: design-and-evolve-database-schemas
description: "Design normalized database schemas, version them with safe migrations, move data between systems, and diagnose slow queries with explain analysis."
skills:
  - database-schema-designer
  - schema-versioning
  - data-migration
  - sql-optimizer
category: development
tags:
  - database
  - schema-design
  - migrations
  - query-optimization
  - postgresql
---

# Design, Migrate, and Optimize Database Schemas

## The Problem

Your application started with a single users table and now has 45 tables with relationships that nobody fully understands. The schema was never properly designed -- tables were added as features demanded them. There are three different ways timestamps are stored (Unix epoch, timestamptz, and varchar). A critical query takes 12 seconds because it joins six tables without proper indexes, but nobody knows how to read the EXPLAIN output. Schema changes are applied manually via SQL scripts that someone runs in production, and last month a migration dropped a column that another service still depended on.

## The Solution

Use **database-schema-designer** to audit and redesign the schema with proper normalization, **schema-versioning** to manage migrations safely with rollback support, **data-migration** to move and transform data between the old and new schema, and **sql-optimizer** to diagnose slow queries and recommend indexes.

## Step-by-Step Walkthrough

### 1. Audit and redesign the schema

Start by understanding the current state and designing the target schema. Dump the current structure without data and give it to the agent:

```console
$ pg_dump --schema-only --no-owner "$DATABASE_URL" > schema.sql
```

> Analyze our schema in schema.sql (45 tables) and identify design problems: denormalized data, missing foreign keys, inconsistent naming, redundant columns, and missing indexes. Design an improved schema that normalizes the worst offenders while keeping read-heavy queries performant. Output an ER diagram and a migration plan.

In this team's case the audit found denormalized tables, missing foreign key constraints, and JSON blobs that should be separate related tables. Review the proposed design before any migration is written: the agent works from the dump, not from your application code.

### 2. Set up versioned migrations with rollback

Every schema change gets a timestamped migration with up and down scripts. Pick a runner (Knex, Prisma Migrate or Alembic); Prisma Migrate has no down migrations, so choose Knex or Alembic if you need rollback scripts.

> Set up schema versioning for our PostgreSQL database. Create migration files for the schema improvements from step 1. Each migration should have an up and down script and include a data backfill step where needed. Test every migration against a shadow database by running up, down, then up again, and add a CI check that applies the full chain to a fresh database.

A migration looks like this, with explicit up and down scripts and a data backfill. The runner records which migrations have been applied, so each one runs once; the statements themselves are not safe to repeat. It assumes `users.created_at` is a bigint of epoch seconds, `orders.order_date` is a varchar, and `events.recorded_at_str` holds `YYYY-MM-DD HH24:MI:SS` text. Run each script in a transaction (PostgreSQL DDL is transactional). It was run against PostgreSQL 18 on sample rows in both directions.

```sql
-- Migration 20261107_normalize_timestamps
-- Up
ALTER TABLE users ALTER COLUMN created_at TYPE timestamptz
  USING to_timestamp(created_at);
ALTER TABLE orders ALTER COLUMN order_date TYPE timestamptz
  USING order_date::timestamptz;
ALTER TABLE events ADD COLUMN recorded_at timestamptz;
UPDATE events SET recorded_at = to_timestamp(recorded_at_str, 'YYYY-MM-DD HH24:MI:SS');
ALTER TABLE events ALTER COLUMN recorded_at SET NOT NULL;
ALTER TABLE events DROP COLUMN recorded_at_str;

-- Down
ALTER TABLE events ADD COLUMN recorded_at_str varchar;
UPDATE events SET recorded_at_str = to_char(recorded_at, 'YYYY-MM-DD HH24:MI:SS');
ALTER TABLE events ALTER COLUMN recorded_at_str SET NOT NULL;
ALTER TABLE events DROP COLUMN recorded_at;
ALTER TABLE orders ALTER COLUMN order_date TYPE varchar
  USING to_char(order_date, 'YYYY-MM-DD HH24:MI:SS');
ALTER TABLE users ALTER COLUMN created_at TYPE bigint
  USING extract(epoch FROM created_at)::bigint;
```

`ALTER COLUMN ... TYPE` rewrites the table under an exclusive lock, which on a large table is an outage; for those, add a new column, backfill in batches and swap. A down script cannot restore dropped data, so take a backup before applying to production. CI applies the full chain to a fresh database to ensure it runs cleanly from the first migration to the latest.

### 3. Migrate data between old and new structures

Restructuring tables requires moving data without downtime.

> We need to split the orders table (which has 2.3 million rows and stores line items as a JSON array) into a normalized orders and order_items schema. Generate a data migration that runs in batches of 1,000 rows, handles the dual-write period where both schemas are active, and verifies data integrity after completion. The API must stay online during the migration.

Ask for the three phases explicitly. First, create the new order_items table alongside the existing orders table. Second, enable dual-write so new orders populate both schemas. Third, backfill historical data in batches of 1,000 rows with a progress counter and integrity check after each batch. Once the backfill completes and row counts match, switch reads to the new schema and drop the JSON column in a subsequent migration.

### 4. Diagnose and fix slow queries

Use EXPLAIN ANALYZE to find why critical queries are slow and what indexes to add. `EXPLAIN ANALYZE` executes the statement, so for an INSERT, UPDATE or DELETE wrap it in `BEGIN; ... ROLLBACK;`.

> Our order listing endpoint takes 12 seconds. Here is the query. Run EXPLAIN (ANALYZE, BUFFERS) and tell me why it is slow. Recommend specific indexes, query rewrites, or schema changes to bring it under 200ms. Show the before and after EXPLAIN output so I can verify the improvement.

## Real-World Example

An e-commerce platform processing 8,000 orders per day had a schema that grew organically over four years. The order listing page took 12 seconds to load because a six-table join was doing sequential scans on two tables with 2.3 million rows each. The schema review identified that the orders table was storing line items as a JSON array, forcing PostgreSQL to parse JSON on every row scan. The versioned migrations split orders into orders and order_items tables. The team moved the 2.3 million orders in batches over 4 hours without downtime using a dual-write strategy. After the migration, the query analysis recommended a composite index on (order_date, customer_id, status), which brought the query from 12 seconds to 85 milliseconds on their data (their numbers, not a benchmark).

## Tips

- Always create the down migration alongside the up migration. Skipping rollback scripts saves 5 minutes now and costs 5 hours during an incident.
- Run batch data migrations during off-peak hours and throttle with a sleep between batches to avoid saturating database connections during business hours.
- Use `pg_stat_user_indexes` to verify that newly created indexes are actually being used. An unused index wastes storage and slows writes for no benefit.
- Test every migration against a database dump that matches production size. A migration that runs fine on 1,000 rows can lock a table for minutes on 2 million rows.

## Related Skills

- `database-schema-designer` — target design, indexes and constraints for the normalized schema
- `schema-versioning` — migration runner setup, shadow-database testing, rollback and CI check
- `data-migration` — batched backfill, validation and cutover for the orders split
- `sql-optimizer` — EXPLAIN analysis and index recommendations for the slow query
