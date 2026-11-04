---
title: "Monitor Data Pipeline Health with AI"
slug: monitor-data-pipeline-health
description: "Detect anomalies, stale data, and silent failures in ETL and data pipelines before they impact downstream consumers."
skills: [data-analysis, coding-agent, n8n]
category: data-ai
tags: [data-pipeline, monitoring, etl, anomaly-detection, data-quality]
---

# Monitor Data Pipeline Health with AI

## The Problem

Lena is a data engineer at a 20-person SaaS startup. She has 15 dbt models running daily at 06:00 UTC, loading data from Postgres into BigQuery. When pipelines fail loudly, she catches them. The real danger is the silent kind.

Last month, a partner API started returning empty arrays for a subset of accounts. The pipeline ran green for five days straight — no errors, no alerts, nothing. The VP of Sales noticed the problem first, when revenue numbers were off by 15% in the executive dashboard. Five days of bad data, decisions already made on the wrong numbers.

That's the pattern with data pipelines: a source API returns stale data, a schema change upstream causes nulls to propagate through the warehouse, or a job runs successfully but processes zero rows. The pipeline says "success" because it ran without errors. Nobody checks whether the data it produced actually makes sense. The 12-person analytics team spends their mornings manually spot-checking dashboards because they don't trust the numbers — and they're right not to.

## The Solution

Using the **coding-agent** skill to read the project and write the checks, the **data-analysis** skill to calibrate thresholds from history, and the **n8n** skill to run the checks on a schedule and alert, the approach is: audit the pipeline graph to find critical paths, use dbt's own freshness and tests where they exist, add SQL checks for volume and schema drift, calibrate alert thresholds from historical baselines, and wire everything into an automated workflow that runs after the pipeline.

## Step-by-Step Walkthrough

### Step 1: Audit the Pipeline Graph

Lena starts by sharing her dbt manifest with the agent:

```text
I have 15 dbt models that run daily at 06:00 UTC, loading data from Postgres
into BigQuery. Help me build health checks for these pipelines. Here's my
dbt manifest: manifest.json
```

The manifest reveals the dependency graph — 15 models, 4 source tables, 3 exposure endpoints. The critical path jumps out immediately:

**raw_transactions -> stg_transactions -> fct_revenue**

This chain feeds the executive dashboard. If anything goes wrong here, leadership sees wrong numbers. And right now, `raw_transactions` has no freshness check configured. The `stg_users` model JOINs on an email field with no null handling — one upstream schema change and the whole join silently drops rows. The `fct_revenue` aggregation could mask missing data entirely because a SUM over fewer rows still returns a number. It just returns the wrong number.

Three other risk areas surface from the dependency analysis:
- `stg_users` feeds 4 downstream models — a failure here cascades silently
- `fct_churn_metrics` depends on a third-party enrichment API with no SLA
- `dim_products` has no deduplication logic, so upstream duplicates pass through unchecked

### Step 2: Write Validation Queries for Each Critical Model

For each high-risk model, the health checks need to answer three questions: Is the data fresh? Is there enough of it? Does it look right?

**Freshness check** — dbt has this built in. Declare it on the source and run `dbt source freshness` (dbt 2.0 also offers `dbt freshness`). `raw_transactions` should update daily, so warn after 26 hours and error after 36:

```yaml
# models/sources.yml
sources:
  - name: warehouse
    config:
      loaded_at_field: loaded_at
    tables:
      - name: raw_transactions
        config:
          freshness:
            warn_after: { count: 26, period: hour }
            error_after: { count: 36, period: hour }
```

The command writes `target/sources.json`, which the monitoring workflow reads. Keep `dbt source freshness` in the same job as the run, or the check passes against data from a previous day.

**Volume check** — flag if yesterday's row count drops more than 30% below the average of the same weekday over the previous four weeks. Comparing the same weekday keeps a quiet Sunday from looking like an outage, and this is the check that would have caught last month's API issue. BigQuery SQL:

```sql
WITH daily AS (
  SELECT DATE(created_at) AS dt, COUNT(*) AS row_count
  FROM warehouse.stg_transactions
  WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 35 DAY)  -- keeps the partition scan small
  GROUP BY dt
),
scored AS (
  SELECT dt, row_count,
    AVG(row_count) OVER (
      PARTITION BY EXTRACT(DAYOFWEEK FROM dt) ORDER BY dt
      ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING) AS avg_same_weekday
  FROM daily
)
SELECT * FROM scored
WHERE dt = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) AND row_count < avg_same_weekday * 0.7;
```

The query returns a row only when the check fails. A window function cannot go in `HAVING`, which is why the filter sits in an outer `WHERE`. A zero-row run is the worst case: with no rows for yesterday the query also returns nothing, so have the workflow treat "no result for yesterday" as a failure too (for example `SELECT COUNT(*)` for yesterday, alert when it is 0).

**Null ratio check** — key columns like `customer_id` and `amount` should rarely be null. If the share grows, a schema change upstream is probably breaking the JOIN logic:

```sql
SELECT null_pct FROM (
  SELECT SAFE_DIVIDE(COUNTIF(customer_id IS NULL), COUNT(*)) * 100 AS null_pct
  FROM warehouse.stg_transactions
  WHERE created_at >= TIMESTAMP(CURRENT_DATE())
)
WHERE null_pct > 2.0;
```

For checks that belong to a model, a dbt `not_null` test with `config: { severity: warn, warn_if: ">100", error_if: ">1000" }` does the same job inside `dbt build`; the SQL above is for thresholds in the workflow.

**Schema drift check** — snapshot the columns every day and diff against yesterday. This catches the breaking change that turns a numeric column into a string and silently produces nulls downstream:

```sql
SELECT table_name, column_name, data_type
FROM warehouse.INFORMATION_SCHEMA.COLUMNS
WHERE table_name IN ('raw_transactions', 'stg_users');
```

Insert the result into a dated table and compare today's set with yesterday's; any added, removed or retyped column is an alert. For dbt-built models, `contract: { enforced: true }` with declared column types makes the build itself fail on a type change.

### Step 3: Calibrate Thresholds from Historical Data

Static thresholds are brittle — a 30% volume drop might be normal on weekends but catastrophic on a Tuesday. The **data-analysis** skill loads 30 days of history from the warehouse into pandas and computes a baseline per model and per weekday type:

```python
import pandas as pd

df = pd.read_csv("daily_counts.csv", parse_dates=["dt"])   # exported from the daily CTE above
df["weekend"] = df["dt"].dt.day_of_week >= 5
b = df.groupby("weekend")["row_count"].agg(["mean", "std"])
b["floor"] = b["mean"] - 3 * b["std"]
print(b.round(0))
```

For Lena's data the agent produces a table like this (the example's own numbers):

| Model | Daily Average | Std Dev | Alert Threshold | Notes |
|---|---|---|---|---|
| raw_transactions | 45,200 rows | 3,100 | < 35,900 rows (mean − 3 SD) | Weekend volume ~30% lower, separate baseline |
| stg_users | 0.3% null rate on email | 0.1% | > 2% null rate | Set well above the observed range to avoid noise |
| fct_revenue | 4.2 min load time | 1.1 min | > 12 min load time | Spikes on month-end close |

Volume floors are set at three standard deviations below the mean, which is sensitive enough to catch real problems and loose enough to avoid alert fatigue. Null rates and load times are not normally distributed, so their limits are set by judgment above the observed range and reviewed monthly. Month-end processing, which naturally increases load times and row counts, gets its own calibration window. Thresholds should be derived from the data, not guessed.

### Step 4: Wire Everything Into an n8n Workflow

The checks need to run automatically, not depend on someone remembering to look. The **n8n** skill covers self-hosting n8n (pinned image, published only on `127.0.0.1` behind a TLS proxy, credentials kept in n8n's credential store, never inside the workflow). A workflow called `pipeline-health-monitor` starts from a Schedule Trigger at 07:00 UTC (set `GENERIC_TIMEZONE=UTC`), one hour after the dbt run. If the dbt job can call a webhook when it finishes, use a Webhook trigger with header authentication instead, so the checks never run against a job that is still going:

1. Read `sources.json` from `dbt source freshness` (or run the freshness check in the dbt job and post its result to the workflow)
2. Google BigQuery node, *Execute a SQL query*: the volume check for each critical model
3. Google BigQuery node: the null-ratio queries on key columns
4. Google BigQuery node: today's `INFORMATION_SCHEMA.COLUMNS` snapshot, compared with yesterday's in a Code node
5. If any check fails (an IF node), Slack node: post to `#data-team` with the failing check, the affected model, current vs. expected values, and a link to the dbt docs
6. BigQuery node: insert every result, pass and fail, into a `pipeline_health_log` table for trend analysis

Give the workflow its own BigQuery service account with read access to the warehouse and write access to the log table only. An error workflow (n8n's *Error Workflow* setting) should alert when the monitor itself fails, because a monitor that silently stops is the same problem one level up.

The logging matters as much as the alerting. Over weeks, the health log reveals gradual drift in volume that never trips the threshold on any single day but shows a clear downward trend over a month. A null rate creeping from 0.3% to 0.8% to 1.4% is invisible day-to-day but obvious in a 30-day chart.

A second Schedule Trigger posts a weekly digest to `#data-team` every Monday: models trending toward their alert thresholds, and checks that passed but were within 20% of triggering.

### Step 5: Validate the Setup

Two weeks after deployment, the same API hiccup recurs — the partner API starts returning empty arrays for a subset of accounts again. This time, the volume check on `stg_transactions` catches it within an hour of the load. Lena sees the Slack alert at 07:05 UTC:

> Pipeline Health Alert: stg_transactions volume anomaly
> Yesterday: 28,400 rows | Expected: > 31,360 rows (70% of the 4-week same-weekday average, 44,800)
> Affected downstream: fct_revenue, fct_churn_metrics

She confirms the issue with the API provider and has a fix deployed before the analytics team even opens their laptops. The five-day detection window from last month becomes a one-hour detection window.

The `pipeline_health_log` table also surfaces something unexpected: `stg_users` has been slowly accumulating nulls in the `email` field — 0.3% a month ago, 0.5% two weeks ago, 0.8% now. Not enough to trip the 2% alert, but the weekly digest flagged it as "trending toward threshold." Investigation reveals a new integration partner has been sending records without email addresses. Caught before it became a problem, fixed by adding a validation rule at the ingestion layer.

## Real-World Example

Before the monitoring setup, Lena's mornings started with the analytics team asking "do the numbers look right today?" She'd manually query a few tables, eyeball the row counts, and hope for the best. The team spent 30 minutes every morning spot-checking dashboards because they'd been burned too many times.

After deploying the health checks, pipeline trust improved measurably. The analytics team stopped their manual spot-checks within a month. In Lena's own tracking, the time to detect data issues dropped from 5 days (stakeholder-reported) to under an hour (automated alert). The weekly digest caught two slow-building issues that would have taken weeks to surface otherwise.

Most importantly, the `pipeline_health_log` gave Lena ammunition for quarterly planning. She could point to specific trends — "this source has triggered 4 volume alerts in 6 weeks, we need an SLA" — instead of vaguely arguing that data quality needed investment. Data-backed arguments win budget conversations.

Setup took Lena about an afternoon in this example. First silent failure caught: 12 days after deployment.
