---
name: pandas
description: >-
  Assists with loading, cleaning, transforming, and analyzing tabular data using pandas.
  Use when importing CSV/Excel/SQL data, handling missing values, performing groupby
  aggregations, merging datasets, working with time series, or building analysis-ready
  datasets. Trigger words: pandas, dataframe, csv, groupby, merge, time series, data cleaning.
license: Apache-2.0
compatibility: "pandas 3.x requires Python 3.11+; pyarrow for Parquet"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "pandas, data-analysis, dataframe, python, tabular-data"
  repository: https://github.com/pandas-dev/pandas
---

# Pandas

## Overview

Pandas is a Python library for loading, cleaning, transforming, and analyzing tabular data. It provides DataFrames for structured data manipulation, supports CSV, Excel, SQL, JSON, and Parquet formats, and offers powerful groupby aggregation, merge/join operations, time series resampling, and method chaining for building analysis pipelines. This skill targets pandas 3.x (3.1.0 checked): Copy-on-Write is always on, text columns default to the `str` dtype, and the old `"M"`/`"Y"`/`"Q"` offset aliases are gone.

## Instructions

- When loading data, use `pd.read_parquet()` for large datasets (faster, smaller, type-preserving), `pd.read_csv()` with explicit `dtype` for CSVs, and `pd.read_sql()` for database queries.
- When cleaning data, handle missing values with `fillna()` or `dropna()`, deduplicate with `drop_duplicates()`, use string methods (`.str.strip()`, `.str.lower()`) for text cleaning, and convert types explicitly with `astype()` and `pd.to_datetime()`.
- When transforming data, use `assign()` for computed columns, `pipe()` for method chaining, `melt()` and `pivot_table()` for reshaping, and `pd.cut()`/`pd.qcut()` for binning.
- When aggregating, use `groupby().agg()` with named aggregation for readable column names, `transform()` to broadcast results back to original shape, and `resample()` for time-based grouping.
- When merging, use `pd.merge()` with explicit `how` and `validate` parameters to catch data quality issues at merge time, and `pd.concat()` for stacking DataFrames.
- When writing values, assign with one `.loc[mask, "col"] = value` step. Chained assignment such as `df[df.a > 1]["b"] = "q"` never updates `df` in pandas 3 (it raises a `ChainedAssignmentError` warning), and a derived object never changes its parent.
- When resampling by month, quarter or year use the end aliases `"ME"`, `"QE"`, `"YE"` (or start aliases `"MS"`, `"QS"`, `"YS"`); `resample("M")` raises `Invalid frequency` in pandas 3.

```python
mask = df["amount"] > 100
df.loc[mask, "tier"] = "large"                       # one-step write, works in pandas 3
monthly = df.resample("ME", on="order_date")["amount"].sum()
```

- When optimizing performance, use `category` dtype for low-cardinality strings, vectorized operations over `.apply()`, and Parquet for storage; for datasets over 10GB, consider Polars or DuckDB.

## Examples

### Example 1: Clean and analyze a sales dataset

**User request:** "Load a messy CSV of sales data, clean it, and generate monthly revenue summaries"

**Actions:**
1. Load with `pd.read_csv()` specifying `dtype` and `parse_dates` for key columns
2. Clean missing values, deduplicate by order ID, and standardize text fields
3. Add computed columns for revenue and profit margin using `assign()`
4. Group by month with `resample("ME", on="date").agg()` for revenue, order count, and average order value

```python
import pandas as pd

orders = pd.read_csv(
    "orders_2026.csv",
    dtype={"order_id": "int64", "region": "category"},
    parse_dates=["order_date"],
)
monthly = (
    orders.drop_duplicates("order_id")
    .assign(amount=lambda d: d["amount"].fillna(0))
    .resample("ME", on="order_date")
    .agg(revenue=("amount", "sum"), orders=("order_id", "count"))
)
```

**Output:** A DataFrame indexed by month end (`2026-01-31`, `2026-02-28`, ...) with `revenue` and `orders` columns, ready for charts or reporting.

### Example 2: Merge and enrich customer data from multiple sources

**User request:** "Join customer data from CRM, transactions, and support tickets into a single view"

**Actions:**
1. Load each dataset and standardize key columns (email, customer ID)
2. Merge CRM and transactions with `pd.merge(on="customer_id", how="left", validate="one_to_many")`
3. Aggregate support tickets per customer and merge counts
4. Export the enriched dataset to Parquet for downstream analysis

```python
customers = (
    crm.merge(orders, on="customer_id", how="left", validate="one_to_many")
    .merge(ticket_counts, on="customer_id", how="left")
)
customers.to_parquet("customers_enriched.parquet")  # needs pyarrow
```

**Output:** A unified customer DataFrame with CRM info, transaction history, and support metrics.

## Guidelines

- Use `pd.read_parquet()` for intermediate and output files since it is faster, smaller, and preserves types.
- Chain transformations with `.pipe()` for readable and testable code.
- Use named aggregation in `.agg()` for self-documenting column names.
- Set `dtype` explicitly on `read_csv()` for large files: it is faster, uses less memory and avoids mixed-type surprises (IDs with leading zeros, for example).
- Use `category` dtype for low-cardinality columns for large memory savings; in pandas 3 `groupby` skips unused categories by default (`observed=True`), so pass `observed=False` only when you want empty groups listed.
- Parquet needs `pyarrow` (`pip install pandas pyarrow`); `pd.read_parquet` and `to_parquet` fail without an engine.
- Validate merges with `validate="one_to_many"` to catch data quality issues at merge time.
- Use `query()` for complex filters instead of chained boolean indexing for better readability.
