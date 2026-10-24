---
name: aws-dynamodb
description: |
  Amazon DynamoDB is a fully managed NoSQL key-value and document database with single-digit millisecond reads and writes. Use this skill to design tables with partition and sort keys, add global and local secondary indexes, write and query items with the AWS CLI and boto3, use conditional writes and transactions, enable streams and TTL, and apply single-table design. Use when someone says "create a DynamoDB table", "query by sort key", "add a GSI" or "expire items automatically".
license: Apache-2.0
compatibility: 'AWS CLI v2, Python boto3 1.x, an AWS account with DynamoDB permissions'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - aws
    - dynamodb
    - nosql
    - database
    - serverless
---

# AWS DynamoDB

## Overview

DynamoDB stores items (rows) in tables addressed by a primary key: a partition key (PK) alone, or a partition key plus sort key (SK). Reads that give the full key (`GetItem`) or a PK plus an SK condition (`Query`) are fast and cheap; `Scan` reads every item and should be reserved for small tables and one-off jobs. You model data around the queries you need, not the other way round.

Building blocks: GSI (global secondary index, any alternate key, can be added later), LSI (same PK, different SK, only at table creation, caps a partition at 10 GB), Streams (ordered change log), TTL (automatic expiry) and point-in-time recovery (PITR).

## Instructions

### 1. Create a table
On-demand (`PAY_PER_REQUEST`) is the right default for new or spiky workloads; it needs no capacity settings. Turn on deletion protection for production tables.

```bash
aws dynamodb create-table \
  --table-name Orders \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
      AttributeName=GSI1PK,AttributeType=S AttributeName=GSI1SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes '[{
    "IndexName": "GSI1",
    "KeySchema": [
      {"AttributeName":"GSI1PK","KeyType":"HASH"},
      {"AttributeName":"GSI1SK","KeyType":"RANGE"}
    ],
    "Projection": {"ProjectionType":"ALL"}
  }]' \
  --billing-mode PAY_PER_REQUEST \
  --deletion-protection-enabled \
  --tags Key=Env,Value=prod

aws dynamodb wait table-exists --table-name Orders
aws dynamodb update-continuous-backups --table-name Orders \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

For provisioned mode use `--billing-mode PROVISIONED --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5`, and give every GSI its own `ProvisionedThroughput` block. Only key attributes are declared in `--attribute-definitions`.

### 2. Read and write items (CLI)
The CLI uses typed attribute values (`{"S": ...}`, `{"N": "149.99"}`; numbers are strings). `status` is a reserved word, so expressions alias it with `#s`.

```bash
aws dynamodb put-item --table-name Orders --item '{
  "PK": {"S": "CUSTOMER#C001"}, "SK": {"S": "ORDER#2026-01-15#O001"},
  "total": {"N": "149.99"}, "status": {"S": "pending"}}'

aws dynamodb get-item --table-name Orders \
  --key '{"PK":{"S":"CUSTOMER#C001"},"SK":{"S":"ORDER#2026-01-15#O001"}}'

aws dynamodb update-item --table-name Orders \
  --key '{"PK":{"S":"CUSTOMER#C001"},"SK":{"S":"ORDER#2026-01-15#O001"}}' \
  --update-expression "SET #s = :new, updated_at = :ts" \
  --condition-expression "#s = :old" \
  --expression-attribute-names '{"#s":"status"}' \
  --expression-attribute-values '{":new":{"S":"shipped"},":old":{"S":"pending"},":ts":{"S":"2026-01-16T10:00:00Z"}}'
```

If the condition fails the call returns `ConditionalCheckFailedException` and nothing is written; use this for optimistic locking and "create only if absent" (`attribute_not_exists(PK)`). `delete-item` takes the same `--key`.

### 3. Query, do not scan

```bash
aws dynamodb query --table-name Orders \
  --key-condition-expression "PK = :pk AND begins_with(SK, :prefix)" \
  --expression-attribute-values '{":pk":{"S":"CUSTOMER#C001"},":prefix":{"S":"ORDER#2026"}}' \
  --no-scan-index-forward --limit 10

aws dynamodb query --table-name Orders --index-name GSI1 \
  --key-condition-expression "GSI1PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"ORDER#O001"}}'
```

