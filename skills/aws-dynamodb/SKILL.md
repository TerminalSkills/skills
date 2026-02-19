---
name: aws-dynamodb
description: |
  Build with Amazon DynamoDB for fast, scalable NoSQL storage. Design tables with
  partition and sort keys, create GSI and LSI for flexible queries, enable streams
  for change data capture, and apply single-table design patterns for efficient
  data modeling.
license: Apache-2.0
compatibility:
  - aws-cli
  - boto3
  - sdk
metadata:
  author: terminal-skills
  version: 1.0.0
  category: cloud-services
  tags:
    - aws
    - dynamodb
    - nosql
    - database
    - serverless
---

# AWS DynamoDB

Amazon DynamoDB is a fully managed NoSQL key-value and document database. It delivers single-digit millisecond latency at any scale with automatic scaling, built-in security, and zero operational overhead.

## Core Concepts

- **Table** — a collection of items (rows)
- **Partition Key (PK)** — required primary key for distributing data
- **Sort Key (SK)** — optional, enables range queries within a partition
- **GSI** — Global Secondary Index, alternate PK/SK for different access patterns
- **LSI** — Local Secondary Index, same PK but different SK (must be created at table creation)
- **Streams** — ordered log of item changes for event-driven processing
- **TTL** — automatic item expiration

## Creating Tables

```bash
# Create a table with partition key and sort key
aws dynamodb create-table \
  --table-name Orders \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Env,Value=prod
```

```bash
# Create table with provisioned capacity and GSI
aws dynamodb create-table \
  --table-name Orders \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes '[{
    "IndexName": "GSI1",
    "KeySchema": [
      {"AttributeName":"GSI1PK","KeyType":"HASH"},
      {"AttributeName":"GSI1SK","KeyType":"RANGE"}
    ],
    "Projection": {"ProjectionType":"ALL"},
    "ProvisionedThroughput": {"ReadCapacityUnits":5,"WriteCapacityUnits":5}
  }]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

## Single-Table Design

```python
# Single-table design — store multiple entity types in one table
import boto3
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('AppData')

# Store a customer
table.put_item(Item={
    'PK': 'CUSTOMER#C001',
    'SK': 'PROFILE',
    'name': 'Alice Johnson',
    'email': 'alice@example.com',
    'GSI1PK': 'CUSTOMERS',
    'GSI1SK': 'Alice Johnson',
    'entity_type': 'Customer'
})

# Store an order for that customer
table.put_item(Item={
    'PK': 'CUSTOMER#C001',
    'SK': 'ORDER#2024-01-15#O001',
    'total': 149.99,
    'status': 'shipped',
    'GSI1PK': 'ORDER#O001',
    'GSI1SK': 'CUSTOMER#C001',
    'entity_type': 'Order'
})

# Query all orders for a customer (sorted by date)
response = table.query(
    KeyConditionExpression='PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues={':pk': 'CUSTOMER#C001', ':sk': 'ORDER#'}
)
```

## CRUD Operations

```bash
# Put an item
aws dynamodb put-item \
  --table-name Orders \
  --item '{
    "PK": {"S": "CUSTOMER#C001"},
    "SK": {"S": "ORDER#2024-01-15#O001"},
    "total": {"N": "149.99"},
    "status": {"S": "pending"}
  }'
```

```bash
# Get an item by key
aws dynamodb get-item \
  --table-name Orders \
  --key '{"PK":{"S":"CUSTOMER#C001"},"SK":{"S":"ORDER#2024-01-15#O001"}}'
```

```bash
# Update an item with conditional expression
aws dynamodb update-item \
  --table-name Orders \
  --key '{"PK":{"S":"CUSTOMER#C001"},"SK":{"S":"ORDER#2024-01-15#O001"}}' \
  --update-expression "SET #s = :new_status, updated_at = :ts" \
  --condition-expression "#s = :old_status" \
  --expression-attribute-names '{"#s":"status"}' \
  --expression-attribute-values '{":new_status":{"S":"shipped"},":old_status":{"S":"pending"},":ts":{"S":"2024-01-16T10:00:00Z"}}'
```

```bash
# Delete an item
aws dynamodb delete-item \
  --table-name Orders \
  --key '{"PK":{"S":"CUSTOMER#C001"},"SK":{"S":"ORDER#2024-01-15#O001"}}'
```

## Queries and Scans

```bash
# Query with sort key condition
aws dynamodb query \
  --table-name Orders \
  --key-condition-expression "PK = :pk AND begins_with(SK, :prefix)" \
  --expression-attribute-values '{":pk":{"S":"CUSTOMER#C001"},":prefix":{"S":"ORDER#2024"}}' \
  --scan-index-forward false \
  --limit 10
```

```bash
# Query a GSI
aws dynamodb query \
  --table-name Orders \
  --index-name GSI1 \
  --key-condition-expression "GSI1PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"ORDER#O001"}}'
```

## Batch Operations

```python
# Batch write (up to 25 items)
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('AppData')

with table.batch_writer() as batch:
    for i in range(100):
        batch.put_item(Item={
            'PK': f'PRODUCT#P{i:04d}',
            'SK': 'DETAILS',
            'name': f'Product {i}',
            'price': round(9.99 + i * 0.5, 2)
        })
```

## DynamoDB Streams

```bash
# Enable streams on a table
aws dynamodb update-table \
  --table-name Orders \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES
```

```python
# Lambda handler for DynamoDB stream events
import json

def handler(event, context):
    for record in event['Records']:
        event_name = record['eventName']  # INSERT, MODIFY, REMOVE
        new_image = record['dynamodb'].get('NewImage', {})
        old_image = record['dynamodb'].get('OldImage', {})

        if event_name == 'MODIFY':
            old_status = old_image.get('status', {}).get('S')
            new_status = new_image.get('status', {}).get('S')
            if old_status != new_status:
                print(f"Status changed: {old_status} -> {new_status}")
                # Trigger downstream processing
```

## TTL (Time to Live)

```bash
# Enable TTL on an attribute
aws dynamodb update-time-to-live \
  --table-name Sessions \
  --time-to-live-specification Enabled=true,AttributeName=expires_at
```

```python
# Set TTL when writing items (epoch timestamp)
import time

table.put_item(Item={
    'PK': 'SESSION#abc123',
    'SK': 'DATA',
    'user_id': 'U001',
    'expires_at': int(time.time()) + 86400  # 24 hours from now
})
```

## Best Practices

- Design for access patterns first, not entity relationships
- Use single-table design to minimize the number of requests
- Use `begins_with` on sort keys for hierarchical data queries
- Enable on-demand (PAY_PER_REQUEST) for unpredictable workloads
- Use GSIs sparingly — each one duplicates data and costs extra
- Enable DynamoDB Streams + Lambda for event-driven reactions
- Use TTL to auto-expire temporary data (sessions, caches)
- Use condition expressions to prevent write conflicts
