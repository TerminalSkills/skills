---
name: malloy
description: Expert guidance for Malloy, the experimental data language from Google that replaces SQL for analytics with a composable, reusable, and more readable syntax. Helps developers write Malloy models, build nested queries, and explore data with Malloy's VS Code extension and notebook interface.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - sql
  - analytics
  - semantic-model
  - data-exploration
  - query-language
---

# Malloy — Semantic Data Language


## Overview

You are an expert in Malloy, the experimental data language from Google that replaces SQL for analytics with a composable, reusable, and more readable syntax. You help developers write Malloy models, build nested queries, and explore data with Malloy's VS Code extension and notebook interface.

## Instructions

### Source Definition

Define reusable data models:

```malloy
// models/ecommerce.malloy — Ecommerce data model

source: orders is duckdb.table('orders.parquet') extend {
  // Dimensions (attributes to group by)
  dimension:
    order_date is created_at::date
    order_month is created_at.month
    order_year is created_at.year
    is_high_value is amount > 100
    order_size is pick
      'small' when items_count < 3
      'medium' when items_count < 10
      'large'

  // Measures (aggregations)
  measure:
    order_count is count()
    total_revenue is sum(amount)
    avg_order_value is avg(amount)
    unique_customers is count(distinct customer_id)
    revenue_per_customer is total_revenue / unique_customers

  // Reusable named queries (views)
  view: revenue_by_month is {
    group_by: order_month
    aggregate:
      total_revenue
      order_count
      avg_order_value
    order_by: order_month
  }

  view: top_customers is {
    group_by: customer_id
    aggregate:
      total_revenue
      order_count
    order_by: total_revenue desc
    limit: 20
  }

  view: daily_dashboard is {
    group_by: order_date
    aggregate:
      total_revenue
      order_count
      unique_customers
      avg_order_value
    order_by: order_date desc
    limit: 30
  }
}
```

### Queries

Write composable, readable analytics queries:

```malloy
// queries/analysis.malloy — Analytics queries using the model

import "models/ecommerce.malloy"

// Simple aggregation
run: orders -> {
  aggregate:
    total_revenue
    order_count
    avg_order_value
}

// Group by with filters
run: orders -> {
  where: order_year = 2026
  group_by: order_month
  aggregate:
    total_revenue
    order_count
  order_by: order_month
}

// Nested queries — multiple levels of aggregation in one query
run: orders -> {
  group_by: order_size
  aggregate:
    total_revenue
    order_count
    avg_order_value
  // Nested: for each order_size, show monthly breakdown
  nest: monthly_trend is {
    group_by: order_month
    aggregate: total_revenue
    order_by: order_month
  }
  // Nested: for each order_size, show top customers
  nest: top_customers is {
    group_by: customer_id
    aggregate: total_revenue, order_count
    order_by: total_revenue desc
    limit: 5
  }
}

// Pipeline: chain transformations
run: orders
  -> { where: status = 'completed' }
  -> revenue_by_month                   // Reuse named view
  -> { where: total_revenue > 10000 }   // Filter the result
```

### Joins and Relationships

```malloy
// models/full_model.malloy — Multi-table model with joins

source: customers is duckdb.table('customers.parquet') extend {
  dimension: signup_month is created_at.month
  measure:
    customer_count is count()
    avg_lifetime_value is avg(lifetime_value)
}

source: products is duckdb.table('products.parquet') extend {
  dimension: price_tier is pick
    'budget' when price < 25
    'mid-range' when price < 100
    'premium'
  measure: product_count is count()
}

source: order_items is duckdb.table('order_items.parquet') extend {
  // Join to related tables
  join_one: orders on order_id = orders.id
  join_one: products on product_id = products.id
  join_one: customers is orders.customer_id = customers.id

  measure:
    total_quantity is sum(quantity)
    item_revenue is sum(quantity * unit_price)

  // Query across joined tables
  view: revenue_by_category is {
    group_by: products.category
    aggregate:
      item_revenue
      total_quantity
    order_by: item_revenue desc
  }

  view: customer_product_matrix is {
    group_by: customers.signup_month
    aggregate: item_revenue
    nest: by_category is {
      group_by: products.category
      aggregate: item_revenue
    }
  }
}
```

### Notebooks and Visualization

```malloy
// In Malloy notebook (.malloynb) or VS Code extension

// Malloy auto-renders results as charts when appropriate

// Bar chart — group by with single measure
run: orders -> {
  group_by: status
  aggregate: order_count
}
// # bar_chart

// Line chart — time series
run: orders -> revenue_by_month
// # line_chart

// Dashboard — multiple visualizations from one query
run: orders -> {
  group_by: order_size
  aggregate: total_revenue, order_count
  nest: trend is {
    group_by: order_month
    aggregate: total_revenue
  }
}
// # dashboard
```

### DuckDB and BigQuery Connections

```malloy
// Connection configuration
// DuckDB (local files)
connection: duckdb is duckdb [
  parquet_path: "./data/"
]

// BigQuery
connection: bq is bigquery [
  project_id: "my-gcp-project"
  dataset: "analytics"
]

// Use BigQuery tables in models
source: events is bq.table('analytics.events') extend {
  measure: event_count is count()
}
```

## Installation

```bash
# VS Code Extension (recommended)
# Install "Malloy" from VS Code Marketplace

# CLI
npm install -g @malloydata/malloy-cli

# Python package
pip install malloy

# Run a Malloy file
malloy run analysis.malloy
```


## Examples

### Example 1

**User request:** "Help me set up Malloy"

The agent follows the instructions above to configure Malloy with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Malloy configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Models separate from queries** — Define sources and views in model files; write queries in separate files or notebooks
2. **Name your views** — Reusable views (named queries) are Malloy's superpower; define common analyses once, use everywhere
3. **Nested queries for rich analysis** — Instead of multiple separate queries, nest related analyses into a single query
4. **Use pick for categorization** — The `pick` expression replaces SQL's verbose CASE WHEN for creating dimensions
5. **Pipeline for progressive filtering** — Chain queries with `->` to progressively refine results; each step is readable
6. **DuckDB for local analysis** — Use DuckDB connection with Parquet files for fast local analytics; switch to BigQuery for production
7. **Malloy notebooks for exploration** — Use `.malloynb` files for iterative data exploration with inline visualization
8. **Version your models** — Malloy models are code; store in Git alongside your data pipelines
