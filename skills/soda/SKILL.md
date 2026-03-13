---
name: soda
category: Data Engineering
tags: [data-quality, testing, monitoring, data-observability, validation, open-source]
version: 1.0.0
author: terminal-skills
---

# Soda — Data Quality Testing and Monitoring

You are an expert in Soda, the data quality platform for testing, monitoring, and profiling data. You help developers write data quality checks in YAML that validate freshness, completeness, uniqueness, validity, and business rules — catching data issues before they reach dashboards and ML models.

## Core Capabilities

### Check Definitions

```yaml
# checks/orders_checks.yaml — Data quality checks

checks for orders:
  # Freshness — data should be recent
  - freshness(created_at) < 2h:
      name: "Order data is fresh"

  # Row count — catch pipeline breaks
  - row_count > 0:
      name: "Orders table is not empty"
  - row_count between 100 and 10000:
      name: "Daily order volume is normal"

  # Completeness — no missing critical fields
  - missing_count(customer_id) = 0:
      name: "Every order has a customer"
  - missing_count(total_amount) = 0
  - missing_percent(shipping_address) < 5%:
      name: "Less than 5% missing addresses"

  # Uniqueness — no duplicates
  - duplicate_count(order_id) = 0:
      name: "No duplicate order IDs"

  # Validity — correct values
  - invalid_count(status) = 0:
      valid values: [pending, processing, shipped, delivered, cancelled, refunded]
  - invalid_count(total_amount) = 0:
      valid min: 0
      name: "No negative order amounts"

  # Business rules — custom SQL
  - failed_rows:
      fail query: |
        SELECT * FROM orders
        WHERE status = 'delivered' AND delivered_at IS NULL
      name: "Delivered orders must have delivery date"

  # Anomaly detection — ML-based
  - anomaly detection for row_count:
      name: "No unusual spikes or drops in order volume"
      severity: warn

  # Schema — structural checks
  - schema:
      fail:
        when required column missing: [order_id, customer_id, total_amount, status, created_at]
      warn:
        when forbidden column present: [__deleted, _temp_*]
```

### Configuration and Running

```yaml
# configuration.yml — Soda connection config
data_source my_warehouse:
  type: bigquery
  project_id: my-project
  dataset: analytics
  credentials: ${GCP_CREDENTIALS}

# Alternative: PostgreSQL
data_source my_postgres:
  type: postgres
  host: localhost
  port: 5432
  database: analytics
  username: ${DB_USER}
  password: ${DB_PASS}
```

```bash
# Run checks
soda scan -d my_warehouse -c configuration.yml checks/orders_checks.yaml

# Run all checks in a directory
soda scan -d my_warehouse -c configuration.yml checks/

# Output:
# Soda Library 1.x
# Scan summary:
# 12/12 checks PASSED
# 0 checks WARNED
# 0 checks FAILED
# All is good. No failures. No warnings. No errors.
```

### CI/CD Integration

```yaml
# .github/workflows/data-quality.yml
name: Data Quality Checks
on:
  schedule:
    - cron: "0 */4 * * *"                # Every 4 hours
  workflow_dispatch:                       # Manual trigger

jobs:
  soda-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install soda-core-bigquery
      - run: soda scan -d warehouse -c soda/configuration.yml soda/checks/
        env:
          GCP_CREDENTIALS: ${{ secrets.GCP_CREDENTIALS }}
      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text": "⚠️ Data quality check failed! Check GitHub Actions."}'
```

### Programmatic Usage

```python
from soda.scan import Scan

scan = Scan()
scan.set_data_source_name("my_warehouse")
scan.add_configuration_yaml_file("configuration.yml")
scan.add_sodacl_yaml_str("""
checks for customers:
  - row_count > 0
  - missing_count(email) = 0
  - duplicate_count(email) = 0
""")

scan.execute()
print(scan.get_scan_results())

if scan.has_check_fails():
    # Trigger alert, block pipeline, etc.
    raise Exception(f"Data quality checks failed: {scan.get_checks_fail_text()}")
```

## Installation

```bash
pip install soda-core-bigquery            # BigQuery
pip install soda-core-postgres            # PostgreSQL
pip install soda-core-snowflake           # Snowflake
pip install soda-core-duckdb             # DuckDB
```

## Best Practices

1. **Check after every sync** — Run Soda checks after Airbyte/dbt runs; catch issues before they reach dashboards
2. **Freshness checks first** — Start with `freshness()` checks; stale data is the most common silent failure
3. **Anomaly detection** — Use ML-based anomaly detection for volume and metric checks; catches issues you can't anticipate
4. **Failed rows for debugging** — Use `failed_rows` with `fail query` for business logic checks; shows exactly which rows are bad
5. **Severity levels** — Use `severity: warn` for non-critical checks; `fail` (default) blocks pipelines
6. **Schema checks** — Validate required columns exist; catches upstream schema changes before they break transforms
7. **CI/CD integration** — Run checks on schedule and in PR pipelines for dbt model changes
8. **Soda Cloud** — Use Soda Cloud for historical trends, dashboards, and incident management; CLI is free for basic checks
