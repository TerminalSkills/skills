---
name: powertools-lambda
description: >-
  Powertools for AWS Lambda is an open-source toolkit that adds structured
  JSON logging, X-Ray tracing, CloudWatch metrics (EMF), idempotency, batch
  processing, parameter fetching and API event handlers to Lambda functions in
  Python, TypeScript, Java and .NET. Use when a user wants better Lambda
  observability, retry-safe handlers, SQS partial batch failures, or asks about
  "aws-lambda-powertools", "Powertools logger", "Lambda idempotency" or "EMF metrics".
license: Apache-2.0
compatibility: 'Python 3.10+ (aws-lambda-powertools 3.37) or Node.js 22+ (@aws-lambda-powertools/* 2.36); AWS Lambda'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/aws-powertools/powertools-lambda-python
  category: devops
  tags:
    - aws
    - lambda
    - observability
    - serverless
    - idempotency
---

# Powertools for AWS Lambda

## Overview

Powertools for AWS Lambda is maintained by AWS. Core utilities: **Logger** (JSON logs with Lambda context and correlation ids), **Tracer** (X-Ray), **Metrics** (CloudWatch Embedded Metric Format: metrics are written as a log line, no API call), **Idempotency** (DynamoDB-backed), **Batch** (SQS, Kinesis and DynamoDB Streams partial failures), **Parameters** (SSM, Secrets Manager, AppConfig with caching) and **Event Handler** (API Gateway, ALB and Function URL routing, Python). The Python package is `aws-lambda-powertools` (3.x, Python 3.10+; the 3.37 release metadata says `<4.0.0,>=3.10`). The TypeScript packages are `@aws-lambda-powertools/<utility>` (2.x). Java and .NET versions exist with the same concepts.

## Instructions

### Install

```bash
pip install "aws-lambda-powertools[tracer]"          # tracer extra adds aws-xray-sdk; boto3 is in the Lambda runtime
npm install @aws-lambda-powertools/logger @aws-lambda-powertools/tracer @aws-lambda-powertools/metrics @aws-lambda-powertools/idempotency @aws-lambda-powertools/jmespath @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @middy/core
```

Alternatively use the AWS-published Powertools Lambda layer (Python); ARNs per region are in the documentation. The idempotency package needs `@aws-lambda-powertools/jmespath` and the two DynamoDB SDK clients as peer dependencies (the Node.js Lambda runtime already ships the SDK clients). Middy 7 is ESM-only and needs Node.js 22+, so write the TypeScript handler as an ES module (`"type": "module"`).

Enable tracing on the function (`Tracing: Active` in SAM, `tracing: lambda.Tracing.ACTIVE` in CDK) and give the role `xray:PutTraceSegments` and `xray:PutTelemetryRecords`. Set `POWERTOOLS_SERVICE_NAME` and `POWERTOOLS_METRICS_NAMESPACE` as environment variables instead of repeating them in code.

### Python: logger, tracer, metrics and a REST resolver

```python
from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger(service="user-service")
tracer = Tracer(service="user-service")
metrics = Metrics(namespace="UserService")
app = APIGatewayRestResolver()

@app.get("/users/<uid>")
@tracer.capture_method
def get_user(uid: str):
    logger.info("Fetching user", user_id=uid)          # extra keys become JSON fields
    metrics.add_metric(name="UserFetched", unit=MetricUnit.Count, value=1)
    return {"user": load_user(uid)}                    # your own data access

@app.post("/users")
@tracer.capture_method
def create_user():
    body = app.current_event.json_body
    metrics.add_metric(name="UserCreated", unit=MetricUnit.Count, value=1)
    return {"user": save_user(body)}, 201                  # (body, status code) tuple

@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
```

`@metrics.log_metrics` must wrap the handler, otherwise metrics are never flushed. Use `APIGatewayHttpResolver` for HTTP APIs and `ALBResolver` for load balancers.

### Python: SQS partial batch failures and idempotency

```python
import json

from aws_lambda_powertools.utilities.batch import BatchProcessor, EventType, process_partial_response
from aws_lambda_powertools.utilities.data_classes.sqs_event import SQSRecord
from aws_lambda_powertools.utilities.idempotency import DynamoDBPersistenceLayer, IdempotencyConfig, idempotent, idempotent_function

processor = BatchProcessor(event_type=EventType.SQS)
persistence = DynamoDBPersistenceLayer(table_name="idempotency-table")

@idempotent_function(data_keyword_argument="order", config=IdempotencyConfig(event_key_jmespath="orderId"), persistence_store=persistence)
def charge_order(order: dict):                             # your own charge call; call it with order=...
    ...

def record_handler(record: SQSRecord):
    charge_order(order=record.json_body)                   # raises on failure; a redelivered orderId is not charged twice

def lambda_handler(event, context):
    # returns {"batchItemFailures": [{"itemIdentifier": "<messageId>"}]} for records that raised
    return process_partial_response(event=event, record_handler=record_handler, processor=processor, context=context)

# Whole-handler idempotency for an API Gateway event, whose "body" is a JSON string
config = IdempotencyConfig(event_key_jmespath="powertools_json(body).orderId", expires_after_seconds=3600)

@idempotent(config=config, persistence_store=persistence)
def payment_handler(event, context):
    return {"statusCode": 200, "body": json.dumps(take_payment(json.loads(event["body"])["orderId"]))}  # your own call
```

