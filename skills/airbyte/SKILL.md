---
name: airbyte
category: Data Engineering
tags: [etl, data-integration, connectors, sync, data-pipeline, open-source]
version: 1.0.0
author: terminal-skills
---

# Airbyte — Open-Source Data Integration Platform

You are an expert in Airbyte, the open-source data integration platform with 300+ pre-built connectors. You help developers sync data from SaaS tools, databases, and APIs into data warehouses and lakes — handling incremental syncs, CDC (Change Data Capture), schema evolution, and error recovery for production data pipelines.

## Core Capabilities

### Self-Hosted Setup

```bash
# Docker Compose (recommended for small-medium)
git clone https://github.com/airbytehq/airbyte.git
cd airbyte && ./run-ab-platform.sh
# UI at http://localhost:8000

# Kubernetes (production)
helm repo add airbyte https://airbytehq.github.io/helm-charts
helm install airbyte airbyte/airbyte -n airbyte --create-namespace

# Cloud: https://cloud.airbyte.com (managed)
```

### Configuration via API

```python
# Create connections programmatically via Airbyte API
import requests

AIRBYTE_API = "http://localhost:8000/api/v1"

# Create a Stripe source
source = requests.post(f"{AIRBYTE_API}/sources/create", json={
    "workspaceId": workspace_id,
    "name": "Stripe Production",
    "sourceDefinitionId": "e094cb9a-26de-4645-8761-65c0c425d1de",  # Stripe
    "connectionConfiguration": {
        "account_id": "acct_xxx",
        "client_secret": os.environ["STRIPE_SECRET_KEY"],
        "start_date": "2025-01-01T00:00:00Z",
    },
}).json()

# Create a BigQuery destination
destination = requests.post(f"{AIRBYTE_API}/destinations/create", json={
    "workspaceId": workspace_id,
    "name": "BigQuery Warehouse",
    "destinationDefinitionId": "22f6c74f-5699-40ff-833c-4a879ea40133",
    "connectionConfiguration": {
        "project_id": "my-project",
        "dataset_id": "raw_stripe",
        "credentials_json": os.environ["GCP_CREDENTIALS"],
        "loading_method": {"method": "GCS Staging", "gcs_bucket_name": "airbyte-staging"},
    },
}).json()

# Create connection (source → destination)
connection = requests.post(f"{AIRBYTE_API}/connections/create", json={
    "sourceId": source["sourceId"],
    "destinationId": destination["destinationId"],
    "syncCatalog": {
        "streams": [
            {
                "stream": {"name": "subscriptions", "namespace": "stripe"},
                "config": {
                    "syncMode": "incremental",
                    "destinationSyncMode": "append_dedup",
                    "cursorField": ["created"],
                    "primaryKey": [["id"]],
                },
            },
        ],
    },
    "schedule": {"scheduleType": "cron", "cronExpression": "0 */2 * * * ?"},
    "namespaceFormat": "raw_${SOURCE_NAMESPACE}",
}).json()
```

### Custom Connectors (CDK)

```python
# Build a custom source connector with Airbyte CDK
from airbyte_cdk.sources import AbstractSource
from airbyte_cdk.sources.streams import Stream
from airbyte_cdk.sources.streams.http import HttpStream

class InternalAPIStream(HttpStream):
    url_base = "https://api.internal.company.com/v1/"
    primary_key = "id"
    cursor_field = "updated_at"

    def path(self, **kwargs) -> str:
        return "events"

    def parse_response(self, response, **kwargs):
        for record in response.json()["data"]:
            yield record

class Source(AbstractSource):
    def check_connection(self, logger, config):
        # Verify API credentials work
        return True, None

    def streams(self, config):
        return [InternalAPIStream(authenticator=self.get_auth(config))]
```

## Installation

```bash
# Docker Compose
curl -o docker-compose.yaml https://raw.githubusercontent.com/airbytehq/airbyte/master/docker-compose.yaml
docker compose up -d

# Python CDK for custom connectors
pip install airbyte-cdk
```

## Best Practices

1. **Incremental syncs** — Use incremental mode for large tables; full refresh only for small reference tables
2. **CDC for databases** — Use Change Data Capture (logical replication) for real-time PostgreSQL/MySQL syncs
3. **Staging area** — Configure GCS/S3 staging for BigQuery/Snowflake destinations; direct insert is slow for large volumes
4. **Schema evolution** — Airbyte handles new columns automatically; configure `auto_propagation` in connection settings
5. **Alerting** — Set up webhook notifications for sync failures; integrate with Slack/PagerDuty
6. **Namespace per source** — Use `raw_${SOURCE}` namespace pattern; keeps raw data organized before dbt transforms
7. **Self-host for cost** — Airbyte Cloud charges per row synced; self-hosting is free for unlimited data
8. **Custom connectors** — Use CDK for internal APIs; publish to Airbyte's connector marketplace for community use
