---
title: "Validate ETL Data Quality with AI Before It Breaks Your Dashboard"
slug: validate-etl-data-quality
description: "Catch data quality issues in ETL pipelines before bad data reaches dashboards and reports."
skills: [data-validator, sql-optimizer, data-analysis]
category: data-ai
tags: [data-quality, etl, pipelines, analytics, validation]
---

# Validate ETL Data Quality with AI Before It Breaks Your Dashboard

## The Problem

Your morning dashboard shows revenue dropped 80% overnight. Panic. Three hours later, someone discovers a broken ETL job silently loaded null values into the amounts column. The data was never validated — it just flowed from source to warehouse to dashboard. By the time anyone noticed, stakeholders had already escalated and trust in the data team was shattered.

## The Solution

Use the **data-validator** skill to run automated quality checks on your data at every stage of the pipeline. Combine with **sql-optimizer** to write efficient validation queries and **data-analysis** to profile datasets and detect anomalies. Catch problems at ingestion, not at the dashboard.

```bash
npx terminal-skills install data-validator
npx terminal-skills install sql-optimizer
npx terminal-skills install data-analysis
```

## Step-by-Step Walkthrough

### 1. Profile the incoming data

```
Profile this CSV export from our payments provider. We receive this daily and load it into our warehouse. Show me the data shape and any red flags.
```

The agent scans the file and reports:

```
Dataset: payments_20260217.csv
Rows: 34,219 | Columns: 11

| Column          | Type   | Nulls | Unique | Concern          |
|-----------------|--------|-------|--------|------------------|
| transaction_id  | string | 0%    | 34,219 | ✅ All unique    |
| amount_cents    | int    | 0.4%  | 5,891  | ⚠️ 137 nulls     |
| currency        | string | 0%    | 3      | ✅ USD, EUR, GBP |
| customer_email  | string | 2.3%  | 18,442 | ⚠️ Above threshold|
| processed_at    | date   | 0%    | 31,004 | ✅ All today      |
```

### 2. Define and run validation rules

```
Validate this data with these rules: transaction_id must be unique, amount_cents cannot be null, customer_email null rate must be under 1%, and all dates must be today.
```

```
## Validation Report

### ❌ Failed (2)
1. amount_cents: 137 null values (0.4%) — blocks accurate revenue calc
2. customer_email: 2.3% null (threshold: 1%) — 789 records missing email

### ✅ Passed (2)
- transaction_id uniqueness: PASS
- processed_at date range: PASS (all 2026-02-17)

Pipeline verdict: BLOCK — fix nulls in amount_cents before loading.
```

### 3. Investigate the root cause

```
Show me the 137 rows with null amount_cents. Is there a pattern?
```

The agent finds all 137 records share `payment_method: bank_transfer` and `status: pending` — these are authorized but not yet settled transactions that the provider shouldn't have included.

### 4. Build a validation query for the warehouse

```
Write a SQL validation query I can run after each load to catch these issues automatically.
```

```sql
WITH checks AS (
  SELECT
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE amount_cents IS NULL) AS null_amounts,
    COUNT(*) FILTER (WHERE customer_email IS NULL) AS null_emails,
    COUNT(*) - COUNT(DISTINCT transaction_id) AS duplicate_txns,
    MAX(processed_at) AS latest_record
  FROM staging.payments_daily
  WHERE load_date = CURRENT_DATE
)
SELECT *,
  CASE WHEN null_amounts > 0 THEN 'FAIL' ELSE 'PASS' END AS amount_check,
  CASE WHEN null_emails::float / total_rows > 0.01 THEN 'FAIL' ELSE 'PASS' END AS email_check,
  CASE WHEN duplicate_txns > 0 THEN 'FAIL' ELSE 'PASS' END AS uniqueness_check
FROM checks;
```

### 5. Set up ongoing monitoring rules

```
Summarize a data contract for this payments feed that we can share with the provider and use for automated checks.
```

The agent produces a data contract document specifying expected schema, null thresholds, freshness requirements, and volume bounds.

## Real-World Example

Kenji, a data engineer at a mid-size e-commerce analytics company, loads data from 12 merchant APIs nightly. One merchant changed their API response format — order amounts switched from cents (integer) to dollars (float), silently inflating revenue by 100x.

1. Kenji asks the agent: "Profile today's merchant feeds and compare value distributions to last week"
2. The agent flags merchant #7: average amount jumped from 4,500 to 450,000 — a 100x increase
3. Kenji asks: "Validate the data types match our schema contract"
4. The agent confirms: `amount` field changed from integer to float with decimal values
5. Kenji adds a type-check rule to the pipeline that blocks loads when types drift
6. Total time from detection to fix: 15 minutes instead of 3 days of wrong dashboards

## Related Skills

- [excel-processor](../skills/excel-processor/) — Validate and clean spreadsheet data before pipeline ingestion
- [data-visualizer](../skills/data-visualizer/) — Visualize data quality metrics over time
- [report-generator](../skills/report-generator/) — Generate automated data quality reports for stakeholders
