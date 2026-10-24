---
title: Build a Modern Data Stack for SaaS Analytics
slug: build-modern-data-stack-for-saas-analytics
description: Build a production data pipeline using Airbyte to sync data from Stripe, HubSpot, and PostgreSQL into a warehouse, dlt for custom Python-based data ingestion, Soda for automated data quality checks, and Metabase for self-serve dashboards — giving a 40-person SaaS company real-time visibility into MRR, churn, and product usage without engineering bottleneck.
skills: [airbyte, dlt, soda, metabase, dbt]
category: data-ai
tags: [data-pipeline, etl, data-quality, analytics, data-warehouse, modern-data-stack]
---

# Build a Modern Data Stack for SaaS Analytics

Oscar is the first data hire at a 40-person SaaS company doing $2M ARR. The CEO wants to know churn rate, MRR trends, and which features drive retention. The VP of Sales wants a dashboard showing pipeline velocity and conversion rates. Product wants cohort analysis. Everyone asks engineering, and engineering is building product.

Oscar's job: build a data stack that ingests data from 8 sources, transforms it into business metrics, validates quality automatically, and serves dashboards that people actually use — all in 3 weeks, with zero ongoing engineering support.

## Step 1: Data Ingestion with Airbyte

The company's data lives in Stripe (billing), HubSpot (CRM), PostgreSQL (product database), Intercom (support), Mixpanel (analytics), Google Sheets (finance models), Slack (activity signals), and GitHub (engineering metrics). Airbyte has a pre-built connector for each of them and syncs to the warehouse on a schedule.

Airbyte's supported way to self-host is `abctl`, which runs Airbyte in a local Kubernetes cluster on top of Docker (the old `docker compose` install is no longer the documented route). Install it with Homebrew, or download the release archive for your OS from [github.com/airbytehq/abctl/releases](https://github.com/airbytehq/abctl/releases), then:

```bash
brew tap airbytehq/tap && brew install abctl   # or unpack the release archive and put abctl on your PATH
abctl local install                            # UI at http://localhost:8000
abctl local credentials                        # prints the generated admin password
```

Oscar creates the destination (BigQuery) and one connection per source in the UI. The settings that matter:

| Source | Key settings | Sync mode / schedule |
|---|---|---|
| Stripe | `account_id`, restricted API key as `client_secret`, `start_date`; lookback window if you want late changes re-read | Incremental, every 2 hours; `customers` full refresh |
| HubSpot | Private app access token | Incremental, every 4 hours |
| PostgreSQL | Read-only user, SSL on | CDC for `events` (needs logical replication on the database), otherwise incremental by cursor |
| Intercom, Mixpanel, Google Sheets, GitHub | Per-connector credentials | Incremental where the stream supports it |

