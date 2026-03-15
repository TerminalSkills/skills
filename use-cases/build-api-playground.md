---
title: Build an API Playground
slug: build-api-playground
description: Build an interactive API playground where developers can explore endpoints, edit request parameters, see live responses, save and share snippets, and auto-generate code examples in multiple languages.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
  - nextjs
category: development
tags:
  - api
  - playground
  - documentation
  - developer-experience
  - interactive
---

# Build an API Playground

## The Problem

Rosa leads developer relations at a 30-person API company. Their docs have curl examples, but developers still spend 30 minutes figuring out authentication, headers, and request bodies. Support tickets are 60% "how do I call this endpoint?" They tried Swagger UI but it's clunky — no saved history, no code generation, no way to share a working request with a teammate. They need an interactive playground where developers can explore the API in the browser, see real responses, and copy working code.

## Step 1: Build the Playground Engine

```typescript
// src/playground/executor.ts — API playground with sandboxed execution and code generation
import { pool } from "../db";
import { Redis } from "ioredis";
import { z } from "zod";

const redis = new Redis(process.env.REDIS_URL!);

interface APIEndpoint {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description: string;
  parameters: EndpointParam[];
  requestBody: RequestBodySchema | null;
  responses: Record<string, ResponseSchema>;
  auth: "none" | "api_key" | "bearer" | "oauth2";
  rateLimit: { requests: number; window: string };
}

interface EndpointParam {
  name: string;
  in: "path" | "query" | "header";
  type: string;
  required: boolean;
  description: string;
  example: any;
  enum?: string[];
}

interface RequestBodySchema {
  contentType: string;
  schema: Record<string, any>;
  example: any;
}

interface ResponseSchema {
  description: string;
  example: any;
}

interface PlaygroundRequest {
  endpointId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: any;
  apiKey?: string;
}

interface PlaygroundResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  latencyMs: number;
  size: number;
}

interface SavedSnippet {
  id: string;
  name: string;
  request: PlaygroundRequest;
  response: PlaygroundResponse;
  createdBy: string;
  isPublic: boolean;
  shareUrl: string;
  createdAt: string;
}

// Execute playground request (proxied through our server for CORS)
export async function executeRequest(
  request: PlaygroundRequest,
  userId: string
): Promise<PlaygroundResponse> {
  // Rate limit playground usage
  const rateKey = `playground:rate:${userId}`;
  const count = await redis.incr(rateKey);
  await redis.expire(rateKey, 60);

  if (count > 30) {
    return { status: 429, statusText: "Too Many Requests", headers: {}, body: { error: "Playground rate limit: 30 requests/minute" }, latencyMs: 0, size: 0 };
  }

  // Build the actual API URL
  const baseUrl = process.env.API_BASE_URL!;
  let url = `${baseUrl}${request.path}`;

  // Apply query params
  const queryString = new URLSearchParams(request.queryParams).toString();
  if (queryString) url += `?${queryString}`;

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...request.headers,
  };

  // Apply auth
  if (request.apiKey) {
    headers["Authorization"] = `Bearer ${request.apiKey}`;
  }

  const start = Date.now();
  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      signal: AbortSignal.timeout(10000), // 10s timeout
    };

    if (request.body && ["POST", "PUT", "PATCH"].includes(request.method)) {
      fetchOptions.body = JSON.stringify(request.body);
    }

    const res = await fetch(url, fetchOptions);
    const responseBody = await res.json().catch(() => res.text());
    const latencyMs = Date.now() - start;

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { responseHeaders[k] = v; });

    const response: PlaygroundResponse = {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
      body: responseBody,
      latencyMs,
      size: JSON.stringify(responseBody).length,
    };

    // Save to history
    await redis.rpush(`playground:history:${userId}`, JSON.stringify({
      request, response, timestamp: new Date().toISOString(),
    }));
    await redis.ltrim(`playground:history:${userId}`, -50, -1);

    return response;
  } catch (err: any) {
    return {
      status: 0,
      statusText: "Error",
      headers: {},
      body: { error: err.message },
      latencyMs: Date.now() - start,
      size: 0,
    };
  }
}

// Generate code snippet in multiple languages
export function generateCodeSnippet(
  request: PlaygroundRequest,
  language: "curl" | "javascript" | "python" | "go" | "ruby" | "php"
): string {
  const baseUrl = process.env.API_BASE_URL!;
  let url = `${baseUrl}${request.path}`;
  const qs = new URLSearchParams(request.queryParams).toString();
  if (qs) url += `?${qs}`;

  switch (language) {
    case "curl": {
      let cmd = `curl -X ${request.method} '${url}'`;
      for (const [k, v] of Object.entries(request.headers)) {
        cmd += ` \\\n  -H '${k}: ${v}'`;
      }
      if (request.apiKey) cmd += ` \\\n  -H 'Authorization: Bearer ${request.apiKey}'`;
      if (request.body) cmd += ` \\\n  -d '${JSON.stringify(request.body, null, 2)}'`;
      return cmd;
    }

    case "javascript": {
      const opts: any = { method: request.method, headers: { ...request.headers } };
      if (request.apiKey) opts.headers["Authorization"] = `Bearer ${request.apiKey}`;
      if (request.body) opts.body = "JSON.stringify(body)";

      return `const body = ${JSON.stringify(request.body, null, 2)};

