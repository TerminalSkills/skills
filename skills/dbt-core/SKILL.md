---
name: dbt-core
description: >-
  SQL-first data transformation and analytics engineering with dbt (data build
  tool). Use when: transforming raw data in a warehouse, building data pipelines
  with SQL, testing data quality, documenting data models, or implementing
  analytics engineering best practices.
license: Apache-2.0
compatibility: "Requires Python 3.9+. Warehouse adapter must be installed separately."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data
  tags: ["dbt", "analytics-engineering", "sql", "data-transformation", "warehouse"]
  use-cases:
    - "Transform raw event data into clean analytics-ready tables in BigQuery"
    - "Add not_null and referential integrity tests to all models in a warehouse"
    - "Generate interactive data documentation from existing SQL models"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# dbt Core

## Overview

dbt (data build tool) is the standard for analytics engineering. It lets you write data transformations as SELECT statements in `.sql` files, then manages dependencies, runs them in the right order, and tests data quality — all inside your data warehouse.

Key concepts:
- **Models** — SQL SELECT statements that become tables or views
- **Sources** — references to raw data already in the warehouse
- **Tests** — assertions about your data (not_null, unique, etc.)
- **Macros** — reusable Jinja functions for DRY SQL
- **Docs** — auto-generated documentation from schema definitions

Supported adapters: BigQuery, Snowflake, Postgres, DuckDB, Redshift, Databricks, and more.

## Setup

### Install dbt with your warehouse adapter

```bash
# BigQuery
pip install dbt-bigquery

# Snowflake
pip install dbt-snowflake

# PostgreSQL
pip install dbt-postgres

# DuckDB (great for local development)
pip install dbt-duckdb
```

### Initialize a project

```bash
dbt init my_project
cd my_project
```

This creates:
```
my_project/
├── dbt_project.yml       # project config
├── profiles.yml          # connection config (usually in ~/.dbt/)
├── models/               # SQL models go here
├── tests/                # singular tests
├── macros/               # reusable Jinja macros
└── seeds/                # CSV files to load as tables
```

### Configure your connection (`~/.dbt/profiles.yml`)

```yaml
# DuckDB (local dev)
my_project:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: dev.duckdb

# PostgreSQL
my_project:
  target: dev
  outputs:
    dev:
      type: postgres
      host: localhost
      user: myuser
      password: "{{ env_var('DBT_PASSWORD') }}"
      port: 5432
      dbname: analytics
      schema: dbt_dev
      threads: 4

# BigQuery
my_project:
  target: prod
  outputs:
    prod:
      type: bigquery
      method: oauth
      project: my-gcp-project
      dataset: analytics
      threads: 8
```

## Instructions

### Step 1: Write models (SQL as SELECT statements)

Models live in `models/` as `.sql` files. dbt compiles them to CREATE TABLE or CREATE VIEW statements.

**`models/staging/stg_orders.sql`**
```sql
-- Staging model: clean and rename raw columns
select
    order_id,
    customer_id,
    cast(created_at as timestamp) as created_at,
    lower(status)                 as status,
    amount_cents / 100.0          as amount_usd
from {{ source('raw', 'orders') }}
where order_id is not null
```

**`models/marts/orders_daily.sql`**
```sql
-- Mart model: aggregate for reporting
select
    date_trunc('day', created_at) as order_date,
    count(*)                       as order_count,
    sum(amount_usd)                as total_revenue_usd,
    avg(amount_usd)                as avg_order_value_usd
from {{ ref('stg_orders') }}
where status = 'completed'
group by 1
order by 1 desc
```

### Step 2: Configure model materialization

Set materialization in `dbt_project.yml` or per-model config blocks:

```yaml
# dbt_project.yml
models:
  my_project:
    staging:
      +materialized: view        # staging = views (fast, no storage cost)
    marts:
      +materialized: table       # marts = tables (fast queries)
    reports:
      +materialized: incremental # only process new rows
```

Or inline:

```sql
-- models/reports/events_incremental.sql
{{ config(
    materialized='incremental',
    unique_key='event_id',
    on_schema_change='sync_all_columns'
) }}

select
    event_id,
    user_id,
    event_type,
    created_at
from {{ source('raw', 'events') }}

{% if is_incremental() %}
  where created_at > (select max(created_at) from {{ this }})
{% endif %}
```

### Step 3: Define sources and refs

**`models/staging/schema.yml`** — declare sources:

```yaml
version: 2

sources:
  - name: raw
    database: my_database
    schema: raw_data
    tables:
      - name: orders
        description: "Raw orders from the e-commerce platform"
        loaded_at_field: created_at    # for freshness checks
        freshness:
          warn_after: { count: 12, period: hour }
          error_after: { count: 24, period: hour }
        columns:
          - name: order_id
            description: "Primary key"
          - name: customer_id
            description: "FK to customers table"
```

Reference models with `{{ ref('model_name') }}` and sources with `{{ source('source_name', 'table_name') }}`.

### Step 4: Write tests

**Schema tests** in `schema.yml`:

```yaml
version: 2

models:
  - name: stg_orders
    description: "Cleaned orders from raw source"
    columns:
      - name: order_id
        tests:
          - not_null
          - unique
      - name: customer_id
        tests:
          - not_null
          - relationships:
              to: ref('stg_customers')
              field: customer_id
      - name: status
        tests:
          - accepted_values:
              values: ["pending", "completed", "cancelled", "refunded"]
      - name: amount_usd
        tests:
          - not_null
          - dbt_utils.expression_is_true:
              expression: ">= 0"
```

**Singular tests** in `tests/`:

```sql
-- tests/assert_positive_revenue.sql
-- Fails if any row returns a result
select order_id, amount_usd
from {{ ref('stg_orders') }}
where amount_usd < 0
```

### Step 5: Use macros and Jinja

**`macros/cents_to_dollars.sql`**:

```sql
{% macro cents_to_dollars(column_name) %}
    ({{ column_name }} / 100.0)
{% endmacro %}
```

Use it in a model:

```sql
select
    order_id,
    {{ cents_to_dollars('amount_cents') }} as amount_usd
from {{ source('raw', 'orders') }}
```

**Built-in Jinja:**

```sql
-- Dynamic column generation
select
    user_id,
    {% for metric in ['orders', 'revenue', 'sessions'] %}
    sum(case when event_type = '{{ metric }}' then 1 else 0 end) as {{ metric }}_count
    {% if not loop.last %},{% endif %}
    {% endfor %}
from {{ ref('events') }}
group by 1
```

### Step 6: Run dbt commands

```bash
# Run all models
dbt run

# Run specific model and its dependencies
dbt run --select stg_orders+

# Run specific model only
dbt run --select stg_orders

# Run models in a folder
dbt run --select staging.*

# Test all models
dbt test

# Test specific model
dbt test --select stg_orders

# Run then test
dbt build   # = dbt run + dbt test + dbt seed + dbt snapshot

# Generate and serve docs
dbt docs generate
dbt docs serve   # opens browser at localhost:8080

# Check source freshness
dbt source freshness

# Compile (preview SQL without running)
dbt compile --select stg_orders
```

### Step 7: Seeds (CSV files as tables)

Put CSV files in `seeds/` and load them as tables:

```bash
# seeds/country_codes.csv
country_code,country_name
US,United States
GB,United Kingdom
DE,Germany
```

```bash
dbt seed
```

Then reference them like models:

```sql
select o.*, c.country_name
from {{ ref('orders') }} o
join {{ ref('country_codes') }} c on o.country_code = c.country_code
```

## Complete Project Structure

```
my_project/
├── dbt_project.yml
├── models/
│   ├── staging/
│   │   ├── schema.yml           # sources + staging model tests
│   │   ├── stg_orders.sql
│   │   └── stg_customers.sql
│   ├── intermediate/
│   │   └── int_orders_enriched.sql
│   └── marts/
│       ├── schema.yml           # mart model docs + tests
│       ├── orders_daily.sql
│       └── customer_ltv.sql
├── macros/
│   └── cents_to_dollars.sql
├── seeds/
│   └── country_codes.csv
└── tests/
    └── assert_positive_revenue.sql
```

## Guidelines

- Always use `{{ ref() }}` to reference other models — never hardcode table names. This lets dbt build the correct DAG.
- Apply `not_null` and `unique` tests to all primary keys as a minimum baseline.
- Materialize staging models as views, marts as tables, and large fact tables as incremental.
- Store `profiles.yml` in `~/.dbt/` (not in the repo) and use `{{ env_var('VAR') }}` for secrets.
- Run `dbt build` in CI to run, test, and validate everything in one step.
- Use `dbt compile` to preview generated SQL before running — helps debug Jinja rendering.
- Name staging models `stg_<source>__<table>` and mart models with the business concept (e.g., `orders_daily`).
- Add `description:` fields to all models and columns — `dbt docs generate` makes them searchable.
