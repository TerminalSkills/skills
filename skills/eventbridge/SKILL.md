---
name: eventbridge
description: >-
  You are an expert in Amazon EventBridge, the serverless event bus for
  building event-driven architectures. You help developers route events
  between AWS services, SaaS applications, and custom microservices using
  event rules, patterns, transformations, dead-letter queues, and scheduling —
  decoupling producers from consumers with content-based routing that scales
  automatically.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Cloud & Serverless
  tags:
    - aws
    - events
    - serverless
    - event-driven
    - integration
    - bus
---

# Amazon EventBridge — Serverless Event Bus

You are an expert in Amazon EventBridge, the serverless event bus for building event-driven architectures. You help developers route events between AWS services, SaaS applications, and custom microservices using event rules, patterns, transformations, dead-letter queues, and scheduling — decoupling producers from consumers with content-based routing that scales automatically.

## Core Capabilities

### Event Publishing

```typescript
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

const eb = new EventBridgeClient({ region: "us-east-1" });

// Publish custom event
await eb.send(new PutEventsCommand({
  Entries: [{
    Source: "myapp.orders",
    DetailType: "OrderCreated",
    Detail: JSON.stringify({
      orderId: "ord-123",
      userId: "usr-456",
      total: 99.99,
      items: [{ sku: "WIDGET-A", qty: 2 }],
      region: "us-west",
    }),
    EventBusName: "my-app-bus",
  }],
}));

// Batch events
await eb.send(new PutEventsCommand({
  Entries: events.map(e => ({
    Source: "myapp.inventory",
    DetailType: "StockUpdated",
    Detail: JSON.stringify(e),
    EventBusName: "my-app-bus",
  })),
}));
```

### Event Rules and Patterns

```yaml
# SAM template
Resources:
  OrderBus:
    Type: AWS::Events::EventBus
    Properties:
      Name: my-app-bus

  # Route high-value orders to special processing
  HighValueOrderRule:
    Type: AWS::Events::Rule
    Properties:
      EventBusName: !Ref OrderBus
      EventPattern:
        source: ["myapp.orders"]
        detail-type: ["OrderCreated"]
        detail:
          total: [{ "numeric": [">=", 1000] }]
      Targets:
        - Arn: !GetAtt HighValueProcessor.Arn
          Id: high-value-processor
          DeadLetterConfig:
            Arn: !GetAtt DLQueue.Arn

  # Route all order events to analytics
  AnalyticsRule:
    Type: AWS::Events::Rule
    Properties:
      EventBusName: !Ref OrderBus
      EventPattern:
        source: [{ "prefix": "myapp." }]
      Targets:
        - Arn: !GetAtt AnalyticsStream.Arn
          Id: analytics
          InputTransformer:
            InputPathsMap:
              orderId: "$.detail.orderId"
              total: "$.detail.total"
              time: "$.time"
            InputTemplate: '{"event_time": "<time>", "order_id": "<orderId>", "amount": <total>}'

  # Scheduled rule (cron)
  DailyReportRule:
    Type: AWS::Events::Rule
    Properties:
      ScheduleExpression: "cron(0 9 * * ? *)"
      Targets:
        - Arn: !GetAtt DailyReportFunction.Arn
          Id: daily-report
```

### Lambda Consumer

```typescript
// Handler for EventBridge events
export async function handler(event: EventBridgeEvent) {
  const { source, "detail-type": detailType, detail } = event;

  switch (detailType) {
    case "OrderCreated":
      await sendConfirmationEmail(detail.userId, detail.orderId);
      await updateInventory(detail.items);
      break;
    case "OrderCancelled":
      await processRefund(detail.orderId);
      break;
  }
}
```

## Installation

```bash
npm install @aws-sdk/client-eventbridge
```

## Best Practices

1. **Content-based routing** — Use event patterns for routing; filter by source, detail-type, and detail fields
2. **Custom event bus** — Create per-application buses; don't use the default bus for custom events
3. **Schema registry** — Enable schema discovery; auto-generates schemas from events, provides code bindings
4. **Dead-letter queues** — Configure DLQ on every rule target; catch events that fail delivery
5. **Input transformers** — Transform event shape before delivery; targets receive only needed fields
6. **Cross-account** — Use resource policies to send/receive events across AWS accounts; central event bus pattern
7. **Idempotent consumers** — Events may be delivered more than once; design consumers to handle duplicates
8. **Archive and replay** — Enable event archive for replay; useful for debugging, reprocessing, and recovery
