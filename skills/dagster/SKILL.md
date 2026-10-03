---
name: dagster
description: |
  Dagster is a data pipeline orchestrator built around the concept of software-defined assets.
  Learn to define assets, ops, jobs, schedules, sensors, and resources for
  building maintainable data platforms.
license: Apache-2.0
compatibility: 'macos, linux, windows; Python 3.10+'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/dagster-io/dagster
  tags:
    - dagster
    - data-pipeline
    - orchestration
    - assets
    - python
---

# Dagster

## Overview

Dagster organizes data pipelines around software-defined assets — declarations of the data artifacts your pipeline produces. Assets track lineage, enable incremental computation, and integrate with the Dagster UI. Version 1.13 (current as of October 2026) introduces **Components**, a scaffolding layer on top of the same asset/job/resource APIs described below; new projects created with the `dg` CLI use that layout, but the classic `dagster` CLI and plain Python definitions in this skill still work unchanged and are the simpler starting point for a single-file pipeline.

## Instructions

### Installation

```bash
# Install Dagster and the UI webserver
pip install dagster dagster-webserver

# Scaffold a project (classic layout: one code location, pyproject.toml, tests)
dagster project scaffold --name my_pipeline
cd my_pipeline
pip install -e ".[dev]"

# Start the dev server (loads Definitions objects found in the package)
dagster dev
# UI at http://localhost:3000
```

Newer projects can instead use `uvx create-dagster@latest project my_pipeline` (or `pip install dagster-dg-cli` then `create-dagster project my_pipeline`), which scaffolds a Components-ready layout and starts the UI with `dg dev` instead of `dagster dev`. Both layouts share the same `dagster` Python package and the asset/resource/schedule APIs below.

### Software-Defined Assets

```python
# my_pipeline/assets.py: Define assets that produce data
import dagster as dg
import pandas as pd
import httpx

@dg.asset(group_name="raw")
def raw_users(context: dg.AssetExecutionContext) -> pd.DataFrame:
    """Fetch raw user data from the billing API."""
    response = httpx.get("https://billing.internal.sharpline.io/v1/users")
    df = pd.DataFrame(response.json())
    context.log.info(f"Fetched {len(df)} users")
    return df

@dg.asset(group_name="raw")
def raw_orders(context: dg.AssetExecutionContext) -> pd.DataFrame:
    """Fetch raw order data from the billing API."""
    response = httpx.get("https://billing.internal.sharpline.io/v1/orders")
    return pd.DataFrame(response.json())

@dg.asset(group_name="analytics", deps=[raw_users, raw_orders])
def revenue_by_user(raw_users: pd.DataFrame, raw_orders: pd.DataFrame) -> pd.DataFrame:
    """Calculate total revenue per user."""
    merged = raw_orders.merge(raw_users, left_on="user_id", right_on="id")
    result = (
        merged.groupby(["user_id", "name"])
        .agg(total_revenue=("amount", "sum"), order_count=("id_x", "count"))
        .reset_index()
    )
    return result
```

`dagster as dg` is the import convention used throughout current Dagster docs and examples (`dg.asset`, `dg.Definitions`, …) — it is unrelated to the separate `dg` *CLI* installed by `dagster-dg-cli`. The older `from dagster import asset, AssetExecutionContext` style still works; both resolve to the same package.

### Resources

```python
# my_pipeline/resources.py: Configurable resources for external systems
import dagster as dg
import sqlalchemy

class DatabaseResource(dg.ConfigurableResource):
    connection_string: str

    def query(self, sql: str) -> list:
        engine = sqlalchemy.create_engine(self.connection_string)
        with engine.connect() as conn:
            result = conn.execute(sqlalchemy.text(sql))
            return [dict(row._mapping) for row in result]

    def execute(self, sql: str):
        engine = sqlalchemy.create_engine(self.connection_string)
        with engine.connect() as conn:
            conn.execute(sqlalchemy.text(sql))
            conn.commit()
```

### Assets with Resources

```python
# my_pipeline/db_assets.py: Assets that use database resources
import dagster as dg
from .resources import DatabaseResource

@dg.asset(group_name="warehouse")
def dim_users(context: dg.AssetExecutionContext, database: DatabaseResource):
    """Load cleaned user dimension table into warehouse."""
    users = database.query("SELECT id, name, email, created_at FROM raw_users")
    context.log.info(f"Loaded {len(users)} users into warehouse")
    return users
```

### Definitions

```python
# my_pipeline/__init__.py: Wire everything together
import dagster as dg
from . import assets, db_assets
from .resources import DatabaseResource
import os

all_assets = dg.load_assets_from_modules([assets, db_assets])

defs = dg.Definitions(
    assets=all_assets,
    resources={
        "database": DatabaseResource(
            connection_string=os.environ["WAREHOUSE_CONNECTION_STRING"]
        ),
    },
)
```

