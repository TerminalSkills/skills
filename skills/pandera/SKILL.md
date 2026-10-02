---
name: pandera
description: >-
  Pandera is a Python library for validating DataFrames (pandas, Polars, PySpark,
  Dask and others) against declarative schemas with column types, constraints
  and custom checks. Use this skill when asked to validate a DataFrame, define a
  data contract, add data quality checks to a pipeline or pytest suite, or
  report which rows fail validation.
license: Apache-2.0
compatibility: "Python 3.9+; pandas or polars installed through pandera extras"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/unionai-oss/pandera
  tags: ["data-validation", "pandas", "polars", "python", "schema"]
---

# Pandera — Data Validation for DataFrames


## Overview


Pandera validates DataFrames against schemas you declare as classes (`DataFrameModel`) or objects (`DataFrameSchema`). Each column gets a type, constraints (`ge`, `isin`, `str_matches`, `unique`, `nullable`) and optional custom checks; whole-frame rules go in `@pa.dataframe_check`. It works with pandas (`pandera.pandas`), Polars (`pandera.polars`), PySpark, Dask, Modin and Ibis. The pandas API lives in `pandera.pandas`, and the base `pandera` package no longer installs pandas for you.


## Instructions

### Schema Definition

Define column types, constraints, and checks:

```python
# schemas/orders.py — Order data validation schema
import pandas as pd
import pandera.pandas as pa
from pandera.typing import Series, DataFrame

class OrderSchema(pa.DataFrameModel):
    """Schema for validated order records (one row per order)."""

    order_id: Series[str] = pa.Field(
        unique=True,
        str_matches=r"^ORD-\d{8}$",       # Format: ORD-00000001
        description="Unique order identifier",
    )

    customer_id: Series[str] = pa.Field(
        nullable=False,
        str_length={"min_value": 1, "max_value": 50},
    )

    amount: Series[float] = pa.Field(
        ge=0.01,                            # Minimum $0.01
        le=100_000,                         # Maximum $100,000 (sanity check)
        description="Order total in USD",
    )

    status: Series[str] = pa.Field(
        isin=["pending", "processing", "completed", "cancelled", "refunded"],
    )

    currency: Series[str] = pa.Field(
        isin=["USD", "EUR", "GBP"],
        default="USD",
    )

    created_at: Series[pd.Timestamp] = pa.Field(
        nullable=False,
        description="Order creation timestamp (UTC)",
    )

    shipped_at: Series[pd.Timestamp] = pa.Field(
        nullable=True,                      # Not all orders are shipped yet
    )

    items_count: Series[int] = pa.Field(
        ge=1,                               # At least one item per order
        le=100,                             # Max 100 items
    )

    # DataFrame-level validation (checks across columns)
    @pa.dataframe_check
    def shipped_after_created(cls, df: pd.DataFrame) -> Series[bool]:
        """Shipped date must be after creation date (when present)."""
        mask = df["shipped_at"].notna()
        result = pd.Series(True, index=df.index)
        result[mask] = df.loc[mask, "shipped_at"] > df.loc[mask, "created_at"]
        return result

    @pa.dataframe_check
    def completed_must_be_shipped(cls, df: pd.DataFrame) -> Series[bool]:
        """Completed orders must have a shipped date."""
        completed = df["status"] == "completed"
        return ~completed | df["shipped_at"].notna()

    class Config:
        strict = True                       # Reject extra columns not in schema
        coerce = True                       # Auto-coerce types (str → int, etc.)
        name = "OrderSchema"
        description = "Validated order records for the analytics pipeline"
```

### Using Schemas in Pipelines

```python
# pipelines/orders.py — Data pipeline with validation
import pandas as pd
import pandera.pandas as pa
from pandera.typing import DataFrame
from schemas.orders import OrderSchema

@pa.check_types                              # Validates return type at runtime
def load_orders(filepath: str) -> DataFrame[OrderSchema]:
    """Load order data from CSV; raises pa.errors.SchemaError if invalid."""
    df = pd.read_csv(filepath, parse_dates=["created_at", "shipped_at"])
    return df                                # Auto-validated by @check_types


def process_orders(orders: DataFrame[OrderSchema]) -> pd.DataFrame:
    """Process validated orders into daily revenue summary."""
    return (
        orders
        .query("status == 'completed'")
        .groupby(orders["created_at"].dt.date)
        .agg(
            revenue=("amount", "sum"),
            order_count=("order_id", "count"),
            avg_items=("items_count", "mean"),
        )
        .reset_index()
    )


# Usage
try:
    orders = load_orders("data/orders_2026_03.csv")
    summary = process_orders(orders)
    print(f"Processed {len(orders)} orders → {len(summary)} daily summaries")
except pa.errors.SchemaError as err:
    print(f"Validation failed:\n{err.failure_cases}")
    # failure_cases is a DataFrame showing exactly which rows/columns failed
```

### Custom Checks

```python
# schemas/custom_checks.py — Reusable validation checks
import pandas as pd
import pandera.pandas as pa
import pandera.extensions as extensions
from pandera.typing import Series

@extensions.register_check_method(statistics=["threshold"])
def no_outliers_iqr(series: pd.Series, *, threshold: float = 1.5) -> pd.Series:
    """Flag values outside the IQR fence (1.5 = standard, 3.0 = extreme only)."""
    q1 = series.quantile(0.25)
    q3 = series.quantile(0.75)
    iqr = q3 - q1
    lower = q1 - threshold * iqr
    upper = q3 + threshold * iqr
    return (series >= lower) & (series <= upper)


# Usage in schema
class MetricsSchema(pa.DataFrameModel):
    revenue: Series[float] = pa.Field(no_outliers_iqr={"threshold": 3.0})
    latency_ms: Series[float] = pa.Field(no_outliers_iqr={"threshold": 1.5})
```

