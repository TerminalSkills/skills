---
name: great-expectations
description: |
  Great Expectations is a Python framework for data quality testing and validation.
  Learn to define expectations, create validation suites, build data docs,
  and integrate with data pipelines for automated quality checks.
license: Apache-2.0
compatibility:
  - macos
  - linux
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - great-expectations
    - data-quality
    - testing
    - validation
    - python
---

# Great Expectations

Great Expectations (GX) lets you define, run, and document data quality tests. Express expectations about your data ("this column should never be null"), validate against real data, and generate documentation automatically.

## Installation

```bash
# Install Great Expectations
pip install great_expectations

# Initialize a project
great_expectations init
# Creates great_expectations/ directory with config
```

## Project Structure

```text
great_expectations/
├── great_expectations.yml    # Main config
├── expectations/             # Expectation suites (JSON)
├── checkpoints/              # Validation checkpoints
├── plugins/                  # Custom expectations
└── uncommitted/
    └── data_docs/            # Generated documentation
```

## Connect a Data Source

```python
# setup_datasource.py: Configure a PostgreSQL data source
import great_expectations as gx

context = gx.get_context()

# Add a PostgreSQL datasource
datasource = context.sources.add_postgres(
    name="my_postgres",
    connection_string="postgresql://user:pass@localhost:5432/analytics",
)

# Add a data asset (table)
asset = datasource.add_table_asset(
    name="orders",
    table_name="orders",
)

# Or add a pandas datasource for CSV files
pandas_ds = context.sources.add_pandas("local_files")
csv_asset = pandas_ds.add_csv_asset(
    name="daily_report",
    filepath_or_buffer="data/daily_report.csv",
)
```

## Define Expectations

```python
# create_expectations.py: Build an expectation suite for the orders table
import great_expectations as gx

context = gx.get_context()

# Get a batch of data
datasource = context.get_datasource("my_postgres")
asset = datasource.get_asset("orders")
batch_request = asset.build_batch_request()

# Create an expectation suite
suite = context.add_expectation_suite("orders_quality_checks")

# Get a validator
validator = context.get_validator(
    batch_request=batch_request,
    expectation_suite_name="orders_quality_checks",
)

# Add expectations
validator.expect_column_to_exist("id")
validator.expect_column_to_exist("user_id")
validator.expect_column_to_exist("amount")
validator.expect_column_to_exist("status")

validator.expect_column_values_to_not_be_null("id")
validator.expect_column_values_to_not_be_null("user_id")
validator.expect_column_values_to_not_be_null("amount")

validator.expect_column_values_to_be_unique("id")

validator.expect_column_values_to_be_between(
    "amount", min_value=0, max_value=100000,
)

validator.expect_column_values_to_be_in_set(
    "status", ["pending", "completed", "cancelled", "refunded"],
)

validator.expect_column_pair_values_a_to_be_greater_than_b(
    "updated_at", "created_at", or_equal=True,
)

# Table-level expectations
validator.expect_table_row_count_to_be_between(min_value=1, max_value=10_000_000)

# Save the suite
validator.save_expectation_suite(discard_failed_expectations=False)
```

## Run Validations

```python
# validate.py: Run a checkpoint to validate data
import great_expectations as gx

context = gx.get_context()

# Create a checkpoint
checkpoint = context.add_or_update_checkpoint(
    name="orders_checkpoint",
    validations=[
        {
            "batch_request": {
                "datasource_name": "my_postgres",
                "data_asset_name": "orders",
            },
            "expectation_suite_name": "orders_quality_checks",
        },
    ],
    action_list=[
        {"name": "store_validation_result", "action": {"class_name": "StoreValidationResultAction"}},
        {"name": "update_data_docs", "action": {"class_name": "UpdateDataDocsAction"}},
    ],
)

# Run the checkpoint
result = checkpoint.run()

if not result.success:
    print("❌ Validation failed!")
    for validation in result.run_results.values():
        for r in validation["validation_result"]["results"]:
            if not r["success"]:
                print(f"  FAILED: {r['expectation_config']['expectation_type']}")
                print(f"    {r['result']}")
else:
    print("✅ All expectations passed!")
```

## Pipeline Integration

```python
# pipeline_check.py: Use GX in an ETL pipeline (e.g., with Airflow or Prefect)
import great_expectations as gx
import pandas as pd

def validate_dataframe(df: pd.DataFrame, suite_name: str) -> bool:
    """Validate a pandas DataFrame against an expectation suite."""
    context = gx.get_context()

    datasource = context.sources.add_or_update_pandas("runtime")
    asset = datasource.add_dataframe_asset("runtime_df")
    batch_request = asset.build_batch_request(dataframe=df)

    checkpoint = context.add_or_update_checkpoint(
        name="runtime_check",
        validations=[{
            "batch_request": batch_request,
            "expectation_suite_name": suite_name,
        }],
    )

    result = checkpoint.run()
    return result.success

# Usage in pipeline
df = pd.read_csv("data/incoming.csv")
if not validate_dataframe(df, "orders_quality_checks"):
    raise ValueError("Data quality check failed — aborting pipeline")
```

## Data Docs

```bash
# docs.sh: Generate and serve data documentation
# Build data docs
great_expectations docs build

# Serve locally
great_expectations docs serve
# Opens browser at http://localhost:8765

# Data docs include:
# - All expectation suites with descriptions
# - Validation results with pass/fail details
# - Data profiling statistics
```

## Common Expectations Reference

```text
Column-level:
  expect_column_to_exist
  expect_column_values_to_not_be_null
  expect_column_values_to_be_unique
  expect_column_values_to_be_in_set
  expect_column_values_to_be_between
  expect_column_values_to_match_regex
  expect_column_mean_to_be_between
  expect_column_max_to_be_between

Table-level:
  expect_table_row_count_to_be_between
  expect_table_row_count_to_equal
  expect_table_columns_to_match_ordered_list

Multi-column:
  expect_column_pair_values_a_to_be_greater_than_b
  expect_compound_columns_to_be_unique
```
