---
name: azure-cosmos-db
description: >-
  Azure Cosmos DB is Microsoft's globally distributed NoSQL database service. Use when someone asks to
  "set up Cosmos DB", "create a container with a partition key", "query Cosmos DB with the Python SDK",
  "choose a consistency level", "add a region", "process the change feed", or "reduce RU cost".
  Covers the API for NoSQL: az CLI setup, Entra ID access, CRUD, SQL queries, change feed, throughput.
license: Apache-2.0
compatibility: 'Azure CLI 2.x, Python 3.9+ with azure-cosmos 4.x and azure-identity, an Azure subscription'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/Azure/azure-sdk-for-python
  category: devops
  tags:
    - azure
    - cosmos-db
    - nosql
    - global-distribution
    - multi-model
---

# Azure Cosmos DB

## Overview

Azure Cosmos DB is a globally distributed database with single-digit millisecond reads and writes at the 99th percentile (Microsoft's SLA figure), and five tunable consistency levels. It exposes several APIs: NoSQL (documents, SQL-like queries; the one this skill covers), MongoDB, Cassandra, Gremlin and Table. The account's API is chosen at creation and cannot be changed. The `az cosmosdb sql ...` commands and the `azure-cosmos` SDK below are for the API for NoSQL (older docs call it the "SQL API").

## Core Concepts

- **Account** — top-level resource, defines global regions and consistency
- **Database** — a namespace for containers
- **Container** — equivalent to a collection/table, holds items
- **Partition Key** — determines data distribution; critical for performance
- **Request Unit (RU)** — normalized cost of database operations
- **Consistency Level** — Strong, Bounded Staleness, Session, Consistent Prefix, Eventual

## Instructions

### Account and Database Setup

```bash
# Create a Cosmos DB account with global replication
az cosmosdb create \
  --name my-app-cosmos \
  --resource-group my-app-rg \
  --kind GlobalDocumentDB \
  --default-consistency-level Session \
  --locations regionName=eastus failoverPriority=0 \
  --locations regionName=westeurope failoverPriority=1 \
  --enable-automatic-failover true \
  --disable-local-auth true
```

`--disable-local-auth true` turns off account keys so only Microsoft Entra ID identities can reach the data (recommended for production; drop it if you still need keys). Grant the app's identity the built-in data role, whose id is `00000000-0000-0000-0000-000000000002` ("Cosmos DB Built-in Data Contributor"):

```bash
az cosmosdb sql role assignment create \
  --account-name my-app-cosmos \
  --resource-group my-app-rg \
  --scope "/" \
  --principal-id "$APP_PRINCIPAL_ID" \
  --role-definition-id 00000000-0000-0000-0000-000000000002
```

```bash
# Create a database with shared throughput
az cosmosdb sql database create \
  --account-name my-app-cosmos \
  --resource-group my-app-rg \
  --name app-db \
  --throughput 400
```

```bash
# Create a container with partition key and autoscale
az cosmosdb sql container create \
  --account-name my-app-cosmos \
  --resource-group my-app-rg \
  --database-name app-db \
  --name orders \
  --partition-key-path /customerId \
  --max-throughput 4000 \
  --idx '{"indexingMode":"consistent","automatic":true,"includedPaths":[{"path":"/*"}],"excludedPaths":[{"path":"/payload/*"}]}'
```

### CRUD Operations

```python
# pip install azure-cosmos azure-identity
import os
from azure.cosmos import CosmosClient
from azure.identity import DefaultAzureCredential

# Entra ID (works with az login locally and managed identity in Azure)
client = CosmosClient(
    url="https://my-app-cosmos.documents.azure.com:443/",
    credential=DefaultAzureCredential(),
)
# Key-based alternative (only if local auth is enabled):
# client = CosmosClient(url, credential=os.environ["COSMOS_KEY"])
database = client.get_database_client("app-db")
container = database.get_container_client("orders")

# Create an item
order = {
    "id": "order-001",
    "customerId": "customer-123",
    "items": [
        {"name": "Widget", "qty": 2, "price": 29.99},
        {"name": "Gadget", "qty": 1, "price": 49.99}
    ],
    "total": 109.97,
    "status": "pending",
    "createdAt": "2026-10-15T10:30:00Z"
}
container.create_item(body=order)
```

```python
# Read an item (requires partition key)
item = container.read_item(item="order-001", partition_key="customer-123")
print(f"Order: {item['status']}, Total: ${item['total']}")
```

```python
# Replace (full update)
item['status'] = 'shipped'
item['shippedAt'] = '2026-10-16T14:00:00Z'
container.replace_item(item=item['id'], body=item)  # use upsert_item(body=item) to insert-or-replace
```

```python
# Partial update with patch operations
container.patch_item(
    item="order-001",
    partition_key="customer-123",
    patch_operations=[
        {"op": "set", "path": "/status", "value": "delivered"},
        {"op": "add", "path": "/deliveredAt", "value": "2026-10-17T09:00:00Z"},
        {"op": "incr", "path": "/updateCount", "value": 1}
    ]
)
```

```python
# Delete an item
container.delete_item(item="order-001", partition_key="customer-123")
```

### Querying

```python
# SQL queries on Cosmos DB
# Query orders for a customer
orders = container.query_items(
    query="SELECT * FROM c WHERE c.customerId = @customerId AND c.status = @status",
    parameters=[
        {"name": "@customerId", "value": "customer-123"},
        {"name": "@status", "value": "pending"}
    ],
    partition_key="customer-123"
)
for order in orders:
    print(f"{order['id']}: ${order['total']}")
```

```python
# Cross-partition query (more expensive, use sparingly)
all_pending = container.query_items(
    query="SELECT c.id, c.customerId, c.total FROM c WHERE c.status = 'pending' ORDER BY c.total DESC",
    enable_cross_partition_query=True,
    max_item_count=50
)
```

```python
# Aggregation query
result = container.query_items(
    query="SELECT VALUE COUNT(1) FROM c WHERE c.status = 'shipped'",
    enable_cross_partition_query=True
)
count = list(result)[0]
```

### Consistency Levels

```bash
# Update default consistency level
az cosmosdb update \
  --name my-app-cosmos \
  --resource-group my-app-rg \
  --default-consistency-level BoundedStaleness \
  --max-staleness-prefix 100 \
  --max-interval 5
```

| Level | Guarantee | RU Cost | Use Case |
|-------|-----------|---------|----------|
| Strong | Linearizable reads | Highest | Financial transactions |
| Bounded Staleness | Reads lag by ≤K versions or T time | High | Leaderboards, counters |
| Session | Read-your-writes per session | Medium | **Default — most apps** |
| Consistent Prefix | Reads never see out-of-order writes | Low | Social feeds |
| Eventual | No ordering guarantee | Lowest | Non-critical analytics |

### Change Feed

```python
# Process the change feed for an event-driven pipeline (azure-cosmos 4.17)
# Reuses `container` from the CRUD section.
change_feed = container.query_items_change_feed(
    start_time="Beginning",          # or "Now" (the default) or a datetime
    max_item_count=100,
)
for change in change_feed:
    print(f"Changed item: {change['id']}, status: {change.get('status')}")
```

The older `is_start_from_beginning` and `partition_key_range_id` arguments are gone from current SDKs; scope a read with `partition_key=` or `feed_range=` (see `container.read_feed_ranges()`). To resume later, pass the `continuation` token you got from the previous response. The default mode shows only the latest version of changed items and does not include deletes; `mode="AllVersionsAndDeletes"` (needs continuous backup on the account) also reports deletes, but only from `start_time="Now"` or a `continuation` token, not from `"Beginning"`. For a durable multi-worker processor, use Azure Functions' Cosmos DB trigger or the .NET/Java change feed processor.

### Global Distribution

```bash
# Add a read region
az cosmosdb update \
  --name my-app-cosmos \
  --resource-group my-app-rg \
  --locations regionName=eastus failoverPriority=0 \
  --locations regionName=westeurope failoverPriority=1 \
  --locations regionName=southeastasia failoverPriority=2
```

```bash
# Enable multi-region writes
az cosmosdb update \
  --name my-app-cosmos \
  --resource-group my-app-rg \
  --enable-multiple-write-locations true
```

### Throughput Management

```bash
# Move a manual-throughput container to autoscale (the orders container above was
# already created with --max-throughput, so it is autoscale and needs no migration)
az cosmosdb sql container throughput migrate \
  --account-name my-app-cosmos \
  --resource-group my-app-rg \
  --database-name app-db \
  --name orders \
  --throughput-type autoscale
```

```bash
# Check current throughput and usage
az cosmosdb sql container throughput show \
  --account-name my-app-cosmos \
  --resource-group my-app-rg \
  --database-name app-db \
  --name orders
```

## Examples

### Example 1: Orders container for a shop

**User request:** "Create a Cosmos DB database for my shop's orders, in two regions, no account keys."

The agent runs the `az cosmosdb create` command with `--disable-local-auth true`, creates `app-db` and the `orders` container with `/customerId` as partition key, assigns the data role to the app's identity, and writes the Python client with `DefaultAzureCredential`. Result: `read_item("order-001", partition_key="customer-123")` returns the order for about 1 RU, and a query filtered on `customerId` stays in one partition.

### Example 2: Why is this query expensive?

**User request:** "My order list query uses 300 RU per call. Fix it."

The agent finds that the query runs with `enable_cross_partition_query=True` and no `customerId` filter. It adds the partition key value to the query (`partition_key="customer-123"`), selects only the needed properties instead of `SELECT *`, and excludes `/payload/*` from the indexing policy. Result: the request charge drops because the query touches one logical partition and writes index fewer paths.

## Guidelines

- Choose partition key carefully — it determines scalability and query performance
- Use Session consistency for most applications (best balance of performance and guarantees)
- Use autoscale throughput for variable workloads to avoid over-provisioning
- Query within a single partition whenever possible to minimize RU consumption
- Use the change feed for event-driven patterns instead of polling
- Enable automatic failover for production accounts
- Exclude large payload paths from indexing to save RUs on writes
- Use point reads (by id + partition key) instead of queries when possible — about 1 RU for a 1 KB item
- Prefer Entra ID (`DefaultAzureCredential`) over account keys; keep any key in an environment variable or Key Vault, never in code
- Handle HTTP 429 (rate limited): the SDK retries automatically, but sustained 429s mean the container needs more RU/s or a better partition key
- Test locally with the Linux emulator (`mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-latest`); it covers only part of the API for NoSQL, so check the feature you need
