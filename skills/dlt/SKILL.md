---
name: dlt
category: Data Engineering
tags: [data-loading, python, etl, data-pipeline, ingestion, open-source]
version: 1.0.0
author: terminal-skills
---

# dlt (Data Load Tool) — Python-First Data Ingestion

You are an expert in dlt, the open-source Python library for building data pipelines. You help developers load data from any API, file, or database into warehouses and lakes using simple Python decorators — with automatic schema inference, incremental loading, and built-in data contracts. dlt is the "requests library for data pipelines."

## Core Capabilities

### Basic Pipeline

```python
import dlt

# Simplest pipeline: Python generator → warehouse
@dlt.resource(write_disposition="append")
def github_events():
    """Load GitHub events for a repository."""
    import requests
    response = requests.get("https://api.github.com/repos/org/repo/events")
    yield from response.json()

# Run pipeline
pipeline = dlt.pipeline(
    pipeline_name="github_events",
    destination="bigquery",               # or: postgres, snowflake, duckdb, motherduck
    dataset_name="raw_github",
)
load_info = pipeline.run(github_events())
print(load_info)                          # Schema inferred automatically
```

### Incremental Loading

```python
@dlt.resource(
    write_disposition="merge",            # Upsert: update existing, insert new
    primary_key="id",
)
def orders(
    updated_at=dlt.sources.incremental(
        "updated_at",
        initial_value="2025-01-01T00:00:00Z"
    )
):
    """Load orders incrementally — only new/changed since last run.

    dlt tracks the cursor automatically between runs.
    No need to store state manually.
    """
    import requests
    page = 1
    while True:
        response = requests.get("https://api.shop.com/orders", params={
            "updated_after": updated_at.last_value,
            "page": page,
            "per_page": 100,
        })
        data = response.json()
        if not data:
            break
        yield from data
        page += 1
```

### REST API Source (Declarative)

```python
from dlt.sources.rest_api import rest_api_source

# Declarative API source — no code needed for standard REST APIs
source = rest_api_source({
    "client": {
        "base_url": "https://api.hubspot.com/crm/v3/",
        "auth": { "type": "bearer", "token": dlt.secrets["hubspot_token"] },
        "paginator": { "type": "offset", "limit": 100, "offset_param": "offset" },
    },
    "resources": [
        {
            "name": "contacts",
            "endpoint": { "path": "objects/contacts" },
            "write_disposition": "merge",
            "primary_key": "id",
        },
        {
            "name": "deals",
            "endpoint": { "path": "objects/deals" },
            "write_disposition": "merge",
            "primary_key": "id",
        },
    ],
})

pipeline = dlt.pipeline(destination="bigquery", dataset_name="raw_hubspot")
pipeline.run(source)
```

### Data Contracts

```python
# Enforce schema contracts — fail loudly on unexpected changes
@dlt.resource(
    write_disposition="merge",
    primary_key="id",
    columns={
        "id": {"data_type": "bigint", "nullable": False},
        "email": {"data_type": "text", "nullable": False},
        "plan": {"data_type": "text", "nullable": False},
        "mrr_cents": {"data_type": "bigint"},
    },
    schema_contract="evolve",             # "freeze" | "evolve" | "discard_value" | "discard_row"
)
def customers():
    # If API returns unexpected fields, dlt handles per contract setting
    yield from fetch_customers()
```

## Installation

```bash
pip install dlt[bigquery]                 # + destination adapter
# Other destinations: dlt[snowflake], dlt[postgres], dlt[duckdb], dlt[motherduck]
```

## Best Practices

1. **Start with DuckDB** — Develop locally with `destination="duckdb"`, switch to BigQuery/Snowflake for production
2. **Incremental for APIs** — Use `dlt.sources.incremental` for stateful loading; dlt tracks cursor between runs
3. **REST API source** — Use the declarative `rest_api_source` for standard REST APIs; write custom resources only for complex APIs
4. **Merge for entities** — Use `write_disposition="merge"` with `primary_key` for entity tables; `append` for event streams
5. **Schema contracts** — Set `schema_contract="freeze"` in production to catch breaking API changes immediately
6. **Secrets management** — Use `dlt.secrets["key"]` backed by environment variables or `.dlt/secrets.toml`
7. **Transformations** — Use `add_map()` for row-level transforms during loading; heavier transforms belong in dbt
8. **Deploy anywhere** — dlt is a library, not a service; deploy in cron, Airflow, Dagster, GitHub Actions, or Lambda
