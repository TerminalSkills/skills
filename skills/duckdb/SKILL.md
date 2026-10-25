---
name: duckdb
description: >
  DuckDB is an in-process analytical database that runs embedded inside your application with zero
  external dependencies. It can query CSV, Parquet, and JSON files directly without loading them into
  tables first, making it ideal for local data exploration, ETL pipelines, and analytical workloads
  where spinning up a server is overkill.
license: Apache-2.0
compatibility: 'linux, macos, windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/duckdb/duckdb
  category: data-ai
  tags: "database, analytics, embedded, parquet, sql"
---

# DuckDB

## Overview

DuckDB is an embeddable SQL OLAP database. Think of it as SQLite for analytics — it runs in your process, needs no server, and is optimized for scanning and aggregating large datasets. It reads Parquet, CSV, and JSON files natively, which means you can query your data lake files with SQL without any import step.

This skill covers the CLI for ad-hoc exploration, the Python API for data science workflows, the Node.js API for application integration, and Parquet as the preferred storage format.

## Instructions

Pick the client that fits the job: the CLI for exploration, Python or Node for pipelines. All of them run the same SQL.

## CLI

Install DuckDB as a standalone binary. On macOS and Linux, a single download gives you a full-featured SQL shell.

```bash
# install — DuckDB CLI via Homebrew (macOS/Linux)
brew install duckdb
```

```bash
# install — DuckDB CLI via direct download (Linux x64, v2.0.0 ships .tar.gz)
curl -fsSL -o duckdb-cli.tar.gz https://github.com/duckdb/duckdb/releases/download/v2.0.0/duckdb-cli-linux-amd64.tar.gz
# compare with the sha256 shown for this asset on the v2.0.0 release page before extracting
sha256sum duckdb-cli.tar.gz
tar xzf duckdb-cli.tar.gz
./duckdb --version
```

The old `releases/latest/download/duckdb_cli-linux-amd64.zip` URL returns 404 for 2.0 (the archive is now `duckdb-cli-<os>-<arch>.tar.gz`), so pin the version. `pip install duckdb` and `npm install @duckdb/node-api` need no CLI at all.

Launch the shell and start querying files directly:

```bash
# CLI — query a CSV file without creating a table
duckdb -c "SELECT country, count(*) AS orders
            FROM 'orders.csv'
            GROUP BY country
            ORDER BY orders DESC
            LIMIT 10"
```

The CLI can also persist data to a file-based database:

```bash
# CLI — create a persistent database and import data
duckdb analytics.db <<'SQL'
CREATE TABLE events AS SELECT * FROM 'raw_events.parquet';
SELECT event_name, count(*) FROM events GROUP BY event_name;
SQL
```

## Querying Files Directly

DuckDB's most powerful feature is its ability to query files in place. No CREATE TABLE, no COPY, no ETL — just point SQL at a file path or glob pattern.

```sql
-- query — scan all Parquet files in a directory
SELECT
    date_trunc('month', created_at) AS month,
    count(*) AS events
FROM 'data/events/*.parquet'
GROUP BY month
ORDER BY month;
```

```sql
-- query — join a CSV with a Parquet file
SELECT
    u.email,
    count(e.event_id) AS event_count
FROM 'users.csv' u
JOIN 'events.parquet' e ON u.id = e.user_id
GROUP BY u.email
ORDER BY event_count DESC
LIMIT 20;
```

```sql
-- query — read JSON lines (newline-delimited JSON)
SELECT * FROM read_json_auto('logs.jsonl') LIMIT 5;
```

## Python API

DuckDB's Python package integrates tightly with pandas and the broader PyData ecosystem. Install it with pip and start querying DataFrames with SQL.

```python
# duckdb_analysis.py — Python API for analytical queries
# pip install duckdb pandas

import duckdb
import pandas as pd

# DuckDB can query pandas DataFrames directly
df = pd.DataFrame({
    'user_id': [1, 2, 3, 1, 2, 1],
    'event': ['view', 'view', 'signup', 'click', 'click', 'view'],
    'ts': pd.date_range('2025-01-01', periods=6, freq='h')
})

# Query the DataFrame with SQL — no import needed
result = duckdb.sql("""
    SELECT event, count(*) AS total, count(DISTINCT user_id) AS users
    FROM df
    GROUP BY event
    ORDER BY total DESC
""").fetchdf()

print(result)
```

For persistent databases with the Python API:

