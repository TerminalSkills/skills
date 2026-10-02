---
name: ibis
description: >-
  Ibis is a Python dataframe library whose pandas-like expressions compile to SQL
  and run on the engine that holds the data: DuckDB, PostgreSQL, BigQuery,
  Snowflake, Spark, Polars and about twenty more. Use this skill when asked to
  write analytics once and run it on several databases, push pandas-style code
  down to a warehouse instead of loading it into memory, or develop locally on
  DuckDB and deploy on BigQuery or Snowflake.
license: Apache-2.0
compatibility: "Python 3.10+; install the backend you need through ibis-framework extras"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/ibis-project/ibis
  tags: ["python", "sql", "dataframe", "analytics", "duckdb"]
---

# Ibis — Portable Python Analytics


## Overview


Ibis builds lazy table expressions (`filter`, `group_by`, `agg`, `mutate`, `join`, window functions) and compiles them to the SQL dialect of the chosen backend, so only the result moves to Python. Results come back as pandas (`.to_pandas()` / `.execute()`), PyArrow (`.to_pyarrow()`), or can be written with `.to_parquet()`. Examples below were run against ibis-framework 12.0 with DuckDB. Backends that need credentials (BigQuery, Snowflake, Postgres) are documented but not run here.


## Instructions

### Basic Usage

```python
# src/analytics.py — Portable analytics with Ibis
import ibis
from ibis import _                         # Shorthand for column references

# Connect to a backend (DuckDB for local development)
con = ibis.duckdb.connect("analytics.duckdb")

# Production backends use the same expressions (credentials come from the environment):
# con = ibis.connect("postgres://analytics:...@db.northwind.dev:5432/shop")
# con = ibis.bigquery.connect(project_id="northwind-prod", dataset_id="analytics")
# con = ibis.snowflake.connect(...)   # see the Snowflake backend page for parameters

# Load data
orders = con.table("orders")

# Build a query — this is lazy (no execution until you call .execute())
monthly_revenue = (
    orders
    .filter(_.status == "completed")
    .filter(_.created_at >= "2026-01-01")
    .group_by(month=_.created_at.truncate("M"))
    .agg(
        revenue=_.amount.sum(),
        order_count=_.count(),
        unique_customers=_.customer_id.nunique(),
        avg_order_value=_.amount.mean(),
    )
    .order_by(_.month)
)

# Execute and get a pandas DataFrame
df = monthly_revenue.execute()
print(df)

# Or see the generated SQL
print(ibis.to_sql(monthly_revenue))
```

### Complex Transformations

```python
# Window functions, joins, and case expressions
import ibis
from ibis import _

con = ibis.duckdb.connect("analytics.duckdb")
orders = con.table("orders")
customers = con.table("customers")

# Window functions — running totals and rankings
ranked = (
    orders
    .filter(_.status == "completed")
    .group_by(_.customer_id)
    .agg(
        total_spent=_.amount.sum(),
        order_count=_.count(),
        first_order=_.created_at.min(),
        last_order=_.created_at.max(),
    )
    .mutate(
        # Rank customers by revenue
        revenue_rank=ibis.rank().over(
            order_by=ibis.desc(_.total_spent)
        ),
        # Percentile
        revenue_percentile=ibis.percent_rank().over(
            order_by=_.total_spent
        ),
        # Customer segment based on spending
        # ibis.case() was removed; use ibis.cases(...) (or ibis.ifelse for two branches)
        segment=ibis.cases(
            (_.total_spent >= 1000, "whale"),
            (_.total_spent >= 100, "regular"),
            else_="casual",
        ),
    )
)

# Joins
customer_analytics = (
    ranked
    .join(customers, ranked.customer_id == customers.id)
    .select(
        "customer_id", "name", "email", "plan",
        "total_spent", "order_count", "segment", "revenue_rank",
        # Whole days since the last order. Casting an interval to int fails
        # (DuckDB: "Unimplemented type for cast (INTERVAL -> INTEGER)"); use delta().
        # Put the table column in the argument: a deferred `_` is not accepted there.
        days_inactive=ibis.now().delta(ranked.last_order, unit="day"),
    )
)

# Cohort analysis
cohorts = (
    orders
    .filter(_.status == "completed")
    .mutate(
        # window over each customer's rows: their first order month
        cohort_month=_.created_at.min().over(group_by=_.customer_id).truncate("M"),
    )
    .mutate(
        months_since=_.created_at.truncate("M").delta(_.cohort_month, unit="month"),
    )
    .group_by(_.cohort_month, _.months_since)
    .agg(
        active_users=_.customer_id.nunique(),
        revenue=_.amount.sum(),
    )
)
```

### Backend Portability

```python
# The same analytics code runs on any backend
import ibis
from ibis import _

def build_revenue_report(con: ibis.BaseBackend):
    """Build a revenue report; works on any Ibis backend."""
    orders = con.table("orders")

    return (
        orders
        .filter(_.status == "completed")
        .group_by(
            month=_.created_at.truncate("M"),
            category=_.category,
        )
        .agg(
            revenue=_.amount.sum(),
            orders=_.count(),
        )
        .order_by(_.month.desc())
    )

# Development: DuckDB on local Parquet files
dev_con = ibis.duckdb.connect()
dev_con.read_parquet("data/orders.parquet", table_name="orders")
report = build_revenue_report(dev_con).execute()

# Production: BigQuery
prod_con = ibis.bigquery.connect(project_id="prod-project", dataset_id="analytics")
report = build_revenue_report(prod_con).execute()

# Testing: in-memory with DuckDB
test_con = ibis.duckdb.connect()
test_con.create_table("orders", ibis.memtable(test_data_df))
report = build_revenue_report(test_con).execute()
```