Use `Incremental | Append + Deduped` for streams with a cursor, so the warehouse always holds one current row per primary key. Keep credentials out of the repo: enter them in the Airbyte UI, which stores them as secrets. Connection setup can also be scripted with the [Airbyte Terraform provider](https://registry.terraform.io/providers/airbytehq/airbyte/latest) once the first one works by hand.

## Step 2: Custom Ingestion with dlt (Data Load Tool)

Slack activity is a signal Oscar wants for engagement metrics, and he wants control over which channels are read and which fields are kept. dlt turns a Python generator into a pipeline: it creates the tables, tracks the incremental cursor, and loads into the same warehouse. (dlt also ships a verified Slack source: `dlt init slack bigquery`. Writing the resource by hand is the right call when you need only a few derived fields.)

```python
# pipelines/slack_activity.py
import dlt
from dlt.sources.helpers import requests

CHANNELS = ["C0GENERAL", "C0PRODUCT", "C0ENGINEERING"]


@dlt.source(name="slack_activity")
def slack_activity(slack_token: str = dlt.secrets.value):
    @dlt.resource(write_disposition="merge", primary_key=["channel", "ts"])
    def messages(
        last_ts=dlt.sources.incremental("ts", initial_value="0"),
    ):
        headers = {"Authorization": f"Bearer {slack_token}"}
        for channel in CHANNELS:
            cursor = None
            while True:
                params = {"channel": channel, "oldest": last_ts.last_value, "limit": 200}
                if cursor:
                    params["cursor"] = cursor
                resp = requests.get(
                    "https://slack.com/api/conversations.history",
                    params=params,
                    headers=headers,
                )
                data = resp.json()
                if not data.get("ok"):
                    raise RuntimeError(f"Slack error for {channel}: {data.get('error')}")
                for msg in data["messages"]:
                    yield {
                        "ts": msg["ts"],
                        "channel": channel,
                        "user": msg.get("user"),
                        "text_length": len(msg.get("text", "")),
                        "reaction_count": len(msg.get("reactions", [])),
                        "thread_reply_count": msg.get("reply_count", 0),
                        "has_attachment": bool(msg.get("files")),
                    }
                cursor = data.get("response_metadata", {}).get("next_cursor")
                if not cursor:
                    break

    return messages


if __name__ == "__main__":
    pipeline = dlt.pipeline(
        pipeline_name="slack_activity",
        destination="bigquery",
        dataset_name="raw_slack",
    )
    print(pipeline.run(slack_activity()))
```

Credentials come from `.dlt/secrets.toml` (git-ignored) or environment variables: `SOURCES__SLACK_ACTIVITY__SLACK_TOKEN` for the Slack bot token (scopes `channels:history`, `groups:history` for private channels; the bot must be invited to each channel) and `DESTINATION__BIGQUERY__CREDENTIALS__PROJECT_ID`, `__PRIVATE_KEY`, `__CLIENT_EMAIL` for BigQuery. `pip install "dlt[bigquery]"` then `python pipelines/slack_activity.py`. Merge disposition with a `(channel, ts)` primary key makes re-runs idempotent.

## Step 3: Transform with dbt

Raw tables are not metrics. Oscar models them with dbt: staging models rename and cast, marts hold business logic. `pip install dbt-bigquery`, then `dbt build` runs models and tests together.

```sql
-- models/staging/stripe/stg_stripe__subscription_mrr.sql
-- One row per subscription per month, from paid invoices on monthly plans.
-- (Annual plans need amount_paid / 12 spread over 12 months; add that when you have them.)
select
    subscription as subscription_id,
    date_trunc(date(created), month) as month,
    sum(amount_paid) / 100 as mrr
from {{ source('raw_stripe', 'invoices') }}
where subscription is not null
  and status = 'paid'
group by 1, 2
```

```sql
-- models/marts/finance/mrr_events.sql
-- Fill every month between a subscription's first invoice and today with 0,
-- so a cancellation shows up as a month with MRR 0.
with bounds as (
    select subscription_id, min(month) as first_month
    from {{ ref('stg_stripe__subscription_mrr') }}
    group by 1
),
spine as (
    select subscription_id, month
    from bounds,
        unnest(generate_date_array(first_month, date_trunc(current_date(), month), interval 1 month)) as month
),
monthly as (
    select
        spine.subscription_id,
        spine.month,
        coalesce(s.mrr, 0) as mrr
    from spine
    left join {{ ref('stg_stripe__subscription_mrr') }} s
        on s.subscription_id = spine.subscription_id and s.month = spine.month
),
changes as (
    select
        subscription_id,
        month as event_date,
        mrr - coalesce(lag(mrr) over (partition by subscription_id order by month), 0) as mrr_change,
        lag(mrr) over (partition by subscription_id order by month) as previous_mrr,
        mrr
    from monthly
)
select
    *,
    case
        when previous_mrr is null then 'new'
        when mrr = 0 then 'churn'
        when previous_mrr = 0 then 'reactivation'
        when mrr > previous_mrr then 'expansion'
        else 'contraction'
    end as event_type
from changes
where mrr_change != 0
```

Declare the Airbyte table once in `models/staging/stripe/sources.yml` (`sources: - name: raw_stripe`, `tables: - name: invoices`; add `schema: raw_stripe` if the Airbyte dataset name differs from the source name), and point the dbt BigQuery profile at `dataset: mart_finance` so the model lands in `mart_finance.mrr_events`, the table the Metabase question reads.

## Step 4: Data Quality with Soda

Bad data is worse than no data. Current Soda (v4) checks are written as data contracts, one YAML file per dataset, and run with `soda contract verify`. The older SodaCL `checks for ...` files and `soda scan` command belong to Soda Core 3 and are not part of the current CLI.

```bash
pip install soda-core soda-bigquery
```

```yaml
# soda/ds_config.yml
type: bigquery
name: warehouse
connection:
  account_info_json_path: ${env.GOOGLE_APPLICATION_CREDENTIALS}
  dataset: raw_stripe
  project_id: ${env.BQ_PROJECT_ID}
```

```yaml
# soda/contracts/stripe_invoices.yml
# dataset format: <data source>/<project>/<dataset>/<table>
dataset: warehouse/my-project/raw_stripe/invoices
columns:
  - name: amount_paid
    checks:
      - missing:
      - invalid:
          valid_min: 0
          name: No negative invoice amounts
  - name: currency
    checks:
      - invalid:
          valid_values: [usd, eur, gbp]
          name: Only expected currencies
checks:
  - row_count:
  - freshness:
      column: created
      threshold:
        unit: hour
        must_be_less_than: 3
```

Business-level ranges go in a second contract on the mart (for example an `aggregate` check with `function: sum` and `must_be_between` on `mrr`). Anomaly detection in Soda v4 is a Soda Cloud feature, so the open-source CLI checks use explicit thresholds.

```bash
soda contract test --contract soda/contracts/stripe_invoices.yml     # syntax only, no data read
soda contract verify --contract soda/contracts/stripe_invoices.yml -ds soda/ds_config.yml
```

`verify` exits non-zero when a check fails, so an orchestrator (or a CI job after the dbt run) stops the pipeline before bad numbers reach a dashboard. Output ends with a summary table:

```console
# Summary:
|----------------|---|----|
| Checks         | 5 |    |
| Passed         | 5 | ✅ |
| Failed         | 0 | ✅ |
| Warned         | 0 | ✅ |
| Not Evaluated  | 0 | ✅ |
| Excluded       | 0 | ✅ |
| Runtime Errors | 0 | ✅ |
```

## Step 5: Self-Serve Dashboards with Metabase

Oscar deploys Metabase connected to the warehouse's transformed layer (`mart_*` datasets only). Run the open-source image bound to localhost behind a reverse proxy with TLS, with its application database on Postgres rather than the default H2 file:

```bash
docker run -d --name metabase -p 127.0.0.1:3000:3000 \
  -e MB_DB_TYPE=postgres -e MB_DB_HOST=db.internal -e MB_DB_PORT=5432 \
  -e MB_DB_DBNAME=metabase -e MB_DB_USER=metabase -e MB_DB_PASS="$METABASE_DB_PASSWORD" \
  metabase/metabase:latest
```

Pin an explicit version tag in production. Non-technical users build their own questions with the query builder; Oscar saves the MRR waterfall as a SQL question (BigQuery syntax) and pins it to the Executive Dashboard. A dashboard subscription (needs SMTP configured) sends the CEO a weekly email.

```sql
-- Metabase question: MRR Waterfall
WITH monthly AS (
  SELECT
    DATE_TRUNC(event_date, MONTH) AS month,
    SUM(IF(event_type = 'new', mrr_change, 0)) AS new_mrr,
    SUM(IF(event_type = 'expansion', mrr_change, 0)) AS expansion_mrr,
    SUM(IF(event_type = 'contraction', mrr_change, 0)) AS contraction_mrr,
    SUM(IF(event_type = 'churn', mrr_change, 0)) AS churned_mrr,
    SUM(IF(event_type = 'reactivation', mrr_change, 0)) AS reactivated_mrr
  FROM mart_finance.mrr_events
  GROUP BY month
)
SELECT
  month, new_mrr, expansion_mrr, reactivated_mrr, contraction_mrr, churned_mrr,
  SUM(new_mrr + expansion_mrr + reactivated_mrr + contraction_mrr + churned_mrr)
    OVER (ORDER BY month) AS cumulative_mrr
FROM monthly
ORDER BY month
```

## Results After 3 Weeks

Oscar delivers the stack in 3 weeks. The CEO opens the MRR dashboard every morning, the VP of Sales stopped asking engineering for reports, and product runs its own cohort analysis in Metabase. When a Stripe sync stalls overnight, the freshness check fails and blocks the dashboard refresh, so people see yesterday's numbers marked stale instead of wrong ones.

- **8 data sources** synced automatically (Airbyte + dlt)
- **dbt models** turning raw data into business metrics, tested on every run
- **Soda contracts** verified after every sync
- **Metabase dashboards** used by most of the company weekly
- **Zero engineering tickets** for data requests after launch (this team's own result)

## Related Skills

- [airbyte](/skills/airbyte) — pre-built connectors and scheduled syncs
- [dlt](/skills/dlt) — Python pipelines for custom sources
- [dbt](/skills/dbt) — transformations and tests
- [soda](/skills/soda) — data quality checks
- [metabase](/skills/metabase) — self-serve dashboards
