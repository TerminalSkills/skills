---
name: dlt
description: >-
  dlt (data load tool) is an open-source Python library that loads data from
  APIs, files and databases into warehouses and lakes, inferring the schema and
  tracking incremental state for you. Use when a user asks to build a data
  pipeline in Python, load a REST API into DuckDB, BigQuery, Snowflake or
  Postgres, set up incremental or merge loading, enforce a schema contract, or
  replace a hand-written ETL script or a hosted ELT connector.
license: Apache-2.0
compatibility: "Python 3.10–3.14. Destination drivers are installed as extras, e.g. dlt[duckdb], dlt[bigquery]."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
    - data-pipeline
    - python
    - etl
    - ingestion
    - duckdb
  repository: https://github.com/dlt-hub/dlt
---

# dlt (Data Load Tool) — Python-First Data Ingestion

## Overview

dlt is a Python library, not a service: a pipeline is a script that runs anywhere Python runs. You yield dictionaries from a function decorated with `@dlt.resource`, and dlt infers the schema, unnests nested JSON into child tables, tracks incremental cursors between runs and loads the result into a destination such as DuckDB, BigQuery, Snowflake, Postgres or a data lake. Standard REST APIs need no extraction code at all — the built-in `rest_api` source is configured with a dictionary.

## Instructions

### Installation

```bash
pip install "dlt[duckdb]"                 # library + destination driver
# Other destinations: "dlt[bigquery]", "dlt[snowflake]", "dlt[postgres]", "dlt[motherduck]"

dlt --version
dlt init rest_api duckdb                  # optional: scaffold rest_api_pipeline.py and .dlt/
```

`dlt init` writes `.dlt/config.toml`, an empty `.dlt/secrets.toml`, `requirements.txt` and a `.gitignore` that excludes `secrets.toml`.

### Basic Pipeline

```python
import dlt
import requests

# Simplest pipeline: Python generator → warehouse
@dlt.resource(write_disposition="append")
def github_events():
    """Load public events for a repository."""
    response = requests.get("https://api.github.com/repos/dlt-hub/dlt/events")
    response.raise_for_status()
    yield from response.json()

pipeline = dlt.pipeline(
    pipeline_name="github_events",
    destination="duckdb",                 # or: postgres, snowflake, bigquery, motherduck
    dataset_name="raw_github",
)
load_info = pipeline.run(github_events())
print(load_info)                          # Schema inferred automatically
```

With `destination="duckdb"` the data lands in `github_events.duckdb` in the working directory. Pipeline state and load packages are kept in `~/.dlt/pipelines/github_events`.

### Incremental Loading

```python
@dlt.resource(
    write_disposition="merge",            # Upsert: update existing, insert new
    primary_key="id",
)
def orders(
    updated_at=dlt.sources.incremental(
        "updated_at",
        initial_value="2026-01-01T00:00:00Z"
    )
):
    """Load orders incrementally — only new/changed since last run.

    dlt stores the highest cursor value in pipeline state between runs.
    """
    page = 1
    while True:
        response = requests.get("https://shop.northwind.dev/api/orders", params={
            # start_value stays fixed for the whole run;
            # last_value moves with every yielded page, so do not paginate on it
            "updated_after": updated_at.start_value,
            "page": page,
            "per_page": 100,
        })
        response.raise_for_status()
        data = response.json()
        if not data:
            break
        yield data
        page += 1
```

Write dispositions: `append` (default) for immutable events, `replace` for full refreshes, `merge` with a `primary_key` for entities that change.

### REST API Source (Declarative)

```python
import dlt
from dlt.sources.rest_api import RESTAPIConfig, rest_api_source

config: RESTAPIConfig = {
    "client": {
        "base_url": "https://api.github.com/repos/dlt-hub/dlt/",
        "auth": {"type": "bearer", "token": dlt.secrets["sources.github.access_token"]},
    },
    "resource_defaults": {
        "primary_key": "id",
        "write_disposition": "merge",
        "endpoint": {"params": {"per_page": 100}},
    },
    "resources": [
        {
            "name": "issues",
            "endpoint": {
                "path": "issues",
                "params": {
                    "state": "all",
                    "since": "{incremental.start_value}",
                },
                "incremental": {
                    "cursor_path": "updated_at",
                    "initial_value": "2026-09-01T00:00:00Z",
                },
            },
        },
        {
            # Child resource: one request per issue from the parent
            "name": "issue_comments",
            "endpoint": {"path": "issues/{resources.issues.number}/comments"},
            "include_from_parent": ["id"],
        },
    ],
}

pipeline = dlt.pipeline(
    pipeline_name="github_issues", destination="duckdb", dataset_name="raw_github"
)
print(pipeline.run(rest_api_source(config)))
```

Pagination is detected from the first response. When detection fails, set `paginator` on the client or the endpoint: `json_link` (`next_url_path`), `header_link`, `offset` (`limit`, `offset_param`, `total_path`), `page_number` (`base_page`, `total_path`), `cursor` (`cursor_path`, `cursor_param`) or `single_page`. Use `data_selector` when the records sit under a key such as `results`.

### Secrets and Configuration

dlt resolves every config value from environment variables first, then `.dlt/secrets.toml` and `.dlt/config.toml`. Sections are joined with a double underscore in environment variables:

```bash
export SOURCES__GITHUB__ACCESS_TOKEN="$GITHUB_TOKEN"          # dlt.secrets["sources.github.access_token"]
export DESTINATION__POSTGRES__CREDENTIALS="postgresql://loader:$PGPASSWORD@db.northwind.dev:5432/analytics"
```

