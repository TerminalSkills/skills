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

Use **database-schema-designer** to audit and redesign the schema with proper normalization, **schema-versioning** to manage migrations safely with rollback support, **data-migration** to move and transform data between the old and new schema, and **db-explain-analyzer** to diagnose slow queries and recommend indexes.

## Step-by-Step Walkthrough

### 1. Audit and redesign the schema

Start by understanding the current state and designing the target schema.

> Analyze our PostgreSQL schema (45 tables) and identify design problems: denormalized data, missing foreign keys, inconsistent naming, redundant columns, and missing indexes. Design an improved schema that normalizes the worst offenders while keeping read-heavy queries performant. Output an ER diagram and a migration plan.

The audit reveals 8 tables with denormalization issues, 14 missing foreign key constraints, and 3 tables storing JSON blobs that should be separate related tables.

### 2. Set up versioned migrations with rollback

Every schema change gets a numbered migration with up and down scripts.

> Set up schema versioning for our PostgreSQL database. Create migration files for the schema improvements from step 1. Each migration should have an up and down script, be idempotent (safe to run twice), and include a data backfill step where needed. Add a CI check that validates migrations apply cleanly to a fresh database.

A migration file looks like this, with explicit up and down scripts and a data backfill:

```sql
-- Migration 003: normalize_timestamps
-- Up
ALTER TABLE users ALTER COLUMN created_at TYPE timestamptz
  USING to_timestamp(created_at::bigint);
ALTER TABLE orders ALTER COLUMN order_date TYPE timestamptz
  USING order_date::timestamptz;
UPDATE events SET recorded_at = to_timestamp(recorded_at_str, 'YYYY-MM-DD HH24:MI:SS')
  WHERE recorded_at IS NULL;
ALTER TABLE events DROP COLUMN recorded_at_str;

-- Down
ALTER TABLE events ADD COLUMN recorded_at_str varchar;
UPDATE events SET recorded_at_str = to_char(recorded_at, 'YYYY-MM-DD HH24:MI:SS');
ALTER TABLE orders ALTER COLUMN order_date TYPE varchar
  USING order_date::text;
ALTER TABLE users ALTER COLUMN created_at TYPE bigint
  USING extract(epoch FROM created_at)::bigint;
```

Each migration is tested against a fresh database in CI to ensure the full chain applies cleanly from migration 001 to the latest.

### 3. Migrate data between old and new structures

Restructuring tables requires moving data without downtime.

> We need to split the orders table (which has 2.3 million rows and stores line items as a JSON array) into a normalized orders and order_items schema. Generate a data migration that runs in batches of 1,000 rows, handles the dual-write period where both schemas are active, and verifies data integrity after completion. The API must stay online during the migration.

The migration runs in three phases. First, create the new order_items table alongside the existing orders table. Second, enable dual-write so new orders populate both schemas. Third, backfill historical data in batches of 1,000 rows with a progress counter and integrity check after each batch. Once the backfill completes and row counts match, switch reads to the new schema and drop the JSON column in a subsequent migration.

### 4. Diagnose and fix slow queries

Use EXPLAIN ANALYZE to find why critical queries are slow and what indexes to add.

> Our order listing endpoint takes 12 seconds. Here is the query. Run EXPLAIN ANALYZE and tell me why it is slow. Recommend specific indexes, query rewrites, or schema changes to bring it under 200ms. Show the before and after EXPLAIN output so I can verify the improvement.

## Real-World Example

An e-commerce platform processing 8,000 orders per day had a schema that grew organically over four years. The order listing page took 12 seconds to load because a six-table join was doing sequential scans on two tables with 2.3 million rows each. The database-schema-designer identified that the orders table was storing line items as a JSON array, forcing PostgreSQL to parse JSON on every row scan. The schema-versioning skill created a migration that split orders into orders and order_items tables. The data-migration skill moved 2.3 million orders in batches over 4 hours with zero downtime using a dual-write strategy. After the migration, the db-explain-analyzer recommended a composite index on (order_date, customer_id, status), bringing the query from 12 seconds to 85 milliseconds.

## Tips

- Always create the down migration alongside the up migration. Skipping rollback scripts saves 5 minutes now and costs 5 hours during an incident.
- Run batch data migrations during off-peak hours and throttle with a sleep between batches to avoid saturating database connections during business hours.
- Use `pg_stat_user_indexes` to verify that newly created indexes are actually being used. An unused index wastes storage and slows writes for no benefit.
- Test every migration against a database dump that matches production size. A migration that runs fine on 1,000 rows can lock a table for minutes on 2 million rows.