```python
# duckdb_persistent.py — persistent database with Python
# pip install duckdb

import duckdb

# Open or create a database file
con = duckdb.connect('analytics.db')

# Create a table from a Parquet file
con.execute("""
    CREATE TABLE IF NOT EXISTS events AS
    SELECT * FROM 'raw_events.parquet'
""")

# Run aggregation
daily_stats = con.execute("""
    SELECT
        date_trunc('day', created_at) AS day,
        count(DISTINCT user_id) AS dau,
        count(*) AS total_events
    FROM events
    WHERE created_at >= current_date - INTERVAL '30 days'
    GROUP BY day
    ORDER BY day
""").fetchdf()

print(daily_stats)
con.close()
```

## Node.js API

Use `@duckdb/node-api` (the "Neo" client, promise-based, current line 2.0). The older `duckdb` npm package is deprecated and stops at 1.4.x, and `duckdb-async` is only a wrapper around it.

```javascript
// duckdb-query.mjs — Node.js DuckDB client for analytical queries
// npm install @duckdb/node-api

import { DuckDBInstance } from '@duckdb/node-api';

const instance = await DuckDBInstance.create(':memory:');
const conn = await instance.connect();

await conn.run(`CREATE TABLE events AS SELECT * FROM 'events.parquet'`);

const reader = await conn.runAndReadAll(`
  SELECT event_name, count(*) AS total, count(DISTINCT user_id) AS unique_users
  FROM events
  GROUP BY event_name
  ORDER BY total DESC
`);

// BIGINT columns come back as JS bigint; getRowObjectsJson() turns them into strings
console.table(reader.getRowObjectsJson());
conn.closeSync();
```

## Parquet Integration

Parquet is a columnar file format that pairs naturally with DuckDB. It compresses well, preserves types, and enables predicate pushdown so DuckDB can skip irrelevant row groups without reading entire files.

### Writing Parquet

```sql
-- export — write query results to a Parquet file
COPY (
    SELECT user_id, event_name, created_at
    FROM 'raw_events.csv'
    WHERE created_at >= '2025-01-01'
) TO 'filtered_events.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
```

### Partitioned Parquet

For large datasets, partition your Parquet output by a key column to enable partition pruning:

```sql
-- export — write partitioned Parquet files by month
COPY (
    SELECT *, strftime(created_at, '%Y-%m') AS month
    FROM events
) TO 'data/events' (FORMAT PARQUET, PARTITION_BY (month), COMPRESSION ZSTD);
```

Create the parent folder first (`mkdir -p data`); the copy fails with "Failed to create directory" if it is missing. It then writes `data/events/month=2025-01/data_0.parquet` and so on. Partition on a string or integer column: a timestamp such as `date_trunc('month', ...)` produces directory names like `month=2025-01-01%2000%3A00%3A00`. Read it back with `read_parquet('data/events/*/*.parquet', hive_partitioning = true)` to get `month` as a column and let `WHERE month = '2025-01'` skip folders.

### Inspecting Parquet Metadata

```sql
-- metadata — inspect Parquet file schema and row counts
SELECT * FROM parquet_file_metadata('events.parquet');  -- rows, row groups, creator
SELECT * FROM parquet_metadata('events.parquet');       -- per column chunk statistics
SELECT * FROM parquet_schema('events.parquet');
```

DuckDB's Parquet support makes it an excellent tool for building lightweight data pipelines: ingest raw data from any format, transform it with SQL, and write optimized Parquet files for downstream consumers.

## Examples

**"How many orders per month does each country have in these CSV exports?"**

```bash
duckdb -c "SELECT country, strftime(created_at, '%Y-%m') AS month, count(*) AS orders
           FROM read_csv('exports/orders-*.csv')
           GROUP BY ALL ORDER BY month, orders DESC"
```

The result is a table with columns `country`, `month`, `orders`, one row per pair.

**"Turn this 2 GB CSV into something fast to query."**

```bash
duckdb -c "COPY (SELECT * FROM 'orders.csv') TO 'orders.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)"
duckdb -c "SELECT count(*), sum(amount) FROM 'orders.parquet'"
```

The Parquet file is usually much smaller than the CSV and scans only the columns the query names.

## Guidelines

- Check the storage-format compatibility notes in the DuckDB docs before opening one database file from clients of different major versions; keep the CLI, Python and Node clients on the same release.
- When stdout is not a terminal and `AI_AGENT` is set, the 2.0 CLI prints Markdown-style tables and a banner line; pass `-no-agent` for normal output, or use `-csv` / `-json` when another program parses the result.
- A bare file name in `FROM 'orders.csv'` is resolved relative to the working directory; use `read_csv('orders.csv', header = true)` when type sniffing guesses wrong.
- Only one process can open a database file read-write; open it with `duckdb.connect('analytics.db', read_only=True)` for concurrent readers.
- DuckDB is for analytics on one machine. It is not a replacement for a multi-writer transactional server such as PostgreSQL.
