---
name: polars
description: >-
  Polars is a fast DataFrame library written in Rust with Python bindings, built on Apache Arrow with lazy evaluation and a streaming engine for larger-than-memory data. Use it when a user asks to replace pandas for speed, read CSV or Parquet files, write expressions, group_by, join and window queries, or process a file bigger than RAM.
license: Apache-2.0
compatibility: 'macos, linux, windows'
metadata:
  author: terminal-skills
  repository: https://github.com/pola-rs/polars
  version: 1.1.0
  category: data-ai
  tags:
    - polars
    - dataframe
    - rust
    - python
    - performance
---

# Polars

## Overview

Polars is a DataFrame library that leverages Rust's performance and Apache Arrow's columnar format. It's significantly faster than pandas for most operations, especially on large datasets, thanks to parallel execution and lazy evaluation.

## Instructions

### Installation

Checked against Polars 2.0.0 (the API below ran on it).

```bash
# Python
pip install polars

# With all optional dependencies (Excel, SQL, cloud storage)
pip install 'polars[all]'

# Node.js
npm install nodejs-polars   # separate project, API differs from Python
```

### Basic Operations

```python
# basics.py: Create and manipulate DataFrames
import polars as pl

# Create from dict
df = pl.DataFrame({
    "name": ["Alice", "Bob", "Charlie", "Diana"],
    "age": [30, 28, 35, 42],
    "city": ["NYC", "London", "Paris", "NYC"],
    "salary": [85000, 72000, 90000, 110000],
})

# Basic operations
print(df.head(2))
print(df.describe())
print(df.shape)  # (4, 4)
print(df.columns)  # ['name', 'age', 'city', 'salary']

# Select columns
df.select("name", "salary")
df.select(pl.col("name"), pl.col("salary") / 1000)

# Filter rows
df.filter(pl.col("age") > 30)
df.filter((pl.col("city") == "NYC") & (pl.col("salary") > 80000))

# Sort
df.sort("salary", descending=True)
```

### Expressions

```python
# expressions.py: Polars expression system — the core of Polars
import polars as pl

df = pl.DataFrame({
    "product": ["A", "B", "A", "B", "A"],
    "revenue": [100, 200, 150, 300, 120],
    "cost": [60, 120, 80, 180, 70],
    "date": ["2026-01-01", "2026-01-01", "2026-01-02", "2026-01-02", "2026-01-03"],
})

# Computed columns with expressions
result = df.with_columns(
    profit=pl.col("revenue") - pl.col("cost"),
    margin=(pl.col("revenue") - pl.col("cost")) / pl.col("revenue") * 100,
    date_parsed=pl.col("date").str.to_date(),
)

# Multiple aggregations
summary = df.group_by("product").agg(
    total_revenue=pl.col("revenue").sum(),
    avg_revenue=pl.col("revenue").mean(),
    max_cost=pl.col("cost").max(),
    count=pl.len(),
)

# Window functions
df.with_columns(
    revenue_rank=pl.col("revenue").rank(descending=True).over("product"),
    cumulative=pl.col("revenue").cum_sum().over("product"),
    pct_of_total=pl.col("revenue") / pl.col("revenue").sum().over("product") * 100,
)
```

### Lazy Evaluation

```python
# lazy.py: Use lazy frames for optimized query plans
import polars as pl

# Lazy evaluation — build a query plan, execute once
result = (
    pl.scan_csv("sales_data.csv")  # Lazy read
    .filter(pl.col("status") == "completed")
    .with_columns(
        revenue=pl.col("quantity") * pl.col("unit_price"),
        order_date=pl.col("date").str.to_date(),
    )
    .filter(pl.col("order_date").dt.year() == 2026)
    .group_by("category")
    .agg(
        total_revenue=pl.col("revenue").sum(),
        order_count=pl.len(),
        avg_order=pl.col("revenue").mean(),
    )
    .sort("total_revenue", descending=True)
    .collect()  # Execute the optimized plan
)

# View the query plan before executing
lazy_df = pl.scan_csv("sales_data.csv").filter(pl.col("amount") > 100)
print(lazy_df.explain())  # Shows optimized plan with predicate pushdown
```

### Joins