const response = await fetch("${url}", {
  method: "${request.method}",
  headers: ${JSON.stringify(opts.headers, null, 4)},${request.body ? '\n  body: JSON.stringify(body),' : ''}
});

const data = await response.json();
console.log(data);`;
    }

    case "python": {
      const headers = { ...request.headers };
      if (request.apiKey) headers["Authorization"] = `Bearer ${request.apiKey}`;

      return `import requests

response = requests.${request.method.toLowerCase()}(
    "${url}",
    headers=${JSON.stringify(headers, null, 4)},${request.body ? `\n    json=${JSON.stringify(request.body, null, 4)},` : ''}
)

print(response.json())`;
    }

    case "go": {
      return `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "io"
)

func main() {
    ${request.body ? `body, _ := json.Marshal(${JSON.stringify(request.body)})
    req, _ := http.NewRequest("${request.method}", "${url}", bytes.NewBuffer(body))` : `req, _ := http.NewRequest("${request.method}", "${url}", nil)`}
    ${request.apiKey ? `req.Header.Set("Authorization", "Bearer ${request.apiKey}")` : ''}
    req.Header.Set("Content-Type", "application/json")

    resp, _ := http.DefaultClient.Do(req)
    defer resp.Body.Close()
    data, _ := io.ReadAll(resp.Body)
    fmt.Println(string(data))
}`;
    }

    default:
      return `// Code generation for ${language} not implemented`;
  }
}

// Save and share a snippet
export async function saveSnippet(
  name: string,
  request: PlaygroundRequest,
  response: PlaygroundResponse,
  userId: string,
  isPublic: boolean
): Promise<SavedSnippet> {
  const id = `snip-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const snippet: SavedSnippet = {
    id, name, request, response,
    createdBy: userId, isPublic,
    shareUrl: `${process.env.APP_URL}/playground/s/${id}`,
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO playground_snippets (id, name, request, response, created_by, is_public, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [id, name, JSON.stringify(request), JSON.stringify(response), userId, isPublic]
  );

  return snippet;
}

// Get request history for a user
export async function getHistory(userId: string): Promise<Array<{
  request: PlaygroundRequest;
  response: PlaygroundResponse;
  timestamp: string;
}>> {
  const items = await redis.lrange(`playground:history:${userId}`, 0, -1);
  return items.map((item) => JSON.parse(item)).reverse();
}
```

## Results

- **Support tickets down 55%** — "how do I call this endpoint?" replaced by "click Try It, see it work"; developers are self-serve
- **Time to first API call: 30 min → 3 min** — prefilled examples with working auth; developers click "Send" and see the response immediately
- **Code snippets in 4 languages** — developer copies working Python/JS/curl/Go code directly; no more translating curl to their language manually
- **Shareable snippets** — developer gets a working request, saves it, shares the URL with their team; onboarding new team members takes minutes not hours
- **Request history** — developers don't re-enter parameters; last 50 requests saved; iterate faster on complex queries