Use `@idempotent` on a handler and `@idempotent_function` on a function inside it, such as the per-record charge above.

Enable `ReportBatchItemFailures` on the SQS event source mapping, or the partial response is ignored. The DynamoDB table needs a string partition key named `id` (default) and TTL on `expiration`.

### TypeScript: middy middleware

```typescript
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import middy from "@middy/core";

const logger = new Logger({ serviceName: "payment-service" });
const tracer = new Tracer({ serviceName: "payment-service" });
const metrics = new Metrics({ namespace: "PaymentService", serviceName: "payment-service" });

const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const orderId = event.pathParameters?.id ?? "unknown";
  logger.appendKeys({ orderId });
  logger.info("Processing payment", { amount: 29.99, currency: "USD" });

  const subsegment = tracer.getSegment()?.addNewSubsegment("card-charge");
  try {
    const charge = await chargeCard(orderId, 29.99);       // your own payment call
    subsegment?.addAnnotation("chargeId", charge.id);
    metrics.addDimension("PaymentMethod", "card");
    metrics.addMetric("PaymentProcessed", MetricUnit.Count, 1);
    return { statusCode: 200, body: JSON.stringify(charge) };
  } catch (error) {
    subsegment?.addError(error as Error);
    logger.error("Payment failed", error as Error);
    metrics.addMetric("PaymentFailed", MetricUnit.Count, 1);
    throw error;
  } finally {
    subsegment?.close();
  }
};

export const handler = middy(lambdaHandler)
  .use(injectLambdaContext(logger, { logEvent: false }))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics, { captureColdStartMetric: true }));
```

### TypeScript: idempotency

```typescript
import { makeIdempotent, IdempotencyConfig } from "@aws-lambda-powertools/idempotency";
import { DynamoDBPersistenceLayer } from "@aws-lambda-powertools/idempotency/dynamodb";
import type { Context } from "aws-lambda";

const persistenceStore = new DynamoDBPersistenceLayer({ tableName: "idempotency-table" });
const config = new IdempotencyConfig({ eventKeyJmesPath: "orderId", expiresAfterSeconds: 3600 });

const processPayment = async (event: { orderId: string; amount: number }) => {
  return { statusCode: 200, body: JSON.stringify(await chargeCard(event.orderId, event.amount)) };
};

const idempotentPayment = makeIdempotent(processPayment, { persistenceStore, config });

export const handler = async (event: { body: string }, context: Context) => {
  config.registerLambdaContext(context);   // lets it detect an in-flight call about to time out
  return idempotentPayment(JSON.parse(event.body));
};
```

Wrapping the handler directly (`export const handler = makeIdempotent(fn, { persistenceStore })`) also works when the event itself carries the key.

## Examples

### Example 1: Add observability to an existing Python function

**User request:**

```
Our order-lookup Lambda logs plain print() lines. Make the logs searchable in CloudWatch Logs Insights and add a cold start metric.
```

The agent installs the package, adds `Logger`, `Metrics` and the three decorators from the Python example, sets `POWERTOOLS_SERVICE_NAME=order-lookup` and `POWERTOOLS_METRICS_NAMESPACE=Orders` in the template, and replaces `print` calls with `logger.info`. Result: each log line is JSON with `level`, `message`, `function_request_id`, `cold_start` and `correlation_id`, and a `ColdStart` metric appears in CloudWatch under the namespace.

### Example 2: Stop duplicate charges on retries

**User request:**

```
Sometimes SQS delivers the same order twice and the customer is charged twice. Fix it.
```

The agent switches the handler to `BatchProcessor` with partial responses, wraps the charge function in `@idempotent_function` keyed on the order id, creates the DynamoDB table with partition key `id` and TTL attribute `expiration`, and grants the function `dynamodb:GetItem`, `PutItem`, `UpdateItem` and `DeleteItem` on it. Result: a redelivered message returns the stored result instead of charging again, and only failed records return to the queue.

## Guidelines

- Create `Logger`, `Tracer`, `Metrics` and persistence stores at module level, outside the handler, so they are reused between invocations.
- Metrics are flushed once per invocation by the decorator or middleware; the EMF limit is 100 metrics per log line, and high-cardinality dimensions (user ids) become expensive, so put them in log keys instead.
- Do not log full events or secrets: `log_event=True` / `logEvent: true` writes the whole payload, including personal data.
- Idempotency needs a stable key; choose a business id (order id), not a timestamp. Handler errors are not stored as results, so a failed call can be retried.
- Pin the Python layer or package version and read the changelog before upgrading across major versions.
- Outside Lambda (containers, servers), Logger and Metrics still work, but Tracer and Idempotency expect Lambda environment variables.
