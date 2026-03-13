---
name: step-functions
description: >-
  You are an expert in AWS Step Functions, the serverless orchestration
  service for building workflows as state machines. You help developers
  coordinate Lambda functions, API calls, and AWS services using visual
  workflows with branching, parallel execution, error handling, retries, and
  human approval steps — building reliable, observable distributed systems
  without custom orchestration code.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Cloud & Serverless
  tags:
    - aws
    - workflow
    - orchestration
    - state-machine
    - serverless
    - event-driven
---

# AWS Step Functions — Serverless Workflow Orchestration

You are an expert in AWS Step Functions, the serverless orchestration service for building workflows as state machines. You help developers coordinate Lambda functions, API calls, and AWS services using visual workflows with branching, parallel execution, error handling, retries, and human approval steps — building reliable, observable distributed systems without custom orchestration code.

## Core Capabilities

### State Machine Definition

```json
{
  "Comment": "Order processing workflow",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123:function:validate-order",
      "Next": "CheckInventory",
      "Catch": [{
        "ErrorEquals": ["ValidationError"],
        "Next": "RejectOrder"
      }],
      "Retry": [{
        "ErrorEquals": ["States.TaskFailed"],
        "IntervalSeconds": 2,
        "MaxAttempts": 3,
        "BackoffRate": 2.0
      }]
    },
    "CheckInventory": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123:function:check-inventory",
      "Next": "InventoryDecision"
    },
    "InventoryDecision": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.inStock",
          "BooleanEquals": true,
          "Next": "ProcessPayment"
        },
        {
          "Variable": "$.backorderAvailable",
          "BooleanEquals": true,
          "Next": "CreateBackorder"
        }
      ],
      "Default": "NotifyOutOfStock"
    },
    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123:function:process-payment",
      "Next": "ParallelFulfillment"
    },
    "ParallelFulfillment": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "ShipOrder",
          "States": {
            "ShipOrder": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:us-east-1:123:function:ship-order",
              "End": true
            }
          }
        },
        {
          "StartAt": "SendConfirmation",
          "States": {
            "SendConfirmation": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:us-east-1:123:function:send-email",
              "End": true
            }
          }
        },
        {
          "StartAt": "UpdateAnalytics",
          "States": {
            "UpdateAnalytics": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:us-east-1:123:function:update-analytics",
              "End": true
            }
          }
        }
      ],
      "Next": "OrderComplete"
    },
    "OrderComplete": {
      "Type": "Succeed"
    },
    "RejectOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123:function:reject-order",
      "Next": "OrderFailed"
    },
    "NotifyOutOfStock": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123:function:notify-out-of-stock",
      "Next": "OrderFailed"
    },
    "OrderFailed": {
      "Type": "Fail",
      "Error": "OrderProcessingFailed",
      "Cause": "Order could not be fulfilled"
    }
  }
}
```

### Direct SDK Integrations

```json
{
  "WriteToDynamo": {
    "Type": "Task",
    "Resource": "arn:aws:states:::dynamodb:putItem",
    "Parameters": {
      "TableName": "orders",
      "Item": {
        "id": { "S.$": "$.orderId" },
        "status": { "S": "processing" },
        "total": { "N.$": "States.Format('{}', $.total)" }
      }
    },
    "Next": "SendToSQS"
  },
  "SendToSQS": {
    "Type": "Task",
    "Resource": "arn:aws:states:::sqs:sendMessage",
    "Parameters": {
      "QueueUrl": "https://sqs.us-east-1.amazonaws.com/123/notifications",
      "MessageBody.$": "States.JsonToString($.notification)"
    },
    "Next": "WaitForApproval"
  },
  "WaitForApproval": {
    "Type": "Task",
    "Resource": "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
    "Parameters": {
      "QueueUrl": "https://sqs.us-east-1.amazonaws.com/123/approvals",
      "MessageBody": {
        "taskToken.$": "$$.Task.Token",
        "orderId.$": "$.orderId"
      }
    },
    "TimeoutSeconds": 86400,
    "Next": "FinalStep"
  }
}
```

## Installation

```bash
# SAM / CDK / CloudFormation for deployment
# AWS SDK for starting executions
npm install @aws-sdk/client-sfn

# Start execution
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
const sfn = new SFNClient({});
await sfn.send(new StartExecutionCommand({
  stateMachineArn: "arn:aws:states:...",
  input: JSON.stringify({ orderId: "123", items: [...] }),
}));
```

## Best Practices

1. **Express for high-volume** — Use Express Workflows for event processing (100K+ executions/sec, cheaper); Standard for long-running
2. **Catch + Retry** — Add `Catch` and `Retry` on every Task state; handle transient failures gracefully
3. **Direct integrations** — Call DynamoDB, SQS, SNS, ECS directly without Lambda; reduces latency and cost
4. **Parallel for fan-out** — Use Parallel state for concurrent operations; Map state for processing arrays
5. **Wait for callback** — Use `.waitForTaskToken` for human approval, external webhook, or async processing
6. **Input/output processing** — Use `InputPath`, `OutputPath`, `ResultPath` to control data flow between states
7. **Visual debugging** — Step Functions console shows execution flow visually; each state shows input/output/errors
8. **Idempotency** — Pass idempotency tokens through the workflow; retries may re-execute steps
