---
name: "eventbridge"
description: "Build event-driven architectures with AWS EventBridge for decoupled microservices, event routing, and real-time integrations"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "integration"
  tags: ["aws", "eventbridge", "events", "microservices", "integration", "decoupling"]
---

# AWS EventBridge

Build event-driven architectures with AWS EventBridge for decoupled microservices, intelligent event routing, schema registry, and seamless third-party integrations.

## Overview

AWS EventBridge provides:

- **Event-driven architecture** for loosely coupled microservices
- **Custom event buses** for application and organizational boundaries
- **Rule-based routing** with content-based filtering
- **Schema registry** for event structure documentation and validation
- **Third-party integrations** with SaaS applications and AWS services
- **Replay and archive** capabilities for event recovery
- **Dead letter queues** for failed event handling
- **Cross-account and cross-region** event delivery

Perfect for microservices communication, workflow orchestration, real-time data processing, and system integration.

## Instructions

### Step 1: Custom Event Bus Setup

Create custom event buses for different domains and applications.

```typescript
// infrastructure/eventbridge-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class EventBridgeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Custom event buses for different domains
    const orderEventBus = new events.EventBus(this, 'OrderEventBus', {
      eventBusName: 'order-events'
    });

    const userEventBus = new events.EventBus(this, 'UserEventBus', {
      eventBusName: 'user-events'
    });

    // Lambda function for handling events
    const orderProcessorFunction = new lambda.Function(this, 'OrderProcessorFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'order-processor.handler',
      code: lambda.Code.fromAsset('lambda/order-processor'),
      timeout: cdk.Duration.seconds(30)
    });

    // Event rules for order processing
    new events.Rule(this, 'OrderCreatedRule', {
      eventBus: orderEventBus,
      ruleName: 'order-created-rule',
      eventPattern: {
        source: ['order.service'],
        detailType: ['Order Created'],
        detail: {
          status: ['pending']
        }
      },
      targets: [new targets.LambdaFunction(orderProcessorFunction)]
    });
  }
}
```

### Step 2: Event Publisher Service

Create a service to publish events with proper schema validation.

```typescript
// src/event-publisher.ts
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

export class EventPublisher {
  private client: EventBridgeClient;

  constructor(region = 'us-east-1') {
    this.client = new EventBridgeClient({ region });
  }

  async publishOrderEvent(orderData: any): Promise<void> {
    const event = {
      Source: 'order.service',
      DetailType: 'Order Created',
      Detail: JSON.stringify({
        orderId: orderData.orderId,
        customerId: orderData.customerId,
        status: 'pending',
        total: orderData.total,
        timestamp: new Date().toISOString()
      }),
      EventBusName: 'order-events'
    };

    try {
      const command = new PutEventsCommand({ Entries: [event] });
      const response = await this.client.send(command);
      
      if (response.FailedEntryCount && response.FailedEntryCount > 0) {
        throw new Error('Event publication failed');
      }
      
      console.log('Event published successfully');
    } catch (error) {
      console.error('Failed to publish event:', error);
      throw error;
    }
  }
}
```

### Step 3: Event Handler Functions

Create Lambda functions to handle different types of events.

```typescript
// lambda/order-processor/index.ts
import { EventBridgeEvent, Handler } from 'aws-lambda';

interface OrderEventDetail {
  orderId: string;
  customerId: string;
  status: string;
  total: number;
}

export const handler: Handler<EventBridgeEvent<string, OrderEventDetail>, void> = async (event) => {
  console.log('Processing order event:', JSON.stringify(event, null, 2));

  const { detail } = event;
  
  try {
    switch (event['detail-type']) {
      case 'Order Created':
        await processOrderCreated(detail);
        break;
      
      case 'Order Updated':
        await processOrderUpdated(detail);
        break;
      
      default:
        console.warn(`Unhandled event type: ${event['detail-type']}`);
    }
  } catch (error) {
    console.error('Event processing failed:', error);
    throw error; // Re-throw to trigger DLQ
  }
};

async function processOrderCreated(detail: OrderEventDetail) {
  console.log(`Processing new order: ${detail.orderId}`);
  
  // Business logic for order processing
  // - Validate inventory
  // - Process payment
  // - Send confirmation email
  
  console.log(`Order ${detail.orderId} processed successfully`);
}

async function processOrderUpdated(detail: OrderEventDetail) {
  console.log(`Processing order update: ${detail.orderId} -> ${detail.status}`);
  
  // Handle order status changes
  if (detail.status === 'shipped') {
    // Send shipping notification
  } else if (detail.status === 'delivered') {
    // Request review
  }
}
```

