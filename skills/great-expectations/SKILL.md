---
name: great-expectations
description: >-
  Great Expectations (GX Core) is a Python framework for testing and documenting
  data quality. Use when a user wants to define expectations about a dataset
  (nulls, ranges, uniqueness, allowed values), validate a pandas DataFrame or a
  SQL table against them, wire a checkpoint into a pipeline, or generate Data
  Docs that show what passed and failed.
license: Apache-2.0
compatibility: "Python 3.10-3.14; macOS, Linux, Windows"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags:
    - great-expectations
    - data-quality
    - testing
    - validation
    - python
  repository: https://github.com/great-expectations/great_expectations
---

# Great Expectations

## Overview

Great Expectations (GX) lets you define, run, and document data quality checks. GX 1.0 (released 2025) was a ground-up rewrite: the global `DataContext`/CLI-driven project from the 0.18 series is gone, replaced by an in-code context you build with `gx.get_context()`. There is no more `great_expectations init` scaffolding step — if an older tutorial opens with that command, it is describing the pre-1.0 API and the rest of its code will not run.

Current version is GX Core 1.23 (`pip show great_expectations`). The core flow is: Data Source → Data Asset → Batch Definition → Batch, then Expectation Suite → Validation Definition → Checkpoint.

## Instructions

### Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install great_expectations
# SQL sources need their driver too, e.g.:
pip install psycopg2-binary
```

### Connect to a pandas DataFrame

```python
import great_expectations as gx
import pandas as pd

context = gx.get_context()

data_source = context.data_sources.add_pandas(name="runtime_dataframes")
data_asset = data_source.add_dataframe_asset(name="orders_dataframe")
batch_definition = data_asset.add_batch_definition_whole_dataframe("orders_batch")

df = pd.read_csv("data/orders_2026_q3.csv")
batch = batch_definition.get_batch(batch_parameters={"dataframe": df})
```

### Connect to a SQL table

```python
data_source = context.data_sources.add_postgres(
    "warehouse",
    connection_string="postgresql+psycopg2://gx_reader:${WAREHOUSE_PASSWORD}@warehouse.internal:5432/analytics",
)
orders_asset = data_source.add_table_asset(name="orders", table_name="fct_orders")
batch_definition = orders_asset.add_batch_definition_whole_table("orders_table_batch")
batch = batch_definition.get_batch()
```

Pull the password from an environment variable (`os.environ["WAREHOUSE_PASSWORD"]`) rather than hardcoding it in the connection string.

### Build an expectation suite

Expectations are classes under `gx.expectations`, not validator method calls like in 0.18:

```python
suite = context.suites.add(gx.ExpectationSuite(name="orders_quality"))

suite.add_expectation(gx.expectations.ExpectColumnValuesToNotBeNull(column="order_id"))
suite.add_expectation(gx.expectations.ExpectColumnValuesToBeUnique(column="order_id"))
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeBetween(column="total_amount", min_value=0, max_value=50_000)
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeInSet(
        column="status", value_set=["pending", "shipped", "delivered", "refunded"]
    )
)
```

### Validate a single batch directly

```python
result = batch.validate(suite)
print(result.describe())
```

### Wire a validation definition and checkpoint (for pipelines)

```python
validation_definition = context.validation_definitions.add(
    gx.ValidationDefinition(name="orders_validation", data=batch_definition, suite=suite)
)

checkpoint = context.checkpoints.add(
    gx.Checkpoint(name="orders_checkpoint", validation_definitions=[validation_definition])
)

checkpoint_result = checkpoint.run()
if not checkpoint_result.success:
    raise ValueError("orders data quality check failed")
```

## Examples

### Example 1: Validate an incoming CSV before loading it

**User request:** "Before we load `orders_2026_q3.csv` into the warehouse, check that `order_id` is unique and not null, and `total_amount` is never negative."

```python
import great_expectations as gx
import pandas as pd

context = gx.get_context()
data_source = context.data_sources.add_pandas(name="runtime_dataframes")
asset = data_source.add_dataframe_asset(name="orders_dataframe")
batch_definition = asset.add_batch_definition_whole_dataframe("orders_batch")

df = pd.read_csv("data/orders_2026_q3.csv")
batch = batch_definition.get_batch(batch_parameters={"dataframe": df})

suite = context.suites.add(gx.ExpectationSuite(name="orders_load_checks"))
suite.add_expectation(gx.expectations.ExpectColumnValuesToNotBeNull(column="order_id"))
suite.add_expectation(gx.expectations.ExpectColumnValuesToBeUnique(column="order_id"))
suite.add_expectation(gx.expectations.ExpectColumnValuesToBeBetween(column="total_amount", min_value=0))

result = batch.validate(suite)
print(result.describe())
```

**Result:** a `ValidationResult` whose `.describe()` lists each expectation, pass/fail, and the offending rows for anything that failed — catching a bad load before it reaches the warehouse.

### Example 2: Gate an Airflow task on a Postgres table

**User request:** "Fail the nightly DAG if `fct_orders.status` ever contains a value outside our known set."

```python
checkpoint_result = checkpoint.run()  # using the warehouse checkpoint built above
if not checkpoint_result.success:
    raise ValueError("fct_orders failed its quality checkpoint — check Data Docs")
```

**Result:** the Airflow task raises and the DAG stops before downstream tasks run on bad data.

## Guidelines

- GX 1.x is a different API from the widely copied 0.18 tutorials: there is no `great_expectations init`, no `context.sources.add_postgres` (it is `context.data_sources.add_postgres`), and expectations are added as `gx.expectations.ExpectX(...)` objects, not `validator.expect_x(...)` calls. Treat any code using those older forms as outdated.
- A DataFrame batch only exists at runtime — it is not persisted, so `batch_parameters={"dataframe": df}` must be supplied again each time you call `get_batch()`.
- Never put a database password directly in a connection string in code; read it from an environment variable.
- Use `severity` on an expectation (`"warning"` vs `"critical"`) to distinguish checks that should merely be logged from ones that should block a pipeline.
- Great Expectations validates structure and values; it does not fix bad data. Pair it with an alerting step (Slack, PagerDuty, an Airflow failure callback) so a failed checkpoint is actually seen.
- For large tables, prefer a sampled or windowed batch definition over `add_batch_definition_whole_table` if validation time matters — the whole-table batch definition reads every row.
