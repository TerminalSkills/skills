---
title: "Deploy and Debug Serverless Applications"
slug: deploy-and-debug-serverless-applications
description: "Ship serverless apps to AWS with SST, debug cold starts and timeout issues, and use Railway as a fallback for workloads that outgrow Lambda."
skills:
  - sst
  - serverless-debugger
  - railway-deploy
category: devops
tags:
  - serverless
  - aws-lambda
  - sst
  - railway
  - debugging
---

# Deploy and Debug Serverless Applications

## The Problem

A startup builds its API on AWS Lambda with the Serverless Framework. Deployments take 8 minutes because every change goes through a full CloudFormation update. Cold starts add 3-4 seconds to the first request after idle periods, frustrating users. When a function times out, the only debugging tool is CloudWatch Logs, which requires navigating a maze of log groups. One function that processes image uploads regularly hits the 15-minute Lambda timeout and needs to move to a container, but the team does not want to manage infrastructure.

## The Solution

Using the **sst** skill to replace the Serverless Framework with SST for faster deployments and live Lambda debugging, the **serverless-debugger** skill to diagnose cold starts, timeouts, and memory issues, and the **railway-deploy** skill to run the image processing workload as a long-running container worker without managing servers.

## Step-by-Step Walkthrough

### 1. Migrate to SST for faster development

Replace the Serverless Framework with SST for incremental deploys and live debugging.

> Migrate our 12-function Serverless Framework project to SST (v3 or later, `npm install sst`, not the old v2 constructs). Preserve the existing API Gateway routes, DynamoDB tables, and S3 buckets. Set up SST's live Lambda development so I can test functions locally against real AWS resources without deploying. Configure the production stage to use us-east-1 with custom domain api.ourapp.com.

SST v3 is built on Pulumi and Terraform providers instead of CloudFormation, and `sst dev` runs your function code on your machine against the real AWS resources, so most edits need no deploy at all. Check what a production deploy would change with `npx sst diff --stage production`, then run `npx sst deploy --stage production`. Pass `--stage` explicitly in CI, and set `removal: "retain"` and `protect: true` for production in `sst.config.ts` so a `sst remove` cannot delete data. The `sst` skill has the full config for routes, tables and linked resources.

### 2. Debug cold starts and optimize function performance

Identify and fix the sources of cold start latency.

> Our Lambda functions have 3-4 second cold starts. Analyze the cold start breakdown for our top 5 most-invoked functions. Show me how much time goes to runtime init, dependency loading, and handler initialization. Recommend specific fixes: which functions should use provisioned concurrency, which need dependency pruning, and which are loading unused modules.

The debugger produces a detailed cold start breakdown for each function:

```text
COLD START ANALYSIS — Top 5 Functions
======================================

Function: create-order (Node.js 22)
  Total cold start:         3,412ms
  ├─ Runtime init:            312ms
  ├─ Dependency loading:    2,148ms
  │   ├─ aws-sdk (full):    1,680ms  ← ISSUE: loads all 300+ service clients
  │   ├─ pg (postgres):       284ms
  │   └─ zod + utils:        184ms
  ├─ Handler init:            952ms
  │   └─ DB connection pool:  810ms  ← ISSUE: pool created inside handler
  └─ Recommended fixes:
      1. Replace aws-sdk v2 (end of support Sept 2025) with modular v3 clients, e.g. @aws-sdk/client-s3
      2. Move pg pool to module scope (saves ~800ms)
      3. Expected cold start after fixes: ~410ms

Function: process-payment (Node.js 22)
  Total cold start:         2,890ms
  ...
```

The numbers above are illustrative output, not a benchmark: real figures come from the `Init Duration` field of your own `REPORT` log lines. The pattern is typical: most of the cold start is the full AWS SDK v2 being loaded instead of the few v3 clients needed, plus a connection pool created inside the handler instead of at module scope. Bundling with esbuild and moving initialization out of the handler usually cuts the largest share; keep provisioned concurrency for the few latency-critical functions, since it costs money. Since August 2025 the init phase is also billed for on-demand functions, so slow cold starts show up on the invoice.

### 3. Move the image processor to Railway

Deploy the long-running image processing service as a container on Railway.

> Our image-upload-processor Lambda function regularly hits the 15-minute timeout when processing batches of 50+ high-resolution images. Move it to Railway as a Docker container. Set up an SQS queue (defined in `sst.config.ts` with `sst.aws.Queue`) so the Lambda API endpoint enqueues jobs and a Railway worker long-polls the queue and processes them asynchronously.

The worker runs as a container on Railway with no function-style timeout. Create the service and give it an AWS access key limited to that one queue (`sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility`):

```console
$ railway add --service image-worker --repo your-org/image-worker
$ echo "$AWS_SECRET_ACCESS_KEY" | railway variable set AWS_SECRET_ACCESS_KEY --stdin --service image-worker
$ railway variable set AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" QUEUE_URL="$QUEUE_URL" --service image-worker
$ railway logs --service image-worker
```

Set the SQS visibility timeout longer than the longest batch so a message is not redelivered while still being processed, and give the queue a dead-letter queue. Railway does not autoscale on queue depth: you set the replica count yourself (`railway scale --service image-worker us-east=2`), and a worker that polls SQS sends outbound traffic, so Serverless sleeping never puts it to sleep. Expect it to run, and bill, continuously. The Lambda API function returns as soon as the message is enqueued, so the endpoint no longer waits for image work.

### 4. Set up monitoring and alerting for both platforms

Create unified monitoring across Lambda and Railway services.

> Set up CloudWatch alarms for our SST Lambda functions and the SQS queue. Alarm when the Lambda `Errors` rate exceeds 1% of `Invocations`, when `Duration` p95 approaches the function timeout, and when the queue's `ApproximateAgeOfOldestMessage` or `ApproximateNumberOfMessagesVisible` stays high for more than 5 minutes (a sign the Railway worker is down or too slow). Show me how to read the Railway worker's logs and CPU/memory.

The queue metrics live in AWS, so one set of alarms covers both sides: Lambda errors on the API, and a backed-up queue when the worker stops consuming. Worker logs and resource usage stay in Railway (`railway logs --service image-worker` and the service's metrics tab).

When deciding what stays on Lambda, the limits decide: a function that needs more than 15 minutes, a persistent connection, or a heavy native toolchain belongs in a container. Short, bursty request handlers stay on Lambda.

## Real-World Example

Liam's startup processes 15,000 API requests per day across 12 Lambda functions and handles 500 image upload batches weekly. After migrating to SST, developers iterate with `sst dev` instead of waiting for deploys, and the team's own measurements show first-request latency falling from about 3.4 seconds to well under a second after the bundling and initialization fixes. The image processor moves to Railway and handles 50-image batches in 25 minutes instead of timing out at 15. The worker runs all the time, so the team accepts a small fixed monthly cost for it in exchange for no timeouts.

## Related Skills

- **sst**: replaces the Serverless Framework setup and provides live Lambda development and staged deploys.
- **serverless-debugger**: breaks down cold starts, timeouts and memory problems from the Lambda logs.
- **railway-deploy**: creates and operates the container worker that takes over the long-running job.
