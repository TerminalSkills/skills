---
name: eventbridge
description: >-
  Amazon EventBridge is AWS's serverless event bus: it routes events from AWS
  services, SaaS apps and your own code to targets using pattern-matching
  rules. Use when a user wants to publish custom events, write event
  patterns, add dead-letter queues or input transformers, replay an archive,
  or run something on a schedule (EventBridge Scheduler).
license: Apache-2.0
compatibility: 'AWS account; AWS CLI v2; Node.js 18+ for the SDK examples'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/aws/aws-sdk-js-v3
  tags: "aws, events, serverless, event-driven, integration"
---

# Amazon EventBridge — Serverless Event Bus

## Overview

EventBridge receives events (JSON with `source`, `detail-type`, `detail`), matches them against rules on an event bus, and delivers matches to targets such as Lambda, SQS, Step Functions or API destinations. Producers do not know who consumes. Use a custom bus per application; the default bus carries AWS service events.

For schedules, AWS now recommends EventBridge Scheduler (`AWS::Scheduler::Schedule`); scheduled rules on a bus are marked legacy in the user guide.

## Instructions

### Publish events

```bash
npm install @aws-sdk/client-eventbridge
```

`PutEvents` does not throw when individual entries fail. Check `FailedEntryCount` and retry only the failed entries.

```typescript
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

const eb = new EventBridgeClient({ region: "us-east-1" });

export async function publishOrderCreated(order: { orderId: string; userId: string; total: number }) {
  const res = await eb.send(new PutEventsCommand({
    Entries: [{
      Source: "myapp.orders",
      DetailType: "OrderCreated",
      Detail: JSON.stringify(order),
      EventBusName: "my-app-bus",
    }],
  }));
  if (res.FailedEntryCount) {
    const failed = res.Entries?.filter(e => e.ErrorCode);
    throw new Error(`PutEvents failed: ${JSON.stringify(failed)}`);
  }
}
```

Limits: the PutEvents guide allows up to 10 entries per request and under 1 MB total request size; the quotas page lists a higher per-request entry range, so chunk batches (10 is always safe). `Source` values starting with `aws.` are reserved.

### Rules, patterns, DLQ (CloudFormation / SAM)

```yaml
Resources:
  OrderBus:
    Type: AWS::Events::EventBus
    Properties:
      Name: my-app-bus

  DeadLetterQueue:
    Type: AWS::SQS::Queue

  DeadLetterQueuePolicy:   # EventBridge may not write to the queue without this
    Type: AWS::SQS::QueuePolicy
    Properties:
      Queues: [!Ref DeadLetterQueue]
      PolicyDocument:
        Statement:
          - Effect: Allow
            Principal: { Service: events.amazonaws.com }
            Action: sqs:SendMessage
            Resource: !GetAtt DeadLetterQueue.Arn
            Condition:
              ArnEquals: { "aws:SourceArn": !GetAtt HighValueOrderRule.Arn }

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
          RetryPolicy: { MaximumRetryAttempts: 10, MaximumEventAgeInSeconds: 3600 }
          DeadLetterConfig: { Arn: !GetAtt DeadLetterQueue.Arn }

  HighValueInvokePermission:   # Lambda targets need a resource policy
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref HighValueProcessor
      Action: lambda:InvokeFunction
      Principal: events.amazonaws.com
      SourceArn: !GetAtt HighValueOrderRule.Arn

  AnalyticsRule:
    Type: AWS::Events::Rule
    Properties:
      EventBusName: !Ref OrderBus
      EventPattern:
        source: [{ "prefix": "myapp." }]
      Targets:
        - Arn: !GetAtt AnalyticsStream.Arn
          Id: analytics
          RoleArn: !GetAtt AnalyticsStreamRole.Arn
          InputTransformer:
            InputPathsMap:
              orderId: "$.detail.orderId"
              total: "$.detail.total"
              time: "$.time"
            InputTemplate: '{"event_time": "<time>", "order_id": "<orderId>", "amount": <total>}'
```

Default retry is up to 185 attempts over 24 hours (`MaximumRetryAttempts` 0-185, `MaximumEventAgeInSeconds` 60-86400). A DLQ only catches events that exhaust retries. Targets other than Lambda, SNS and SQS (Kinesis, Step Functions) need `RoleArn`. The AWS-level pattern operators include `prefix`, `suffix`, `anything-but`, `numeric`, `exists`, `wildcard`, `equals-ignore-case`.

### Schedules: use EventBridge Scheduler

```yaml
  DailyReportSchedule:
    Type: AWS::Scheduler::Schedule
    Properties:
      ScheduleExpression: "cron(0 9 * * ? *)"
      ScheduleExpressionTimezone: "Europe/Berlin"
      FlexibleTimeWindow: { Mode: "OFF" }
      Target:
        Arn: !GetAtt DailyReportFunction.Arn
        RoleArn: !GetAtt SchedulerInvokeRole.Arn
```

Scheduler takes a time zone and one-time `at(2026-12-01T09:00:00)` schedules; the old `AWS::Events::Rule` with `ScheduleExpression` still works but is legacy.

### Lambda consumer

```typescript
import type { EventBridgeEvent } from "aws-lambda"; // npm i -D @types/aws-lambda

type OrderDetail = { orderId: string; userId: string; total: number };

export async function handler(event: EventBridgeEvent<"OrderCreated", OrderDetail>) {
  console.log(event.id, event["detail-type"], event.detail.orderId);
  await sendConfirmationEmail(event.detail.userId, event.detail.orderId);
}
```

Use `event.id` as an idempotency key: delivery is at least once.

## Examples

### Example 1: "Alert me when any order over 1000 is created"

Publish with `publishOrderCreated({ orderId: "ord-7731", userId: "usr-204", total: 1499.0 })`. The `HighValueOrderRule` above matches because `total >= 1000`, invokes `HighValueProcessor`, and after exhausted retries parks the event in `DeadLetterQueue`. A 49.99 order does not match and produces no invocation.

### Example 2: "Replay last week's events after a bug fix"

```bash
aws events create-archive --archive-name orders-archive \
  --event-source-arn arn:aws:events:us-east-1:123456789012:event-bus/my-app-bus \
  --retention-days 30
aws events start-replay --replay-name fix-2026-10-24 \
  --event-source-arn arn:aws:events:us-east-1:123456789012:archive/orders-archive \
  --destination '{"Arn":"arn:aws:events:us-east-1:123456789012:event-bus/my-app-bus"}' \
  --event-start-time 2026-10-17T00:00:00Z --event-end-time 2026-10-24T00:00:00Z
```

Events must have been archived before the replay window.

## Guidelines

- Check `FailedEntryCount` on every PutEvents call; a 200 response does not mean all entries were accepted.
- Create a custom bus per application and grant cross-account access with a bus resource policy.
- Put a DLQ and a retry policy on each target, and the queue policy that lets EventBridge write to it.
- Keep consumers idempotent; duplicates and out-of-order delivery happen.
- A rule matches only what its pattern spells out; test patterns with `aws events test-event-pattern` before deploying.
- Not a queue or stream: for ordered, high-throughput processing use SQS FIFO or Kinesis. For point-to-point scheduling prefer EventBridge Scheduler.