In `.dlt/secrets.toml` the same value is the key `access_token` under the `[sources.github]` table. `dlt init` adds that file to `.gitignore`; keep it there.

### Data Contracts

```python
# Fail loudly instead of silently adding columns
@dlt.resource(
    write_disposition="merge",
    primary_key="id",
    columns={
        "id": {"data_type": "bigint", "nullable": False},
        "email": {"data_type": "text", "nullable": False},
        "plan": {"data_type": "text", "nullable": False},
        "mrr_cents": {"data_type": "bigint"},
    },
    # One mode for everything ("freeze") or per entity.
    # Modes: "evolve" (default) | "freeze" | "discard_value" | "discard_row"
    schema_contract={"tables": "evolve", "columns": "freeze", "data_type": "freeze"},
)
def customers():
    yield from fetch_customers()
```

### Inspecting a Pipeline

```python
dataset = pipeline.dataset()
print(dataset.row_counts().fetchall())                        # [('customers', 3)]
print(dataset.customers.select("id", "plan").fetchall())
print(dataset("SELECT plan, count(*) FROM customers GROUP BY 1").fetchall())
# .df() and .arrow() need pandas / pyarrow installed
```

```bash
dlt pipeline github_issues info           # state, schemas, pending and completed load packages
dlt pipeline github_issues trace          # what the last run did
dlt pipeline github_issues show           # browser dashboard; needs `pip install "dlt[hub]" marimo pyarrow ibis-framework`
```

## Examples

### Example 1: Load a billing export into DuckDB and keep it in sync

**User request:** "Every night I get customers from our billing API. Load them into DuckDB, and only update the rows that changed."

```python
# shop_pipeline.py
import dlt

@dlt.resource(write_disposition="merge", primary_key="id")
def customers(updated_at=dlt.sources.incremental("updated_at", initial_value="2026-01-01T00:00:00Z")):
    yield from fetch_customers(since=updated_at.start_value)   # your API call, returns a list of dicts

pipeline = dlt.pipeline(pipeline_name="shop", destination="duckdb", dataset_name="raw_shop")
print(pipeline.run(customers()))
print(pipeline.last_trace.last_normalize_info.row_counts)
```

First run, two customers; second run, one of them changed plan:

```text
Pipeline shop load step finished in 0.13 seconds
1 load package(s) were loaded to destination duckdb and into dataset raw_shop
The duckdb destination used duckdb:////home/dana/shop/shop.duckdb location to store data
Load package 1790847834.5139096 is LOADED and contains no failed jobs
{'_dlt_pipeline_state': 1, 'customers': 2}
...
{'_dlt_pipeline_state': 1, 'customers': 1}
```

The table still holds two rows: the changed customer was updated in place, not appended.

### Example 2: Stop a pipeline when the API adds a field

**User request:** "Our customers table feeds finance reports. If the API starts sending a new column, I want the load to fail, not change the table."

The agent sets `schema_contract={"tables": "evolve", "columns": "freeze", "data_type": "freeze"}` on the resource. When a record arrives with an unknown `referrer` field, the run stops before anything is loaded:

```text
dlt.pipeline.exceptions.PipelineStepFailed: Pipeline execution failed at `step=normalize` ...
In schema `shop`: In Table: `customers` Column: `referrer` . Contract on `columns` with
`contract_mode=freeze` is violated. Can't add table column `referrer` to table `customers`
because `columns` are frozen.
```

The rejected package stays in the pipeline's working directory and is retried on the next run, which fails the same way. After deciding what to do with the field, discard it:

```bash
dlt pipeline shop info                    # "Has 1 extracted packages ready to be normalized"
dlt -y pipeline shop abort-packages       # -y accepts the confirmation prompt
```

Switching the `columns` mode to `discard_value` instead loads the row without the unknown field.

## Guidelines

1. **Start with DuckDB** — Develop locally with `destination="duckdb"`, switch to BigQuery/Snowflake for production by changing the destination string and credentials
2. **Incremental for APIs** — Use `dlt.sources.incremental` for stateful loading; pass `start_value` to the API, never `last_value`, while paginating
3. **REST API source** — Use the declarative `rest_api_source` for standard REST APIs; write custom resources only for complex APIs. Put incremental cursors in the `incremental` block with the `{incremental.start_value}` placeholder — the older `"type": "incremental"` parameter form is deprecated
4. **Merge for entities** — Use `write_disposition="merge"` with `primary_key` for entity tables; `append` for event streams
5. **Schema contracts** — Freeze `columns` and `data_type` in production to catch breaking API changes immediately; a frozen contract leaves a pending package behind that must be aborted
6. **Pending packages block new data** — when a run fails after extraction, the next `pipeline.run()` loads the pending package and ignores the data passed to it. Check `dlt pipeline NAME info` after any failure
7. **State lives on local disk** — `~/.dlt/pipelines` holds cursors and packages. On ephemeral runners (CI, serverless) dlt restores state from the destination at the start of a run, but pending packages are lost
8. **Secrets management** — Use `dlt.secrets["key"]` backed by environment variables or `.dlt/secrets.toml`; keep `secrets.toml` out of version control and never hardcode tokens in the config dictionary
9. **Transformations** — Use `add_map()` for row-level transforms during loading; heavier transforms belong in dbt or SQL after the load
10. **Deploy anywhere** — dlt is a library, not a scheduler; run the script from cron, Airflow, Dagster, GitHub Actions or Lambda
11. **When not to use** — dlt moves and normalizes data; it is not an orchestrator and not a streaming engine for sub-second latency
