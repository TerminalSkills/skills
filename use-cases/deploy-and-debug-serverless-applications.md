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

A startup builds its API on AWS Lambda with the Serverless Framework. Deployments take 8 minutes because CloudFormation diffs the entire stack. Cold starts add 3-4 seconds to the first request after idle periods, frustrating users. When a function times out, the only debugging tool is CloudWatch Logs, which requires navigating a maze of log groups. One function that processes image uploads regularly hits the 15-minute Lambda timeout and needs to move to a container, but the team does not want to manage infrastructure.

## The Solution

Using the **sst** skill to replace the Serverless Framework with SST for faster deployments and live Lambda debugging, the **serverless-debugger** skill to diagnose cold starts, timeouts, and memory issues, and the **railway-deploy** skill to run the image processing workload as a container without managing servers.

## Step-by-Step Walkthrough

### 1. Migrate to SST for faster development

Replace the Serverless Framework with SST for incremental deploys and live debugging.

> Migrate our 12-function Serverless Framework project to SST v3. Preserve the existing API Gateway routes, DynamoDB tables, and S3 buckets. Set up SST's live Lambda development so I can test functions locally against real AWS resources without deploying. Configure the production stage to use us-east-1 with custom domain api.ourapp.com.

SST's incremental deploy takes 8 seconds instead of 8 minutes because it updates only the changed functions rather than diffing the entire CloudFormation stack. Live Lambda development connects local code to real AWS resources, so the developer can set breakpoints and inspect variables without deploying.

### 2. Debug cold starts and optimize function performance

Identify and fix the sources of cold start latency.

> Our Lambda functions have 3-4 second cold starts. Analyze the cold start breakdown for our top 5 most-invoked functions. Show me how much time goes to runtime init, dependency loading, and handler initialization. Recommend specific fixes: which functions should use provisioned concurrency, which need dependency pruning, and which are loading unused modules.

The debugger reveals that 2.1 seconds of the 3.4-second cold start comes from loading the full AWS SDK v2 instead of importing only the needed clients. Another 800ms comes from initializing a database connection pool inside the handler instead of outside it. After fixes, cold starts drop to 400ms without provisioned concurrency.

### 3. Move the image processor to Railway

Deploy the long-running image processing service as a container on Railway.

> Our image-upload-processor Lambda function regularly hits the 15-minute timeout when processing batches of 50+ high-resolution images. Move it to Railway as a Docker container. Set up an SQS queue so the Lambda API endpoint enqueues jobs and the Railway service processes them asynchronously. Configure Railway autoscaling from 0 to 3 instances based on queue depth.

The image processor runs as a container on Railway with no timeout limit. It pulls jobs from SQS, processes each batch in 20-40 minutes, and scales to zero when the queue is empty. The Lambda function returns immediately after enqueuing, so the API response time drops from timeout-prone to under 100ms.

### 4. Set up monitoring and alerting for both platforms

Create unified monitoring across Lambda and Railway services.

> Set up monitoring that covers both our SST Lambda functions and the Railway container service. Track invocation count, error rate, duration p95, and cold start percentage for Lambda. Track CPU, memory, and queue depth for Railway. Alert when Lambda error rate exceeds 1% or Railway queue depth exceeds 100 items for more than 5 minutes.

The unified dashboard shows the health of the entire system -- serverless functions handling API traffic and the Railway container processing background jobs. The team sees both platforms in one view instead of switching between AWS Console and Railway dashboard.

## Real-World Example

Liam's startup processes 15,000 API requests per day across 12 Lambda functions and handles 500 image upload batches weekly. After migrating to SST, deploy times drop from 8 minutes to 8 seconds, letting developers iterate 60 times faster. Cold start fixes reduce first-request latency from 3.4 seconds to 400ms. The image processor moves to Railway and handles 50-image batches in 25 minutes instead of timing out at 15. Monthly compute cost stays flat because Railway scales to zero between batches and Lambda pricing remains per-invocation.
