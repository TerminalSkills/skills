---
title: Build a Data Pipeline with Airflow and dbt
slug: build-data-pipeline-with-airflow-and-dbt
description: Build an ETL pipeline that extracts data from APIs, loads it into PostgreSQL, transforms it with dbt, and orchestrates the entire workflow with Apache Airflow.
skills:
  - airflow
  - dbt
  - postgresql
category: data-ai
tags:
  - etl
  - data-pipeline
  - orchestration
  - sql
  - analytics
---

# Build a Data Pipeline with Airflow and dbt

Modern analytics teams separate extraction/loading from transformation. In this walkthrough, you'll build a pipeline that pulls data from external APIs, lands it in PostgreSQL, transforms it into analytics-ready tables with dbt, and schedules the entire flow with Airflow.

## Architecture Overview

The pipeline follows the ELT pattern:

1. **Extract** — Airflow tasks pull data from REST APIs
2. **Load** — Raw JSON is inserted into PostgreSQL staging tables
3. **Transform** — dbt models clean, join, and aggregate the data
4. **Orchestrate** — Airflow schedules and monitors the entire flow

## Setting Up the Infrastructure

Start by spinning up PostgreSQL and Airflow with Docker Compose. PostgreSQL serves double duty — it's both Airflow's metadata store and your analytics warehouse.

```yaml
# docker-compose.yml: Full stack with Airflow, PostgreSQL, and dbt
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: pipeline
      POSTGRES_PASSWORD: pipeline
      POSTGRES_DB: analytics
    ports:
      - "5432:5432"
    volumes:
      - pg-data:/var/lib/postgresql/data

  airflow-webserver:
    image: apache/airflow:2.9.0
    depends_on: [postgres]
    environment:
      AIRFLOW__CORE__EXECUTOR: LocalExecutor
      AIRFLOW__DATABASE__SQL_ALCHEMY_CONN: postgresql+psycopg2://pipeline:pipeline@postgres/analytics
      AIRFLOW__WEBSERVER__SECRET_KEY: change-me
      DBT_PROJECT_DIR: /opt/airflow/dbt_project
    volumes:
      - ./dags:/opt/airflow/dags
      - ./dbt_project:/opt/airflow/dbt_project
    ports:
      - "8080:8080"
    command: bash -c "pip install dbt-postgres && airflow db migrate && airflow users create --username admin --password admin --firstname Admin --lastname User --role Admin --email admin@example.com && airflow webserver"

  airflow-scheduler:
    image: apache/airflow:2.9.0
    depends_on: [postgres]
    environment:
      AIRFLOW__CORE__EXECUTOR: LocalExecutor
      AIRFLOW__DATABASE__SQL_ALCHEMY_CONN: postgresql+psycopg2://pipeline:pipeline@postgres/analytics
    volumes:
      - ./dags:/opt/airflow/dags
      - ./dbt_project:/opt/airflow/dbt_project
    command: bash -c "pip install dbt-postgres && airflow scheduler"

volumes:
  pg-data:
```

Launch everything:

```bash
# start.sh: Start the pipeline infrastructure
docker compose up -d
```

## Creating the Staging Schema

Before extracting data, set up the raw landing tables in PostgreSQL.

```sql
-- init.sql: Create staging schema and raw tables
CREATE SCHEMA IF NOT EXISTS raw;

CREATE TABLE IF NOT EXISTS raw.users (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT,
    created_at TIMESTAMP,
    _loaded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw.orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    product TEXT,
    amount_cents INTEGER,
    status TEXT,
    ordered_at TIMESTAMP,
    _loaded_at TIMESTAMP DEFAULT NOW()
);
```

## Writing the Extraction DAG

The Airflow DAG handles extraction and loading, then triggers dbt for transformation.