### Step 4: Event Monitoring

Implement monitoring and debugging utilities for EventBridge.

```typescript
// monitoring/eventbridge-monitor.ts
import { EventBridgeClient, ListRulesCommand, DescribeRuleCommand } from '@aws-sdk/client-eventbridge';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

export class EventBridgeMonitor {
  private eventBridge: EventBridgeClient;
  private cloudWatch: CloudWatchClient;

  constructor(region = 'us-east-1') {
    this.eventBridge = new EventBridgeClient({ region });
    this.cloudWatch = new CloudWatchClient({ region });
  }

  async monitorEventBus(eventBusName = 'default') {
    console.log(`Monitoring EventBridge bus: ${eventBusName}`);

    try {
      // List all rules for the event bus
      const rulesResponse = await this.eventBridge.send(new ListRulesCommand({
        EventBusName: eventBusName,
        Limit: 50
      }));

      for (const rule of rulesResponse.Rules || []) {
        if (!rule.Name) continue;

        const ruleDetails = await this.eventBridge.send(new DescribeRuleCommand({
          Name: rule.Name,
          EventBusName: eventBusName
        }));

        console.log(`Rule: ${rule.Name}, State: ${ruleDetails.State}`);
        
        // Publish custom metrics
        await this.publishRuleMetrics(eventBusName, rule.Name, ruleDetails.State === 'ENABLED');
      }
    } catch (error) {
      console.error('EventBridge monitoring failed:', error);
    }
  }

  private async publishRuleMetrics(eventBusName: string, ruleName: string, enabled: boolean) {
    try {
      await this.cloudWatch.send(new PutMetricDataCommand({
        Namespace: 'EventBridge/Custom',
        MetricData: [{
          MetricName: 'RuleState',
          Value: enabled ? 1 : 0,
          Unit: 'Count',
          Dimensions: [
            { Name: 'EventBus', Value: eventBusName },
            { Name: 'Rule', Value: ruleName }
          ],
          Timestamp: new Date()
        }]
      }));
    } catch (error) {
      console.error('Failed to publish rule metrics:', error);
    }
  }
}
```

### Step 5: Deploy and Test

Deploy your EventBridge infrastructure and test event flow.

```bash
# Deploy CDK stack
cdk deploy EventBridgeStack

# Test event publishing
aws events put-events \
  --entries Source=order.service,DetailType="Order Created",Detail='{"orderId":"123","customerId":"456","total":100}',EventBusName=order-events

# Monitor events
aws logs tail /aws/lambda/order-processor --follow
```

## Guidelines

- **Design for loose coupling** - events should contain all necessary information
- **Use meaningful event names** - follow consistent naming conventions
- **Implement idempotency** - handlers should handle duplicate events gracefully
- **Add correlation IDs** - track events across distributed system boundaries
- **Handle failures gracefully** - use dead letter queues and retry mechanisms
- **Monitor event flow** - track events through your system for debugging
- **Use content-based filtering** - reduce unnecessary Lambda invocations
- **Archive important events** - enable replay capabilities for critical business events
- **Validate event schemas** - use schema registry to ensure event consistency
- **Secure event buses** - implement proper IAM policies and cross-account access