---
name: data-validator
description: >-
  Validate data quality in CSV, JSON, and database exports by checking for
  missing values, type mismatches, duplicates, outliers, and schema violations.
  Use when building ETL pipelines, auditing data imports, checking data freshness,
  or ensuring data contracts between teams. Trigger words: data quality, validation,
  null values, duplicates, schema check, data contract, ETL, pipeline, data drift.
license: Apache-2.0
compatibility: "Works with CSV, JSON, Parquet (via Python), and SQL query results"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "data-quality, validation, etl, data-pipeline"
---

# Data Validator

## Overview

Perform comprehensive data quality checks on datasets — validate schemas, detect anomalies, find duplicates, and enforce data contracts. Essential for ETL pipelines where bad data silently corrupts downstream analytics and dashboards.

## Instructions

### 1. Profile the dataset first

Before validating, understand the data:
- Row count and column count
- Data types per column (string, integer, float, date, boolean)
- Null rates per column
- Unique value counts and cardinality
- Min/max/mean for numeric columns
- Date ranges for temporal columns

Present as a data profile summary:
```
Dataset Profile: orders_export.csv
Rows: 142,847 | Columns: 12

| Column        | Type    | Nulls  | Unique  | Sample Values          |
|---------------|---------|--------|---------|------------------------|
| order_id      | string  | 0%     | 142,847 | ORD-20260217-001       |
| customer_id   | integer | 0.3%   | 28,491  | 10042, 10043           |
| amount         | float   | 0%     | 8,234   | 29.99, 149.00          |
| created_at    | date    | 0%     | 89,112  | 2026-02-17T14:23:01Z   |
| status        | string  | 0%     | 5       | completed, pending      |
```

### 2. Run validation checks

Apply these checks systematically:

**Completeness** — Are required fields populated?
- Check null/empty rates against thresholds (e.g., email must be <1% null)
- Flag columns with unexpected null spikes

**Uniqueness** — Are IDs actually unique?
- Check primary key columns for duplicates
- Report duplicate counts and sample duplicate rows

**Type consistency** — Do values match expected types?
- Dates that don't parse, numbers stored as strings
- Mixed types in the same column

**Range validity** — Are values within expected bounds?
- Negative amounts, future dates, ages over 150
- Enum columns with unexpected values

**Referential integrity** — Do foreign keys match?
- customer_id values that don't exist in the customers table
- Orphaned records

**Freshness** — Is the data up to date?
- Most recent record timestamp vs current time
- Gaps in time series data

### 3. Report findings

Structure results as a validation report:
```
## Data Validation Report
Dataset: orders_export.csv | Checked: 2026-02-17 14:30 UTC

### ❌ Failed Checks (3)
1. **Duplicate order_id** — 23 duplicate IDs found (0.016%)
   Sample: ORD-20260215-4421 appears 3 times
2. **Null customer_email** — 2.1% null (threshold: 1%)
   Spike on 2026-02-15 (bulk import batch)
3. **Future dates in created_at** — 7 rows have dates in 2027

### ⚠️ Warnings (2)
1. **Amount outliers** — 4 orders exceed $10,000 (review manually)
2. **Status enum drift** — New value "on_hold" not in expected set

### ✅ Passed Checks (8)
- Primary key not null (order_id): PASS
- Amount non-negative: PASS
- Date range valid: PASS (excluding 7 future dates)
...
```

Quick pandas profile and checks (works on CSV, JSON lines or Parquet loaded into a DataFrame):
```python
import pandas as pd
df = pd.read_csv("orders_export.csv", parse_dates=["created_at"])
print(df.isna().mean().sort_values(ascending=False).head(10))   # null rate per column
print(df[df.duplicated("order_id", keep=False)].head())          # duplicate keys with sample rows
print(df[df["created_at"] > pd.Timestamp.now(tz="UTC")].shape[0]) # future dates (needs tz-aware column)
```
For rules that must run on every load, a schema library such as pandera or Great Expectations keeps them in code rather than in a prompt.

### 4. Suggest fixes

For each failed check, recommend a concrete action:
- SQL query to find and fix duplicates
- Transform to clean null values
- Filter to remove invalid rows
- Alert to set up for ongoing monitoring

## Examples

### Example 1: CSV Import Validation

**Input:** "Validate this customer export before importing to our new CRM"

**Output:**
```
## Validation Report: customers_export.csv
Rows: 8,234 | Columns: 9

### ❌ Failed (2)
1. **Email format invalid** — 142 rows (1.7%) have malformed emails
   Pattern: missing @ symbol, spaces in domain
   Fix: SELECT * FROM data WHERE email NOT LIKE '%_@_%.__%'

2. **Phone duplicates** — 34 phone numbers shared by multiple customers
   Likely data entry errors or shared business lines
   Fix: Review and merge duplicate customer records

### ✅ Passed (6)
- customer_id unique: PASS
- Required fields (name, email): PASS (99.8%)
- Country codes valid ISO-3166: PASS
- Created dates in range: PASS
- No PII in notes field: PASS
- UTF-8 encoding clean: PASS

Recommendation: Fix the 142 invalid emails before import.
The phone duplicates are non-blocking but should be reviewed.
```

### Example 2: Pipeline Data Contract Check

**Input:** "Check if the analytics events from our tracking pipeline match the expected schema"

**Output:**
```
## Schema Contract Validation: events_2026_02_17.json
Events: 1.2M | Schema version: v3.2

### ❌ Contract Violations (1)
1. **Missing required field: session_id**
   - 12,847 events (1.07%) missing session_id
   - All from source: mobile-ios-sdk v4.1.0
   - Started: 2026-02-16 09:00 UTC (correlates with SDK release)

### ⚠️ Warnings (1)
1. **New field detected: device_model**
   - Not in schema v3.2 — likely added in SDK update
   - 100% populated on mobile events, absent on web

### ✅ Contract Compliance: 98.93%

Action: Pin mobile-ios-sdk to v4.0.x or update schema to v3.3
with session_id as optional for mobile sources.
```

## Guidelines

- Always profile before validating — you need baselines to detect anomalies
- Distinguish between hard failures (blocks the pipeline) and warnings (review later)
- Include sample rows for every finding — abstract stats are hard to act on
- Suggest SQL or code fixes, not just descriptions of problems
- For time series data, check for gaps and seasonality, not just latest timestamp
- Track validation results over time to detect data drift
- Parse dates with an explicit format or `errors="coerce"` and count the failures; silent coercion hides bad rows
- Be specific about which rows/records are affected — "23 duplicates" beats "some duplicates"