```python
# dags/etl_pipeline.py: Main pipeline DAG with extract, load, and dbt run
from datetime import datetime, timedelta
from airflow.decorators import dag, task
from airflow.operators.bash import BashOperator
import json

@dag(
    schedule="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    default_args={"retries": 2, "retry_delay": timedelta(minutes=5)},
    tags=["etl", "production"],
)
def etl_pipeline():

    @task()
    def extract_users():
        """Pull user data from external API."""
        import httpx
        response = httpx.get("https://api.example.com/users")
        return response.json()

    @task()
    def extract_orders():
        """Pull order data from external API."""
        import httpx
        response = httpx.get("https://api.example.com/orders")
        return response.json()

    @task()
    def load_to_postgres(table: str, data: list):
        """Insert raw data into PostgreSQL staging tables."""
        import psycopg2
        from psycopg2.extras import execute_values

        conn = psycopg2.connect("postgresql://pipeline:pipeline@postgres/analytics")
        cur = conn.cursor()

        if table == "users":
            execute_values(cur,
                "INSERT INTO raw.users (id, name, email, created_at) VALUES %s ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email",
                [(u["id"], u["name"], u["email"], u["created_at"]) for u in data]
            )
        elif table == "orders":
            execute_values(cur,
                "INSERT INTO raw.orders (id, user_id, product, amount_cents, status, ordered_at) VALUES %s ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status",
                [(o["id"], o["user_id"], o["product"], o["amount_cents"], o["status"], o["ordered_at"]) for o in data]
            )

        conn.commit()
        conn.close()

    # dbt run as a bash command
    dbt_run = BashOperator(
        task_id="dbt_run",
        bash_command="cd /opt/airflow/dbt_project && dbt run --profiles-dir .",
    )

    dbt_test = BashOperator(
        task_id="dbt_test",
        bash_command="cd /opt/airflow/dbt_project && dbt test --profiles-dir .",
    )

    # Define task dependencies
    users = extract_users()
    orders = extract_orders()
    load_users = load_to_postgres.override(task_id="load_users")("users", users)
    load_orders = load_to_postgres.override(task_id="load_orders")("orders", orders)

    [load_users, load_orders] >> dbt_run >> dbt_test

etl_pipeline()
```

## Setting Up the dbt Project

Create a dbt project inside the repository for the transformation layer.

```yaml
# dbt_project/dbt_project.yml: dbt project configuration
name: analytics
version: '1.0.0'
profile: analytics

models:
  analytics:
    staging:
      +materialized: view
      +schema: staging
    marts:
      +materialized: table
      +schema: analytics
```

```yaml
# dbt_project/profiles.yml: Connection profile for PostgreSQL
analytics:
  target: prod
  outputs:
    prod:
      type: postgres
      host: postgres
      port: 5432
      user: pipeline
      password: pipeline
      dbname: analytics
      schema: public
      threads: 4
```

## Writing dbt Models

Staging models clean the raw data. Mart models build business-ready tables.

```sql
-- dbt_project/models/staging/stg_users.sql: Clean raw user data
SELECT
    id AS user_id,
    TRIM(name) AS name,
    LOWER(TRIM(email)) AS email,
    created_at::timestamp AS signed_up_at
FROM {{ source('raw', 'users') }}
WHERE email IS NOT NULL
```

```sql
-- dbt_project/models/staging/stg_orders.sql: Clean raw order data
SELECT
    id AS order_id,
    user_id,
    product,
    amount_cents / 100.0 AS amount,
    status,
    ordered_at::timestamp AS ordered_at
FROM {{ source('raw', 'orders') }}
WHERE status != 'test'
```

```sql
-- dbt_project/models/marts/fct_daily_revenue.sql: Daily revenue fact table
SELECT
    DATE_TRUNC('day', o.ordered_at)::date AS order_date,
    COUNT(*) AS total_orders,
    COUNT(DISTINCT o.user_id) AS unique_customers,
    SUM(o.amount) AS total_revenue,
    AVG(o.amount) AS avg_order_value
FROM {{ ref('stg_orders') }} o
WHERE o.status = 'completed'
GROUP BY 1
```

```yaml
# dbt_project/models/staging/_sources.yml: Define raw data sources
version: 2
sources:
  - name: raw
    schema: raw
    tables:
      - name: users
      - name: orders
```

## Adding dbt Tests

```yaml
# dbt_project/models/staging/_staging.yml: Schema tests for data quality
version: 2
models:
  - name: stg_users
    columns:
      - name: user_id
        tests: [unique, not_null]
      - name: email
        tests: [unique, not_null]
  - name: stg_orders
    columns:
      - name: order_id
        tests: [unique, not_null]
      - name: amount
        tests:
          - not_null
```

## Running the Pipeline

With everything in place, the pipeline runs automatically on schedule. You can also trigger it manually:

```bash
# run.sh: Trigger the pipeline manually
# Via Airflow CLI
docker exec airflow-webserver airflow dags trigger etl_pipeline

# Check dbt independently
cd dbt_project
dbt run --profiles-dir .
dbt test --profiles-dir .
dbt docs generate && dbt docs serve
```

The Airflow UI at `http://localhost:8080` shows the DAG graph, task durations, and logs. Failed tasks retry automatically based on the configured policy, and you can set up email or Slack alerts for persistent failures.
