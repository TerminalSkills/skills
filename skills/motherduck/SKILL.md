---
name: motherduck
description: Expert guidance for MotherDuck, the serverless analytics platform built on DuckDB that combines local and cloud query execution. Helps developers run SQL analytics on cloud-hosted data, share datasets, and build hybrid local-cloud data pipelines using DuckDB's familiar interface.
license: Apache-2.0
compatibility: Python 3.10+ with duckdb 1.5.6, or Node.js with @duckdb/node-api 1.5.6-r.2 (MotherDuck supports DuckDB 1.5.6, not 2.0); a MotherDuck account and access token (free tier available)
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags: "duckdb, cloud, analytics, sql, serverless"
---

# MotherDuck — Serverless DuckDB in the Cloud

## Overview

MotherDuck, the serverless analytics platform built on DuckDB that combines local and cloud query execution. Helps developers run SQL analytics on cloud-hosted data, share datasets, and build hybrid local-cloud data pipelines using DuckDB's familiar interface.

## Instructions

### Connection and Setup

Create an access token in the MotherDuck UI (organization name, then Settings, then Create token) and export it as `motherduck_token`. The DuckDB clients read that variable automatically.

```bash
export motherduck_token="$(cat ~/.secrets/motherduck_token)"   # never commit this value
```

```python
import os
import duckdb

# Without a token in the environment, the first connect opens a browser to log in
conn = duckdb.connect("md:")          # workspace mode: attaches all your databases

conn.sql("CREATE DATABASE IF NOT EXISTS analytics")
conn.sql("USE analytics")             # cloud databases persist across machines

# Single mode (one database, nothing persisted in the workspace):
conn = duckdb.connect("md:analytics")

# Explicit token in config (same value as the environment variable):
conn = duckdb.connect("md:analytics", config={"motherduck_token": os.environ["motherduck_token"]})
```

### Hybrid Queries (Local + Cloud)

```python
# Query that combines local files with cloud tables
import duckdb

conn = duckdb.connect("md:analytics")

# Upload a local Parquet file to MotherDuck
conn.sql("""
  CREATE OR REPLACE TABLE events AS
  SELECT * FROM read_parquet('local_data/events_2026_q3.parquet')
""")

# Query cloud data alongside local files (MotherDuck's "dual execution" decides
# which side runs each part of the plan)
result = conn.sql("""
  SELECT
    e.event_type,
    COUNT(*) AS event_count,
    AVG(e.duration_ms) AS avg_duration,
    u.plan AS user_plan
  FROM analytics.events e                              -- Cloud table
  JOIN read_parquet('local_data/users.parquet') u      -- Local file
    ON e.user_id = u.id
  WHERE e.created_at >= '2026-07-01'
  GROUP BY 1, 4
  ORDER BY 2 DESC
""").df()

print(result)
```

### Data Loading

Load in bulk (`CREATE TABLE ... AS SELECT`, `INSERT ... SELECT`, `COPY`), never row by row.

```python
conn = duckdb.connect("md:analytics")

# CSV from a URL or local path
conn.sql("""
  CREATE OR REPLACE TABLE sales AS
  SELECT * FROM read_csv('https://datasets.northwindlogistics.com/sales_2026.csv', header=true)
""")

# Parquet on S3 needs credentials. Store them once as a MotherDuck secret:
import os
conn.sql(f"""
  CREATE OR REPLACE SECRET northwind_s3 IN MOTHERDUCK (
    TYPE S3, KEY_ID '{os.environ["AWS_ACCESS_KEY_ID"]}',
    SECRET '{os.environ["AWS_SECRET_ACCESS_KEY"]}', REGION 'eu-west-1'
  )
""")
conn.sql("""
  CREATE OR REPLACE TABLE events AS
  SELECT * FROM read_parquet('s3://northwind-events/events/*.parquet', hive_partitioning=true)
""")

# JSON
conn.sql("CREATE OR REPLACE TABLE logs AS SELECT * FROM read_json_auto('logs/*.json')")

# Incremental load: append only rows that are not there yet
conn.sql("""
  INSERT INTO events
  SELECT * FROM read_parquet('s3://northwind-events/events/2026-10/*.parquet') n
  WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.event_id = n.event_id)
""")
```

### Sharing Databases

Sharing is done with read-only share objects created from a database. Creating one is a zero-copy, metadata-only operation. Shares are scoped to the organization's cloud region.

```python
conn = duckdb.connect("md:")

conn.sql("""
  CREATE OR REPLACE TABLE team_analytics.monthly_metrics AS
  SELECT date_trunc('month', created_at) AS month,
         COUNT(DISTINCT user_id) AS mau, SUM(amount) AS total_revenue
  FROM analytics.events GROUP BY 1 ORDER BY 1
""")   # team_analytics must already exist (CREATE DATABASE team_analytics)

# Restricted share, visible to the org, readable by every preset role
share_url = conn.sql("""
  CREATE SHARE team_analytics_share FROM team_analytics
    (ACCESS RESTRICTED, VISIBILITY DISCOVERABLE, UPDATE AUTOMATIC)
""").fetchone()
conn.sql("GRANT READ ON SHARE team_analytics_share TO ROLE explorer")
```

A recipient attaches it, which creates a read-only zero-copy clone, and queries it:

```python
conn = duckdb.connect("md:")
conn.sql("ATTACH 'md:_share/team_analytics/0a9a026ec5a55946a9de39851087ed81' AS team_analytics")  # the URL CREATE SHARE returned
conn.sql("SELECT * FROM team_analytics.monthly_metrics").show()
```

