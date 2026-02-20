---
name: "serverless-framework"
description: "Deploy and manage serverless applications across multiple cloud providers using the Serverless Framework"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "serverless"
  tags: ["serverless", "framework", "deployment", "aws", "azure", "gcp", "multi-cloud"]
---

# Serverless Framework

Deploy serverless applications across AWS, Azure, GCP with infrastructure as code, plugin ecosystem, and multi-environment management.

## Overview

The Serverless Framework provides:

- **Multi-cloud support** - Deploy to AWS, Azure, GCP, and other providers
- **Infrastructure as Code** - Define resources in YAML configuration
- **Plugin ecosystem** - Extend functionality with community plugins
- **Local development** - Offline testing and debugging

## Instructions

### Step 1: Installation

```bash
npm install -g serverless
serverless create --template aws-nodejs-typescript --path my-api
cd my-api && npm install
```

### Step 2: Service Configuration

```yaml
# serverless.yml
service: my-serverless-api
frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  stage: ${opt:stage, 'dev'}
  
functions:
  hello:
    handler: src/handler.hello
    events:
      - httpApi:
          path: /hello
          method: get
  
resources:
  Resources:
    UsersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:service}-${self:provider.stage}-users
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
```

### Step 3: Handler Implementation

```typescript
// src/handler.ts
import { APIGatewayProxyHandler } from 'aws-lambda';

export const hello: APIGatewayProxyHandler = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Hello from Serverless Framework!',
      timestamp: new Date().toISOString()
    })
  };
};
```

### Step 4: Deploy

```bash
# Deploy to dev
serverless deploy --stage dev

# Deploy to production
serverless deploy --stage production

# Remove stack
serverless remove --stage dev
```

## Guidelines

- **Use TypeScript** for better development experience and type safety
- **Environment separation** - Always use different stages for dev/staging/production
- **Resource naming** - Include stage name in resource names to avoid conflicts
- **Monitor costs** - Track invocation count, duration, and memory usage