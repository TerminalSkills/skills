---
name: malloy
description: >-
  Malloy is an open-source semantic modeling and query language that compiles to SQL and runs on DuckDB, BigQuery, Snowflake, PostgreSQL, MySQL, Trino, Presto and Databricks. Use when the user wants to write Malloy models, sources, views, joins or nested queries, run .malloy files from the VS Code extension, the malloy-cli command line or Node.js, or replace repetitive SQL analytics with reusable measures.
license: Apache-2.0
compatibility: "VS Code extension, or Node.js 20+ for the npm packages and malloy-cli. Needs a supported SQL database or local Parquet/CSV files via DuckDB."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/malloydata/malloy
  tags:
    - sql
    - analytics
    - semantic-model
    - data-exploration
    - query-language
---

# Malloy — Semantic Data Language

## Overview

Malloy is a language for describing data relationships and transformations. A `.malloy` file defines sources (a table plus its dimensions, measures, joins and named views) and queries over them; the compiler produces SQL for the database you already use. Nested results are first-class, and every measure is defined once and reused by name. Supported engines include BigQuery, Snowflake, DuckDB, MotherDuck, PostgreSQL, MySQL, Trino, Presto and Databricks. The npm package `@malloydata/malloy` is at 0.0.x, so syntax still gets deprecations; trust compiler messages over old blog posts.

## Instructions

### Sources, dimensions, measures and views

```malloy
// models/ecommerce.malloy
source: customers is duckdb.table('customers.parquet') extend {
  primary_key: id
  dimension: signup_month is created_at.month
}

source: orders is duckdb.table('orders.parquet') extend {
  join_one: customers with customer_id        // needs primary_key on customers

  dimension:
    order_month is created_at.month           // dot notation truncates time
    is_high_value is amount > 100
    order_size is pick 'small' when items_count < 3
      pick 'medium' when items_count < 10
      else 'large'

  measure:
    order_count is count()
    total_revenue is sum(amount)
    avg_order_value is amount.avg()
    unique_customers is count(customer_id)    // count(distinct x) is deprecated
    revenue_per_customer is total_revenue / unique_customers

  view: revenue_by_month is {
    group_by: order_month
    aggregate: total_revenue, order_count, avg_order_value
    order_by: order_month
  }

  view: top_customers is {
    group_by: customers.name
    aggregate: total_revenue, order_count
    order_by: total_revenue desc
    limit: 20
  }
}
```

Comments use `//` or `--`. Joined fields are reached with dot notation (`customers.name`). Alias a join with `is`: `join_one: billing is customers with billing_customer_id`. Without a primary key, use `join_one: customers on customer_id = customers.id`.

### Queries

```malloy
import "models/ecommerce.malloy"

run: orders -> revenue_by_month                       // run a named view

run: orders -> {                                      // ad-hoc query
  where: created_at ? @2026-02
  group_by: order_size
  aggregate: total_revenue, order_count
}

run: orders -> revenue_by_month + { where: status = 'completed' }   // refine a view

run: orders -> revenue_by_month -> {                  // pipeline: second stage reads the first
  where: total_revenue > 10000
  select: *
}

run: orders -> {                                      // nesting: one query, several levels
  group_by: order_size
  aggregate: total_revenue
  nest: monthly_trend is {
    group_by: order_month
    aggregate: total_revenue
    order_by: order_month
  }
  nest: best_customers is {
    group_by: customers.name
    aggregate: total_revenue
    order_by: total_revenue desc
    limit: 5
  }
}
```

If `order_by` is omitted, results sort by the first aggregate, descending.

### Visualization tags

A tag on its own line applies to the thing on the following line (query, view or field):

```malloy
# bar_chart
run: orders -> { group_by: status aggregate: order_count }

# line_chart
run: orders -> revenue_by_month
```

Other tags: `# dashboard`, `# scatter_chart`, `# table`; field tags such as `# currency`, `# percent`, `# hidden`. Charts render in the VS Code extension and in Malloy notebooks (`.malloynb`).

### Installing and running

- VS Code: install the "Malloy" extension, then set up the connection in its settings. A browser trial exists at github.dev/malloydata/try-malloy.
- Command line: `npm install -g malloy-cli`, then `malloy-cli run queries.malloy`; it also has `compile` (print SQL) and `build`. Connections live in `~/.config/malloy/malloy-config.json`.
- Node.js: `npm install @malloydata/malloy @malloydata/malloy-connections`, then `new Runtime({ config: new MalloyConfig({ includeDefaultConnections: true }) })` and `runtime.loadQuery(text).run()`; call `runtime.shutdown()` when done.
- Serving models to apps and agents: Malloy Publisher (`npx @malloy-publisher/server --port 4000 --server_root models`) exposes REST and MCP endpoints.
- Python: the `malloy` package on PyPI (last release 2024.1096) is a thin wrapper, not the main toolchain.

## Examples

### Example 1: Replace a SQL report with a reusable view

**Request:** "Turn this SQL into Malloy: monthly revenue and order count for completed orders in 2026, from orders.parquet."

```malloy
source: orders is duckdb.table('orders.parquet') extend {
  dimension: order_month is created_at.month
  measure:
    order_count is count()
    total_revenue is sum(amount)
}

run: orders -> {
  where: status = 'completed' and created_at ? @2026
  group_by: order_month
  aggregate: total_revenue, order_count
  order_by: order_month
}
```

`malloy-cli run monthly.malloy` prints one row per month, for example `2026-01-01 | 48210.50 | 311`. `malloy-cli compile monthly.malloy` shows the generated DuckDB SQL. The same `total_revenue` can now feed any later query.

### Example 2: Run a query from a Node.js script

**Request:** "Call Malloy from my script and print the top products."

```javascript
require('@malloydata/malloy-connections');
const { MalloyConfig, Runtime } = require('@malloydata/malloy');

async function main() {
  const runtime = new Runtime({ config: new MalloyConfig({ includeDefaultConnections: true }) });
  const result = await runtime.loadQuery(`
    source: sales is duckdb.table('sales.parquet') extend {
      measure: total_revenue is revenue.sum()
    }
    run: sales -> { group_by: product aggregate: total_revenue limit: 5 }
  `).run();
  console.table(result.data.toObject());
  await runtime.shutdown();
}
main().catch(console.error);
```

Run `node top-products.js`; the table lists five products with their revenue.

## Guidelines

- Keep sources and views in model files and import them from query files and notebooks.
- Define measures once on the source; avoid repeating `sum(...)` in every query.
- `join_one ... with key` requires `primary_key` on the joined source; joined measures are aggregated safely (no fan-out double counting).
- `pick` needs an `else`, and each branch starts with `pick`.
- Relative file paths in `duckdb.table(...)` resolve against the `.malloy` file, not the shell directory.
- Never put database passwords in `.malloy` files; keep them in the connection config or environment.
- When a query fails, read the compiler error, then check the language reference at docs.malloydata.dev; do not guess from SQL habits.
- Not the right tool for write-heavy SQL (inserts, DDL) or when the team only needs one-off queries.
