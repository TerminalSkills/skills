---
name: dbt
description: |
  dbt (data build tool) transforms data in your warehouse using SQL SELECT statements.
  Learn project setup, models, tests, documentation, incremental materializations,
  and integration with data warehouses like PostgreSQL, BigQuery, and Snowflake.
license: Apache-2.0
compatibility: 'macos, linux, windows'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/dbt-labs/dbt-core
  category: data-ai
  tags:
    - dbt
    - data-transformation
    - sql
    - data-warehouse
    - analytics
---

# dbt

## Overview

dbt lets analytics engineers transform data by writing SQL SELECT statements. It handles materialization (tables, views, incremental), testing, documentation, and lineage tracking. This skill was checked against dbt Core 1.12.6 (run with the DuckDB adapter, 1.11.0) and the dbt v2 install docs, October 2026.

## Instructions

### Installation

dbt now comes in two lines. **dbt v1** (Core 1.12, Python adapters) is what the project below targets. **dbt v2** is a Rust rewrite that `pip install dbt` now installs by default (also Homebrew, winget); it validates strictly at parse time (misspelled configs and unused config paths become errors), and its listed adapters are BigQuery, Databricks, Redshift, Snowflake, ClickHouse, Spark and DuckDB, with no Postgres. For Postgres, or any project that still has deprecation warnings, stay on v1:

```bash
# dbt v1: use a virtualenv; the adapter package pulls in dbt-core
python3 -m venv .venv && source .venv/bin/activate
pip install dbt-postgres

# Or with other adapters
pip install dbt-bigquery
pip install dbt-snowflake
dbt --version

# Initialize a new project
dbt init my_project
cd my_project
```

## Project Structure

```text
my_project/
├── dbt_project.yml      # Project configuration
├── profiles.yml         # Connection profiles (usually in ~/.dbt/)
├── models/
│   ├── staging/         # Raw data cleaning
│   │   ├── _staging.yml # Schema + tests for staging models
│   │   ├── stg_users.sql
│   │   └── stg_orders.sql
│   └── marts/           # Business logic
│       ├── _marts.yml
│       └── fct_revenue.sql
├── tests/               # Custom data tests
├── macros/              # Reusable SQL macros
└── seeds/               # CSV files to load
```

## Configuration

```yaml
# dbt_project.yml: Project configuration
name: my_project
version: '1.0.0'
profile: my_project

models:
  my_project:
    staging:
      +materialized: view
      +schema: staging
    marts:
      +materialized: table
      +schema: analytics
```

```yaml
# profiles.yml: Database connection (~/.dbt/profiles.yml)
my_project:
  target: dev
  outputs:
    dev:
      type: postgres
      host: localhost
      port: 5432
      user: analyst
      password: "{{ env_var('DBT_PASSWORD') }}"
      dbname: analytics
      schema: dev
      threads: 4
    prod:
      type: postgres
      host: prod-db.brewline.dev
      port: 5432
      user: dbt_prod
      password: "{{ env_var('DBT_PROD_PASSWORD') }}"
      dbname: analytics
      schema: public
      threads: 8
```

## Staging Models

```sql
-- models/staging/stg_users.sql: Clean raw user data
WITH source AS (
    SELECT * FROM {{ source('raw', 'users') }}
),

cleaned AS (
    SELECT
        id AS user_id,
        LOWER(TRIM(email)) AS email,
        name,
        created_at::timestamp AS signed_up_at,
        CASE WHEN status = 'active' THEN TRUE ELSE FALSE END AS is_active
    FROM source
    WHERE email IS NOT NULL
)

SELECT * FROM cleaned
```

```sql
-- models/staging/stg_orders.sql: Clean raw order data
SELECT
    id AS order_id,
    user_id,
    amount_cents / 100.0 AS amount,
    status,
    created_at::timestamp AS ordered_at
FROM {{ source('raw', 'orders') }}
WHERE status != 'test'
```

