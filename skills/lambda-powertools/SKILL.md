---
name: "lambda-powertools"
description: "Enhance AWS Lambda functions with observability, tracing, metrics, and best practices using AWS Lambda Powertools"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "serverless"
  tags: ["aws", "lambda", "powertools", "observability", "tracing", "metrics", "logging"]
---

# AWS Lambda Powertools

Enhance AWS Lambda functions with structured logging, distributed tracing, custom metrics, and observability best practices.

## Overview

AWS Lambda Powertools provide:

- **Structured logging** with correlation IDs and context
- **Distributed tracing** with AWS X-Ray integration
- **Custom metrics** with CloudWatch Metrics
- **Event handler utilities** for common AWS services

## Instructions

### Step 1: Installation

```bash
# Python
pip install aws-lambda-powertools

# TypeScript
npm install @aws-lambda-powertools/logger
npm install @aws-lambda-powertools/tracer
npm install @aws-lambda-powertools/metrics
```

### Step 2: Structured Logging

```typescript
// logger-example.ts
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  serviceName: 'user-service',
  logLevel: 'INFO'
});

export const handler = async (event: any, context: any) => {
  logger.addContext(context);
  
  logger.info('Processing request', {
    userId: event.pathParameters?.id,
    method: event.httpMethod
  });

  try {
    const result = await processUser(event.pathParameters?.id);
    
    logger.info('Request processed successfully', {
      userId: event.pathParameters?.id,
      result
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    logger.error('Request failed', { error: error as Error });
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

### Step 3: Distributed Tracing

```typescript
// tracer-example.ts
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer';

const tracer = new Tracer({ serviceName: 'order-service' });

export const handler = captureLambdaHandler(async (event: any) => {
  tracer.putAnnotation('userId', event.userId);
  tracer.putMetadata('orderData', event.order);

  const result = await processOrder(event.order);
  return { statusCode: 200, body: JSON.stringify(result) };
});

const processOrder = tracer.captureMethod(async (order: any) => {
  // Automatically traced
  return { orderId: 'order_123', status: 'processed' };
});
```

### Step 4: Custom Metrics

```typescript
// metrics-example.ts
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';

const metrics = new Metrics({
  namespace: 'ECommerce',
  serviceName: 'payment-service'
});

export const handler = async (event: any) => {
  const startTime = Date.now();

  try {
    await processPayment(event);
    
    metrics.addMetric('PaymentSuccess', MetricUnits.Count, 1);
    metrics.addMetric('PaymentAmount', MetricUnits.None, event.amount);
    
  } catch (error) {
    metrics.addMetric('PaymentError', MetricUnits.Count, 1);
    throw error;
  } finally {
    const duration = Date.now() - startTime;
    metrics.addMetric('PaymentDuration', MetricUnits.Milliseconds, duration);
    metrics.publishStoredMetrics();
  }
};
```

## Guidelines

- **Use structured logging** with correlation IDs for better debugging
- **Add contextual information** to logs, traces, and metrics
- **Monitor cold starts** and optimize Lambda performance
- **Publish metrics consistently** to avoid data loss