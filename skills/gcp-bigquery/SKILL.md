---
name: gcp-bigquery
description: |
  Analyze massive datasets with Google BigQuery. Run SQL queries on petabytes of
  data, load and stream data in real-time, create materialized views, and use
  BigQuery ML for machine learning models directly in SQL.
license: Apache-2.0
compatibility: 'gcloud-cli, bq-cli, python'
metadata:
  author: terminal-skills
  version: 1.2.0
  category: devops
  tags: "gcp, bigquery, analytics, data-warehouse, sql"
---

# GCP BigQuery

## Overview

Google BigQuery is a serverless, petabyte-scale data warehouse. It runs SQL queries across massive datasets in seconds, with no infrastructure to manage. Pay only for queries run and data stored.

## Instructions

### Core Concepts

- **Dataset** — a container for tables, scoped to a project and region
- **Table** — structured data with a schema (native, external, or view)
- **Partitioned Table** — split data by date/integer for query performance
- **Clustered Table** — sort data within partitions for further optimization
- **Streaming Insert** — real-time data ingestion
- **BigQuery ML** — train and predict with ML models using SQL

### Datasets and Tables

```bash
# Create a dataset
bq mk --dataset --location=US my_project:analytics
```

```bash
# Create a partitioned and clustered table
bq mk --table \
  --time_partitioning_field created_at \
  --time_partitioning_type DAY \
  --clustering_fields user_id,event_type \
  --schema 'event_id:STRING,user_id:STRING,event_type:STRING,payload:JSON,created_at:TIMESTAMP' \
  analytics.events
```

```sql
CREATE TABLE `my_project.analytics.page_views` (
  session_id STRING NOT NULL,
  user_id STRING,
  page_url STRING,
  duration_ms INT64,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY user_id, page_url
OPTIONS (
  partition_expiration_days = 365,
  description = 'Page view events'
);
```

### Loading Data

```bash
# Load CSV from local file
bq load --source_format=CSV --autodetect \
  analytics.customers ./customers.csv
```

```bash
# Load Parquet from GCS (most efficient format)
bq load --source_format=PARQUET \
  analytics.events \
  gs://my-data-bucket/events/2024-01/*.parquet
```

### Streaming Data

`insert_rows_json` uses the older `tabledata.insertAll` streaming API. For new high-volume pipelines Google recommends the BigQuery Storage Write API (`google-cloud-bigquery-storage`); the call below is fine for low volume and quick scripts.

```python
# Stream rows into BigQuery in real-time
from google.cloud import bigquery

client = bigquery.Client()
table_id = "my_project.analytics.events"

rows = [
    {
        "event_id": "evt-001",
        "user_id": "u-123",
        "event_type": "purchase",
        "payload": '{"amount": 49.99, "currency": "USD"}',
        "created_at": "2026-10-15T10:30:00Z"
    },
    {
        "event_id": "evt-002",
        "user_id": "u-456",
        "event_type": "page_view",
        "payload": '{"url": "/products/widget"}',
        "created_at": "2026-10-15T10:30:01Z"
    }
]

errors = client.insert_rows_json(table_id, rows)
if errors:
    print(f"Insert errors: {errors}")
else:
    print(f"Inserted {len(rows)} rows")
```

### Querying

```sql
-- Query with partition pruning (scans only relevant partitions)
SELECT
  user_id,
  event_type,
  COUNT(*) as event_count,
  AVG(CAST(JSON_VALUE(payload, '$.duration_ms') AS INT64)) as avg_duration
FROM `analytics.events`
WHERE created_at BETWEEN '2024-01-01' AND '2024-01-31'
  AND event_type IN ('page_view', 'purchase')
GROUP BY user_id, event_type
ORDER BY event_count DESC
LIMIT 100;
```

```bash
# Run query from CLI
bq query --use_legacy_sql=false \
  'SELECT COUNT(*) as total FROM `analytics.events` WHERE DATE(created_at) = CURRENT_DATE()'
```

### Materialized Views

```sql
-- Create a materialized view for fast dashboard queries
-- (materialized views allow APPROX_COUNT_DISTINCT but not COUNT(DISTINCT ...))
CREATE MATERIALIZED VIEW `analytics.daily_metrics`
OPTIONS (enable_refresh = true, refresh_interval_minutes = 30)
AS
SELECT
  DATE(created_at) as date,
  event_type,
  COUNT(*) as event_count,
  APPROX_COUNT_DISTINCT(user_id) as unique_users
FROM `analytics.events`
GROUP BY date, event_type;
```

### BigQuery ML

```sql
-- Train a classification model to predict churn
CREATE OR REPLACE MODEL `analytics.churn_model`
OPTIONS (
  model_type = 'LOGISTIC_REG',
  input_label_cols = ['churned']
) AS
SELECT
  user_id,
  COUNT(*) as total_events,
  COUNT(DISTINCT DATE(created_at)) as active_days,
  MAX(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), created_at, DAY)) as days_since_last,
  churned
FROM `analytics.user_activity`
GROUP BY user_id, churned;
```

