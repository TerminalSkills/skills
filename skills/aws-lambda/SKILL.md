---
name: aws-lambda
description: >-
  AWS Lambda runs your code on demand without servers, scaling from zero to
  thousands of concurrent executions and billing per invocation. Use this skill
  to build Lambda functions in Node.js or Python behind API Gateway, S3, SQS or
  DynamoDB triggers, define them with AWS SAM, deploy and test them locally, or
  when asked about "serverless function", "Lambda handler", "SAM template",
  "cold start" or "Lambda runtime deprecation".
license: Apache-2.0
compatibility: "AWS account and credentials; AWS CLI v2; AWS SAM CLI 1.x (Python 3.10+); Node.js 22/24 or Python 3.12-3.14 for local builds"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - serverless
    - aws
    - functions
    - api-gateway
    - event-driven
  repository: https://github.com/aws/aws-sam-cli
---

# AWS Lambda — Serverless Functions

## Overview

AWS Lambda runs a function in response to an event: an HTTP request through API Gateway or a Function URL, an S3 upload, an SQS message, a DynamoDB stream record or a schedule. You deploy code, Lambda provisions and scales the execution environments, and you pay per request and per millisecond of duration. AWS SAM (Serverless Application Model) is the usual way to describe and deploy functions as CloudFormation.

Check the runtime identifier before you write a template: AWS retires runtimes on a published schedule (Node.js 20 and older are already deprecated; see the Lambda runtimes page). As of October 2026 use `nodejs22.x` or `nodejs24.x`, `python3.12` to `python3.14`, `java21` or `java25`, `dotnet10`. Go and Rust run on the `provided.al2023` OS-only runtime.

## Instructions

### Function handlers

The handler below is for an HTTP API (API Gateway payload format 2.0): the method is in `event.requestContext.http.method`, not `event.httpMethod`. The AWS SDK for JavaScript v3 is bundled in the Node.js 22+ runtimes, so the DynamoDB client needs no packaging.

```typescript
// src/handler.ts: HTTP API (payload 2.0) -> DynamoDB
import { randomUUID } from "node:crypto";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));  // created once per execution environment
const TableName = process.env.TABLE_NAME!;

const json = (statusCode: number, data: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    switch (event.requestContext.http.method) {
      case "GET": {
        const id = event.pathParameters?.id;
        if (id) {
          const { Item } = await db.send(new GetCommand({ TableName, Key: { id } }));
          return Item ? json(200, Item) : json(404, { error: "Not found" });
        }
        const { Items } = await db.send(new ScanCommand({ TableName, Limit: 50 }));
        return json(200, Items ?? []);
      }
      case "POST": {
        const data = JSON.parse(event.body ?? "{}");
        const id = randomUUID();
        await db.send(new PutCommand({ TableName, Item: { id, ...data } }));
        return json(201, { id });
      }
      default:
        return json(405, { error: "Method not allowed" });
    }
  } catch (error) {
    console.error(error);
    return json(500, { error: "Internal error" });
  }
};
```

Build it with esbuild (SAM does this for you when the template sets `Metadata: BuildMethod: esbuild`, see below). Install types with `npm i -D @types/aws-lambda esbuild typescript`.

```python
# handler.py: S3 event trigger (Python)
import io
from urllib.parse import unquote_plus

import boto3
from PIL import Image  # not in the runtime: list Pillow in requirements.txt

s3 = boto3.client("s3")

def handler(event, context):
    """Create a 300px JPEG thumbnail for each object uploaded under uploads/."""
    for record in event["Records"]:
        bucket = record["s3"]["bucket"]["name"]
        key = unquote_plus(record["s3"]["object"]["key"])  # S3 URL-encodes keys in events

        original = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        image = Image.open(io.BytesIO(original)).convert("RGB")
        image.thumbnail((300, 300))
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=85)

        s3.put_object(
            Bucket=bucket,
            Key=key.replace("uploads/", "thumbnails/", 1),
            Body=buffer.getvalue(),
            ContentType="image/jpeg",
        )
    return {"processed": len(event["Records"])}
```

### Infrastructure as Code (SAM)