With `UPDATE MANUAL` run `UPDATE SHARE team_analytics_share` after changing the source. Use `INCLUDE_PATTERN` to expose only some tables. `ACCESS UNRESTRICTED` lets anyone in the same cloud region with the URL attach it; do not use it for private data.

### Node.js / TypeScript Integration

`duckdb-async` and the old `duckdb` package are superseded; MotherDuck's docs use `@duckdb/node-api`. Node does not cache instances by default, so use `DuckDBInstance.fromCache` or each connect reloads the MotherDuck catalog.

```typescript
// src/analytics/motherduck.ts
import { DuckDBInstance } from "@duckdb/node-api";

const instance = await DuckDBInstance.fromCache("md:analytics", {
  motherduck_token: process.env.motherduck_token!,
});

export async function getMonthlyRevenue(months = 12) {
  const connection = await instance.connect();
  const reader = await connection.runAndReadAll(
    `SELECT date_trunc('month', created_at) AS month,
            SUM(amount) AS revenue,
            COUNT(DISTINCT user_id) AS paying_users
     FROM orders
     WHERE created_at >= current_date - to_months($1::INTEGER)
       AND status = 'completed'
     GROUP BY 1 ORDER BY 1`,
    [months],
  );
  return reader.getRowObjectsJson();
}
```

Pass values as parameters (`$1`), never by string interpolation of request input.

### Scheduled Transformations

```python
# scripts/daily_transform.py — Run as a cron job to update materialized tables
import duckdb

conn = duckdb.connect("md:analytics")

# Daily aggregation — rebuild summary tables
conn.sql("""
  CREATE OR REPLACE TABLE daily_kpis AS
  SELECT
    DATE(created_at) AS date,
    COUNT(DISTINCT user_id) AS dau,
    COUNT(DISTINCT CASE WHEN event_type = 'signup' THEN user_id END) AS signups,
    COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_id END) AS purchasers,
    SUM(CASE WHEN event_type = 'purchase' THEN amount ELSE 0 END) AS revenue,
    COUNT(*) AS total_events
  FROM events
  WHERE created_at >= current_date - interval '90 days'
  GROUP BY 1
  ORDER BY 1
""")

# Cohort analysis table
conn.sql("""
  CREATE OR REPLACE TABLE cohort_retention AS
  WITH first_seen AS (
    SELECT user_id, MIN(DATE(created_at)) AS cohort_date
    FROM events
    GROUP BY 1
  )
  SELECT
    f.cohort_date,
    DATE_DIFF('week', f.cohort_date, DATE(e.created_at)) AS week_number,
    COUNT(DISTINCT e.user_id) AS active_users
  FROM events e
  JOIN first_seen f ON e.user_id = f.user_id
  WHERE f.cohort_date >= current_date - interval '12 weeks'
  GROUP BY 1, 2
""")

print("Daily transformations complete")
```

## Installation

```bash
# Use the DuckDB version MotherDuck supports (1.5.6 at the time of writing; see its release notes).
# The newest duckdb on PyPI (2.0.0) is not yet on that list.
pip install "duckdb==1.5.6"                 # Python 3.10+
npm install @duckdb/node-api@1.5.6-r.2     # Node.js
brew install duckdb                # DuckDB CLI (macOS); then: duckdb "md:analytics"
```

## Examples

### Example 1: Query a local Parquet file against cloud data

**User request:**

```
I have last month's orders in orders_2026_09.parquet on my laptop and the customers table is in MotherDuck. Give me revenue per customer segment.
```

The agent connects with `duckdb.connect("md:analytics")` (token from `motherduck_token`), joins `read_parquet('orders_2026_09.parquet')` with `analytics.customers` in one SQL statement, groups by `segment` and prints the result with `.df()`. Output is a small table such as `segment | revenue` with one row per segment; only the needed columns cross the network.

### Example 2: Share a reporting database with the finance team

**User request:**

```
Put the monthly metrics where finance can query them live instead of emailing a CSV.
```

The agent builds a `team_analytics` database with the summary table, runs `CREATE SHARE ... (ACCESS RESTRICTED, VISIBILITY DISCOVERABLE, UPDATE AUTOMATIC)`, then `GRANT READ ON SHARE ... TO ROLE explorer`. It returns the share URL, and finance attach the share and run `SELECT * FROM team_analytics.monthly_metrics`.

## Guidelines

1. **Hybrid execution** — MotherDuck pushes queries to the cloud OR runs locally depending on where data lives; leverage both
2. **Parquet for raw data** — Keep large raw data as Parquet on S3 and query it directly, or load it into a table when queried often
3. **Materialized tables for dashboards** — Pre-compute daily/weekly aggregates; don't recalculate on every dashboard load
4. **Share databases, not exports** — Instead of emailing CSVs, share a MotherDuck database; recipients get live, queryable data
5. **Use DuckDB locally for development** — Write and test queries on a local `.duckdb` file or Parquet sample, then run the same SQL against `md:`
6. **Token management** — Keep the token in `motherduck_token` (the name the DuckDB clients read) or a secret manager; never commit it. Use a read-scaling token for read-only dashboards
7. **Incremental loads** — Append new data with `INSERT ... SELECT ... WHERE NOT EXISTS`; avoid full reloads
8. **Cost awareness** — Compute is billed by usage; pre-aggregate expensive queries into summary tables. Check the pricing page for current plan limits
