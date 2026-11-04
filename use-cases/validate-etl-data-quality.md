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

Kenji's Monday morning starts with a Slack message from the VP of Sales: "Revenue dashboard is showing an 80% drop overnight. What happened?" Kenji leads the data team at a mid-size e-commerce analytics company. Three hours and four panicked stakeholders later, someone finds the root cause -- a broken ETL job silently loaded null values into the `amount_cents` column of the payments table.

The data was never validated. It flowed straight from the payments provider's CSV export into the staging table, through a dbt transformation, and into the dashboard. No checks at any stage. By the time the VP noticed, the board had already seen the numbers. Trust in the data team -- the kind that takes months to build -- evaporated in a single morning.

The worst part: this isn't the first time. Last quarter, a currency conversion bug doubled European revenue for two weeks before anyone caught it. The quarter before that, a timezone mismatch caused duplicate records that inflated customer counts by 12%. Every incident follows the same pattern: bad data flows in, nobody checks it, dashboards break, people scramble.

## The Solution

Using the **data-validator**, **sql-optimizer**, and **data-analysis** skills, Kenji builds validation gates at every stage of the pipeline. Profile incoming data before it touches the warehouse. Define explicit rules that block bad loads. Write efficient SQL checks that run after every ingestion. The goal: catch problems at the source, not at the dashboard.

## Step-by-Step Walkthrough

### Step 1: Profile the Incoming Data

Kenji starts with the daily payments CSV -- the feed that caused Monday's outage. He asks the agent to examine it before it gets anywhere near the warehouse:

```text
Profile this CSV export from our payments provider. We receive this daily and load it into our warehouse. Show me the data shape and any red flags.
```

The profile comes back with a clear picture of what's in the file:

**Dataset:** `payments_20260217.csv` -- 34,219 rows, 11 columns

| Column | Type | Nulls | Unique Values | Status |
|---|---|---|---|---|
| `transaction_id` | string | 0% | 34,219 | Clean -- all unique |
| `amount_cents` | int | 0.4% | 5,891 | **137 nulls** |
| `currency` | string | 0% | 3 | Clean -- USD, EUR, GBP |
| `customer_email` | string | 2.3% | 18,442 | **789 missing** |
| `processed_at` | date | 0% | 31,004 | Clean -- all today |

Two columns already look problematic. Those 137 null amounts are exactly the kind of thing that breaks a revenue dashboard -- aggregate functions skip nulls, so `SUM(amount_cents)` silently under-reports. And 2.3% missing emails is above the 1% threshold the marketing team depends on for attribution.

### Step 2: Define and Run Validation Rules

Kenji defines explicit pass/fail rules for the feed:

```text
Validate this data with these rules: transaction_id must be unique, amount_cents cannot be null, customer_email null rate must be under 1%, and all dates must be today.
```

The validation report is immediate and unambiguous:

**Failed (2):**
1. **`amount_cents` nulls** -- 137 null values (0.4%). Blocks accurate revenue calculation. This is what caused Monday's dashboard incident.
2. **`customer_email` null rate** -- 2.3% null (threshold: 1%). 789 records missing email, breaking marketing attribution downstream.

**Passed (2):**
- `transaction_id` uniqueness -- all 34,219 values unique
- `processed_at` date range -- all records dated 2026-02-17

**Pipeline verdict: BLOCK.** Fix nulls in `amount_cents` before loading.

A prompt is good for exploring. For a rule that must run on every file, the agent turns the same rules into code that exits non-zero when the load must stop. The pandas version below was run against a synthetic 30,000-row file and blocked it on the null amounts and the email null rate:

```python
import sys
import pandas as pd

df = pd.read_csv(sys.argv[1], parse_dates=["processed_at"])
today = pd.Timestamp.now(tz="UTC").normalize()
failures = []

if df["transaction_id"].duplicated().any():
    failures.append(f"{df['transaction_id'].duplicated().sum()} duplicate transaction_id")
if df["amount_cents"].isna().any():
    failures.append(f"{df['amount_cents'].isna().sum()} null amount_cents")
if df["customer_email"].isna().mean() >= 0.01:
    failures.append(f"customer_email null rate {df['customer_email'].isna().mean():.1%} (limit 1%)")
if not 25_000 <= len(df) <= 50_000:
    failures.append(f"row count {len(df)} outside 25,000-50,000")
if not df["currency"].isin(["USD", "EUR", "GBP"]).all():
    failures.append("unexpected currency code")
if (df["processed_at"].dt.tz_convert("UTC").dt.normalize() != today).any():
    failures.append("records not dated today (UTC)")

if failures:
    print("BLOCK:\n- " + "\n- ".join(failures))
    sys.exit(1)
print("PASS")
```

