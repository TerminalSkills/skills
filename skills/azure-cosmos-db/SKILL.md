---
name: azure-cosmos-db
description: |
  Build globally distributed apps with Azure Cosmos DB. Work with multiple data
  models (document, key-value, graph), configure global replication with tunable
  consistency levels, manage throughput with RU/s, and query with SQL API.
license: Apache-2.0
compatibility:
  - azure-cli
  - python
  - nodejs
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - azure
    - cosmos-db
    - nosql
    - global-distribution
    - multi-model
---

# Azure Cosmos DB

Azure Cosmos DB is a globally distributed, multi-model database with guaranteed single-digit millisecond latency at the 99th percentile. It supports document (NoSQL), key-value, graph, and column-family data models with five tunable consistency levels.

## Core Concepts

- **Account** — top-level resource, defines global regions and consistency
- **Database** — a namespace for containers
- **Container** — equivalent to a collection/table, holds items
- **Partition Key** — determines data distribution; critical for performance
- **Request Unit (RU)** — normalized cost of database operations
- **Consistency Level** — Strong, Bounded Staleness, Session, Consistent Prefix, Eventual

## Account and Database Setup

```bash
# Create a Cosmos DB account with global replication
az cosmosdb create \
  --name my-app-cosmos \
  --resource-group my-app-rg \
  --kind GlobalDocumentDB \
  --default-consistency-level Session \
  --locations regionName=eastus failoverPriority=0 \
  --locations regionName=westeurope failoverPriority=1 \
  --enable-automatic-failover true
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

## CRUD Operations

```python
# Initialize client and perform CRUD
from azure.cosmos import CosmosClient, PartitionKey

client = CosmosClient(
    url="https://my-app-cosmos.documents.azure.com:443/",
    credential="your-key-here"
)
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
    "createdAt": "2024-01-15T10:30:00Z"
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
item['shippedAt'] = '2024-01-16T14:00:00Z'
container.replace_item(item=item['id'], body=item)
```

```python
# Partial update with patch operations
container.patch_item(
    item="order-001",
    partition_key="customer-123",
    patch_operations=[
        {"op": "set", "path": "/status", "value": "delivered"},
        {"op": "add", "path": "/deliveredAt", "value": "2024-01-17T09:00:00Z"},
        {"op": "incr", "path": "/updateCount", "value": 1}
    ]
)
```

```python
# Delete an item
container.delete_item(item="order-001", partition_key="customer-123")
```

## Querying

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

## Consistency Levels

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

## Change Feed

```python
# Process change feed for event-driven architecture
from azure.cosmos import CosmosClient

container = CosmosClient(url, credential).get_database_client("app-db").get_container_client("orders")

# Read changes from beginning
change_feed = container.query_items_change_feed(
    is_start_from_beginning=True,
    partition_key_range_id="0"
)
for change in change_feed:
    print(f"Changed item: {change['id']}, status: {change.get('status')}")
```

## Global Distribution

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

## Throughput Management

```bash
# Enable autoscale on a container
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

## Best Practices

- Choose partition key carefully — it determines scalability and query performance
- Use Session consistency for most applications (best balance of performance and guarantees)
- Use autoscale throughput for variable workloads to avoid over-provisioning
- Query within a single partition whenever possible to minimize RU consumption
- Use the change feed for event-driven patterns instead of polling
- Enable automatic failover for production accounts
- Exclude large payload paths from indexing to save RUs on writes
- Use point reads (by id + partition key) instead of queries when possible — 1 RU
