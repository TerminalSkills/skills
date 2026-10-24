---
name: soda
description: >-
  Soda Core is an open-source data quality engine that verifies data contracts, YAML files of checks (row count, freshness, missing, duplicate, invalid, schema, failed rows), against a warehouse table. Use when a user asks to test data quality, write Soda checks or contracts, validate a table before dashboards or ML use, run "soda contract verify" in CI, check freshness or duplicates, or migrate from SodaCL (soda scan) to Soda v4.
license: Apache-2.0
compatibility: 'Python 3.10+, soda-core 4.x with a data source package such as soda-postgres or soda-duckdb; a database to check'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/sodadata/soda-core
  tags:
    - data-quality
    - data-contracts
    - testing
    - validation
    - soda
---

# Soda

## Overview

Soda Core (v4, current release 4.28.0 on PyPI) verifies data contracts. A contract is a YAML file with a `dataset:` name, a `columns:` list and checks; `soda contract verify` runs the checks against your database and exits non-zero when one fails. Packages are named `soda-` plus the database (`soda-postgres`, `soda-bigquery`, `soda-snowflake`, `soda-duckdb`, `soda-databricks`) and pull in `soda-core`.

The older Soda Core v3 (`soda-core-postgres` 3.5.x, `soda scan`, SodaCL such as `checks for orders:` and `missing_count(x) = 0`) is legacy and receives no new releases. Do not mix its syntax with v4 contracts. To stay on it you must pin `~=3.5.0`; Soda ships a migration guide (docs.soda.io, "Migrate from v3 to v4") that converts SodaCL to contracts.

## Instructions

### Step 1: Install and describe the connection

```bash
python -m venv .venv && source .venv/bin/activate
pip install soda-postgres        # or soda-duckdb, soda-bigquery, soda-snowflake
soda data-source create -f soda/shop_ds.yml -t postgres   # writes a template
```

```yaml
# soda/shop_ds.yml - secrets come from environment variables
type: postgres
name: shop
connection:
  host: ${env.POSTGRES_HOST}
  port: 5432
  user: ${env.POSTGRES_USER}
  password: ${env.POSTGRES_PW}
  database: analytics
```

```bash
soda data-source test -ds soda/shop_ds.yml
```

Use a read-only database user. For DuckDB the connection is `database: "shop.duckdb"`.

### Step 2: Write a contract

The dataset name is the data source name, then the prefixes, then the table, separated by slashes; for Postgres the prefixes are database and schema (`shop/analytics/public/orders`), for DuckDB just the schema (`shop/main/orders`). Casing must match the database. A contract needs a `columns:` list even if it is empty (`columns: []`), and a key such as `checks:` may appear only once per mapping.

```yaml
# soda/contracts/orders.yml
dataset: shop/analytics/public/orders
columns:
  - name: order_id
    checks:
      - missing:
      - duplicate:
  - name: customer_id
    checks:
      - missing:
  - name: status
    checks:
      - invalid:
          valid_values: [pending, processing, shipped, delivered, cancelled, refunded]
  - name: total_amount
    checks:
      - invalid:
          name: No negative order amounts
          valid_min: 0
  - name: shipping_address
    checks:
      - missing:
          name: Under 50 percent of addresses missing
          threshold:
            metric: percent
            must_be_less_than: 50
            additional:            # second threshold on the same metric
              must_be_less_than: 10
              level: warn
checks:
  - schema:                         # lists every column that must exist, no extras
  - row_count:
      threshold:
        must_be_between:
          greater_than: 0
          less_than: 10000
  - freshness:
      column: created_at
      threshold:
        unit: hour
        must_be_less_than: 24
  - failed_rows:
      name: Delivered orders must have a delivery date
      expression: status = 'delivered' AND delivered_at IS NULL
```

