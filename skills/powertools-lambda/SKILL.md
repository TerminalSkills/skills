---
name: powertools-lambda
description: >-
  You are an expert in AWS Lambda Powertools, the developer toolkit for
  implementing serverless best practices. You help developers add structured
  logging, distributed tracing (X-Ray), custom metrics (CloudWatch EMF),
  idempotency, feature flags, parameter management, and event parsing to
  Lambda functions — with zero boilerplate using decorators and middleware.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Cloud & Serverless
  tags:
    - aws
    - lambda
    - observability
    - logging
    - tracing
    - metrics
    - middleware
---

# AWS Lambda Powertools — Serverless Best Practices

You are an expert in AWS Lambda Powertools, the developer toolkit for implementing serverless best practices. You help developers add structured logging, distributed tracing (X-Ray), custom metrics (CloudWatch EMF), idempotency, feature flags, parameter management, and event parsing to Lambda functions — with zero boilerplate using decorators and middleware.

## Core Capabilities

### TypeScript

```typescript
// handler.ts — Lambda with Powertools middleware
import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import middy from "@middy/core";

const logger = new Logger({ serviceName: "payment-service" });
const tracer = new Tracer({ serviceName: "payment-service" });
const metrics = new Metrics({ namespace: "PaymentService", serviceName: "payment-service" });

const lambdaHandler = async (event: APIGatewayProxyEvent) => {
  // Structured logging with correlation IDs
  logger.appendKeys({ orderId: event.pathParameters?.id });
  logger.info("Processing payment", { amount: 29.99, currency: "USD" });

  // Custom metrics (published to CloudWatch automatically)
  metrics.addMetric("PaymentProcessed", MetricUnit.Count, 1);
  metrics.addMetric("PaymentAmount", MetricUnit.None, 29.99);
  metrics.addDimension("PaymentMethod", "card");

  // Tracing (X-Ray subsegments)
  const subsegment = tracer.getSegment()?.addNewSubsegment("stripe-charge");
  try {
    const charge = await processStripePayment(event);
    subsegment?.addAnnotation("chargeId", charge.id);
    tracer.addResponseAsMetadata(charge);

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

// Middy middleware stack
export const handler = middy(lambdaHandler)
  .use(injectLambdaContext(logger, { logEvent: true }))
  .use(captureLambdaHandler(tracer))
  .use(logMetrics(metrics));
```

### Idempotency

```typescript
import { makeIdempotent, IdempotencyConfig } from "@aws-lambda-powertools/idempotency";
import { DynamoDBPersistenceLayer } from "@aws-lambda-powertools/idempotency/dynamodb";

const persistenceStore = new DynamoDBPersistenceLayer({
  tableName: "idempotency-table",
});

const config = new IdempotencyConfig({
  eventKeyJmesPath: "body.orderId",       // Dedup key from event
  expiresAfterSeconds: 3600,              // 1 hour TTL
});

const processPayment = async (event: any) => {
  const body = JSON.parse(event.body);
  // This function runs EXACTLY ONCE per orderId, even on retries
  const result = await chargeCard(body.orderId, body.amount);
  return { statusCode: 200, body: JSON.stringify(result) };
};

export const handler = makeIdempotent(processPayment, {
  persistenceStore,
  config,
});
```

### Python

```python
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.utilities.typing import LambdaContext
from aws_lambda_powertools.logging import correlation_paths

logger = Logger(service="user-service")
tracer = Tracer(service="user-service")
metrics = Metrics(namespace="UserService")
app = APIGatewayRestResolver()

@app.get("/users/<user_id>")
@tracer.capture_method
def get_user(user_id: str):
    logger.info("Fetching user", extra={"user_id": user_id})
    user = db.get_user(user_id)
    metrics.add_metric(name="UserFetched", unit="Count", value=1)
    return {"user": user}

@app.post("/users")
@tracer.capture_method
def create_user():
    body = app.current_event.json_body
    user = db.create_user(body)
    metrics.add_metric(name="UserCreated", unit="Count", value=1)
    return {"user": user}, 201

@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
```

## Installation

```bash
# TypeScript
npm install @aws-lambda-powertools/logger @aws-lambda-powertools/tracer @aws-lambda-powertools/metrics

# Python
pip install aws-lambda-powertools
```

## Best Practices

1. **Structured logging** — Use Logger for JSON logs with correlation IDs; enables CloudWatch Insights queries
2. **Distributed tracing** — Use Tracer with X-Ray; trace requests across Lambda → DynamoDB → SQS → Lambda chains
3. **Custom metrics** — Use Metrics with EMF format; CloudWatch picks up without API calls, zero cost overhead
4. **Idempotency** — Use for payment/order handlers; prevents duplicate processing on Lambda retries
5. **Event parsing** — Use event handler resolvers for API Gateway, SQS, S3 events; type-safe with validation
6. **Cold start metric** — Enable `capture_cold_start_metric`; track and optimize cold starts per function
7. **Correlation IDs** — Inject automatically from API Gateway, ALB, or custom headers; trace requests end-to-end
8. **Middy middleware** — Stack Powertools as middy middleware in TypeScript; clean separation of concerns
