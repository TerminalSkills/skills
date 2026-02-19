---
title: Deploy a Serverless API with AWS CDK
slug: deploy-serverless-api-with-aws-cdk
description: Build and deploy a production serverless API using AWS CDK — Lambda functions, API Gateway, DynamoDB, SQS queues, and CloudFront CDN, all defined as TypeScript with unit tests and a self-mutating CI/CD pipeline.
skills:
  - aws-cdk
  - serverless-framework
  - github-actions
category: Cloud Infrastructure
tags:
  - aws
  - serverless
  - cdk
  - lambda
  - infrastructure-as-code
---

# Deploy a Serverless API with AWS CDK

Zara is building a SaaS API for document processing. She estimated $2,000/month for always-on EC2 instances, but her traffic is bursty — heavy during business hours, near-zero at night and weekends. With serverless, she pays only for actual requests. She wants type-safe infrastructure defined in TypeScript, tested like application code, and deployed through a pipeline that updates itself.

## Step 1 — Define the API Stack

CDK lets you define AWS resources as TypeScript classes. The IDE provides autocomplete for every property, and the compiler catches typos that would be silent errors in YAML.

```typescript
// lib/api-stack.ts — Core API infrastructure.
// Defines Lambda functions, API Gateway, DynamoDB, and SQS.
// CDK generates least-privilege IAM policies via grant* methods.

import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as eventsources from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import path from "path";

interface ApiStackProps extends cdk.StackProps {
  stage: string;
}

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // --- DynamoDB Table ---
    // On-demand billing: pay per request, no capacity planning
    // Point-in-time recovery enabled for production data safety
    const documentsTable = new dynamodb.Table(this, "DocumentsTable", {
      tableName: `docproc-${stage}-documents`,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === "prod",
      removalPolicy: stage === "prod"
        ? cdk.RemovalPolicy.RETAIN       // Never delete production data
        : cdk.RemovalPolicy.DESTROY,     // Clean up dev environments
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,  // For change events
    });

    // GSI for querying by user
    documentsTable.addGlobalSecondaryIndex({
      indexName: "gsi-user",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });

    // --- SQS Queue for async document processing ---
    const dlq = new sqs.Queue(this, "ProcessingDLQ", {
      queueName: `docproc-${stage}-dlq`,
      retentionPeriod: cdk.Duration.days(14),  // Keep failed messages for debugging
    });

    const processingQueue = new sqs.Queue(this, "ProcessingQueue", {
      queueName: `docproc-${stage}-processing`,
      visibilityTimeout: cdk.Duration.minutes(5),  // Must exceed Lambda timeout
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,  // After 3 failures, move to DLQ
      },
    });

    // --- Shared Lambda configuration ---
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,  // 20% cheaper than x86
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        TABLE_NAME: documentsTable.tableName,
        QUEUE_URL: processingQueue.queueUrl,
        STAGE: stage,
        NODE_OPTIONS: "--enable-source-maps",
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ["@aws-sdk/*"],  // AWS SDK v3 is in Lambda runtime
      },
    };

    // --- API Lambda functions ---
    const createDocumentFn = new NodejsFunction(this, "CreateDocumentFn", {
      ...commonLambdaProps,
      entry: path.join(__dirname, "../src/handlers/create-document.ts"),
      functionName: `docproc-${stage}-create-document`,
    });

    const getDocumentFn = new NodejsFunction(this, "GetDocumentFn", {
      ...commonLambdaProps,
      entry: path.join(__dirname, "../src/handlers/get-document.ts"),
      functionName: `docproc-${stage}-get-document`,
      memorySize: 128,    // Read-only, needs less memory
      timeout: cdk.Duration.seconds(10),
    });

    const listDocumentsFn = new NodejsFunction(this, "ListDocumentsFn", {
      ...commonLambdaProps,
      entry: path.join(__dirname, "../src/handlers/list-documents.ts"),
      functionName: `docproc-${stage}-list-documents`,
    });

    // --- Async processor (triggered by SQS) ---
    const processorFn = new NodejsFunction(this, "ProcessorFn", {
      ...commonLambdaProps,
      entry: path.join(__dirname, "../src/handlers/process-document.ts"),
      functionName: `docproc-${stage}-processor`,
      memorySize: 1024,    // Processing needs more memory
      timeout: cdk.Duration.minutes(4),
    });

    // --- Permissions (CDK generates least-privilege IAM) ---
    documentsTable.grantReadWriteData(createDocumentFn);
    documentsTable.grantReadData(getDocumentFn);
    documentsTable.grantReadData(listDocumentsFn);
    documentsTable.grantReadWriteData(processorFn);
    processingQueue.grantSendMessages(createDocumentFn);

    // SQS triggers the processor Lambda
    processorFn.addEventSource(new eventsources.SqsEventSource(processingQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
    }));

    // --- HTTP API (API Gateway v2) ---
    const api = new apigateway.HttpApi(this, "HttpApi", {
      apiName: `docproc-${stage}`,
      corsPreflight: {
        allowOrigins: stage === "prod"
          ? ["https://docproc.app"]
          : ["http://localhost:3000"],
        allowMethods: [
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
        ],
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });

    api.addRoutes({
      path: "/documents",
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("CreateDoc", createDocumentFn),
    });

    api.addRoutes({
      path: "/documents/{id}",
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("GetDoc", getDocumentFn),
    });

    api.addRoutes({
      path: "/documents",
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("ListDocs", listDocumentsFn),
    });

    // --- Outputs ---
    this.apiUrl = new cdk.CfnOutput(this, "ApiUrl", {
      value: api.apiEndpoint,
      description: "API Gateway endpoint URL",
    });
  }
}
```

