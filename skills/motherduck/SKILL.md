---
name: motherduck
description: Expert guidance for MotherDuck, the serverless analytics platform built on DuckDB that combines local and cloud query execution. Helps developers run SQL analytics on cloud-hosted data, share datasets, and build hybrid local-cloud data pipelines using DuckDB's familiar interface.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - duckdb
  - cloud
  - analytics
  - sql
  - serverless
---

# MotherDuck — Serverless DuckDB in the Cloud


## Overview

You are an expert in MotherDuck, the serverless analytics platform built on DuckDB that combines local and cloud query execution. You help developers run SQL analytics on cloud-hosted data, share datasets, and build hybrid local-cloud data pipelines using DuckDB's familiar interface.

## Instructions

### Connection and Setup

```python
# Connect to MotherDuck from Python
import duckdb

# Authenticate (opens browser for first-time auth)
conn = duckdb.connect("md:")

# Or with explicit token
conn = duckdb.connect("md:?motherduck_token=your_token_here")

# Create a cloud database
conn.sql("CREATE DATABASE IF NOT EXISTS analytics")
conn.sql("USE analytics")

# Cloud databases persist — accessible from any machine
```

### Hybrid Queries (Local + Cloud)

```python
# Query that combines local files with cloud tables
import duckdb

conn = duckdb.connect("md:analytics")

# Upload a local Parquet file to MotherDuck
conn.sql("""
  CREATE OR REPLACE TABLE events AS
  SELECT * FROM read_parquet('local_data/events_2026_q1.parquet')
""")

# Query cloud data alongside local files
result = conn.sql("""
  SELECT
    e.event_type,
    COUNT(*) AS event_count,
    AVG(e.duration_ms) AS avg_duration,
    u.plan AS user_plan
  FROM analytics.events e                              -- Cloud table
  JOIN read_parquet('local_data/users.parquet') u      -- Local file
    ON e.user_id = u.id
  WHERE e.created_at >= '2026-01-01'
  GROUP BY 1, 4
  ORDER BY 2 DESC
""").df()

print(result)
```

### Data Loading

```python
# Load data from various sources into MotherDuck
conn = duckdb.connect("md:analytics")

# From CSV files (local or URL)
conn.sql("""
  CREATE OR REPLACE TABLE sales AS
  SELECT * FROM read_csv('https://data.example.com/sales_2026.csv',
    header=true, auto_detect=true)
""")

# From Parquet files on S3
conn.sql("""
  CREATE OR REPLACE TABLE events AS
  SELECT * FROM read_parquet('s3://my-bucket/events/*.parquet',
    hive_partitioning=true)
""")

# From JSON files
conn.sql("""
  CREATE OR REPLACE TABLE logs AS
  SELECT * FROM read_json_auto('logs/*.json')
""")

# Incremental loading — append new data
conn.sql("""
  INSERT INTO events
  SELECT * FROM read_parquet('s3://my-bucket/events/2026-03/*.parquet')
  WHERE event_id NOT IN (SELECT event_id FROM events)
""")
```

### Sharing Databases

```python
# Share a database with team members
conn = duckdb.connect("md:")

# Create a shared database
conn.sql("CREATE DATABASE team_analytics")
conn.sql("USE team_analytics")

# Load data
conn.sql("""
  CREATE TABLE monthly_metrics AS
  SELECT
    date_trunc('month', created_at) AS month,
    COUNT(DISTINCT user_id) AS mau,
    SUM(revenue) AS total_revenue,
    COUNT(*) AS total_events
  FROM analytics.events
  GROUP BY 1
  ORDER BY 1
""")

# Share with specific users (via MotherDuck UI or SQL)
conn.sql("GRANT SELECT ON DATABASE team_analytics TO 'colleague@company.com'")

# Recipients connect and query immediately:
# conn = duckdb.connect("md:team_analytics")
# conn.sql("SELECT * FROM monthly_metrics").df()
```

### Node.js / TypeScript Integration

```typescript
// src/analytics/motherduck.ts — MotherDuck in a Node.js application
import duckdb from "duckdb-async";

const db = await duckdb.Database.create("md:analytics", {
  motherduck_token: process.env.MOTHERDUCK_TOKEN!,
});

// Run analytics queries from your API
async function getMonthlyRevenue(months: number = 12) {
  const result = await db.all(`
    SELECT
      date_trunc('month', created_at) AS month,
      SUM(amount) AS revenue,
      COUNT(DISTINCT user_id) AS paying_users
    FROM orders
    WHERE created_at >= current_date - interval '${months} months'
      AND status = 'completed'
    GROUP BY 1
    ORDER BY 1
  `);
  return result;
}

// Use in an API endpoint
app.get("/api/analytics/revenue", async (req, res) => {
  const data = await getMonthlyRevenue(parseInt(req.query.months) || 12);
  res.json(data);
});
```

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

print("✅ Daily transformations complete")
```

## Installation

```bash
# Python
pip install duckdb

# Node.js
npm install duckdb-async

# CLI (DuckDB CLI with MotherDuck support)
# Download from https://motherduck.com/docs/getting-started/
```


## Examples

### Example 1

**User request:** "Help me set up Motherduck"

The agent follows the instructions above to configure Motherduck with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Motherduck configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Hybrid execution** — MotherDuck pushes queries to the cloud OR runs locally depending on where data lives; leverage both
2. **Parquet for everything** — Store raw data as Parquet files on S3; query them directly without loading into tables
3. **Materialized tables for dashboards** — Pre-compute daily/weekly aggregates; don't recalculate on every dashboard load
4. **Share databases, not exports** — Instead of emailing CSVs, share a MotherDuck database; recipients get live, queryable data
5. **Use DuckDB locally for development** — Write and test queries locally with DuckDB; deploy the same SQL to MotherDuck
6. **Token management** — Store `MOTHERDUCK_TOKEN` in environment variables; never commit tokens to code
7. **Incremental loads** — For large datasets, append new data with `INSERT INTO ... WHERE NOT IN`; avoid full reloads
8. **Cost awareness** — MotherDuck charges by query compute; pre-aggregate expensive queries into summary tables
