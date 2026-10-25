---
name: airbyte
description: >-
  Airbyte is an open-source data integration platform that copies data from
  SaaS tools, databases and APIs into warehouses and lakes using ready-made
  connectors. Use it when a user asks to install Airbyte locally with abctl,
  create sources, destinations and connections through the Airbyte API,
  configure incremental or deduplicated syncs, handle schema changes, trigger
  or monitor sync jobs, or build a custom source connector with the Python
  CDK.
license: Apache-2.0
compatibility: Docker (for abctl), 4 CPUs and 8 GB RAM recommended; Python 3.10-3.14 for airbyte-cdk
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/airbytehq/airbyte
  tags: "etl, data-integration, connectors, sync, data-pipeline"
---

# Airbyte — Open-Source Data Integration Platform

## Overview

Airbyte moves data from a source (Stripe, Postgres, a REST API) to a destination (BigQuery, Snowflake, S3) on a schedule. A source plus a destination plus a list of streams is a connection. You can run Airbyte yourself (Airbyte Core, installed with the `abctl` command-line tool, which creates a small Kubernetes cluster inside Docker) or use Airbyte Cloud. Everything in the UI is also available through the Airbyte API, and custom sources are written with the Python CDK or the no-code Connector Builder.

Older guides tell you to clone the repository and run `run-ab-platform.sh` or `docker compose up`. Current documentation uses `abctl` for local installs and Helm for Kubernetes.

## Instructions

### 1. Install locally

```bash
brew tap airbytehq/tap && brew install abctl     # or download a release from github.com/airbytehq/abctl
abctl local install                              # needs Docker running; takes several minutes
abctl local credentials                          # prints the login password, client id and client secret
```

The UI is at `http://localhost:8000`. Add `--host airbyte.northwind.dev` to expose it on a domain, and `--insecure-cookies` only for plain HTTP. Remove it with `abctl local uninstall`. For production on Kubernetes, follow the Helm deployment guide in the Airbyte docs.

### 2. Get an API token

Airbyte Core has one built-in application; its client id and secret come from `abctl local credentials` or User settings, Applications. Tokens expire after 15 minutes, so request a new one when needed. On Cloud the API base is `https://api.airbyte.com/v1`; on a local install it is `http://localhost:8000/api/public/v1`.

```python
import os, requests

BASE = "http://localhost:8000/api/public/v1"
token = requests.post(f"{BASE}/applications/token", json={
    "client_id": os.environ["AIRBYTE_CLIENT_ID"],
    "client_secret": os.environ["AIRBYTE_CLIENT_SECRET"],
    "grant-type": "client_credentials",
}, timeout=30).json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
workspace_id = requests.get(f"{BASE}/workspaces", headers=headers, timeout=30).json()["data"][0]["workspaceId"]
```

### 3. Create a source, destination and connection

Connector settings go in `configuration`, with `sourceType` or `destinationType` naming the connector. The exact fields differ per connector; read them from the connector's page in the docs.

```python
source = requests.post(f"{BASE}/sources", headers=headers, timeout=30, json={
    "workspaceId": workspace_id,
    "name": "stripe-production",
    "configuration": {
        "sourceType": "stripe",
        "account_id": "acct_1NfK2LHd8sQw",
        "client_secret": os.environ["STRIPE_API_KEY"],
        "start_date": "2026-01-01T00:00:00Z",
    },
}).json()

destination = requests.post(f"{BASE}/destinations", headers=headers, timeout=30, json={
    "workspaceId": workspace_id,
    "name": "bigquery-warehouse",
    "configuration": {
        "destinationType": "bigquery",
        "project_id": "northwind-analytics",
        "dataset_id": "raw_stripe",
        "dataset_location": "US",
        "credentials_json": os.environ["BIGQUERY_SERVICE_ACCOUNT_JSON"],
    },
}).json()

connection = requests.post(f"{BASE}/connections", headers=headers, timeout=30, json={
    "name": "stripe-to-bigquery",
    "sourceId": source["sourceId"],
    "destinationId": destination["destinationId"],
    "schedule": {"scheduleType": "cron", "cronExpression": "0 0 */2 * * ?", "cronTimeZone": "UTC"},
    "namespaceDefinition": "custom_format",
    "namespaceFormat": "raw_${SOURCE_NAMESPACE}",
    "nonBreakingSchemaUpdatesBehavior": "propagate_columns",
    "configurations": {"streams": [
        {"name": "subscriptions", "syncMode": "incremental_deduped_history",
         "cursorField": ["updated"], "primaryKey": [["id"]]},
        {"name": "customers", "syncMode": "full_refresh_overwrite"},
    ]},
}).json()
```

