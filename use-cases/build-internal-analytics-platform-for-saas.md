---
title: Build an Internal Analytics Platform for a SaaS Product
slug: build-internal-analytics-platform-for-saas
description: Build a self-serve analytics platform using DuckDB via MotherDuck for the data warehouse, Ibis for portable Python analytics, Cube as the semantic layer, Evidence for SQL-driven dashboards, and Pandera for data quality validation.
skills:
- motherduck
- ibis
- cube
- evidence
- pandera
category: data-ai
tags:
- analytics
- dashboards
- data-warehouse
- semantic-layer
- data-quality
---

# Build an Internal Analytics Platform for a SaaS Product

## The Problem

Priya is the first data hire at a 30-person SaaS company doing $500K ARR. The team has been running analytics on raw PostgreSQL queries — each person writes their own SQL, gets different numbers, and nobody trusts the dashboard. She needs to build a proper analytics stack: a warehouse for historical data, validated metrics everyone agrees on, and self-serve dashboards that non-technical teammates can use.

Her budget is effectively zero. She can't justify a $50K/year Looker license or a dedicated Snowflake instance for a company this size. Everything needs to be open-source or developer-tier pricing.

## The Solution

Use the skills listed above to implement an automated workflow. Install the required skills:

```bash
npx terminal-skills install motherduck ibis cube evidence pandera
```

## Step-by-Step Walkthrough

### Step 1: Set Up the Data Warehouse

MotherDuck gives Priya a cloud DuckDB instance — fast analytical queries, shared access for the team, and no infrastructure to manage. She loads data from the production PostgreSQL into MotherDuck daily.

```python
# etl/extract_to_warehouse.py — Daily ETL from PostgreSQL to MotherDuck
import duckdb
import pandera as pa
from pandera.typing import Series, DataFrame
import pandas as pd
from datetime import datetime, timedelta

# Define data quality schemas before loading anything
class OrderSchema(pa.DataFrameModel):
    """Validation schema for order records entering the warehouse.

    Catches corrupt data, duplicate orders, and impossible values
    before they pollute analytics results.
    """
    id: Series[int] = pa.Field(unique=True, gt=0)
    user_id: Series[int] = pa.Field(gt=0)
    amount_cents: Series[int] = pa.Field(ge=0, le=100_000_00)   # Max $100K
    currency: Series[str] = pa.Field(isin=["usd", "eur", "gbp"])
    status: Series[str] = pa.Field(
        isin=["pending", "processing", "completed", "refunded", "failed"]
    )
    created_at: Series[pd.Timestamp] = pa.Field(nullable=False)
    plan: Series[str] = pa.Field(
        isin=["free", "starter", "pro", "enterprise"]
    )

    @pa.dataframe_check
    def no_future_orders(cls, df: pd.DataFrame) -> Series[bool]:
        """Orders can't have a creation date in the future."""
        return df["created_at"] <= pd.Timestamp.now(tz="UTC")

    class Config:
        strict = True
        coerce = True


class UserSchema(pa.DataFrameModel):
    """Validation schema for user records."""
    id: Series[int] = pa.Field(unique=True, gt=0)
    email: Series[str] = pa.Field(str_matches=r"^[\w.+-]+@[\w.-]+\.\w+$")
    plan: Series[str] = pa.Field(isin=["free", "starter", "pro", "enterprise"])
    created_at: Series[pd.Timestamp] = pa.Field(nullable=False)
    country: Series[str] = pa.Field(str_length={"min_value": 2, "max_value": 2})

    class Config:
        strict = True
        coerce = True


def run_daily_etl():
    """Extract data from production Postgres, validate, load to MotherDuck.

    Runs daily via cron. Validates every row before loading — corrupt data
    is logged and skipped, never silently loaded into the warehouse.
    """
    # Connect to production PostgreSQL (read replica)
    pg = duckdb.connect()
    pg.execute(f"""
        INSTALL postgres; LOAD postgres;
        ATTACH '{POSTGRES_URL}' AS prod (TYPE POSTGRES, READ_ONLY)
    """)

    # Connect to MotherDuck warehouse
    md = duckdb.connect("md:analytics")

    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    # Extract orders
    orders_df = pg.sql(f"""
        SELECT id, user_id, amount_cents, currency, status, created_at, plan
        FROM prod.public.orders
        WHERE created_at::date = '{yesterday}'
    """).df()

    # Validate before loading
    try:
        validated_orders = OrderSchema.validate(orders_df)
        md.sql(f"""
            INSERT INTO orders
            SELECT * FROM validated_orders
            WHERE id NOT IN (SELECT id FROM orders)
        """)
        print(f"✅ Loaded {len(validated_orders)} orders for {yesterday}")
    except pa.errors.SchemaError as e:
        # Log validation failures — don't load bad data
        failed_rows = e.failure_cases
        print(f"❌ {len(failed_rows)} order rows failed validation:")
        print(failed_rows.to_string())
        # Load only the valid rows
        valid_mask = ~orders_df.index.isin(failed_rows["index"])
        valid_orders = orders_df[valid_mask]
        if len(valid_orders) > 0:
            md.sql(f"""
                INSERT INTO orders
                SELECT * FROM valid_orders
                WHERE id NOT IN (SELECT id FROM orders)
            """)
            print(f"⚠️ Loaded {len(valid_orders)} valid orders, skipped {len(failed_rows)} invalid")

    # Extract users (similar validation with UserSchema)
    users_df = pg.sql(f"""
        SELECT id, email, plan, created_at, country
        FROM prod.public.users
        WHERE updated_at::date = '{yesterday}'
    """).df()

    try:
        validated_users = UserSchema.validate(users_df)
        md.sql("""
            INSERT OR REPLACE INTO users
            SELECT * FROM validated_users
        """)
        print(f"✅ Upserted {len(validated_users)} users")
    except pa.errors.SchemaError as e:
        print(f"❌ User validation failed: {e.failure_cases.to_string()}")

    print(f"ETL complete for {yesterday}")


if __name__ == "__main__":
    run_daily_etl()
```