Results are capped at 1 MB per call; page with `LastEvaluatedKey` (the CLI and boto3 paginators do this for you). GSI reads are eventually consistent only; base-table reads can pass `--consistent-read`. `--filter-expression` filters after the read, so you still pay for the items it drops.

### 4. boto3: single-table design, Decimal and batches
boto3 refuses Python floats; use `Decimal` built from strings or the write raises `TypeError: Float types are not supported`.

```python
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

table = boto3.resource("dynamodb").Table("Orders")

table.put_item(Item={
    "PK": "CUSTOMER#C001", "SK": "PROFILE", "name": "Alice Johnson",
    "email": "alice.johnson@acmelogistics.io", "GSI1PK": "CUSTOMERS", "GSI1SK": "Alice Johnson",
    "entity_type": "Customer",
})
table.put_item(Item={
    "PK": "CUSTOMER#C001", "SK": "ORDER#2026-01-15#O001", "total": Decimal("149.99"),
    "status": "shipped", "GSI1PK": "ORDER#O001", "GSI1SK": "CUSTOMER#C001", "entity_type": "Order",
})

resp = table.query(KeyConditionExpression=Key("PK").eq("CUSTOMER#C001") & Key("SK").begins_with("ORDER#"))
orders = resp["Items"]          # follow resp.get("LastEvaluatedKey") for more pages

with table.batch_writer() as batch:       # chunks into 25-item BatchWriteItem calls and retries unprocessed items
    for i in range(100):
        batch.put_item(Item={"PK": f"PRODUCT#P{i:04d}", "SK": "DETAILS",
                             "name": f"Product {i}", "price": Decimal("9.99") + Decimal("0.5") * i})
```

### 5. Transactions
`TransactWriteItems` applies up to 100 actions all-or-nothing (cost is double the normal write units):

```python
client = boto3.client("dynamodb")
client.transact_write_items(TransactItems=[
    {"Put": {"TableName": "Orders", "ConditionExpression": "attribute_not_exists(PK)",
             "Item": {"PK": {"S": "ORDER#O002"}, "SK": {"S": "META"}, "status": {"S": "pending"}}}},
    {"Update": {"TableName": "Orders", "Key": {"PK": {"S": "PRODUCT#P0001"}, "SK": {"S": "DETAILS"}},
                "UpdateExpression": "SET stock = stock - :one", "ConditionExpression": "stock >= :one",
                "ExpressionAttributeValues": {":one": {"N": "1"}}}},
])
```

### 6. Streams and TTL

```bash
aws dynamodb update-table --table-name Orders \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES
aws dynamodb update-time-to-live --table-name Sessions \
  --time-to-live-specification Enabled=true,AttributeName=expires_at
```

TTL attributes must be Number epoch seconds (`int(time.time()) + 86400`); deletion happens in the background, typically within a few days of expiry, so filter expired items in reads if exactness matters. A Lambda stream handler receives `event["Records"]`, each with `eventName` (`INSERT`, `MODIFY`, `REMOVE`) and `dynamodb.NewImage` / `OldImage` in typed form (`{"status": {"S": "shipped"}}`).

## Examples

### Example 1: "Show me the latest 10 orders for customer C001"
Run the first query from step 3. The result is JSON with `Items` (newest first because `--no-scan-index-forward` reads the sort key descending), `Count` and, if more than 10 match, a `LastEvaluatedKey` to resume from.

### Example 2: "Decrement stock only if there is some left, and create the order atomically"
Use the step 5 transaction. If stock is 0 the whole transaction is cancelled with `TransactionCanceledException` (inspect `CancellationReasons`) and no order item is created.

## Guidelines

- List the access patterns first, then choose keys. A hot partition key (one value taking most traffic) throttles even on-demand tables.
- Prefer `Query` on a GSI to `Scan` with a filter; each GSI duplicates data and write cost, so add only those you need.
- Never put floats in boto3 items; use `Decimal(str(value))`.
- Item size limit is 400 KB; keep large blobs in S3 and store the key.
- Back up production tables (PITR) and protect them with deletion protection; `delete-table` is irreversible.
- Use `--endpoint-url` against DynamoDB Local for tests so scripts never touch real tables by accident.
