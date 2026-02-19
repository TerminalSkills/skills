---
name: dbt-advanced
description: >-
  Build data transformation pipelines with dbt (advanced patterns). Use when a
  user asks to implement incremental models, build data marts, add data quality
  tests, manage dbt projects at scale, or optimize dbt performance.
license: Apache-2.0
compatibility: 'PostgreSQL, BigQuery, Snowflake, Redshift, DuckDB'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-engineering
  tags:
    - dbt
    - data-transformation
    - sql
    - analytics
    - data-warehouse
---

# dbt (Advanced)

## Overview

dbt (data build tool) transforms data in your warehouse using SQL. This skill covers advanced patterns: incremental models, snapshots (SCD Type 2), macros, custom tests, packages, and project organization for teams.

## Instructions

### Step 1: Incremental Models

```sql
-- models/marts/fct_daily_revenue.sql — Incremental model (only processes new data)
{{
  config(
    materialized='incremental',
    unique_key='date_day',
    on_schema_change='sync_all_columns'
  )
}}

SELECT
    DATE_TRUNC('day', ordered_at) as date_day,
    COUNT(DISTINCT order_id) as total_orders,
    COUNT(DISTINCT customer_id) as unique_customers,
    SUM(amount) as total_revenue,
    AVG(amount) as avg_order_value
FROM {{ ref('stg_orders') }}

{% if is_incremental() %}
    -- Only process rows newer than the latest data in this model
    WHERE ordered_at > (SELECT MAX(date_day) FROM {{ this }})
{% endif %}

GROUP BY 1
```

### Step 2: Snapshots (SCD Type 2)

```sql
-- snapshots/customer_snapshot.sql — Track historical changes
{% snapshot customer_snapshot %}

{{
  config(
    target_schema='snapshots',
    unique_key='customer_id',
    strategy='timestamp',
    updated_at='updated_at',
  )
}}

SELECT * FROM {{ source('raw', 'customers') }}

{% endsnapshot %}
-- Creates columns: dbt_valid_from, dbt_valid_to, dbt_updated_at
-- Tracks every change to customer records over time
```

### Step 3: Custom Macros

```sql
-- macros/cents_to_dollars.sql — Reusable transformation
{% macro cents_to_dollars(column_name) %}
    ROUND({{ column_name }}::numeric / 100, 2)
{% endmacro %}

-- Usage in models:
-- SELECT {{ cents_to_dollars('amount_cents') }} as amount
```

### Step 4: Custom Tests

```sql
-- tests/generic/test_positive_value.sql — Generic test
{% test positive_value(model, column_name) %}

SELECT *
FROM {{ model }}
WHERE {{ column_name }} < 0

{% endtest %}
```

```yaml
# models/schema.yml — Apply tests to models
models:
  - name: fct_daily_revenue
    columns:
      - name: total_revenue
        tests:
          - not_null
          - positive_value
      - name: date_day
        tests:
          - unique
          - not_null
```

### Step 5: Project Organization

```text
models/
├── staging/          # 1:1 with source tables, light cleaning
│   ├── stg_orders.sql
│   └── stg_customers.sql
├── intermediate/     # business logic, joins
│   └── int_orders_with_customers.sql
└── marts/           # final tables for BI/analytics
    ├── fct_daily_revenue.sql
    └── dim_customers.sql
```

## Guidelines

- Use staging → intermediate → marts pattern for maintainable projects.
- Incremental models are essential for large datasets — full refresh becomes too slow.
- Run `dbt test` in CI to catch data quality issues before they reach dashboards.
- Use dbt packages (dbt-utils, dbt-expectations) for common transformations and tests.