Rules that trip people up:
- Every check has a default threshold of zero (`missing`, `duplicate`, `invalid`, `failed_rows` must be 0; `row_count` must be above 0). A `threshold` compares the check's own metric (the number or percent of bad rows), never the column values. To limit values use `valid_min`, `valid_max`, `valid_values` or `valid_format` in an `invalid` check.
- The `schema` check fails on columns in the table that the contract does not list (`allow_extra_columns: false` is the default). List all columns, or set `allow_extra_columns: true`.
- `threshold` takes `must_be`, `must_not_be`, `must_be_greater_than`, `must_be_less_than`, `must_be_between` and similar keys; `level: warn` makes a breach a warning instead of a failure.
- A dataset-wide `filter: "created_at >= CURRENT_DATE - INTERVAL '1 day'"` limits every check to recent rows; a single check can have its own `filter`. Multi-column uniqueness: `duplicate: {columns: [customer_id, order_date]}` at the dataset level. Custom SQL: `metric` with `expression:` or `query:`, and `aggregate` with `function: avg`.
- `${var.NAME}` references a variable declared under `variables:` and set with `--set NAME=value`.

### Step 3: Verify

```bash
soda contract test -c soda/contracts/orders.yml        # syntax only, no database
soda contract verify -c soda/contracts/orders.yml -ds soda/shop_ds.yml
```

The exit code is 1 when any check fails and 0 otherwise (warnings pass). Useful flags: `-v` for logs, `-cp` with a check path to run only some checks, `-cf "column=status"` to filter checks, `-p` with `-sc soda_cloud.yml` to publish results to Soda Cloud.

### Step 4: Python and CI

```python
from soda_core.contracts import verify_contract_locally

result = verify_contract_locally(
    data_source_file_path="soda/shop_ds.yml",
    contract_file_path="soda/contracts/orders.yml",
    publish=False,
)
if result.has_errors:
    raise RuntimeError(result.get_errors_str())
result.assert_ok()   # raises when a check failed; result.is_warned tells about warnings
```

```yaml
# .github/workflows/data-quality.yml
name: Data quality
on:
  schedule:
    - cron: "0 */4 * * *"
  workflow_dispatch:
jobs:
  soda:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install soda-postgres
      - run: soda contract verify -c soda/contracts/orders.yml -ds soda/shop_ds.yml
        env:
          POSTGRES_HOST: ${{ secrets.POSTGRES_HOST }}
          POSTGRES_USER: ${{ secrets.POSTGRES_USER }}
          POSTGRES_PW: ${{ secrets.POSTGRES_PW }}
```

## Examples

### Example 1: Check a freshly loaded orders table
**User prompt:** "After the nightly load, make sure orders has no duplicate IDs, no missing customers and data newer than 24 hours."

Create `soda/contracts/orders.yml` as in Step 2 (keep the `order_id` duplicate check, the `customer_id` missing check and the 24-hour freshness check), run `soda contract verify`, and read the result table. A failure looks like `| order_id | No duplicate values | ... | FAILED | duplicate_count: 1 duplicate_percent: 20.0 |` and the command returns exit code 1, which fails the pipeline step.

### Example 2: Local trial with DuckDB
**User prompt:** "Try Soda on my shop.duckdb file before I wire it to the warehouse."

```yaml
# ds_config.yml (the create command only has a postgres template, so write this by hand)
type: duckdb
name: shop
connection:
  database: "shop.duckdb"
```

```bash
pip install soda-duckdb
soda contract verify -c contracts/orders.yml -ds ds_config.yml
```

Use `dataset: shop/main/orders` (data source name, schema `main`, table). The summary at the end lists checks passed, failed, warned and not evaluated.

## Guidelines

- Anomaly detection and dashboards are Soda Cloud features, not part of a local contract run; the open-source engine runs the deterministic checks above.
- A "Not evaluated" check means its query failed (wrong dataset path or casing, missing permission). Read the error lines before the table.
- Run contracts after each load (dbt, Airbyte, your own job) so bad data is caught before dashboards read it.
- Prefer SQL `expression:` over a full `query:` in `metric` and `failed_rows`; expressions are combined into fewer queries.
- Keep credentials in environment variables referenced as `${env.NAME}`; never commit them to the data source file.