### Polars Support

```python
# schemas/polars_schema.py — Validate Polars DataFrames
import pandera.polars as pa
import polars as pl

class UserSchema(pa.DataFrameModel):
    user_id: int = pa.Field(unique=True, gt=0)
    email: str = pa.Field(str_matches=r"^[\w.-]+@[\w.-]+\.\w+$")
    plan: str = pa.Field(isin=["free", "pro", "enterprise"])
    mrr: float = pa.Field(ge=0)

# Validate a Polars DataFrame
df = pl.read_parquet("users.parquet")
validated = UserSchema.validate(df)       # Returns validated Polars DataFrame
```

### Integration with Pytest

```python
# tests/test_data_quality.py — Data quality tests
import pandas as pd
import pytest
import pandera.pandas as pa
from schemas.orders import OrderSchema

def test_orders_schema_on_sample_data():
    """Verify the schema accepts known-good data."""
    good_data = pd.DataFrame({
        "order_id": ["ORD-00000001", "ORD-00000002"],
        "customer_id": ["cust-1", "cust-2"],
        "amount": [29.99, 149.00],
        "status": ["completed", "pending"],
        "currency": ["USD", "EUR"],
        "created_at": pd.to_datetime(["2026-01-01", "2026-01-02"]),
        "shipped_at": pd.to_datetime(["2026-01-03", pd.NaT]),
        "items_count": [2, 5],
    })
    validated = OrderSchema.validate(good_data)
    assert len(validated) == 2


def test_orders_schema_rejects_negative_amount():
    """Schema must reject orders with negative amounts."""
    bad_data = pd.DataFrame({
        "order_id": ["ORD-00000001"], "customer_id": ["cust-1"],
        "amount": [-10.00], "status": ["completed"], "currency": ["USD"],
        "created_at": pd.to_datetime(["2026-01-01"]),
        "shipped_at": pd.to_datetime(["2026-01-02"]), "items_count": [1],
    })
    with pytest.raises(pa.errors.SchemaError):
        OrderSchema.validate(bad_data)
```

## Installation

```bash
pip install "pandera[pandas]"      # pandas DataFrames (import pandera.pandas)
pip install "pandera[polars]"      # Polars DataFrames (import pandera.polars)
pip install "pandera[io]"          # to_yaml / from_yaml schema serialization
pip install "pandera[hypotheses]"  # hypothesis checks (needs scipy)
pip install "pandera[strategies]"  # data synthesis with hypothesis
```

The plain `pip install pandera` no longer pulls in pandas, so install the extra for the backend you use.

## Examples

### Example 1: Report every bad row in a CSV before loading it

**User request:** "Our nightly orders.csv sometimes has malformed IDs and negative amounts. Validate it and tell me every failing row, not just the first."

By default Pandera stops at the first failure. Pass `lazy=True` to collect all of them; they raise `pa.errors.SchemaErrors` (plural) with a `failure_cases` DataFrame.

```python
import pandas as pd
import pandera.pandas as pa
from schemas.orders import OrderSchema

df = pd.read_csv("data/orders_2026_03.csv", parse_dates=["created_at", "shipped_at"])
try:
    OrderSchema.validate(df, lazy=True)
except pa.errors.SchemaErrors as err:
    print(err.failure_cases[["index", "column", "check", "failure_case"]])
```

Result: one row per violation, for example `order_id | str_matches('^ORD-\\d{8}$') | ORD-0002` and `amount | greater_than_or_equal_to(0.01) | -1.0`. Without `lazy=True` only the first violation raises `pa.errors.SchemaError`.

### Example 2: Data contract for a Polars users table in CI

**User request:** "Add a check to our pipeline that fails if users.parquet has duplicate ids or an unknown plan."

```python
import pandera.polars as pa
import polars as pl

class UserSchema(pa.DataFrameModel):
    user_id: int = pa.Field(unique=True, gt=0)
    plan: str = pa.Field(isin=["free", "pro", "enterprise"])

UserSchema.validate(pl.read_parquet("users.parquet"), lazy=True)
```

A valid frame is returned unchanged. A frame with `user_id` 1 twice and `plan` "x" raises `SchemaErrors`; `failure_cases` is a Polars DataFrame listing `field_uniqueness` failures for `user_id` and the `isin` failure for `plan`. Without `lazy=True` Polars raises `SchemaError` at the first failure.

## Guidelines

1. **Schema at the boundary** — Validate data at ingestion points (file loads, API responses, database queries); don't trust upstream
2. **Use DataFrameModel over raw SchemaModel** — Class-based schemas give you type hints, IDE autocomplete, and cleaner code
3. **Strict mode** — Enable `strict = True` to reject unexpected columns; prevents schema drift
4. **Coercion for robustness** — Enable `coerce = True` to auto-convert types (string "123" → int 123) before validation
5. **Cross-column checks** — Use `@dataframe_check` for rules that span multiple columns (shipped_at > created_at)
6. **Test your schemas** — Write pytest tests with known-good and known-bad data to verify schema behavior
7. **Descriptive error messages** — Pandera's `failure_cases` DataFrame shows exactly which rows and columns failed and why
8. **Schema evolution** — When requirements change, update the schema first; let validation catch all affected data
9. **Pick the right import** — `import pandera.pandas as pa` for pandas, `import pandera.polars as pa` for Polars; the old top-level `import pandera as pa` still works for pandas, but the submodule is what the documentation uses
10. **Lazy validation for reports** — use `lazy=True` when you want all failures; leave it off for fail-fast pipelines
11. **Cost** — validation runs on every call; for large frames validate at boundaries, or use `head`, `tail` or `sample` arguments on `validate` for a cheaper spot check
