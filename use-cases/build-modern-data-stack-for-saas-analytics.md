---
title: Build a Modern Data Stack for SaaS Analytics
slug: build-modern-data-stack-for-saas-analytics
description: Build a production data pipeline using Airbyte to sync data from Stripe, HubSpot, and PostgreSQL into a warehouse, dlt for custom Python-based data ingestion, Soda for automated data quality checks, and Metabase for self-serve dashboards — giving a 40-person SaaS company real-time visibility into MRR, churn, and product usage without engineering bottleneck.
skills: [airbyte, dlt, soda, metabase, dbt]
category: Data Engineering
tags: [data-pipeline, etl, data-quality, analytics, data-warehouse, modern-data-stack]
---

# Build a Modern Data Stack for SaaS Analytics

Oscar is the first data hire at a 40-person SaaS company doing $2M ARR. The CEO wants to know churn rate, MRR trends, and which features drive retention. The VP of Sales wants a dashboard showing pipeline velocity and conversion rates. Product wants cohort analysis. Everyone asks engineering, and engineering is building product.

Oscar's job: build a data stack that ingests data from 8 sources, transforms it into business metrics, validates quality automatically, and serves dashboards that people actually use — all in 3 weeks, with zero ongoing engineering support.

## Step 1: Data Ingestion with Airbyte

The company's data lives in Stripe (billing), HubSpot (CRM), PostgreSQL (product database), Intercom (support), Mixpanel (analytics), Google Sheets (finance models), Slack (activity signals), and GitHub (engineering metrics). Airbyte connects to all of them with pre-built connectors and syncs to the warehouse on a schedule.

```yaml
# airbyte/connections.yaml — Airbyte connection configuration
# Self-hosted via Docker: docker compose up -d

# Stripe → Warehouse (billing data)
stripe_connection:
  source: stripe
  destination: bigquery                    # or snowflake, postgres, clickhouse
  config:
    account_id: "acct_xxx"
    client_secret: "${STRIPE_SECRET_KEY}"
  streams:
    - name: subscriptions
      sync_mode: incremental               # Only new/changed records
      cursor_field: created
    - name: invoices
      sync_mode: incremental
      cursor_field: created
    - name: charges
      sync_mode: incremental
    - name: customers
      sync_mode: full_refresh              # Full sync — customer data changes
  schedule:
    type: cron
    cron_expression: "0 */2 * * *"         # Every 2 hours

# HubSpot → Warehouse (CRM data)
hubspot_connection:
  source: hubspot
  destination: bigquery
  config:
    credentials:
      access_token: "${HUBSPOT_ACCESS_TOKEN}"
  streams:
    - name: contacts
      sync_mode: incremental
    - name: deals
      sync_mode: incremental
    - name: companies
      sync_mode: incremental
  schedule:
    type: cron
    cron_expression: "0 */4 * * *"         # Every 4 hours

# Product Database → Warehouse (usage data)
postgres_connection:
  source: postgres
  destination: bigquery
  config:
    host: "prod-db.internal.company.com"
    port: 5432
    database: "app_production"
    username: "${DB_READONLY_USER}"
    password: "${DB_READONLY_PASS}"
    ssl: true
    replication_method: CDC                # Change Data Capture — real-time
  streams:
    - name: users
      sync_mode: incremental
    - name: events
      sync_mode: incremental
      cursor_field: created_at
    - name: workspaces
      sync_mode: incremental
```

## Step 2: Custom Ingestion with dlt (Data Load Tool)

Some data sources don't have Airbyte connectors or need custom logic. Oscar uses dlt — a Python library that turns any API into a data pipeline in 30 lines.

```python
# pipelines/slack_activity.py — Custom Slack activity ingestion
import dlt
from dlt.sources.rest_api import rest_api_source

@dlt.source
def slack_activity():
    """Ingest Slack channel activity for team engagement metrics.

    Tracks message volume, reaction counts, and active users per channel
    to correlate team engagement with product metrics.
    """
    @dlt.resource(
        write_disposition="merge",         # Upsert — update existing, insert new
        primary_key="ts",                  # Slack message timestamp is unique ID
        columns={"ts": {"data_type": "text"}, "channel": {"data_type": "text"}},
    )
    def messages(
        last_ts=dlt.sources.incremental("ts", initial_value="0")
    ):
        """Fetch messages from key Slack channels incrementally."""
        import requests
        channels = ["C0GENERAL", "C0PRODUCT", "C0ENGINEERING"]

        for channel in channels:
            response = requests.get("https://slack.com/api/conversations.history", params={
                "channel": channel,
                "oldest": last_ts.last_value,
                "limit": 200,
            }, headers={"Authorization": f"Bearer {dlt.secrets['slack_token']}"})

            data = response.json()
            for msg in data.get("messages", []):
                yield {
                    "ts": msg["ts"],
                    "channel": channel,
                    "user": msg.get("user"),
                    "text_length": len(msg.get("text", "")),
                    "reaction_count": len(msg.get("reactions", [])),
                    "thread_reply_count": msg.get("reply_count", 0),
                    "has_attachment": bool(msg.get("files")),
                }

    return messages()

# Run the pipeline
if __name__ == "__main__":
    pipeline = dlt.pipeline(
        pipeline_name="slack_activity",
        destination="bigquery",
        dataset_name="raw_slack",
    )
    load_info = pipeline.run(slack_activity())
    print(f"Loaded {load_info.loads_ids} — {load_info.metrics}")
```

