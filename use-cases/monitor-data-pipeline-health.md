---
title: "Monitor Data Pipeline Health with AI"
slug: monitor-data-pipeline-health
description: "Detect anomalies, stale data, and silent failures in ETL and data pipelines before they impact downstream consumers."
skills: [data-analysis, coding-agent, n8n-workflow]
category: data-ai
tags: [data-pipeline, monitoring, etl, anomaly-detection, data-quality]
---

# Monitor Data Pipeline Health with AI

## The Problem

Your data pipelines run on a schedule — Airflow DAGs, dbt jobs, custom cron scripts — and when they fail loudly, you catch them. The real danger is silent failures: a pipeline that runs successfully but processes zero rows, a source API that starts returning stale data, or a schema change upstream that causes nulls to propagate through your warehouse. A 12-person analytics team discovers these issues only when a stakeholder reports wrong numbers in a dashboard, sometimes days after the data went bad.

## The Solution

Use the **coding-agent** to build health-check scripts that validate row counts, freshness, and schema consistency. Use **data-analysis** to establish baselines and detect anomalies. Use **n8n-workflow** to wire up automated checks that run after each pipeline stage.

```bash
npx terminal-skills install coding-agent data-analysis n8n-workflow
```

## Step-by-Step Walkthrough

### 1. Ask the agent to audit your current pipelines

```
I have 15 dbt models that run daily at 06:00 UTC, loading data from Postgres
into BigQuery. Help me build health checks for these pipelines. Here's my
dbt manifest: manifest.json
```

### 2. The agent maps dependencies and identifies critical paths

The agent parses your pipeline graph and flags the highest-risk nodes:

```
Pipeline Analysis:
- 15 models, 4 source tables, 3 exposure endpoints
- Critical path: raw_transactions -> stg_transactions -> fct_revenue (feeds exec dashboard)
- Risk areas:
  - raw_transactions: no freshness check configured
  - stg_users: JOIN on email field with no null handling
  - fct_revenue: aggregation could silently drop rows on schema mismatch
```

### 3. The agent generates health-check queries

For each critical model, the agent writes validation SQL:

```sql
-- Freshness check: raw_transactions should update daily
SELECT TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(loaded_at), HOUR) AS hours_since_load
FROM warehouse.raw_transactions
HAVING hours_since_load > 26;

-- Volume check: flag if row count drops more than 30% vs 7-day average
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

### 4. The agent wires checks into an n8n workflow

```
Created n8n workflow: pipeline-health-monitor
Triggers: runs at 07:00 UTC daily (1 hour after dbt completes)
Steps:
1. Execute freshness queries against BigQuery
2. Execute volume anomaly queries
3. Check for null ratios exceeding 5% in key columns
4. Send Slack alert to #data-team if any check fails
5. Log results to pipeline_health_log table for trend analysis
```

### 5. Review the anomaly detection baseline

The agent analyzes 30 days of historical data to calibrate thresholds:

```
Baseline Report:
- raw_transactions: avg 45,200 rows/day (σ = 3,100), alert threshold set at < 35,900
- stg_users: avg null rate on email = 0.3%, alert threshold set at > 2%
- fct_revenue: avg load time 4.2 min, alert threshold set at > 12 min
```

## Real-World Example

Lena is a data engineer at a 20-person SaaS startup. Last month, a partner API silently started returning empty arrays for a subset of accounts. The pipeline ran green for five days before the VP of Sales noticed revenue numbers were off by 15%.

1. Lena feeds the agent her dbt project files and asks for a comprehensive health monitoring setup
2. The agent generates freshness, volume, schema, and null-ratio checks for all 15 models
3. It builds an n8n workflow that runs these checks daily and alerts on Slack
4. Two weeks later, the same API hiccup recurs — but this time the volume check catches it within an hour, and Lena fixes it before anyone notices
5. Pipeline trust improves so much that the analytics team stops manually spot-checking dashboards every morning

## Related Skills

- [data-analysis](../skills/data-analysis/) -- Establishes baselines and detects statistical anomalies in pipeline metrics
- [coding-agent](../skills/coding-agent/) -- Generates health-check scripts and validation queries
- [n8n-workflow](../skills/n8n-workflow/) -- Orchestrates automated monitoring workflows with alerting
