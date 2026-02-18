---
title: "Automate Data Migration Between Databases"
slug: automate-database-migration
description: "Build an automated pipeline to migrate data between databases with schema mapping, validation, and zero-downtime cutover."
skills: [data-migration, sql-optimizer]
category: development
tags: [database, migration, etl, data-pipeline, schema]
---

# Automate Data Migration Between Databases

## The Problem

Migrating data between databases — whether switching from MySQL to PostgreSQL, consolidating legacy systems, or moving to a new schema — is terrifying. You need to map columns between different schemas, transform data types, handle foreign key dependencies in the right order, validate that nothing was lost, and do it all without extended downtime. Most teams write throwaway scripts that break halfway through and leave data in an inconsistent state.

## The Solution

Use the **data-migration** skill to build the migration pipeline with schema mapping, transformation logic, and validation, and **sql-optimizer** to ensure the migration queries perform well on large datasets. The agent creates a repeatable, testable migration that you can dry-run before the real cutover.

```bash
npx terminal-skills install data-migration sql-optimizer
```

## Step-by-Step Walkthrough

### 1. Analyze the source and target schemas

```text
I'm migrating from a legacy MySQL 5.7 database to PostgreSQL 16.
Source has 45 tables, ~12M rows total. The big tables are orders (4M rows),
order_items (8M rows), and customers (500K rows). Some columns need renaming,
some ENUM types need converting, and DATETIME columns need timezone handling.
Generate the schema mapping.
```

```text
Analyzed source schema (MySQL 5.7) → target schema (PostgreSQL 16):

Schema Mapping Report:
  Tables: 45 total, 38 direct mappings, 7 need transformation
  
  Type conversions needed:
    TINYINT(1) → BOOLEAN (12 columns across 8 tables)
    ENUM('active','inactive') → VARCHAR with CHECK constraint (5 columns)
    DATETIME → TIMESTAMPTZ (all timestamp columns — 34 total)
    INT AUTO_INCREMENT → SERIAL / BIGSERIAL
    DOUBLE → DOUBLE PRECISION
    TEXT with latin1 → TEXT (re-encode to UTF-8)

  Column renames (from legacy conventions):
    customers.cust_name → customers.name
    orders.ord_date → orders.created_at
    orders.ord_status → orders.status
    
  Created: migration/schema-map.json — Full column-by-column mapping
  Created: migration/create-target-schema.sql — PostgreSQL DDL
```

### 2. Build the migration pipeline with dependency ordering

```text
Build the migration script. Tables have foreign keys so order matters.
I need: dependency resolution, batch processing for large tables,
and the ability to resume if it fails midway.
```

```text
Created migration/migrate.ts — Main migration orchestrator
Created migration/dependency-graph.ts — FK-based table ordering
Created migration/batch-reader.ts — Cursor-based batch reading
Created migration/transform.ts — Per-table transformation functions
Created migration/state.ts — Checkpoint tracking for resume

Migration order (topological sort by foreign keys):
  1. customers, products, categories (no dependencies)
  2. orders (depends on customers)
  3. order_items (depends on orders, products)
  4. payments (depends on orders)
  ... (45 tables total, 6 dependency levels)

Batch processing:
  Small tables (< 10K rows): single INSERT ... SELECT
  Large tables (> 10K rows): batches of 5,000 with cursor pagination
  orders (4M rows): ~800 batches, estimated 12 minutes
  order_items (8M rows): ~1,600 batches, estimated 25 minutes

Checkpoint: after each batch, save { table, lastId, rowsMigrated } to state file.
On resume: skip completed tables, continue from last checkpoint.
```

### 3. Handle data transformations

```text
The customers table has address data split across 5 columns in MySQL.
In PostgreSQL, I want it in a JSONB column. Also, phone numbers are stored
inconsistently — some have dashes, some have country codes, some don't.
Normalize during migration.
```

```text
Updated migration/transform.ts — Added customer transformation:

Address consolidation:
  MySQL: street, city, state, zip, country (5 columns)
  PostgreSQL: address JSONB → { street, city, state, zip, country }
  Null handling: if all 5 fields null → address = null (not empty object)

Phone normalization:
  Step 1: Strip all non-numeric characters
  Step 2: If 10 digits → prepend +1 (US default)
  Step 3: If 11 digits starting with 1 → prepend +
  Step 4: If doesn't match any pattern → keep original, flag for review
  
  Flagged rows written to migration/review/phones-to-check.csv
  Estimated: ~2% of records will need manual review based on sample analysis
```

### 4. Validate the migration

```text
After migration, validate that all data transferred correctly.
Check row counts, spot-check random records, verify foreign key integrity,
and compare aggregates (sum of order totals, count of active customers).
```

```text
Created migration/validate.ts — Post-migration validation suite

Validation checks:
  ✓ Row counts: compare source vs target for all 45 tables
  ✓ Random sample: 100 random records per table, field-by-field comparison
  ✓ Foreign keys: verify all FK references resolve (no orphaned records)
  ✓ Aggregates:
      SUM(orders.total) — source vs target
      COUNT(customers WHERE status='active') — source vs target
      COUNT(DISTINCT order_items.product_id) — source vs target
  ✓ Null check: no unexpected NULLs in NOT NULL columns
  ✓ Encoding: sample TEXT fields for UTF-8 validity

Output: migration/validation-report.json with pass/fail per check
Estimated runtime: 3 minutes for full validation suite
```

### 5. Plan zero-downtime cutover

```text
Plan the cutover strategy. I need minimal downtime — the app serves
real customers. Can we do it with less than 5 minutes of downtime?
```

```text
Cutover Plan — Estimated downtime: 2-3 minutes

Phase 1 — Pre-migration (zero downtime):
  1. Run full migration to PostgreSQL (background, ~40 min)
  2. Set up logical replication from MySQL to capture changes during migration
  3. Validate migrated data

Phase 2 — Delta sync (zero downtime):
  4. Apply accumulated changes from replication log
  5. Re-validate affected tables

Phase 3 — Cutover (2-3 min downtime):
  6. Set app to maintenance mode
  7. Apply final delta (should be < 1000 rows)
  8. Switch application database config to PostgreSQL
  9. Run quick validation (row counts + latest 100 orders)
  10. Remove maintenance mode

Rollback plan:
  If validation fails at step 9: revert config to MySQL, exit maintenance.
  MySQL is untouched throughout — it's always the fallback.
```

## Real-World Example

A senior developer is consolidating two legacy MySQL databases into a single PostgreSQL instance for a mid-size e-commerce operation. The two systems have overlapping customer records with different ID schemes. The combined dataset is 20M rows.

1. She feeds both schemas to the agent and describes the merge rules for duplicate customers
2. The agent builds a migration pipeline with deduplication logic using email as the merge key
3. She runs it against a staging copy — catches 340 phone numbers that need manual review
4. After fixing edge cases, she runs validation: all row counts match, aggregates within 0.01%
5. Saturday night cutover takes 4 minutes of downtime. The legacy systems are retired Monday
