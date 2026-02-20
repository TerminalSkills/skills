---
name: "sst-v3"
description: "Build full-stack serverless applications with SST Ion, featuring type-safe infrastructure and live development"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "serverless"
  tags: ["sst", "serverless", "typescript", "fullstack", "infrastructure", "ion"]
---

# SST v3 (Ion)

Build full-stack serverless applications with SST Ion, featuring type-safe infrastructure as code, live development mode, and modern deployment patterns.

## Overview

SST Ion provides:

- **Type-safe infrastructure** using TypeScript for AWS resources
- **Live development** with instant feedback and hot reloading
- **Full-stack applications** with frontend and backend integration
- **Modern tooling** with Vite, Pulumi, and OpenNext

## Instructions

### Step 1: Setup

```bash
npx create-sst@latest my-sst-app
cd my-sst-app
npm install
```

### Step 2: Infrastructure

```typescript
// sst.config.ts
import { SSTConfig } from "sst";

export default {
  config(_input) {
    return {
      name: "my-sst-app",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(function API({ stack }) {
      const api = new sst.Api(stack, "api", {
        routes: {
          "GET /": "functions/lambda.handler",
        },
      });
      
      return {
        api: api.url,
      };
    });
  },
} satisfies SSTConfig;
```

### Step 3: Lambda Function

```typescript
// functions/lambda.ts
export const handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from SST!" }),
  };
};
```

### Step 4: Development

```bash
npm run dev  # Start live development
npm run deploy  # Deploy to AWS
```

## Guidelines

- **Use TypeScript** throughout for type safety
- **Leverage live mode** for rapid development
- **Structure stacks logically** - separate database, API, auth concerns
- **Secure your APIs** with proper authentication