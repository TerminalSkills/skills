---
name: step-functions
description: >-
  AWS Step Functions runs serverless workflows defined as state machines in
  Amazon States Language (ASL): Lambda and direct AWS service calls with
  branching, parallel and map steps, retries, error catching and human
  approval callbacks. Use when a user wants to orchestrate Lambda functions,
  build an AWS workflow or saga, add retries and error handling to a
  multi-step process, wait for an approval, or write ASL JSON with JSONata.
license: Apache-2.0
compatibility: >-
  AWS account with IAM permissions to create state machines and a role Step
  Functions can assume; AWS CLI v2 or SDK for JavaScript v3.
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags: "aws, step-functions, workflow, state-machine, serverless"
---

# AWS Step Functions

## Overview

Step Functions executes a state machine written in Amazon States Language (JSON). Each state is a Task (Lambda or any of the many AWS services, called directly), Choice, Parallel, Map, Wait, Pass, Succeed or Fail. Two workflow types exist and the type cannot be changed after creation:

- **Standard**: runs up to one year, exactly-once execution, execution history available. Use for payments, approvals, long processes.
- **Express**: runs up to five minutes, at-least-once, billed by executions and duration, history only in CloudWatch Logs. Use for high-volume, idempotent event processing.

New workflows should set `"QueryLanguage": "JSONata"` at the top level. JSONata replaces the five JSONPath fields (`InputPath`, `Parameters`, `ResultSelector`, `ResultPath`, `OutputPath`) with `Arguments` and `Output`, writes expressions as `"{% ... %}"`, and uses `$states.input` and `$states.result`. Existing JSONPath machines keep working; the older field names below apply only to them.

## Instructions

### Step 1: Write the definition

A JSONata order workflow with a direct Lambda integration, retry, catch and a Choice. Use the optimized `arn:aws:states:::lambda:invoke` resource; its result is under `$states.result.Payload`.

```json
{
  "Comment": "Order processing",
  "QueryLanguage": "JSONata",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Arguments": {
        "FunctionName": "arn:aws:lambda:eu-west-1:482910563127:function:validate-order:live",
        "Payload": "{% $states.input %}"
      },
      "Assign": { "orderId": "{% $states.input.orderId %}" },
      "Output": "{% $states.result.Payload %}",
      "Retry": [
        {
          "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"],
          "IntervalSeconds": 2,
          "MaxAttempts": 4,
          "BackoffRate": 2,
          "JitterStrategy": "FULL"
        }
      ],
      "Catch": [
        { "ErrorEquals": ["ValidationError"], "Next": "RejectOrder", "Output": "{% $states.errorOutput %}" }
      ],
      "Next": "InventoryDecision"
    },
    "InventoryDecision": {
      "Type": "Choice",
      "Choices": [
        { "Condition": "{% $states.input.inStock = true %}", "Next": "ChargeCard" }
      ],
      "Default": "RejectOrder"
    },
    "ChargeCard": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Arguments": {
        "FunctionName": "arn:aws:lambda:eu-west-1:482910563127:function:charge-card:live",
        "Payload": { "orderId": "{% $orderId %}", "total": "{% $states.input.total %}" }
      },
      "Output": "{% $states.result.Payload %}",
      "End": true
    },
    "RejectOrder": {
      "Type": "Fail",
      "Error": "OrderRejected",
      "Cause": "Validation failed or item out of stock"
    }
  }
}
```

Notes on the definition:

- `Assign` stores values in workflow variables (`$orderId`) that every later state can read. Assignments in one `Assign` block all see the values from before that block.
- Retriers and catchers are evaluated in order; `States.ALL` must be alone in its entry and last. A `Catch` replaces the state's output with the error output unless you set `Output`.
- Error names you can match include `States.TaskFailed`, `States.Timeout`, `States.Runtime`, and Lambda's `Lambda.Unknown` and `Sandbox.Timedout`. Custom error names must not start with `States.`.
- Set `TimeoutSeconds` on every Task; without it a stuck task can wait for up to a year in a Standard workflow.

### Step 2: Direct service integrations and callbacks

