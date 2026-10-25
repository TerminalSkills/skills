---
name: data-migration
description: >-
  Plans and scripts data migrations between SQL databases: schema mapping, type
  conversion, batched and resumable loading, validation and cutover. Use when the
  user mentions "data migration,"
  "database migration," "migrate from MySQL to PostgreSQL," "schema migration,"
  "ETL pipeline," "data transfer," "database consolidation," "legacy migration,"
  or "move data between databases." Covers schema analysis, mapping, transformation,
  batch processing, validation, and cutover planning. For query optimization during
  migration, see sql-optimizer.
license: Apache-2.0
compatibility: "Any SQL database (PostgreSQL, MySQL, SQLite, MSSQL)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "migration, database, etl, data-pipeline, schema"
---

# Data Migration

## Overview

Builds automated data migration pipelines between databases. Handles schema analysis and mapping, type conversions, data transformations, dependency-ordered table loading, batch processing for large datasets, checkpoint/resume for reliability, post-migration validation, and cutover planning. Produces repeatable scripts that can be dry-run against staging before production.

## Instructions

### 1. Schema Analysis

Start every migration by analyzing source and target:

```
For each table in source:
  - Column names, types, nullability, defaults
  - Primary keys and auto-increment sequences
  - Foreign key relationships (build dependency graph)
  - Indexes and unique constraints
  - Row count estimate (for batch sizing)
  - Encoding/collation (especially for MySQL → PostgreSQL)
```

Generate a schema map document listing every column with its source type, target type, and any transformation needed.

### 2. Type Mapping

Common cross-database type conversions:

| MySQL | PostgreSQL | Notes |
|-------|-----------|-------|
| TINYINT(1) | BOOLEAN | Map 0/1 to false/true |
| ENUM('a','b') | VARCHAR + CHECK | Or create custom TYPE |
| DATETIME | TIMESTAMPTZ | DATETIME stores no time zone: decide which zone the values were written in, then convert. MySQL converts TIMESTAMP itself, not DATETIME. DATETIME ranges 1000-9999; TIMESTAMP only 1970-2038 |
| INT AUTO_INCREMENT | SERIAL | Reset sequence after migration |
| DOUBLE | DOUBLE PRECISION | Direct mapping |
| BLOB | BYTEA | Binary data |
| TEXT (latin1) | TEXT (UTF-8) | Re-encode characters |
| JSON | JSONB | Use binary JSON in PG |

### 3. Dependency Resolution

Build a directed acyclic graph from foreign keys:

```
1. Parse all FK constraints → build adjacency list
2. Topological sort → migration order
3. Circular dependencies: temporarily drop FK, migrate, re-add FK
4. Self-referencing tables: migrate in two passes (data, then self-FK updates)
```

### 4. Batch Processing

For tables with more than 10,000 rows:

```
function migrateLargeTable(table, batchSize = 5000):
  lastId = loadCheckpoint(table) or 0
  while true:
    rows = SELECT * FROM source.table WHERE id > lastId ORDER BY id LIMIT batchSize
    if rows.empty: break
    transformed = rows.map(row => transform(row, table.mapping))
    INSERT INTO target.table VALUES transformed
    lastId = rows.last.id
    saveCheckpoint(table, lastId, totalMigrated)
```

Performance targets:
- 5,000 rows/batch for most tables
- 1,000 rows/batch for tables with BLOB/TEXT columns
- Disable target indexes during bulk load, rebuild after

### 5. Validation

Post-migration validation checklist:

```
1. Row counts: source vs target for every table
2. Random sampling: 100 random rows per table, field-by-field comparison
3. Aggregate checks: SUM, COUNT, MIN, MAX on numeric columns
4. Referential integrity: all FKs resolve (no orphans)
5. Encoding: sample text fields for valid UTF-8
6. Sequences: verify auto-increment/serial values set above max ID
7. Nullability: no unexpected NULLs in NOT NULL target columns
```

### 6. Cutover Planning

Three strategies by downtime tolerance:

**Full downtime** (simplest): Stop app → migrate → validate → start app. For small datasets (< 1M rows, < 1 hour).

**Minimal downtime** (recommended): Pre-migrate bulk data → set up change capture → maintenance mode → apply delta → switch → validate. Downtime: 2-10 minutes.

**Zero downtime** (complex): Dual-write to both databases → background migration → gradual read traffic shift → drop old writes. Requires application changes.

## Examples

### Example 1: MySQL to PostgreSQL

**Prompt**: "Migrate our MySQL 5.7 database to PostgreSQL 16. 30 tables, biggest is 5M rows."

**Output**: Schema mapping JSON, type conversion DDL, migration script with dependency ordering, batch processing for large tables, checkpoint file, validation suite, and cutover runbook.

### Example 2: Database Consolidation

**Prompt**: "Merge two SQLite databases into one PostgreSQL. Some tables overlap with different schemas."

**Output**: Schema diff report, merge strategy document (which columns win conflicts), deduplication logic using configurable match keys, migration script, and conflict resolution log.

## Guidelines

- **Always dry-run on staging first** — never run migration directly against production
- **Keep source untouched** — migration should be read-only on source until cutover
- **Checkpoint everything** — large migrations will fail; resumability is required
- **Validate before cutover** — automated validation catches what manual spot-checks miss
- **Plan rollback** — if target validation fails, have a documented path back to source
- **Log extensively** — rows processed, rows skipped, transformation errors, timing
- **Reset sequences** — after migration, set serial/auto-increment above max migrated ID. In PostgreSQL, for each table with a `serial` column (tested on PostgreSQL 16):

  ```sql
  SELECT setval(pg_get_serial_sequence('orders', 'id'), coalesce(max(id), 0) + 1, false) FROM orders;
  ```

  The `false` makes the next `nextval` return exactly that value, so an empty table also resets to 1. Passing `true` together with `max(id) + 1` would skip one number.
- **Test with production volume** — a script that works on 1000 rows may OOM on 5M
