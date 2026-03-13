---
name: sqs
description: >-
  You are an expert in Amazon SQS (Simple Queue Service), the fully managed
  message queuing service. You help developers build decoupled, event-driven
  architectures using standard queues (at-least-once, best-effort ordering)
  and FIFO queues (exactly-once, ordered), dead-letter queues for failed
  messages, and Lambda triggers for serverless processing — scaling from zero
  to millions of messages per second.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Cloud & Serverless
  tags:
    - aws
    - queue
    - messaging
    - async
    - decoupling
    - serverless
    - event-driven
---

# Amazon SQS — Managed Message Queue

You are an expert in Amazon SQS (Simple Queue Service), the fully managed message queuing service. You help developers build decoupled, event-driven architectures using standard queues (at-least-once, best-effort ordering) and FIFO queues (exactly-once, ordered), dead-letter queues for failed messages, and Lambda triggers for serverless processing — scaling from zero to millions of messages per second.

## Core Capabilities

### Send and Receive Messages

```typescript
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({ region: "us-east-1" });
const QUEUE_URL = process.env.SQS_QUEUE_URL!;

// Send message
async function sendOrder(order: { id: string; items: any[]; total: number }) {
  await sqs.send(new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(order),
    MessageAttributes: {
      OrderType: { DataType: "String", StringValue: order.total > 1000 ? "high-value" : "standard" },
    },
    DelaySeconds: 0,
  }));
}

// FIFO queue: send with deduplication and grouping
async function sendFifoMessage(userId: string, event: any) {
  await sqs.send(new SendMessageCommand({
    QueueUrl: FIFO_QUEUE_URL,
    MessageBody: JSON.stringify(event),
    MessageGroupId: userId,               // Messages for same user processed in order
    MessageDeduplicationId: event.id,     // Prevents duplicate processing within 5 min
  }));
}

// Receive and process (polling)
async function pollMessages() {
  const response = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 20,                  // Long polling (reduces empty responses)
    VisibilityTimeout: 60,                // 60s to process before message becomes visible again
    MessageAttributeNames: ["All"],
  }));

  for (const message of response.Messages || []) {
    try {
      const order = JSON.parse(message.Body!);
      await processOrder(order);

      // Delete after successful processing
      await sqs.send(new DeleteMessageCommand({
        QueueUrl: QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle!,
      }));
    } catch (error) {
      console.error(`Failed to process ${message.MessageId}:`, error);
      // Message becomes visible again after VisibilityTimeout
    }
  }
}
```

### Lambda Trigger

```yaml
# SAM template — SQS → Lambda
Resources:
  OrderProcessor:
    Type: AWS::Serverless::Function
    Properties:
      Handler: processor.handler
      Runtime: nodejs20.x
      Events:
        SQSEvent:
          Type: SQS
          Properties:
            Queue: !GetAtt OrderQueue.Arn
            BatchSize: 10
            MaximumBatchingWindowInSeconds: 5
            FunctionResponseTypes:
              - ReportBatchItemFailures     # Partial batch failure support

  OrderQueue:
    Type: AWS::SQS::Queue
    Properties:
      VisibilityTimeout: 300
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt DeadLetterQueue.Arn
        maxReceiveCount: 3                 # After 3 failures → DLQ

  DeadLetterQueue:
    Type: AWS::SQS::Queue
    Properties:
      MessageRetentionPeriod: 1209600     # 14 days
```

```typescript
// Lambda handler with partial batch failure reporting
export async function handler(event: SQSEvent) {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const order = JSON.parse(record.body);
      await processOrder(order);
    } catch (error) {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };           // Only failed messages retry
}
```

## Installation

```bash
npm install @aws-sdk/client-sqs
```

## Best Practices

1. **Long polling** — Set `WaitTimeSeconds: 20` to reduce empty receives and API costs
2. **Dead-letter queues** — Configure DLQ with `maxReceiveCount: 3-5`; investigate failed messages, don't lose them
3. **FIFO for ordering** — Use FIFO queues when message order matters; MessageGroupId determines ordering scope
4. **Visibility timeout** — Set to 6x your processing time; prevents premature redelivery
5. **Batch operations** — Send/receive/delete in batches of 10; reduces API calls and costs
6. **Partial batch failures** — Return `batchItemFailures` from Lambda; only failed messages retry
7. **Idempotent consumers** — SQS guarantees at-least-once; design processors to handle duplicate messages safely
8. **Message attributes** — Use message attributes for routing/filtering; avoid parsing body just for routing