### Step 2: Define the Semantic Layer

Cube sits between the warehouse and every analytics consumer. When anyone asks "what's our MRR?" or "how many active users do we have?", Cube ensures they all get the same number — regardless of whether they're querying from Evidence dashboards, the Streamlit app, or the API.

```javascript
// model/cubes/Revenue.js — Revenue metrics (single source of truth)
cube(`Revenue`, {
  sql_table: `analytics.orders`,

  pre_aggregations: {
    daily: {
      measures: [mrr, total_revenue, paying_customers],
      dimensions: [plan],
      time_dimension: created_at,
      granularity: `day`,
      refresh_key: { every: `1 hour` },
    },
  },

  measures: {
    total_revenue: {
      type: `sum`,
      sql: `amount_cents / 100.0`,
      format: `currency`,
      description: `Total revenue in USD (completed orders only)`,
      filters: [{ sql: `${CUBE}.status = 'completed'` }],
    },

    mrr: {
      type: `sum`,
      sql: `amount_cents / 100.0`,
      format: `currency`,
      description: `Monthly Recurring Revenue — sum of all active subscription payments`,
      filters: [
        { sql: `${CUBE}.status = 'completed'` },
        { sql: `${CUBE}.created_at >= DATE_TRUNC('month', CURRENT_DATE)` },
      ],
    },

    paying_customers: {
      type: `count_distinct`,
      sql: `user_id`,
      description: `Unique users with at least one completed order this period`,
      filters: [{ sql: `${CUBE}.status = 'completed'` }],
    },

    arpu: {
      type: `number`,
      sql: `${total_revenue} / NULLIF(${paying_customers}, 0)`,
      format: `currency`,
      description: `Average Revenue Per User`,
    },

    order_count: {
      type: `count`,
    },

    refund_rate: {
      type: `number`,
      sql: `COUNT(CASE WHEN status = 'refunded' THEN 1 END)::float / NULLIF(COUNT(*), 0)`,
      format: `percent`,
    },
  },

  dimensions: {
    plan: {
      type: `string`,
      sql: `plan`,
    },
    status: {
      type: `string`,
      sql: `status`,
    },
    currency: {
      type: `string`,
      sql: `currency`,
    },
    created_at: {
      type: `time`,
      sql: `created_at`,
    },
  },
});
```

### Step 3: Build Dashboards with Evidence

Evidence turns SQL queries into beautiful dashboards — Markdown files that product managers can read and even edit. No Tableau, no drag-and-drop, no "let me send you a screenshot of the dashboard."

```markdown
<!-- pages/index.md — Main dashboard -->
# 📊 Company Dashboard

```sql kpis
SELECT
  SUM(CASE WHEN status = 'completed' AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      THEN amount_cents / 100.0 ELSE 0 END) AS mrr,
  COUNT(DISTINCT CASE WHEN status = 'completed' AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      THEN user_id END) AS paying_customers,
  SUM(CASE WHEN status = 'completed' THEN amount_cents / 100.0 ELSE 0 END) AS total_revenue,
  COUNT(*) AS total_orders
