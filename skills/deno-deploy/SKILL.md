---
name: "deno-deploy"
description: "Deploy serverless applications to Deno's global edge network with TypeScript-first development"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "serverless"
  tags: ["deno", "deploy", "edge", "typescript", "serverless"]
---

# Deno Deploy

Deploy serverless applications to Deno's global edge network with native TypeScript support, Web APIs, and instant global distribution.

## Overview

Deno Deploy provides:

- **Native TypeScript** execution without compilation
- **Web API compatibility** with standard browser APIs
- **Global edge distribution** across 34+ regions worldwide
- **KV storage** for edge data persistence

## Instructions

### Step 1: Basic Server

```typescript
// main.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  if (url.pathname === "/") {
    return new Response(JSON.stringify({
      message: "Hello from Deno Deploy!",
      timestamp: new Date().toISOString(),
      region: Deno.env.get("DENO_REGION") || "unknown"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  
  return new Response("Not Found", { status: 404 });
}

serve(handler);
```

### Step 2: KV Storage

```typescript
// kv-example.ts
const kv = await Deno.openKv();

export async function handleRequest(req: Request) {
  const url = new URL(req.url);
  
  if (req.method === "POST" && url.pathname === "/data") {
    const data = await req.json();
    await kv.set(["data", Date.now()], data);
    return Response.json({ success: true });
  }
  
  if (req.method === "GET" && url.pathname === "/data") {
    const entries = [];
    for await (const entry of kv.list({ prefix: ["data"] })) {
      entries.push(entry.value);
    }
    return Response.json(entries);
  }
}
```

### Step 3: Deploy

```bash
# Deploy via GitHub integration or deployctl
deployctl deploy --project=my-app main.ts
```

## Guidelines

- **Use TypeScript natively** - No compilation step needed
- **Leverage Web APIs** - Use standard APIs that work in browsers
- **Use KV storage** for persistence