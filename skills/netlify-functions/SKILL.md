---
name: "netlify-functions"
description: "Create serverless functions on Netlify with edge functions, scheduled functions, and JAMstack integration"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "serverless"
  tags: ["netlify", "functions", "serverless", "jamstack", "edge"]
---

# Netlify Functions

Create serverless functions on Netlify with support for edge functions, form handling, and seamless JAMstack integration.

## Overview

Netlify Functions provide:

- **Serverless functions** powered by AWS Lambda
- **Edge Functions** running on Deno at the edge
- **Form handling** and submissions processing
- **Built-in authentication** integration

## Instructions

### Step 1: Setup

```bash
mkdir netlify-app && cd netlify-app
npm init -y
mkdir -p netlify/functions netlify/edge-functions
```

### Step 2: Serverless Function

```javascript
// netlify/functions/hello.js
exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Hello from Netlify Functions!',
      method: event.httpMethod
    })
  };
};
```

### Step 3: Edge Function

```typescript
// netlify/edge-functions/geo.ts
import type { Context } from "https://edge.netlify.com/";

export default async (request: Request, context: Context) => {
  const country = context.geo?.country?.code || 'Unknown';
  
  return new Response(JSON.stringify({
    country,
    message: `Hello from ${country}!`
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

### Step 4: Deploy

```bash
netlify init
netlify deploy
netlify deploy --prod
```

## Guidelines

- **Handle CORS properly** for client-side API requests
- **Implement rate limiting** to prevent abuse
- **Use environment variables** for sensitive configuration