```sql
-- Predict churn for current users (churned is a 0/1 INT64 label)
SELECT
  user_id,
  predicted_churned,
  (SELECT p.prob FROM UNNEST(predicted_churned_probs) AS p WHERE p.label = 1) as churn_probability
FROM ML.PREDICT(
  MODEL `analytics.churn_model`,
  (SELECT user_id, total_events, active_days, days_since_last
   FROM `analytics.current_user_stats`)
)
WHERE (SELECT p.prob FROM UNNEST(predicted_churned_probs) AS p WHERE p.label = 1) > 0.7
ORDER BY churn_probability DESC;
```

### BigQuery AI Functions (Gemini in SQL)

BigQuery exposes Gemini directly as SQL functions — no Python, no orchestration. Different from BigQuery ML (`CREATE MODEL`): these are inference calls into Gemini at query time.

```sql
-- Generate text per row
SELECT
  product_id,
  AI.GENERATE(
    ('Write a one-line product tagline for: ', name, ' — ', description),
    connection_id => 'us.gemini-conn',
    endpoint => 'gemini-3.5-flash'
  ).result AS tagline
FROM `analytics.products`
LIMIT 100;
```

```sql
-- Boolean classification
SELECT
  review_id, review_text,
  AI.GENERATE_BOOL(
    ('Is this review positive? ', review_text),
    connection_id => 'us.gemini-conn',
    endpoint => 'gemini-3.5-flash'
  ).result AS is_positive
FROM `analytics.product_reviews`;
```

```sql
-- Time series forecasting with AI.FORECAST (no model training needed)
SELECT * FROM AI.FORECAST(
  TABLE `analytics.daily_revenue`,
  data_col => 'revenue',
  timestamp_col => 'date',
  horizon => 30
);
```

```sql
-- Semantic similarity: AI.SIMILARITY returns a FLOAT64 cosine similarity (not a struct),
-- computed with an embedding model, not Gemini
SELECT
  product_id, name,
  AI.SIMILARITY(name, 'wireless noise-cancelling headphones', model => 'embeddinggemma-300m') AS similarity
FROM `analytics.products`
ORDER BY similarity DESC
LIMIT 20;
```

`AI.GENERATE*` take the model as `endpoint` and `connection_id` is optional: without it the query runs with the caller's end-user credentials, so the person running it needs the Vertex AI User role (`roles/aiplatform.user`). To use a connection instead, create it once with `bq mk --connection --location=US --connection_type=CLOUD_RESOURCE gemini-conn` and grant its service account the same role. Each row is a separate model call and is billed, so test with `LIMIT`. The result of `AI.GENERATE_BOOL`, `_DOUBLE` and `AI.GENERATE` is a STRUCT: `.result` is NULL when a request fails, and `.status` holds the error.

### Scheduled Queries

```bash
# Create a scheduled query (DML needs no destination_table_name_template or write_disposition)
bq mk --transfer_config \
  --data_source=scheduled_query \
  --target_dataset=analytics \
  --display_name="Daily aggregation" \
  --schedule="every 24 hours" \
  --params='{
    "query": "INSERT INTO analytics.daily_summary SELECT DATE(created_at), COUNT(*) FROM analytics.events WHERE DATE(created_at) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) GROUP BY 1"
  }'
```

### Cost Control

```bash
# Dry run to estimate query cost
bq query --dry_run --use_legacy_sql=false \
  'SELECT * FROM `analytics.events` WHERE DATE(created_at) = "2024-01-15"'
```

```bash
# Set maximum bytes billed per query
bq query --maximum_bytes_billed=1000000000 --use_legacy_sql=false \
  'SELECT COUNT(*) FROM `analytics.events`'
```
## Examples

### Example 1: Partitioned events table with a dashboard view

Request: "Our app events land in BigQuery; make dashboards cheap and fast."

Create `analytics.events` partitioned by `created_at` and clustered by `user_id, event_type` (see Datasets and Tables), set `partition_expiration_days = 365`, and create the `analytics.daily_metrics` materialized view. Check the cost first with `bq query --dry_run`, which prints how many bytes the query would process. Give the analysts' service account queries with `--maximum_bytes_billed=1000000000` so a mistake fails instead of billing for a full scan.

### Example 2: "Find similar products" without a vector store

Request: "Rank our catalog by similarity to 'wireless noise-cancelling headphones'."

Run the `AI.SIMILARITY` query above with `model => 'embeddinggemma-300m'`. Each row gets a `similarity` score between -1 and 1, and the top 20 are returned in one statement. For a large catalog, store embeddings in a column with `AI.GENERATE_EMBEDDING` and add a vector index instead of embedding every row on every query.

## Guidelines

- Always partition tables by date and cluster by frequently filtered columns
- Use `--dry_run` to estimate query costs before running expensive queries
- Avoid `SELECT *` — query only the columns you need
- Use materialized views for repeated dashboard queries
- Stream only when real-time is required; batch load is cheaper
- Set `maximum_bytes_billed` to prevent runaway query costs
- Use Parquet or Avro for bulk loading (faster and cheaper than CSV/JSON)
- Expire old partitions automatically with `partition_expiration_days`
- Prefer `AI.GENERATE_*` functions over building separate ML pipelines for per-row inference, but cap rows with `LIMIT` while testing: each row is a billed model call