```yaml
# template.yaml: AWS SAM template
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: nodejs24.x
    Architectures: [arm64]
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables:
        TABLE_NAME: !Ref UsersTable

Resources:
  ApiFunction:
    Type: AWS::Serverless::Function
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: es2022
        EntryPoints: [src/handler.ts]
    Properties:
      Handler: handler.handler
      CodeUri: .
      Events:
        ListUsers:
          Type: HttpApi
          Properties: { Path: /users, Method: get }
        GetUser:
          Type: HttpApi
          Properties: { Path: "/users/{id}", Method: get }
        CreateUser:
          Type: HttpApi
          Properties: { Path: /users, Method: post }
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref UsersTable

  ImageProcessor:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: python3.13
      Handler: handler.handler
      CodeUri: image_processor/      # handler.py + requirements.txt (Pillow)
      MemorySize: 1024
      Timeout: 60
      Events:
        S3Upload:
          Type: S3
          Properties:
            Bucket: !Ref UploadsBucket
            Events: s3:ObjectCreated:*
            Filter:
              S3Key:
                Rules:
                  - Name: prefix
                    Value: uploads/
      Policies:
        - S3CrudPolicy:
            BucketName: !Ref UploadsBucket

  UsersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: id
          AttributeType: S
      KeySchema:
        - AttributeName: id
          KeyType: HASH

  UploadsBucket:
    Type: AWS::S3::Bucket

Outputs:
  ApiUrl:
    Value: !Sub "https://${ServerlessHttpApi}.execute-api.${AWS::Region}.amazonaws.com"
```

The S3 trigger and bucket are in the same template on purpose: SAM can only wire an S3 event to a bucket defined in the same stack. The `S3CrudPolicy` also lets the function write `thumbnails/`, which does not match the `uploads/` filter, so it does not retrigger itself.

```bash
sam build                                  # esbuild for Node, pip install for Python
sam deploy --guided                        # first time; saves samconfig.toml
sam deploy                                 # later deploys
sam local invoke ImageProcessor --event events/s3-put.json   # needs Docker
sam local start-api                        # local HTTP API, needs Docker
sam logs --tail --name ApiFunction --stack-name users-api
```

### Installation

```bash
pip install aws-sam-cli        # or: brew install aws-sam-cli
sam --version
aws configure sso              # or set AWS_PROFILE to an existing profile
```

## Examples

### Example 1: "Put a tiny users API on Lambda"

Save the Node handler and template above, then run `sam build && sam deploy --guided` (stack name `users-api`, region `eu-west-1`). The deploy output prints the `ApiUrl` value from the template's `Outputs`; set `API_URL` to it and test with:

```console
$ curl -s -X POST "$API_URL/users" -d '{"name":"Maria Santos"}'
{"id":"6f1c2d9e-3b71-4d49-9a0e-0c8f4c2f5a11"}
$ curl -s "$API_URL/users/6f1c2d9e-3b71-4d49-9a0e-0c8f4c2f5a11"
{"id":"6f1c2d9e-3b71-4d49-9a0e-0c8f4c2f5a11","name":"Maria Santos"}
```

### Example 2: "Make thumbnails when someone uploads a photo"

Put `handler.py` and a `requirements.txt` containing `Pillow` in `image_processor/`, deploy, then upload `uploads/team.jpg` to the bucket. A 300px JPEG appears at `thumbnails/team.jpg` within a second or two; failures show in `sam logs --name ImageProcessor --stack-name users-api`.

## Guidelines

1. **Runtimes expire.** Pick a current identifier from the Lambda runtimes page and plan upgrades before the deprecation date; deprecated runtimes stop receiving patches and eventually cannot be updated.
2. **Cold starts.** Keep the bundle small, create SDK clients outside the handler, prefer `arm64`, and use provisioned concurrency or SnapStart (Java, Python, .NET) only for latency-sensitive paths.
3. **Config and secrets.** Plain settings go in environment variables; secrets belong in SSM Parameter Store or Secrets Manager, read at init, never committed to the template.
4. **Event payload shape depends on the trigger.** API Gateway REST APIs (SAM `Api` event) send payload 1.0 with `event.httpMethod`; HTTP APIs (`HttpApi`) and Function URLs send 2.0 with `event.requestContext.http.method`.
5. **Retries and failures.** Asynchronous invocations retry twice; configure an on-failure destination or a dead-letter queue. For SQS sources set a redrive policy on the queue and return partial batch failures (`batchItemFailures`) instead of failing a whole batch.
6. **Function URLs** give a function an HTTPS endpoint with no API Gateway and no extra charge beyond invocation cost. Use `AuthType: AWS_IAM` unless the endpoint is meant to be public.
7. **Least privilege.** Use the SAM policy templates (`DynamoDBCrudPolicy`, `S3ReadPolicy`) scoped to one resource; never `Resource: "*"`.
8. **Size limits.** A zip package is limited to 250 MB unzipped (use layers sparingly); use a container image (up to 10 GB) for large or native dependencies. Synchronous request and response payloads are limited to 6 MB.
9. **Tuning.** More memory also means more CPU; use the open-source AWS Lambda Power Tuning tool to find the cheapest setting.
10. **Not a fit** for work longer than 15 minutes, or for steady high-throughput load where a container service is cheaper.
