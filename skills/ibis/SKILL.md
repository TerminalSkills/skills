---
name: ibis
description: Expert guidance for Ibis, the Python dataframe library that provides a pandas-like API but generates SQL for execution on any backend — DuckDB, PostgreSQL, BigQuery, Snowflake, Spark, and more. Helps developers write analytics code once and run it anywhere without rewriting SQL for each database.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - python
  - sql
  - dataframe
  - analytics
  - portable
---

# Ibis — Portable Python Analytics


## Overview


Ibis, the Python dataframe library that provides a pandas-like API but generates SQL for execution on any backend — DuckDB, PostgreSQL, BigQuery, Snowflake, Spark, and more. Helps developers write analytics code once and run it anywhere without rewriting SQL for each database.


## Instructions

### Basic Usage

```python
# src/analytics.py — Portable analytics with Ibis
import ibis
from ibis import _                         # Shorthand for column references

# Connect to a backend (DuckDB for local development)
con = ibis.duckdb.connect("analytics.duckdb")

# Or connect to production databases — same code, different backend
# con = ibis.postgres.connect(url="postgresql://...")
# con = ibis.bigquery.connect(project_id="my-project")
# con = ibis.snowflake.connect(...)

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
        segment=ibis.case()
            .when(_.total_spent >= 1000, "whale")
            .when(_.total_spent >= 100, "regular")
            .else_("casual")
            .end(),
    )
)

# Joins
customer_analytics = (
    ranked
    .join(customers, _.customer_id == customers.id)
    .select(
        _.customer_id,
        customers.name,
        customers.email,
        customers.plan,
        _.total_spent,
        _.order_count,
        _.segment,
        _.revenue_rank,
        # Days since last order
        days_inactive=(ibis.now() - _.last_order).cast("int32") // 86400,
    )
)

# Cohort analysis
cohorts = (
    orders
    .filter(_.status == "completed")
    .group_by(_.customer_id)
    .mutate(
        cohort_month=_.created_at.min().truncate("M"),
    )
    .mutate(
        months_since=((_.created_at.truncate("M") - _.cohort_month)
                      .cast("int32") // (30 * 86400)),
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

def build_revenue_report(con: ibis.BaseBackend):
    """Build a revenue report — works on any Ibis backend.

    Args:
        con: Any Ibis connection (DuckDB, Postgres, BigQuery, etc.)
    """
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
test_con.create_table("orders", test_data_df)
report = build_revenue_report(test_con).execute()
```

### UDFs and Custom Functions

```python
# Custom scalar and aggregate functions
import ibis
from ibis import udf

@udf.scalar.python
def normalize_email(email: str) -> str:
    """Normalize email addresses for deduplication."""
    local, domain = email.lower().split("@")
    # Remove dots and plus aliases from Gmail
    if domain in ("gmail.com", "googlemail.com"):
        local = local.split("+")[0].replace(".", "")
    return f"{local}@{domain}"

# Use in queries
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
# Core library
pip install ibis-framework

# With specific backends
pip install "ibis-framework[duckdb]"
pip install "ibis-framework[postgres]"
pip install "ibis-framework[bigquery]"
pip install "ibis-framework[snowflake]"
pip install "ibis-framework[pyspark]"

# Interactive mode (for notebooks)
ibis.options.interactive = True   # Auto-execute and display results
```


## Examples


### Example 1: Building a basic usage workflow

**User request:**

```
I have CSV sales data from the last 2 years. Help me set up Ibis to analyze trends and create a dashboard.
```

The agent reads the data schema, creates the Ibis configuration, writes queries/transformations for key metrics (monthly revenue, growth rate, top products), and produces a working analysis pipeline with visualizations.

### Example 2: Integrating Ibis with existing data infrastructure

**User request:**

```
We use PostgreSQL for our main database. Set up Ibis to connect and run analytics queries.
```

The agent configures the database connection, creates the necessary Ibis project files, writes example queries that demonstrate key features (complex transformations), and sets up a development workflow with hot-reloading for iterative analysis.


## Guidelines

1. **Write once, run anywhere** — Define analytics logic with Ibis; swap backends by changing the connection, not the code
2. **Lazy by default** — Ibis expressions are lazy; they only execute when you call `.execute()` or `.to_pandas()`
3. **DuckDB for development** — Use DuckDB locally with Parquet files; switch to BigQuery/Snowflake for production
4. **Use `_` for readability** — `from ibis import _` gives you clean column references: `_.amount.sum()` vs `orders.amount.sum()`
5. **Generate SQL for debugging** — Use `ibis.to_sql(expr)` to see the SQL being generated; helps debug unexpected results
6. **Functions for reuse** — Wrap analytics logic in functions that take a connection; test with DuckDB, deploy on any backend
7. **Interactive mode in notebooks** — Set `ibis.options.interactive = True` for immediate result display during exploration
8. **Type your schemas** — Use `ibis.schema()` to define expected table schemas; catch type mismatches early