## Step 3: Data Quality with Soda

Bad data is worse than no data. Oscar sets up Soda checks that run after every sync and alert the team when data quality drops below thresholds.

```yaml
# soda/checks/stripe_checks.yaml — Data quality checks for billing data
checks for raw_stripe.subscriptions:
  # Freshness — data should be less than 3 hours old
  - freshness(created) < 3h:
      name: "Subscription data is fresh"

  # Completeness — no missing critical fields
  - missing_count(customer_id) = 0:
      name: "Every subscription has a customer"
  - missing_count(status) = 0:
      name: "Every subscription has a status"

  # Validity — values are within expected ranges
  - invalid_count(status) = 0:
      valid values: [active, past_due, canceled, trialing, paused]
      name: "All subscription statuses are valid"

  # Volume — catch data pipeline breaks
  - row_count > 0:
      name: "Subscriptions table is not empty"
  - anomaly detection for row_count:
      name: "No unusual changes in subscription volume"
      severity: warn

checks for raw_stripe.invoices:
  - freshness(created) < 3h
  - missing_count(amount_paid) = 0
  - values in (currency) must be in ['usd', 'eur', 'gbp']:
      name: "Only expected currencies"
  - failed_count(amount_paid) = 0:
      fail condition: amount_paid < 0
      name: "No negative invoice amounts"

checks for mart_finance.mrr_monthly:
  # Business logic checks on transformed data
  - avg(mrr) between 150000 and 250000:
      name: "MRR is in expected range ($150K-$250K)"
  - anomaly detection for sum(mrr):
      name: "No sudden MRR spikes or drops"
      severity: critical
```

```bash
# Run checks after dbt transform
soda scan -d bigquery -c soda/configuration.yml soda/checks/stripe_checks.yaml

# Output:
# Scan summary:
# 12/12 checks PASSED
# 0 checks WARNED
# 0 checks FAILED
```

## Step 4: Self-Serve Dashboards with Metabase

Oscar deploys Metabase connected to the warehouse's transformed layer. Non-technical users build their own dashboards with drag-and-drop, and the CEO gets a weekly email with key metrics.

```sql
-- Metabase question: MRR Waterfall
-- Saved as a "question" in Metabase, pinned to the Executive Dashboard

WITH monthly AS (
  SELECT
    date_trunc('month', event_date) AS month,
    SUM(CASE WHEN event_type = 'new' THEN mrr_change ELSE 0 END) AS new_mrr,
    SUM(CASE WHEN event_type = 'expansion' THEN mrr_change ELSE 0 END) AS expansion_mrr,
    SUM(CASE WHEN event_type = 'contraction' THEN mrr_change ELSE 0 END) AS contraction_mrr,
    SUM(CASE WHEN event_type = 'churn' THEN mrr_change ELSE 0 END) AS churned_mrr,
    SUM(CASE WHEN event_type = 'reactivation' THEN mrr_change ELSE 0 END) AS reactivated_mrr
  FROM mart_finance.mrr_events
  GROUP BY 1
)
SELECT
  month,
  new_mrr,
  expansion_mrr,
  reactivated_mrr,
  contraction_mrr,
  churned_mrr,
  SUM(new_mrr + expansion_mrr + reactivated_mrr + contraction_mrr + churned_mrr)
    OVER (ORDER BY month) AS cumulative_mrr
FROM monthly
ORDER BY month
```

## Results After 3 Weeks

Oscar delivers the entire stack in 3 weeks. The CEO opens the MRR dashboard every morning. The VP of Sales stopped asking engineering for reports. Product runs their own cohort analysis in Metabase without writing SQL. Soda caught a Stripe sync failure at 2 AM before anyone noticed — the alert fired, the pipeline self-healed on retry, and the morning dashboards were accurate.

- **8 data sources** synced automatically (Airbyte + dlt)
- **14 dbt models** transforming raw data into business metrics
- **47 Soda checks** running after every sync
- **12 Metabase dashboards** used by 28 out of 40 employees weekly
- **Zero engineering tickets** for data requests after launch
- **Data freshness**: 2 hours for billing, 15 minutes for product usage (CDC)
- **Total cost**: $180/month (self-hosted Airbyte + BigQuery + Metabase OSS)