## Mart Models

```sql
-- models/marts/fct_revenue.sql: Revenue fact table
{{
    config(
        materialized='incremental',
        unique_key='order_date',
        on_schema_change='sync_all_columns'
    )
}}

WITH orders AS (
    SELECT * FROM {{ ref('stg_orders') }}
    {% if is_incremental() %}
    WHERE ordered_at > (SELECT MAX(order_date) FROM {{ this }})
    {% endif %}
),

daily AS (
    SELECT
        DATE_TRUNC('day', ordered_at)::date AS order_date,
        COUNT(*) AS total_orders,
        COUNT(DISTINCT user_id) AS unique_customers,
        SUM(amount) AS total_revenue,
        AVG(amount) AS avg_order_value
    FROM orders
    WHERE status = 'completed'
    GROUP BY 1
)

SELECT * FROM daily
```

## Schema and Tests

```yaml
# models/staging/_staging.yml: Define sources, columns, and tests
version: 2

sources:
  - name: raw
    schema: public
    tables:
      - name: users
        loaded_at_field: created_at
        freshness:
          warn_after: {count: 12, period: hour}
          error_after: {count: 24, period: hour}
      - name: orders

models:
  - name: stg_users
    description: Cleaned user data
    columns:
      - name: user_id
        data_tests: [unique, not_null]
      - name: email
        data_tests: [unique, not_null]

  - name: stg_orders
    columns:
      - name: order_id
        data_tests: [unique, not_null]
      - name: status
        data_tests:
          - accepted_values:
              arguments:   # dbt 1.10+: generic-test arguments nest under `arguments`
                values: ['pending', 'completed', 'cancelled', 'refunded']
```

## CLI Commands

```bash
# commands.sh: Common dbt CLI commands
# Run all models
dbt run

# Run specific model and its upstream dependencies
dbt run --select +fct_revenue

# Run tests
dbt test

# Generate and serve documentation
dbt docs generate
dbt docs serve --port 8081

# Check source freshness
dbt source freshness

# Full build (seeds, models, snapshots and tests in DAG order)
dbt build

# Run against production
dbt run --target prod
```

## Macros

```sql
-- macros/cents_to_dollars.sql: Reusable macro for currency conversion
{% macro cents_to_dollars(column_name) %}
    ({{ column_name }} / 100.0)::numeric(10,2)
{% endmacro %}

-- Usage in a model: SELECT {{ cents_to_dollars('amount_cents') }} AS amount
```

## Examples

### Example 1: "Add a daily revenue table to our dbt project"

Create `models/staging/stg_orders.sql` and `models/marts/fct_revenue.sql` as above, declare the `raw.orders` source in `_staging.yml`, then run `dbt build --select +fct_revenue`. Result: `stg_orders` is created as a view, its `unique`, `not_null` and `accepted_values` tests pass, and `fct_revenue` is created as an incremental table; a second run only processes rows newer than `max(order_date)`.

### Example 2: "Why does dbt print a deprecation warning about test arguments?"

Since dbt 1.10, `values:` written directly under `accepted_values` raises `MissingArgumentsPropertyInGenericTestDeprecation`. Move the arguments under `arguments:` (also use `data_tests:`, the current key name; `tests:` still parses on 1.12 without a warning); run `dbt parse --no-partial-parse --show-all-deprecations` to list every remaining one. Fix them all before trying dbt v2, which rejects deprecated syntax.

## Guidelines

- Pin the dbt version per project (requirements file) so a `pip install` does not jump from v1 to v2 behavior.
- Keep credentials out of `profiles.yml`: use `env_var()` as above.
- The incremental example filters with `>` on the latest date, which skips late-arriving rows for that day; use a lookback window or a `unique_key` merge for late data.
- Run `dbt build`, not `dbt run`, in CI so failing tests block downstream models.
- Not a loader: dbt transforms data already in the warehouse; use another tool to ingest it.