Calling DynamoDB, SQS, SNS, EventBridge, ECS and other services directly skips a Lambda hop. Append `.waitForTaskToken` to pause until something calls `SendTaskSuccess` or `SendTaskFailure` with the token:

```jsonc
// excerpt: one entry of the top-level "States" object (Standard workflows only)
"RequestApproval": {
  "Type": "Task",
  "Resource": "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
  "Arguments": {
    "QueueUrl": "https://sqs.eu-west-1.amazonaws.com/482910563127/refund-approvals",
    "MessageBody": { "taskToken": "{% $states.context.Task.Token %}", "orderId": "{% $orderId %}" }
  },
  "TimeoutSeconds": 86400,
  "Next": "IssueRefund"
}
```

### Step 3: Map and Parallel

`Map` runs an `ItemProcessor` per array item (the old `Iterator` and `Parameters` fields are deprecated; use `ItemProcessor` and `ItemSelector`). `MaxConcurrency` caps parallel iterations; `0` means no limit. `Parallel` runs fixed `Branches` and returns an array of their outputs.

### Step 4: Deploy, validate and run

```console
$ aws stepfunctions validate-state-machine-definition --definition file://order.asl.json --type STANDARD
$ aws stepfunctions create-state-machine --name order-processing --type STANDARD \
    --definition file://order.asl.json \
    --role-arn arn:aws:iam::482910563127:role/order-sfn-role
$ aws stepfunctions start-execution \
    --state-machine-arn arn:aws:states:eu-west-1:482910563127:stateMachine:order-processing \
    --name order-A-1042 --input '{"orderId":"A-1042","total":59.9}'
$ aws stepfunctions describe-execution --execution-arn arn:aws:states:eu-west-1:482910563127:execution:order-processing:order-A-1042
```

`validate-state-machine-definition` checks ASL without creating anything and is good for CI. `test-state` runs a single state in isolation. Express workflows can be called synchronously with `start-sync-execution`.

From Node, install `@aws-sdk/client-sfn` (SDK v3):

```typescript
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'

const sfn = new SFNClient({ region: 'eu-west-1' })
const out = await sfn.send(new StartExecutionCommand({
  stateMachineArn: process.env.ORDER_STATE_MACHINE_ARN!,
  name: 'order-A-1042', // reusing a name with different input is rejected
  input: JSON.stringify({ orderId: 'A-1042', total: 59.9 }),
}))
console.log(out.executionArn)
```

## Examples

### Example 1: Add retries to a flaky Lambda step

User: "My payment step fails now and then with Lambda throttling. Make the workflow retry."

Add the `Retry` block from Step 1 to the `ChargeCard` state with `Lambda.TooManyRequestsException` and `Lambda.ServiceException` in `ErrorEquals`, `JitterStrategy: "FULL"`, and `MaxAttempts: 4`. Because charging is not idempotent, pass `$orderId` as an idempotency key in `Payload`. Re-run `validate-state-machine-definition`; expect `"result": "OK"`.

### Example 2: Approve before refunding

User: "Pause the refund until a manager approves it."

Use the `RequestApproval` state from Step 2. The worker that reads the SQS queue calls `aws stepfunctions send-task-success --task-token "$TOKEN" --task-output '{"approved":true}'` (or `send-task-failure`). The execution waits in that state until then or until `TimeoutSeconds` expires, and the timeout is a `States.Timeout` error you can catch.

## Guidelines

- Pick the workflow type deliberately: it is immutable. Express is at-least-once, so its tasks must be idempotent.
- Input and output of any task or state are limited to 256 KiB; pass references (S3 keys) for big data, not the data.
- Handle Lambda service exceptions in every Lambda Task, as the AWS best-practices page advises.
- Give the execution role least privilege: only the Lambda ARNs and service actions the machine calls, plus `lambda:InvokeFunction` on the exact functions.
- Do not put secrets in state input; history and CloudWatch Logs record it. Read secrets inside the task.
- When a Standard run fails midway, `aws stepfunctions redrive-execution` restarts it from the failed state within 14 days of completion (not available for Express).