Sync modes include `full_refresh_overwrite`, `full_refresh_append`, `incremental_append` and `incremental_deduped_history`. Incremental modes need a cursor field; deduped modes need a primary key. Schema-change behaviour is `ignore`, `disable_connection`, `propagate_columns` or `propagate_fully`. Cron expressions use the Quartz format with a seconds field.

### 4. Run and monitor a sync

```python
job = requests.post(f"{BASE}/jobs", headers=headers, timeout=30,
                    json={"connectionId": connection["connectionId"], "jobType": "sync"}).json()
status = requests.get(f"{BASE}/jobs/{job['jobId']}", headers=headers, timeout=30).json()["status"]
```

Job types are `sync`, `reset`, `refresh` and `clear`. Reset and clear delete destination data; do not run them without confirmation. The official SDK (`pip install airbyte-api`) and Terraform provider wrap the same API.

### 5. Custom connector with the Python CDK

For a simple REST API try the Connector Builder in the UI first, which needs no code. For code, install `airbyte-cdk` (7.x):

```python
from typing import Any, Iterable, List, Mapping, Optional, Tuple

import requests
from airbyte_cdk.sources import AbstractSource
from airbyte_cdk.sources.streams import Stream
from airbyte_cdk.sources.streams.http import HttpStream
from airbyte_cdk.sources.streams.http.requests_native_auth import TokenAuthenticator


class Events(HttpStream):
    url_base = "https://api.northwind.dev/v1/"
    primary_key = "id"

    def path(self, **kwargs) -> str:
        return "events"

    def next_page_token(self, response: requests.Response) -> Optional[Mapping[str, Any]]:
        return None                               # single page; return a token mapping to paginate

    def parse_response(self, response: requests.Response, **kwargs) -> Iterable[Mapping]:
        yield from response.json()["data"]


class SourceNorthwind(AbstractSource):
    def check_connection(self, logger, config) -> Tuple[bool, Optional[Any]]:
        ok = requests.get(Events.url_base + "events?limit=1",
                          headers={"Authorization": f"Bearer {config['api_token']}"}, timeout=30).ok
        return ok, None if ok else "API token rejected"

    def streams(self, config: Mapping[str, Any]) -> List[Stream]:
        return [Events(authenticator=TokenAuthenticator(config["api_token"]))]
```

A real connector also needs a `spec`, JSON schemas for each stream and an entrypoint calling `airbyte_cdk.entrypoint.launch`; see the CDK docs. The snippet above was checked against the 7.39.1 class signatures but not run against a live API.

## Examples

### Example 1: "Sync Stripe subscriptions to BigQuery every two hours"

Run the code in step 3 after `abctl local install`, with `AIRBYTE_CLIENT_ID`, `AIRBYTE_CLIENT_SECRET`, `STRIPE_API_KEY` and `BIGQUERY_SERVICE_ACCOUNT_JSON` set in the environment. The first run backfills from `start_date`; later runs read only rows past the `updated` cursor and merge on `id`. Check the Timeline tab of the connection in the UI.

### Example 2: "Trigger a sync from my orchestrator and wait for it"

POST to `/jobs` as in step 4, then poll `GET /jobs/{jobId}` every 30 seconds until `status` is `succeeded`, `failed`, `incomplete` or `cancelled`, with a timeout, and refresh the token every 15 minutes.

## Guidelines

- Use incremental sync for large tables and full refresh only for small reference data; database sources can use CDC (change data capture) for near-real-time replication.
- Keep API keys and service-account JSON in environment variables or a secret manager, never in code or connection names.
- `abctl` needs about 8 GB RAM; low-resource mode exists for 2 CPUs but is slower.
- Treat connector field names as version-specific: open the connector's documentation page or the UI form before writing configuration.
- Use `reset` and `clear` carefully, and test destructive changes on a copy of the connection.
- Transform loaded data afterwards with dbt or SQL rather than inside Airbyte.