### UDFs and Custom Functions

```python
# Custom scalar and aggregate functions
import ibis

@ibis.udf.scalar.python
def normalize_email(email: str) -> str:
    """Normalize email addresses for deduplication."""
    local, domain = email.lower().split("@")
    # Remove dots and plus aliases from Gmail
    if domain in ("gmail.com", "googlemail.com"):
        local = local.split("+")[0].replace(".", "")
    return f"{local}@{domain}"

# Python UDFs run row by row inside the engine (DuckDB supports them); for speed
# prefer built-in functions, or declare an existing SQL function with
# @ibis.udf.scalar.builtin and an empty body.
customers = con.table("customers")
deduped = (
    customers
    .mutate(clean_email=normalize_email(_.email))
    .group_by(_.clean_email)
    .agg(
        count=_.count(),
        first_seen=_.created_at.min(),
    )
    .filter(_.count > 1)
)
```

## Installation

```bash
pip install "ibis-framework[duckdb]"       # local development, files, in-memory tests
pip install "ibis-framework[postgres]"     # also needs libpq on the machine
pip install "ibis-framework[bigquery]"
pip install "ibis-framework[snowflake]"
pip install "ibis-framework[pyspark]"
```

Plain `pip install ibis-framework` installs no backend. The extra names are `duckdb`, `postgres`, `bigquery`, `snowflake`, `pyspark`, `polars`, `sqlite`, `mysql`, `mssql`, `clickhouse`, `trino` and others. Interactive mode for notebooks: `ibis.options.interactive = True` (expressions print a preview of their result).

Known pitfall: with ibis-framework 12.0.0 and sqlglot 30.x, `con.create_table("t", dataframe)` failed on DuckDB with `Parser Error: syntax error at end of input`, while `ibis.memtable(df)` and sqlglot 28.x worked. If you hit it, pin `"sqlglot<29"` or create the table from `ibis.memtable(df)`.

## Examples

### Example 1: Push a pandas cohort script down to the warehouse

**User request:** "This pandas script computes monthly revenue and retention from the events table by loading 50M rows. Rewrite it with Ibis so BigQuery does the work."

```python
import ibis
from ibis import _

con = ibis.bigquery.connect(project_id="northwind-prod", dataset_id="analytics")
events = con.table("events")

retention = (
    events.filter(_.event == "purchase")
    .mutate(cohort_month=_.created_at.min().over(group_by=_.user_id).truncate("M"))
    .mutate(months_since=_.created_at.truncate("M").delta(_.cohort_month, unit="month"))
    .group_by("cohort_month", "months_since")
    .agg(active_users=_.user_id.nunique())
    .order_by("cohort_month", "months_since")
)
print(ibis.to_sql(retention))     # inspect the BigQuery SQL first
df = retention.to_pandas()        # only the small result crosses the network
```

Result: a pandas frame with one row per cohort and month offset (for example cohort 2026-01-01, `months_since` 0, 1, 2), computed inside BigQuery.

### Example 2: One module for Parquet in development and Snowflake in production

**User request:** "Compute daily active users and revenue per plan from local Parquet files, but let production run on Snowflake."

```python
import os
import ibis
from ibis import _

def get_connection():
    if os.environ.get("ANALYTICS_ENV") == "prod":
        return ibis.snowflake.connect(...)         # parameters from the Snowflake backend page
    con = ibis.duckdb.connect()
    con.read_parquet("data/events.parquet", table_name="events")
    return con

def daily_active_users(events):
    return (events.mutate(day=_.created_at.truncate("D"))
            .group_by("day").agg(dau=_.user_id.nunique()).order_by("day"))

print(daily_active_users(get_connection().table("events")).to_pandas().head())
```

The expression function takes a table, so tests pass a DuckDB table and production passes a Snowflake one.

## Guidelines

1. **Write once, run anywhere** — Define analytics logic with Ibis; swap backends by changing the connection, not the code
2. **Lazy by default** — Ibis expressions are lazy; they only execute when you call `.execute()` or `.to_pandas()`
3. **DuckDB for development** — Use DuckDB locally with Parquet files; switch to BigQuery/Snowflake for production
4. **Use `_` for readability** — `from ibis import _` gives you clean column references: `_.amount.sum()` vs `orders.amount.sum()`
5. **Generate SQL for debugging** — Use `ibis.to_sql(expr)` to see the SQL being generated; helps debug unexpected results
6. **Functions for reuse** — Wrap analytics logic in functions that take a connection; test with DuckDB, deploy on any backend
7. **Interactive mode in notebooks** — Set `ibis.options.interactive = True` for immediate result display during exploration
8. **Type your schemas** — Use `ibis.schema()` to define expected table schemas; catch type mismatches early
9. **Backends differ at the edges** — Not every operation exists on every backend, and results such as ordering without `order_by`, string collation and timestamp precision can differ; run key reports on the target backend, not only on DuckDB
10. **`ibis.rank()` is zero-based** — the best row has rank 0; add 1 for human-facing ranks
11. **Deferred `_` caveat** — `_` works as the receiver (`_.amount.sum()`) but cannot be passed as an argument to a method of a concrete expression such as `ibis.now().delta(_.last_order, ...)`; use the table column there
