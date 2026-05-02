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
  version: 1.1.0
  category: devops
  tags:
    - gcp
    - bigquery
    - analytics
    - data-warehouse
    - sql
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
-- Create table with SQL DDL
CREATE TABLE `my_project.analytics.page_views` (
  session_id STRING NOT NULL,
  user_id STRING,
  page_url STRING,
  referrer STRING,
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
# Load from Cloud Storage (JSON)
bq load --source_format=NEWLINE_DELIMITED_JSON \
  --autodetect \
  analytics.events \
  gs://my-data-bucket/events/2024-01-*.json
```

```bash
# Load Parquet from GCS (most efficient format)
bq load --source_format=PARQUET \
  analytics.events \
  gs://my-data-bucket/events/2024-01/*.parquet
```

### Streaming Data

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
        "created_at": "2024-01-15T10:30:00Z"
    },
    {
        "event_id": "evt-002",
        "user_id": "u-456",
        "event_type": "page_view",
        "payload": '{"url": "/products/widget"}',
        "created_at": "2024-01-15T10:30:01Z"
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

```sql
-- Window functions for user journey analysis
SELECT
  user_id,
  event_type,
  created_at,
  LAG(event_type) OVER (PARTITION BY user_id ORDER BY created_at) as prev_event,
  TIMESTAMP_DIFF(
    created_at,
    LAG(created_at) OVER (PARTITION BY user_id ORDER BY created_at),
    SECOND
  ) as seconds_since_last
FROM `analytics.events`
WHERE DATE(created_at) = '2024-01-15'
ORDER BY user_id, created_at;
```

```bash
# Run query from CLI
bq query --use_legacy_sql=false \
  'SELECT COUNT(*) as total FROM `analytics.events` WHERE DATE(created_at) = CURRENT_DATE()'
```

### Materialized Views

```sql
-- Create a materialized view for fast dashboard queries
CREATE MATERIALIZED VIEW `analytics.daily_metrics`
OPTIONS (enable_refresh = true, refresh_interval_minutes = 30)
AS
SELECT
  DATE(created_at) as date,
  event_type,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users
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
-- Predict churn for current users
SELECT
  user_id,
  predicted_churned,
  predicted_churned_probs[OFFSET(1)].prob as churn_probability
FROM ML.PREDICT(
  MODEL `analytics.churn_model`,
  (SELECT user_id, total_events, active_days, days_since_last
   FROM `analytics.current_user_stats`)
)
WHERE predicted_churned_probs[OFFSET(1)].prob > 0.7
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
    endpoint => 'gemini-2.5-flash'
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
    endpoint => 'gemini-2.5-flash'
  ).result AS is_positive
FROM `analytics.product_reviews`;
```

```sql
-- Numeric extraction (e.g., extract price from free-form text)
SELECT
  listing_id, raw_text,
  AI.GENERATE_DOUBLE(
    ('Extract the price in USD from: ', raw_text),
    connection_id => 'us.gemini-conn'
  ).result AS price_usd
FROM `analytics.scraped_listings`;
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
-- Semantic similarity / search
SELECT
  product_id, name,
  AI.SIMILARITY(
    name,
    'wireless noise-cancelling headphones',
    connection_id => 'us.gemini-conn'
  ).score AS similarity
FROM `analytics.products`
ORDER BY similarity DESC
LIMIT 20;
```

Set up the connection once with `bq mk --connection --location=US --connection_type=CLOUD_RESOURCE gemini-conn` and grant the connection's service account `roles/aiplatform.user`.

### Scheduled Queries

```bash
# Create a scheduled query
bq mk --transfer_config \
  --data_source=scheduled_query \
  --target_dataset=analytics \
  --display_name="Daily aggregation" \
  --schedule="every 24 hours" \
  --params='{
    "query": "INSERT INTO analytics.daily_summary SELECT DATE(created_at), COUNT(*) FROM analytics.events WHERE DATE(created_at) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) GROUP BY 1",
    "destination_table_name_template": "",
    "write_disposition": "WRITE_APPEND"
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

### Example 1 — Build a partitioned events table with PII-safe streaming

User has Kafka events landing in GCS as JSON and wants them queryable with sub-second latency. Create a partitioned/clustered table on `created_at` and `user_id`, set up a Pub/Sub-to-BigQuery streaming pipeline using `client.insert_rows_json`, add a 365-day partition expiration, and create a materialized view for the daily dashboard query. Set `maximum_bytes_billed` on the analyst service account to cap surprise costs.

### Example 2 — Add semantic search to a product catalog without an ML pipeline

User wants to add "find similar products" without building a vector store. Use `AI.SIMILARITY` directly in SQL against the product `name` column — no embeddings to manage, no separate index. Set up the cloud-resource connection once, grant `roles/aiplatform.user`, then queries become single SQL statements. For higher scale, persist embeddings into a column with `AI.GENERATE_EMBEDDING` and use BigQuery's vector index.

## Guidelines

- Always partition tables by date and cluster by frequently filtered columns
- Use `--dry_run` to estimate query costs before running expensive queries
- Avoid `SELECT *` — query only the columns you need
- Use materialized views for repeated dashboard queries
- Stream only when real-time is required; batch load is cheaper
- Set `maximum_bytes_billed` to prevent runaway query costs
- Use Parquet or Avro for bulk loading (faster and cheaper than CSV/JSON)
- Expire old partitions automatically with `partition_expiration_days`
- Prefer `AI.GENERATE_*` functions over building separate ML pipelines for per-row inference
