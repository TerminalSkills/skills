---
title: Build a Data Warehouse with dbt and BigQuery
slug: build-data-warehouse-with-dbt-and-bigquery
description: Build a production data warehouse using dbt Core and BigQuery for SaaS analytics — model MRR, churn, and user funnels from Stripe and Postgres sources, with tests, docs, and automated scheduling.
skills:
  - dbt-core
difficulty: intermediate
time_estimate: "8 hours"
category: data
tags:
  - dbt
  - bigquery
  - data-warehouse
  - analytics
  - saas
  - mrr
---

# Build a Data Warehouse with dbt and BigQuery

Priya is a data engineer at a 60-person B2B SaaS. Finance asks for MRR every Monday. The answer comes from a spreadsheet Priya updates manually from three different dashboards. It takes two hours and the number is always slightly wrong because Stripe and the app database never quite agree. She needs a single source of truth — a proper warehouse that finance, product, and engineering can all query without asking her.

## Step 1 — Connect dbt to BigQuery

```yaml
# ~/.dbt/profiles.yml — BigQuery connection for dbt.
# Use a service account for production; OAuth for local development.

saas_warehouse:
  target: dev
  outputs:
    dev:
      type: bigquery
      method: oauth                          # Uses gcloud auth for local dev
      project: my-project-id
      dataset: dbt_priya                     # Each analyst gets their own dev dataset
      threads: 4
      timeout_seconds: 300
      location: US

    prod:
      type: bigquery
      method: service-account
      project: my-project-id
      dataset: production
      threads: 8
      timeout_seconds: 600
      location: US
      keyfile: /secrets/bigquery-sa-key.json # Mounted as a secret in Cloud Composer
```

```yaml
# dbt_project.yml — Project structure and model configurations.

name: saas_warehouse
version: "1.0.0"
profile: saas_warehouse

model-paths: ["models"]
test-paths: ["tests"]
seed-paths: ["seeds"]
snapshot-paths: ["snapshots"]

models:
  saas_warehouse:
    staging:
      +materialized: view          # Staging = views (cheap, always fresh)
      +schema: staging
    intermediate:
      +materialized: ephemeral     # Intermediate = CTEs (no storage cost)
    marts:
      +materialized: table         # Marts = tables (fast for BI tools)
      +schema: marts
```

## Step 2 — Source Definitions

```yaml
# models/staging/sources.yml — Define raw data sources.
# dbt tracks freshness so you know if Fivetran/Airbyte stopped syncing.

version: 2

sources:
  - name: stripe
    database: my-project-id
    schema: stripe_raw               # Where Fivetran lands Stripe data
    freshness:
      warn_after: {count: 6, period: hour}
      error_after: {count: 24, period: hour}
    loaded_at_field: _fivetran_synced

    tables:
      - name: subscriptions
        description: "Stripe subscription objects"
        columns:
          - name: id
            description: "Stripe subscription ID"
            tests:
              - unique
              - not_null
      - name: invoices
      - name: customers
      - name: prices
      - name: products

  - name: app_db
    database: my-project-id
    schema: postgres_raw             # App database replicated via Airbyte
    freshness:
      warn_after: {count: 1, period: hour}
      error_after: {count: 4, period: hour}
    loaded_at_field: _airbyte_extracted_at

    tables:
      - name: users
      - name: organizations
      - name: feature_usage_events
      - name: trial_activations
```

## Step 3 — Staging Models

```sql
-- models/staging/stripe/stg_stripe__subscriptions.sql
-- Clean and rename raw Stripe subscription data.
-- One row per subscription. All transformations are additive — never destructive.

with source as (
    select * from {{ source('stripe', 'subscriptions') }}
),

renamed as (
    select
        id                                              as subscription_id,
        customer                                        as stripe_customer_id,
        status,
        current_period_start                            as period_start_at,
        current_period_end                              as period_end_at,
        trial_start                                     as trial_start_at,
        trial_end                                       as trial_end_at,
        canceled_at,
        ended_at,
        created                                         as created_at,

        -- Parse metadata fields
        json_value(metadata, '$.organization_id')       as organization_id,

        -- Timestamps from epoch to datetime
        timestamp_seconds(current_period_start)         as period_start_ts,
        timestamp_seconds(current_period_end)           as period_end_ts,

        -- Status flags
        status = 'active'                               as is_active,
        status = 'trialing'                             as is_trialing,
        trial_end is not null                           as has_trial,

        _fivetran_synced                                as synced_at

    from source
    where _fivetran_deleted is false
)

select * from renamed
```

```sql
-- models/staging/app_db/stg_app__feature_usage.sql
-- Usage events from the application database.
-- Used to build activation and engagement metrics downstream.

with source as (
    select * from {{ source('app_db', 'feature_usage_events') }}
),

cleaned as (
    select
        event_id,
        user_id,
        organization_id,
        feature_name,
        event_type,                                     -- 'used', 'limit_hit', 'upgraded'
        cast(event_timestamp as timestamp)              as event_at,
        cast(properties as json)                        as properties,
        date(event_timestamp)                           as event_date

    from source
    where event_timestamp is not null
)

select * from cleaned
```