Run it as the first task of the load (`python gate.py payments_20260217.csv`); the orchestrator stops the DAG on a non-zero exit. Timestamps in the file must carry a UTC offset (`Z`), or `tz_convert` raises. Once the rules grow, move them into a schema library such as pandera or Great Expectations.

This is the key shift -- instead of loading everything and hoping for the best, the pipeline now has a gate. Bad data doesn't get through.

### Step 3: Investigate the Root Cause

Blocking the load is only half the job. Kenji needs to understand why 137 records have null amounts:

```text
Show me the 137 rows with null amount_cents. Is there a pattern?
```

Every single one shares two traits: `payment_method: bank_transfer` and `status: pending`. These are authorized but not yet settled transactions. The payments provider shouldn't be including them in the daily export at all -- they're pre-settlement records that don't have a final amount yet.

This is valuable information. It's not a data corruption issue; it's a provider-side filtering problem. Kenji can now go back to the provider with a specific ask: exclude records where `status = pending` from the daily export. In the meantime, the validation rule catches them automatically.

### Step 4: Build a Warehouse Validation Query

Kenji needs these checks to run automatically after every load, not just when someone remembers to profile a file:

```text
Write a SQL validation query I can run after each load to catch these issues automatically.
```

The query runs all checks in a single pass using conditional aggregation. `COUNT(*) FILTER (WHERE ...)` works in PostgreSQL and SQLite 3.30+; on MySQL or BigQuery use `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`:

```sql
-- Post-load validation: runs after each daily payments ingestion
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
  CASE WHEN total_rows NOT BETWEEN 25000 AND 50000
    THEN 'FAIL' ELSE 'PASS' END AS volume_check,
  CASE WHEN null_amounts > 0
    THEN 'FAIL' ELSE 'PASS' END AS amount_check,
  CASE WHEN null_emails * 1.0 / NULLIF(total_rows, 0) > 0.01
    THEN 'FAIL' ELSE 'PASS' END AS email_check,
  CASE WHEN duplicate_txns > 0
    THEN 'FAIL' ELSE 'PASS' END AS uniqueness_check
FROM checks;
```

`NULLIF` turns an empty load into a failed volume check instead of a division error (verified on SQLite with 30,000 synthetic rows). Run it with `EXPLAIN (ANALYZE, BUFFERS)` as the sql-optimizer skill teaches: if staging grows large, an index or partition on `load_date` keeps the `WHERE load_date = CURRENT_DATE` scan cheap. If any check returns `FAIL`, the pipeline halts and sends an alert to Slack before bad data propagates to production tables. dbt users can express the same rules as `not_null` and `unique` tests on the source.

### Step 5: Formalize a Data Contract

The final step is turning these ad-hoc checks into a formal agreement:

```text
Summarize a data contract for this payments feed that we can share with the provider and use for automated checks.
```

The data contract specifies everything the pipeline expects:

- **Schema:** 11 columns with exact types (`transaction_id: string`, `amount_cents: integer`, etc.)
- **Null thresholds:** `amount_cents` at 0%, `customer_email` under 1%, all other fields under 0.5%
- **Freshness:** file delivered by 06:00 UTC, all records dated current day
- **Volume bounds:** 25,000-50,000 rows (flag if outside range -- too few means a partial export, too many means duplicates)
- **Type constraints:** `amount_cents` must be integer (not float), `currency` must be one of USD/EUR/GBP

Kenji shares this contract with the payments provider and wires it into the pipeline as automated checks. Any deviation triggers an alert before data moves past staging.

## Real-World Example

Three weeks after setting up validation, the system catches something Kenji would have missed entirely. One of the 12 merchant APIs his team ingests nightly changed their response format -- order amounts switched from dollars (decimal) to cents (integer), silently inflating revenue by 100x.

The profiling step flags it immediately: merchant #7's average amount jumped from 45.00 to 4,500 overnight. The type-check rule confirms it -- the `amount` field changed from decimal values to integers. Without validation, this would have shown a 100x revenue spike on every dashboard for days before anyone questioned why the numbers looked too good.

Kenji adds a type-drift rule to the pipeline and notifies the merchant about their API change. Total time from detection to fix: 15 minutes. The previous approach -- waiting for someone to notice bad dashboards -- would have taken 3 days and another round of stakeholder trust erosion.

The validation layer now catches 2-3 issues per week across the 12 feeds. Most are minor (a null spike here, a volume drop there), but each one is a potential dashboard incident that never happens. The Monday morning Slack panics have stopped.
