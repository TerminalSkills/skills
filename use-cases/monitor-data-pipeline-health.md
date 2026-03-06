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

Using the **coding-agent**, **data-analysis**, and **n8n** skills, the approach is: audit the pipeline graph to find critical paths, write validation queries that check freshness, volume, and schema consistency, calibrate alert thresholds from historical baselines, and wire everything into an automated monitoring workflow that runs after each pipeline stage.

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

**Freshness check** — `raw_transactions` should update daily. If it's been more than 26 hours since the last load, something is wrong:

```sql
SELECT
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(loaded_at), HOUR) AS hours_since_load
FROM warehouse.raw_transactions
HAVING hours_since_load > 26;
```

**Volume check** — flag if today's row count drops more than 30% below the 7-day rolling average. This is what would have caught last month's API issue:

```sql
WITH daily_counts AS (
  SELECT DATE(created_at) AS dt, COUNT(*) AS row_count
  FROM warehouse.stg_transactions
  WHERE created_at > CURRENT_DATE - 10
  GROUP BY 1
)
SELECT dt, row_count, AVG(row_count) OVER (ORDER BY dt ROWS 7 PRECEDING) AS avg_7d
FROM daily_counts
HAVING row_count < avg_7d * 0.7;
```

**Null ratio check** — key columns like `customer_id` and `amount` should never exceed 2% nulls. If they do, a schema change upstream is probably breaking the JOIN logic:

```sql
SELECT
  'customer_id' AS column_name,
  COUNT(*) AS total_rows,
  SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END) AS null_count,
  ROUND(SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS null_pct
FROM warehouse.stg_transactions
WHERE created_at >= CURRENT_DATE
HAVING null_pct > 2.0;
```

**Schema drift check** — detect when upstream sources add, remove, or change column types. This catches the kind of breaking change that turns a numeric column into a string and silently produces nulls in downstream calculations.

### Step 3: Calibrate Thresholds from Historical Data

Static thresholds are brittle — a 30% volume drop might be normal on weekends but catastrophic on a Tuesday. Analyzing 30 days of historical data sets proper baselines per model:

| Model | Daily Average | Std Dev | Alert Threshold | Notes |
|---|---|---|---|---|
| raw_transactions | 45,200 rows | 3,100 | < 35,900 rows | Weekend volume ~30% lower |
| stg_users | 0.3% null rate on email | 0.1% | > 2% null rate | Stable, tight threshold OK |
| fct_revenue | 4.2 min load time | 1.1 min | > 12 min load time | Spikes on month-end close |

The thresholds are set at roughly 3 standard deviations from the mean — sensitive enough to catch real problems, loose enough to avoid alert fatigue. Weekend and holiday patterns get separate baselines so a quiet Sunday doesn't fire false alarms. Month-end processing, which naturally increases load times and row counts, gets its own calibration window.

The key principle: thresholds should be data-derived, not guessed. A human saying "45,000 rows seems right" is worse than a statistical model that knows the standard deviation is 3,100 and can set a meaningful boundary.

### Step 4: Wire Everything Into an n8n Workflow

The checks need to run automatically, not depend on someone remembering to look. An n8n workflow called `pipeline-health-monitor` triggers at 07:00 UTC daily — one hour after the dbt run completes:

1. Execute freshness queries against BigQuery for all 4 source tables
2. Execute volume anomaly queries against the calibrated baselines for all 15 models
3. Check null ratios on key columns across all critical models
4. Run schema drift detection against the previous day's column signatures
5. If any check fails, send a Slack alert to `#data-team` with the specific failure, affected model, current vs. expected values, and a link to the relevant dbt docs
6. Log all results (pass and fail) to a `pipeline_health_log` table for trend analysis

The logging matters as much as the alerting. Over weeks, the health log reveals patterns — gradual drift in volume that never trips the threshold on any single day but shows a clear downward trend over a month. A null rate creeping from 0.3% to 0.8% to 1.4% is invisible day-to-day but obvious in a 30-day chart.

The workflow also includes a weekly summary digest posted to `#data-team` every Monday: overall pipeline health score, any models trending toward their alert thresholds, and a list of checks that passed but were within 20% of triggering. This early-warning layer catches problems before they become alerts.

### Step 5: Validate the Setup

Two weeks after deployment, the same API hiccup recurs — the partner API starts returning empty arrays for a subset of accounts again. This time, the volume check on `raw_transactions` catches it within an hour. Lena sees the Slack alert at 8:15 AM:

> Pipeline Health Alert: raw_transactions volume anomaly
> Today: 28,400 rows | Expected: > 35,900 rows (7-day avg: 44,800)
> Affected downstream: stg_transactions, fct_revenue, fct_churn_metrics

She confirms the issue with the API provider and has a fix deployed before the analytics team even opens their laptops. The five-day detection window from last month becomes a one-hour detection window.

The `pipeline_health_log` table also surfaces something unexpected: `stg_users` has been slowly accumulating nulls in the `email` field — 0.3% a month ago, 0.5% two weeks ago, 0.8% now. Not enough to trip the 2% alert, but the weekly digest flagged it as "trending toward threshold." Investigation reveals a new integration partner has been sending records without email addresses. Caught before it became a problem, fixed by adding a validation rule at the ingestion layer.

## Real-World Example

Before the monitoring setup, Lena's mornings started with the analytics team asking "do the numbers look right today?" She'd manually query a few tables, eyeball the row counts, and hope for the best. The team spent 30 minutes every morning spot-checking dashboards because they'd been burned too many times.

After deploying the health checks, pipeline trust improved measurably. The analytics team stopped their manual spot-checks within a month. The mean time to detect data issues dropped from 5 days (stakeholder-reported) to under 1 hour (automated alert). The weekly digest caught two slow-building issues that would have taken weeks to surface otherwise.

Most importantly, the `pipeline_health_log` gave Lena ammunition for quarterly planning. She could point to specific trends — "this source has triggered 4 volume alerts in 6 weeks, we need an SLA" — instead of vaguely arguing that data quality needed investment. Data-backed arguments win budget conversations.

Total setup time: one afternoon. Annual hours saved from manual checking and late-caught data issues: roughly 200. First silent failure caught: 12 days after deployment.