## Step 4 — Intermediate and Mart Models

```sql
-- models/intermediate/int_subscriptions_with_revenue.sql
-- Join subscriptions to invoices to calculate actual revenue per period.
-- This is the bridge between raw Stripe data and the MRR mart.

with subscriptions as (
    select * from {{ ref('stg_stripe__subscriptions') }}
),

invoices as (
    select
        subscription,
        sum(amount_paid) / 100.0  as total_paid_usd,
        count(*)                  as invoice_count
    from {{ source('stripe', 'invoices') }}
    where status = 'paid'
    group by 1
),

prices as (
    select
        id           as price_id,
        unit_amount / 100.0  as monthly_price_usd,
        recurring_interval,
        case
            when recurring_interval = 'year' then unit_amount / 100.0 / 12
            else unit_amount / 100.0
        end          as normalized_monthly_price_usd,
        product      as product_id
    from {{ source('stripe', 'prices') }}
),

subscription_items as (
    select
        subscription,
        price
    from {{ source('stripe', 'subscription_items') }}
),

joined as (
    select
        s.*,
        p.normalized_monthly_price_usd  as mrr,
        p.recurring_interval,
        i.total_paid_usd,
        i.invoice_count

    from subscriptions s
    left join subscription_items si on si.subscription = s.subscription_id
    left join prices p on p.price_id = si.price
    left join invoices i on i.subscription = s.subscription_id
)

select * from joined
```

```sql
-- models/marts/finance/mrr.sql
-- Monthly Recurring Revenue mart. The source of truth for finance.
-- Includes MRR movement: new, expansion, contraction, churn, reactivation.

with monthly_subscriptions as (
    select
        date_trunc(period_start_at, month)  as month,
        organization_id,
        subscription_id,
        mrr,
        is_active,
        is_trialing

    from {{ ref('int_subscriptions_with_revenue') }}
    where is_active or is_trialing
),

with_lag as (
    select
        *,
        lag(mrr) over (
            partition by organization_id
            order by month
        ) as prev_mrr

    from monthly_subscriptions
),

mrr_movements as (
    select
        month,
        organization_id,
        subscription_id,
        mrr,

        case
            when prev_mrr is null then 'new'
            when mrr > prev_mrr then 'expansion'
            when mrr < prev_mrr then 'contraction'
            when mrr = prev_mrr then 'retained'
        end as movement_type

    from with_lag
)

select
    month,
    sum(mrr)                                        as total_mrr,
    sum(case when movement_type = 'new' then mrr else 0 end)         as new_mrr,
    sum(case when movement_type = 'expansion' then mrr - (prev_mrr) else 0 end) as expansion_mrr,
    sum(case when movement_type = 'contraction' then mrr - (prev_mrr) else 0 end) as contraction_mrr,
    count(distinct organization_id)                 as active_customers,
    count(distinct case when movement_type = 'new' then organization_id end) as new_customers

from mrr_movements
group by 1
order by 1
```

## Step 5 — Tests and Documentation

```yaml
# models/marts/finance/mrr.yml — Column-level tests and documentation.

version: 2

models:
  - name: mrr
    description: >
      Monthly Recurring Revenue by month. The primary finance reporting table.
      Updated daily at 6am UTC. Source: Stripe via Fivetran.

    columns:
      - name: month
        description: "First day of the month (UTC)"
        tests:
          - unique
          - not_null

      - name: total_mrr
        description: "Sum of all active subscription MRR in USD"
        tests:
          - not_null
          - dbt_utils.expression_is_true:
              expression: ">= 0"

      - name: active_customers
        description: "Number of organizations with at least one active subscription"
        tests:
          - not_null
```

```bash
# Run tests and generate docs
dbt test --select marts.finance
dbt docs generate
dbt docs serve --port 8080

# Schedule with Cloud Composer (Airflow DAG)
# Or use dbt Cloud's built-in scheduler
dbt run --target prod --select tag:daily
dbt test --target prod --select tag:daily
dbt source freshness
```

## Results

Priya ran the first dbt production run on a Thursday. On Monday morning:

- **Finance got MRR in 3 seconds** — they query the `mrr` mart directly in Looker. No spreadsheet, no manual process.
- **MRR discrepancy resolved** — the mart reconciles Stripe invoices against subscription periods. The previous spreadsheet was undercounting expansion MRR by ~4%.
- **dbt tests catch data issues** — the `not_null` test on `organization_id` fired twice in the first week, catching two Fivetran sync gaps before they polluted the dashboard.
- **Freshness alerts work** — when Fivetran had a 9-hour outage, dbt's `error_after: 24h` freshness check fired and paged Priya before any stakeholder noticed stale data.
- **Self-serve analytics** — the generated dbt docs give the product team a browsable catalog of every table and column. They stopped asking Priya "what does this column mean?"
