---
name: duckdb
description: >
  DuckDB is an in-process analytical database that runs embedded inside your application with zero
  external dependencies. It can query CSV, Parquet, and JSON files directly without loading them into
  tables first, making it ideal for local data exploration, ETL pipelines, and analytical workloads
  where spinning up a server is overkill.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-infrastructure
  tags:
    - database
    - analytics
    - embedded
    - parquet
    - sql
---

# DuckDB

DuckDB is an embeddable SQL OLAP database. Think of it as SQLite for analytics — it runs in your process, needs no server, and is optimized for scanning and aggregating large datasets. It reads Parquet, CSV, and JSON files natively, which means you can query your data lake files with SQL without any import step.

This skill covers the CLI for ad-hoc exploration, the Python API for data science workflows, the Node.js API for application integration, and Parquet as the preferred storage format.

## CLI

Install DuckDB as a standalone binary. On macOS and Linux, a single download gives you a full-featured SQL shell.

```bash
# install — DuckDB CLI via Homebrew (macOS/Linux)
brew install duckdb
```

```bash
# install — DuckDB CLI via direct download (Linux x64)
wget https://github.com/duckdb/duckdb/releases/latest/download/duckdb_cli-linux-amd64.zip
unzip duckdb_cli-linux-amd64.zip
chmod +x duckdb
sudo mv duckdb /usr/local/bin/
```

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

The `duckdb` npm package provides async bindings for embedding DuckDB in Node.js applications.

```javascript
// duckdb-query.js — Node.js DuckDB client for analytical queries
// npm install duckdb

import duckdb from 'duckdb';

const db = new duckdb.Database(':memory:');
const conn = db.connect();

// Load a Parquet file into a table
conn.run(`CREATE TABLE events AS SELECT * FROM 'events.parquet'`);

// Query with aggregation
conn.all(`
  SELECT
    event_name,
    count(*) AS total,
    count(DISTINCT user_id) AS unique_users
  FROM events
  GROUP BY event_name
  ORDER BY total DESC
`, (err, rows) => {
  if (err) throw err;
  console.table(rows);
  db.close();
});
```

For a promise-based workflow with the newer `duckdb-async` wrapper:

```javascript
// duckdb-async-example.js — promise-based DuckDB queries in Node.js
// npm install duckdb-async

import { Database } from 'duckdb-async';

async function analyze() {
  const db = await Database.create(':memory:');

  // Query CSV directly
  const topPages = await db.all(`
    SELECT page, count(*) AS views
    FROM 'pageviews.csv'
    GROUP BY page
    ORDER BY views DESC
    LIMIT 10
  `);

  console.table(topPages);
  await db.close();
}

analyze();
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
    SELECT *, date_trunc('month', created_at) AS month
    FROM events
) TO 'data/events' (FORMAT PARQUET, PARTITION_BY (month), COMPRESSION ZSTD);
```

This creates a directory structure like `data/events/month=2025-01/data_0.parquet` that DuckDB can scan with automatic partition filtering.

### Inspecting Parquet Metadata

```sql
-- metadata — inspect Parquet file schema and row counts
SELECT * FROM parquet_metadata('events.parquet');
SELECT * FROM parquet_schema('events.parquet');
```

DuckDB's Parquet support makes it an excellent tool for building lightweight data pipelines: ingest raw data from any format, transform it with SQL, and write optimized Parquet files for downstream consumers.
