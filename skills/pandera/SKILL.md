---
name: pandera
description: Expert guidance for Pandera, the Python library for validating pandas and Polars DataFrames with expressive schemas. Helps developers define data contracts, validate data pipelines, and catch data quality issues before they corrupt downstream systems.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - data-validation
  - pandas
  - polars
  - python
  - schema
---

# Pandera — Data Validation for DataFrames


## Overview


Pandera, the Python library for validating pandas and Polars DataFrames with expressive schemas. Helps developers define data contracts, validate data pipelines, and catch data quality issues before they corrupt downstream systems.


## Instructions

### Schema Definition

Define column types, constraints, and checks:

```python
# schemas/orders.py — Order data validation schema
import pandera as pa
from pandera.typing import Series, DataFrame
import pandas as pd

class OrderSchema(pa.DataFrameModel):
    """Schema for validated order records.

    Every row represents a single order transaction.
    Validation runs automatically when data enters the pipeline.
    """

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
import pandera as pa
from pandera.typing import DataFrame
from schemas.orders import OrderSchema

@pa.check_types                              # Validates return type at runtime
def load_orders(filepath: str) -> DataFrame[OrderSchema]:
    """Load and validate order data from a CSV file.

    Args:
        filepath: Path to the CSV file containing order records.

    Returns:
        Validated DataFrame conforming to OrderSchema.

    Raises:
        pa.errors.SchemaError: If validation fails with details of violations.
    """
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
    print(f"❌ Validation failed:\n{err.failure_cases}")
    # failure_cases is a DataFrame showing exactly which rows/columns failed
```

### Custom Checks

```python
# schemas/custom_checks.py — Reusable validation checks
import pandera as pa
import pandera.extensions as extensions
import numpy as np

@extensions.register_check_method(
    statistics=["threshold"],
    supported_types=pa.Column,
)
def no_outliers_iqr(series: pd.Series, *, threshold: float = 1.5) -> pd.Series:
    """Flag values outside the IQR fence as failures.

    Args:
        series: The column to check.
        threshold: IQR multiplier (1.5 = standard, 3.0 = extreme only).
    """
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
import pytest
import pandera as pa
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
        "order_id": ["ORD-00000001"],
        "customer_id": ["cust-1"],
        "amount": [-10.00],              # Invalid: negative
        "status": ["completed"],
        "currency": ["USD"],
        "created_at": pd.to_datetime(["2026-01-01"]),
        "shipped_at": pd.to_datetime(["2026-01-02"]),
        "items_count": [1],
    })
    with pytest.raises(pa.errors.SchemaError):
        OrderSchema.validate(bad_data)
```

## Installation

```bash
pip install pandera

# With Polars support
pip install "pandera[polars]"

# With hypothesis for property-based testing
pip install "pandera[hypotheses]"
```


## Examples


### Example 1: Setting up an evaluation pipeline for a RAG application

**User request:**

```
I have a RAG chatbot that answers questions from our docs. Set up Pandera to evaluate answer quality.
```

The agent creates an evaluation suite with appropriate metrics (faithfulness, relevance, answer correctness), configures test datasets from real user questions, runs baseline evaluations, and sets up CI integration so evaluations run on every prompt or retrieval change.

### Example 2: Comparing model performance across prompts

**User request:**

```
We're testing GPT-4o vs Claude on our customer support prompts. Set up a comparison with Pandera.
```

The agent creates a structured experiment with the existing prompt set, configures both model providers, defines scoring criteria specific to customer support (accuracy, tone, completeness), runs the comparison, and generates a summary report with statistical significance indicators.


## Guidelines

1. **Schema at the boundary** — Validate data at ingestion points (file loads, API responses, database queries); don't trust upstream
2. **Use DataFrameModel over raw SchemaModel** — Class-based schemas give you type hints, IDE autocomplete, and cleaner code
3. **Strict mode** — Enable `strict = True` to reject unexpected columns; prevents schema drift
4. **Coercion for robustness** — Enable `coerce = True` to auto-convert types (string "123" → int 123) before validation
5. **Cross-column checks** — Use `@dataframe_check` for rules that span multiple columns (shipped_at > created_at)
6. **Test your schemas** — Write pytest tests with known-good and known-bad data to verify schema behavior
7. **Descriptive error messages** — Pandera's `failure_cases` DataFrame shows exactly which rows and columns failed and why
8. **Schema evolution** — When requirements change, update the schema first; let validation catch all affected data