### Schedules and Sensors

```python
# my_pipeline/schedules.py: Time-based and event-based triggers
import os
import dagster as dg

# Job that materializes specific assets
analytics_job = dg.define_asset_job(
    name="analytics_job",
    selection=dg.AssetSelection.groups("analytics"),
)

# Cron schedule
daily_analytics = dg.ScheduleDefinition(
    job=analytics_job,
    cron_schedule="0 6 * * *",  # 6 AM daily
)

# Sensor — trigger on external event
@dg.sensor(job=analytics_job, minimum_interval_seconds=60)
def new_file_sensor(context: dg.SensorEvaluationContext):
    incoming_dir = os.environ["INCOMING_DATA_DIR"]
    new_files = [f for f in os.listdir(incoming_dir) if f.endswith(".csv")]
    if new_files:
        context.log.info(f"Found {len(new_files)} new files")
        yield dg.RunRequest(run_key=new_files[0])
    else:
        yield dg.SkipReason("No new files found")
```

### Partitioned Assets

```python
# my_pipeline/partitioned.py: Time-partitioned assets for incremental processing
import dagster as dg

daily_partitions = dg.DailyPartitionsDefinition(start_date="2026-01-01")

@dg.asset(partitions_def=daily_partitions, group_name="raw")
def daily_events(context: dg.AssetExecutionContext):
    """Fetch events for a specific date partition."""
    date = context.partition_key  # e.g., "2026-09-19"
    context.log.info(f"Processing events for {date}")
    return fetch_events(date)
```

### CLI Reference

```bash
# Development server (classic layout); Components layout uses `dg dev` instead
dagster dev

# Materialize assets
dagster asset materialize --select raw_users,raw_orders

# List assets
dagster asset list

# Run a job
dagster job execute -j analytics_job

# Load and validate all Definitions without running anything
dagster definitions validate
```

## Examples

### Example 1: Build a daily revenue pipeline

Request: "Pull users and orders from our billing API every morning and compute revenue per user."

Write `raw_users`, `raw_orders` and `revenue_by_user` as shown in Software-Defined Assets above, wire them into a `Definitions` object, then schedule them:

```python
import dagster as dg
from .assets import raw_users, raw_orders, revenue_by_user

analytics_job = dg.define_asset_job(name="analytics_job", selection=dg.AssetSelection.all())
daily_schedule = dg.ScheduleDefinition(job=analytics_job, cron_schedule="0 6 * * *")

defs = dg.Definitions(
    assets=[raw_users, raw_orders, revenue_by_user],
    schedules=[daily_schedule],
)
```

Result: `dagster dev` shows a three-node asset graph in the UI; the schedule runs at 06:00 daily, and `dagster asset materialize --select raw_users,raw_orders,revenue_by_user` runs it on demand. Each run's logs and the resulting `revenue_by_user` table are visible in the Runs tab.

### Example 2: React to new files landing in a directory

Request: "A vendor drops CSV exports into a shared folder a few times a day. Kick off the import job automatically when a new file shows up."

Use the `new_file_sensor` from Schedules and Sensors above, pointed at the drop directory via `INCOMING_DATA_DIR`:

```bash
export INCOMING_DATA_DIR="/srv/dagster/incoming"
dagster dev
```

Result: the sensor polls every 60 seconds; when a `.csv` file appears, it yields a `RunRequest` keyed on the filename, so the same file never triggers two runs even if the sensor evaluates again before the run starts. When the folder is empty it yields `SkipReason("No new files found")`, which shows up in the sensor's tick history instead of a silent no-op.

## Guidelines

- `dagster dev` is for local development: it runs an in-memory, single-process webserver and scheduler. For production, deploy with Dagster+ (the managed offering) or self-host `dagster-webserver` plus a daemon process behind a real run launcher and database — do not run `dagster dev` as a production service.
- Keep API calls, file I/O and database writes inside assets or resources, not at import time; Dagster imports your modules to build the asset graph, so top-level side effects run on every CLI invocation and UI reload.
- Prefer `ConfigurableResource` over module-level clients so connection strings and credentials come from `Definitions(resources=...)` (backed by environment variables), not hardcoded values — this also lets tests swap in a fake resource.
- Partition definitions must line up with the data: a `DailyPartitionsDefinition` asset downstream of a non-partitioned asset needs an explicit partition mapping, or materialization fails.
- `dagster definitions validate` loads every asset, job, schedule and sensor without executing them — run it in CI to catch import errors and bad resource wiring before deploying.
- Sensors poll; `minimum_interval_seconds` is a floor, not a guarantee — a slow sensor function or a busy instance can delay the next tick.
- For a new project today, `create-dagster project` (the `dg` CLI) is the path the official docs lead with and scaffolds Components support; `dagster project scaffold` still produces a working classic project and needs no extra packages, which is simpler for a single pipeline like the one above.