```python
# joins.py: Join DataFrames efficiently
import polars as pl

orders = pl.DataFrame({
    "order_id": [1, 2, 3],
    "user_id": [10, 20, 10],
    "amount": [99.99, 249.50, 15.00],
})

users = pl.DataFrame({
    "user_id": [10, 20, 30],
    "name": ["Alice", "Bob", "Charlie"],
})

# Inner join
joined = orders.join(users, on="user_id", how="inner")

# Left join
all_orders = orders.join(users, on="user_id", how="left")

# Join keys with different names: left_on / right_on
orders.join(users, left_on="user_id", right_on="user_id", how="inner")

# Keep unmatched rows from both sides, one key column
orders.join(users, on="user_id", how="full", coalesce=True)

# Rows of orders with no matching user; validate fails fast on duplicate keys
orders.join(users, on="user_id", how="anti")
orders.join(users, on="user_id", how="left", validate="m:1")
```

### I/O Operations

```python
# io.py: Read and write various formats
import polars as pl

# CSV
df = pl.read_csv("data.csv")
df.write_csv("output.csv")

# Parquet (recommended for large datasets)
df = pl.read_parquet("data.parquet")
df.write_parquet("output.parquet", compression="zstd")

# JSON
df = pl.read_json("data.json")
df.write_json("output.json")

# Parse date columns while reading
df = pl.read_csv("data.csv", try_parse_dates=True)

# From pandas
import pandas as pd
pandas_df = pd.read_sql("SELECT * FROM users", engine)
polars_df = pl.from_pandas(pandas_df)

# SQL databases: pass a DB-API / SQLAlchemy connection (ran with sqlite3)
df = pl.read_database("SELECT * FROM orders WHERE amount > 100", connection)

# Scan (lazy) for large files — only reads what's needed
lazy = pl.scan_parquet("huge_dataset.parquet")
result = lazy.filter(pl.col("status") == "active").head(1000).collect()
```

### Larger-than-memory data

`collect(engine="streaming")` runs the query in batches, and `sink_parquet` writes the result without materializing it.

```python
# streaming.py: process a Parquet file bigger than RAM
import polars as pl

lazy = pl.scan_parquet("events_2026.parquet").filter(pl.col("status") == "active")

# Aggregate in streaming mode
totals = lazy.group_by("country").agg(total=pl.col("amount").sum()).collect(engine="streaming")

# Filter and write straight to disk
lazy.sink_parquet("active_events.parquet")
```

### Comparison with Pandas

```python
# comparison.py: Common pandas patterns translated to Polars
import polars as pl

# pandas: df['new_col'] = df['a'] + df['b']
# Polars:
df = df.with_columns(new_col=pl.col("a") + pl.col("b"))

# pandas: df.groupby('cat').agg({'val': ['sum', 'mean']})
# Polars:
df.group_by("cat").agg(
    val_sum=pl.col("val").sum(),
    val_mean=pl.col("val").mean(),
)

# pandas: df.apply(lambda row: ..., axis=1)  # SLOW
# Polars: Use expressions instead (vectorized, parallel)
df.with_columns(
    label=pl.when(pl.col("score") > 90).then(pl.lit("A"))
         .when(pl.col("score") > 80).then(pl.lit("B"))
         .otherwise(pl.lit("C"))
)
```

## Examples

### Example 1: Monthly revenue from a CSV

**User request:** "Sum completed orders by month from sales_data.csv, newest first."

```python
import polars as pl

monthly = (
    pl.scan_csv("sales_data.csv", try_parse_dates=True)
    .filter(pl.col("status") == "completed")
    .group_by_dynamic("date", every="1mo")
    .agg(revenue=(pl.col("quantity") * pl.col("unit_price")).sum())
    .sort("date", descending=True)
    .collect()
)
print(monthly)
```

Result: a DataFrame with one row per month and a `revenue` column (`date` must be sorted ascending in the source for `group_by_dynamic`; add `.sort("date")` before it if not).

### Example 2: Speed up a slow pandas script

**User request:** "This pandas script uses `apply` per row and takes minutes. Port it to Polars."

Replace the row-wise `apply` with `with_columns` and `pl.when().then().otherwise()` expressions, read with `scan_parquet` instead of `read_csv`, and `collect()` once at the end. Compare `print(lazy.explain())` before running to confirm filters are pushed into the scan.

## Guidelines

- Prefer lazy (`scan_*`) over eager (`read_*`) for files; one `collect()` lets the optimizer prune columns and push filters down.
- Avoid `map_elements` and Python lambdas; they run row by row without parallelism. Express the logic with `pl.col`, `pl.when` and `.over()`.
- Polars has no index; use `join`, `over` and `group_by` instead of `loc`/`reset_index` habits.
- Use `engine="streaming"` when data exceeds memory; not every operation streams, so check `explain()` if memory still spikes.
- Convert with `df.to_pandas()` (needs pandas and pyarrow) only at the boundary of libraries that require it.
- Pin the Polars version in production; the Python package and `nodejs-polars` are separate projects with different APIs.
