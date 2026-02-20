---
name: "step-functions"
description: "Orchestrate serverless workflows and microservices using AWS Step Functions with state machines, error handling, and parallel execution"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "orchestration"
  tags: ["aws", "step-functions", "workflow", "orchestration", "state-machine", "serverless"]
---

# AWS Step Functions

Orchestrate serverless workflows and microservices using AWS Step Functions to build resilient, scalable applications with visual workflows and error handling.

## Overview

AWS Step Functions provide:

- **Visual workflow orchestration** with Amazon States Language (ASL)
- **Error handling and retries** with exponential backoff
- **Parallel execution** for concurrent processing
- **State management** for complex business logic
- **Integration patterns** with AWS services

## Instructions

### Step 1: Basic State Machine

```json
{
  "Comment": "Simple order processing workflow",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:validate-order",
      "Next": "ProcessPayment",
      "Catch": [{
        "ErrorEquals": ["ValidationError"],
        "Next": "OrderValidationFailed"
      }],
      "Retry": [{
        "ErrorEquals": ["States.TaskFailed"],
        "IntervalSeconds": 2,
        "MaxAttempts": 3,
        "BackoffRate": 2.0
      }]
    },
    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:process-payment",
      "Next": "SendConfirmation"
    },
    "SendConfirmation": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:send-confirmation",
      "End": true
    },
    "OrderValidationFailed": {
      "Type": "Fail",
      "Cause": "Order validation failed"
    }
  }
}
```

### Step 2: Parallel Processing

```json
{
  "StartAt": "ParallelTasks",
  "States": {
    "ParallelTasks": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "UpdateInventory",
          "States": {
            "UpdateInventory": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:us-east-1:123456789:function:update-inventory",
              "End": true
            }
          }
        },
        {
          "StartAt": "SendNotification",
          "States": {
            "SendNotification": {
              "Type": "Task", 
              "Resource": "arn:aws:lambda:us-east-1:123456789:function:send-notification",
              "End": true
            }
          }
        }
      ],
      "Next": "Complete"
    },
    "Complete": {
      "Type": "Pass",
      "End": true
    }
  }
}
```

### Step 3: Lambda Integration

```typescript
// validate-order.ts
export const handler = async (event: any) => {
  console.log('Validating order:', event);
  
  if (!event.orderId || !event.customerId) {
    throw new Error('ValidationError: Missing required fields');
  }
  
  return {
    ...event,
    validated: true,
    timestamp: new Date().toISOString()
  };
};
```

### Step 4: CDK Deployment

```typescript
// step-functions-stack.ts
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as sfnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

const validateOrder = new sfnTasks.LambdaInvoke(this, 'ValidateOrder', {
  lambdaFunction: validateOrderFunction,
  payloadResponseOnly: true
});

const processPayment = new sfnTasks.LambdaInvoke(this, 'ProcessPayment', {
  lambdaFunction: processPaymentFunction,
  payloadResponseOnly: true
});

const definition = validateOrder.next(processPayment);

const stateMachine = new stepfunctions.StateMachine(this, 'OrderWorkflow', {
  definition,
  timeout: cdk.Duration.minutes(5)
});
```

## Guidelines

- **Design for idempotency** - ensure workflow steps can be safely retried
- **Use appropriate retry strategies** - exponential backoff for transient errors
- **Monitor execution patterns** - track duration, success rates, and error patterns
- **Secure sensitive data** - use parameter store for credentials