## Step 2 — Write a Lambda Handler

```typescript
// src/handlers/create-document.ts — Create document endpoint.
// Validates input, stores in DynamoDB, sends to SQS for async processing.
// Returns immediately — heavy processing happens in the background.

import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from "crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

interface CreateDocumentRequest {
  title: string;
  content: string;
  type: "invoice" | "contract" | "report";
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body: CreateDocumentRequest = JSON.parse(event.body || "{}");

    // Validate input
    if (!body.title || !body.content || !body.type) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields: title, content, type",
        }),
      };
    }

    const userId = event.requestContext.authorizer?.jwt?.claims?.sub || "anonymous";
    const documentId = randomUUID();
    const now = new Date().toISOString();

    // Store document in DynamoDB
    const item = {
      pk: `DOC#${documentId}`,
      sk: `META`,
      id: documentId,
      userId,
      title: body.title,
      content: body.content,
      type: body.type,
      status: "pending",           // Will be updated by processor
      createdAt: now,
      updatedAt: now,
    };

    await ddb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: item,
    }));

    // Send to processing queue (async — returns immediately to client)
    await sqs.send(new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify({
        documentId,
        type: body.type,
        action: "process",
      }),
      MessageGroupId: userId,      // FIFO ordering per user (if FIFO queue)
    }));

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: documentId,
        status: "pending",
        message: "Document created and queued for processing",
      }),
    };
  } catch (error: any) {
    console.error("Create document failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
```

## Step 3 — Test the Infrastructure

```typescript
// test/api-stack.test.ts — CDK infrastructure unit tests.
// Verify resources are created with correct properties.
// Catches misconfigurations before deployment.

import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ApiStack } from "../lib/api-stack";

describe("ApiStack", () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new ApiStack(app, "TestStack", {
      stage: "test",
      env: { account: "123456789012", region: "us-east-1" },
    });
    template = Template.fromStack(stack);
  });

  test("creates DynamoDB table with on-demand billing", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
    });
  });

  test("creates SQS queue with dead letter queue", () => {
    template.hasResourceProperties("AWS::SQS::Queue", {
      RedrivePolicy: Match.objectLike({
        maxReceiveCount: 3,
      }),
    });
  });

  test("Lambda functions use ARM64 architecture", () => {
    template.allResourcesProperties("AWS::Lambda::Function", {
      Architectures: ["arm64"],
    });
  });

  test("creates HTTP API with CORS", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: Match.objectLike({
        AllowMethods: Match.anyValue(),
        AllowOrigins: Match.anyValue(),
      }),
    });
  });

  test("processor Lambda has SQS event source", () => {
    template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
      BatchSize: 5,
    });
  });

  test("creates exactly 4 Lambda functions", () => {
    template.resourceCountIs("AWS::Lambda::Function", 4);
  });
});
```

## Step 4 — Self-Mutating CI/CD Pipeline

```typescript
// lib/pipeline-stack.ts — CDK Pipeline that deploys itself.
// When you push changes to the pipeline definition, it updates itself
// first, then deploys the updated application stacks.

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  CodePipeline,
  CodePipelineSource,
  ShellStep,
} from "aws-cdk-lib/pipelines";
import { ApiStack } from "./api-stack";

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, "Pipeline", {
      pipelineName: "docproc-pipeline",
      synth: new ShellStep("Synth", {
        input: CodePipelineSource.gitHub("zara-dev/docproc", "main", {
          authentication: cdk.SecretValue.secretsManager("github-token"),
        }),
        commands: [
          "npm ci",
          "npm run build",
          "npm test",
          "npx cdk synth",
        ],
      }),
    });

    // Staging environment
    const staging = new ApiStage(this, "Staging", { stage: "staging" });
    pipeline.addStage(staging, {
      post: [
        new ShellStep("IntegrationTests", {
          envFromCfnOutputs: { API_URL: staging.apiUrl },
          commands: [
            "npm ci",
            "npm run test:integration",
          ],
        }),
      ],
    });

    // Production (with manual approval)
    const prod = new ApiStage(this, "Production", { stage: "prod" });
    pipeline.addStage(prod, {
      pre: [new cdk.pipelines.ManualApprovalStep("PromoteToProd")],
    });
  }
}

class ApiStage extends cdk.Stage {
  public readonly apiUrl: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props: { stage: string } & cdk.StageProps) {
    super(scope, id, props);

    const api = new ApiStack(this, "Api", {
      stage: props.stage,
    });

    this.apiUrl = api.apiUrl;
  }
}
```

## Results

Zara deployed the serverless API and ran it for three months:

- **Monthly cost: $2,000 (estimated EC2) → $127** — Lambda charges per request, DynamoDB charges per read/write. At 500K requests/month, the serverless architecture costs 94% less than always-on servers.
- **Auto-scaling: 0 to 10,000 concurrent in 2 seconds** — Lambda scales automatically. During a product launch that generated 50x normal traffic, the API handled it without any configuration changes or alerts.
- **Zero downtime deployments** — CDK Pipeline deploys to staging, runs integration tests, and promotes to production with a manual approval gate. No maintenance windows.
- **Infrastructure as tested code**: 12 unit tests catch misconfigurations before deployment. A developer accidentally removed the DLQ — the test suite caught it in CI before it reached staging.
- **Self-mutating pipeline**: when Zara added a new Lambda function, she added it to the CDK stack, pushed to main, and the pipeline updated itself to include the new function. No manual pipeline editing.
- **ARM64 Lambda: 20% cost reduction** — switching from x86 to Graviton processors reduces per-request cost with identical performance for Node.js workloads.
