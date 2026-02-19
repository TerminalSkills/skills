---
name: aws-lambda
description: >-
  Build serverless functions with AWS Lambda. Use when a user asks to deploy
  serverless functions, run code without servers, build event-driven backends,
  create API endpoints with Lambda, process S3 events, handle SQS messages, or
  build serverless APIs with API Gateway. Covers function creation, triggers,
  layers, environment variables, and deployment.
license: Apache-2.0
compatibility: 'Node.js, Python, Go, Rust, Java, .NET'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: cloud
  tags:
    - aws
    - lambda
    - serverless
    - functions
    - api-gateway
---

# AWS Lambda

## Overview

AWS Lambda runs code without provisioning servers. You pay only for compute time consumed. This skill covers function creation, API Gateway integration, event triggers (S3, SQS, DynamoDB, CloudWatch), layers, environment variables, and deployment with AWS CLI and SAM.

## Instructions

### Step 1: Create a Function

```javascript
// handler.js — Lambda function handler
// Receives events from API Gateway, S3, SQS, etc.

export const handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event))

  // API Gateway event
  if (event.httpMethod) {
    const body = JSON.parse(event.body || '{}')
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello', data: body }),
    }
  }

  // S3 event
  if (event.Records?.[0]?.eventSource === 'aws:s3') {
    const bucket = event.Records[0].s3.bucket.name
    const key = event.Records[0].s3.object.key
    console.log(`New file: s3://${bucket}/${key}`)
  }

  return { statusCode: 200 }
}
```

### Step 2: Deploy with AWS CLI

```bash
# Package and deploy
zip function.zip handler.js
aws lambda create-function \
  --function-name my-function \
  --runtime nodejs20.x \
  --handler handler.handler \
  --role arn:aws:iam::123456789:role/lambda-role \
  --zip-file fileb://function.zip

# Update function code
aws lambda update-function-code \
  --function-name my-function \
  --zip-file fileb://function.zip

# Add API Gateway trigger
aws apigatewayv2 create-api \
  --name my-api \
  --protocol-type HTTP \
  --target arn:aws:lambda:us-east-1:123456789:function:my-function
```

### Step 3: SAM (Serverless Application Model)

```yaml
# template.yaml — SAM template for Lambda + API Gateway
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Timeout: 30
    Runtime: nodejs20.x
    MemorySize: 256

Resources:
  ApiFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: handler.handler
      CodeUri: ./src/
      Events:
        Api:
          Type: HttpApi
          Properties:
            Path: /api/{proxy+}
            Method: ANY
      Environment:
        Variables:
          TABLE_NAME: !Ref MyTable

  MyTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: my-table
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - { AttributeName: id, AttributeType: S }
      KeySchema:
        - { AttributeName: id, KeyType: HASH }
```

```bash
# Deploy with SAM
sam build
sam deploy --guided
```

### Step 4: Python Lambda

```python
# handler.py — Python Lambda with DynamoDB
import json
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('my-table')

def handler(event, context):
    if event.get('httpMethod') == 'GET':
        result = table.scan()
        return {
            'statusCode': 200,
            'body': json.dumps(result['Items']),
        }
    elif event.get('httpMethod') == 'POST':
        body = json.loads(event['body'])
        table.put_item(Item=body)
        return {'statusCode': 201, 'body': json.dumps({'created': True})}
```

## Guidelines

- Keep functions small and focused — one function per API endpoint or event handler.
- Use environment variables for configuration, never hardcode secrets.
- Cold starts add 100-500ms latency. Use provisioned concurrency for latency-sensitive functions.
- Set appropriate memory (128MB-10GB) — more memory also means more CPU. Benchmark to find the sweet spot.
- Use Lambda Layers for shared dependencies to reduce deployment package size.
- Default timeout is 3 seconds — increase for longer operations (max 15 minutes).