FROM orders
```

<BigValue data={kpis} value=mrr fmt=usd title="MRR" />
<BigValue data={kpis} value=paying_customers fmt=num0 title="Paying Customers" />
<BigValue data={kpis} value=total_revenue fmt=usd title="Total Revenue" />

## Revenue Trend

```sql monthly_revenue
SELECT
  DATE_TRUNC('month', created_at) AS month,
  SUM(amount_cents / 100.0) AS revenue,
  COUNT(DISTINCT user_id) AS customers,
  COUNT(*) AS orders
FROM orders
WHERE status = 'completed'
  AND created_at >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY 1
ORDER BY 1
```

<LineChart data={monthly_revenue} x=month y=revenue yFmt=usd title="Monthly Revenue" />

## Revenue by Plan

```sql plan_breakdown
SELECT
  plan,
  SUM(amount_cents / 100.0) AS revenue,
  COUNT(DISTINCT user_id) AS customers,
  SUM(amount_cents / 100.0) / COUNT(DISTINCT user_id) AS arpu
FROM orders
WHERE status = 'completed'
  AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY 1
ORDER BY 2 DESC
```

<BarChart data={plan_breakdown} x=plan y=revenue yFmt=usd title="MRR by Plan" />

<DataTable data={plan_breakdown}>
  <Column id=plan title="Plan" />
  <Column id=revenue title="Revenue" fmt=usd />
  <Column id=customers title="Customers" fmt=num0 />
  <Column id=arpu title="ARPU" fmt=usd />
</DataTable>
```

### Step 4: Portable Analytics with Ibis

For ad-hoc analysis and data science work, Priya uses Ibis. The same Python code runs locally on DuckDB during development and on MotherDuck in production — zero SQL rewriting.

```python
# analytics/cohort_analysis.py — Cohort retention analysis with Ibis
import ibis
from ibis import _

def cohort_retention(con: ibis.BaseBackend, months_back: int = 6):
    """Calculate cohort retention — works on any Ibis backend.

    Runs on DuckDB locally, MotherDuck in production.
    Same code, different connection.
    """
    users = con.table("users")
    orders = con.table("orders")

    # First purchase date defines the cohort
    first_orders = (
        orders
        .filter(_.status == "completed")
        .group_by(_.user_id)
        .agg(cohort_month=_.created_at.min().truncate("M"))
    )

    # Join orders with cohort assignment
    cohort_orders = (
        orders
        .filter(_.status == "completed")
        .join(first_orders, "user_id")
        .mutate(
            order_month=_.created_at.truncate("M"),
            months_since=((_.created_at.truncate("M").cast("int64") -
                          _.cohort_month.cast("int64")) // (30 * 86400)),
        )
        .filter(_.cohort_month >= ibis.now() - ibis.interval(months=months_back))
    )

    # Aggregate into cohort table
    retention = (
        cohort_orders
        .group_by(_.cohort_month, _.months_since)
        .agg(
            active_users=_.user_id.nunique(),
            revenue=ibis.literal(0.01).cast("float64") * _.amount_cents.sum(),
        )
        .order_by(_.cohort_month, _.months_since)
    )

    return retention.execute()


# Development: local DuckDB
dev = ibis.duckdb.connect("local_analytics.duckdb")
result = cohort_retention(dev, months_back=3)

# Production: MotherDuck
prod = ibis.duckdb.connect("md:analytics")
result = cohort_retention(prod, months_back=12)
```


## Real-World Example

After two weeks of building, Priya's analytics platform is live. The Evidence dashboard loads in under a second — SQL queries run against MotherDuck's pre-computed tables, and Evidence serves static HTML. The CEO checks MRR every morning without asking anyone for a spreadsheet.

Data quality is measurably better. Pandera caught 23 corrupt order records in the first week — orders with negative amounts from a billing API bug that would have inflated refund metrics. The validation logs helped the engineering team trace and fix the bug.

The semantic layer resolved the "everyone gets different numbers" problem. Before Cube, the sales team counted refunded orders as revenue (their SQL didn't filter status), while the finance team excluded pending orders (theirs was too aggressive). Now everyone queries the same `Revenue.mrr` measure and gets the same $42K.

The total cost: $0/month for Evidence (static hosting), $0/month for Cube (open-source), $20/month for MotherDuck (developer tier), and the VPS they already had. Under $25/month for a complete analytics platform that would cost $2K+ with commercial tools.

## Related Skills

- [motherduck](../skills/motherduck/) -- Complementary skill for this workflow
- [ibis](../skills/ibis/) -- Complementary skill for this workflow
- [cube](../skills/cube/) -- Complementary skill for this workflow
- [evidence](../skills/evidence/) -- Complementary skill for this workflow
- [pandera](../skills/pandera/) -- Complementary skill for this workflow
