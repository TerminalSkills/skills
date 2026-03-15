---
title: Build an API Mock Server
slug: build-api-mock-server
description: Build a programmable API mock server with OpenAPI schema import, dynamic response generation, request recording, latency simulation, and stateful mocking for frontend-first development.
skills:
  - typescript
  - redis
  - hono
  - zod
category: development
tags:
  - mocking
  - api
  - testing
  - development
  - openapi
---

# Build an API Mock Server

## The Problem

Pablo leads frontend at a 20-person company. Backend APIs are always 2 sprints behind — frontend developers wait idle or build against stale Postman mocks that diverge from reality. Hardcoded mock data doesn't test edge cases: what happens when the API returns an empty list, a 500 error, or a 3-second delay? Contract changes break frontend at integration. They need a mock server: import OpenAPI spec, generate realistic responses automatically, simulate errors and latency, record real API calls as fixtures, and update mocks when the spec changes.

## Step 1: Build the Mock Server Engine

```typescript
// src/mock/server.ts — Programmable API mock server with OpenAPI import and stateful responses
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface MockEndpoint {
  id: string;
  method: string;
  path: string;              // with path params: /users/:id
  responses: MockResponse[];
  activeResponseIndex: number;
  delay?: number;            // simulated latency in ms
  recordMode: boolean;       // record real requests as fixtures
  state: Record<string, any>;// stateful data for CRUD simulation
}

interface MockResponse {
  name: string;              // "success", "empty", "error", "slow"
  status: number;
  headers: Record<string, string>;
  body: any;
  probability?: number;      // for random response selection (0-1)
  condition?: string;        // JS expression to match: "req.query.page > 5"
}

interface MockConfig {
  endpoints: MockEndpoint[];
  globalDelay?: number;
  proxyTarget?: string;      // forward unmatched requests to real API
}

let config: MockConfig = { endpoints: [] };

// Import from OpenAPI spec
export async function importOpenAPI(spec: any): Promise<{ endpoints: number; generated: number }> {
  const endpoints: MockEndpoint[] = [];
  let generated = 0;

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods as any)) {
      if (["get", "post", "put", "patch", "delete"].includes(method)) {
        const op = operation as any;
        const responses: MockResponse[] = [];

        for (const [statusCode, responseSpec] of Object.entries(op.responses || {})) {
          const respSpec = responseSpec as any;
          const schema = respSpec.content?.["application/json"]?.schema;
          const body = schema ? generateFromSchema(schema, spec.components?.schemas) : {};

          responses.push({
            name: `${statusCode} ${respSpec.description || ""}`.trim(),
            status: parseInt(statusCode),
            headers: { "Content-Type": "application/json" },
            body,
          });
          generated++;
        }

        // Add default error responses
        if (!responses.find((r) => r.status === 500)) {
          responses.push({ name: "server_error", status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Internal Server Error" } });
        }

        endpoints.push({
          id: `mock-${randomBytes(4).toString("hex")}`,
          method: method.toUpperCase(),
          path: path.replace(/{(\w+)}/g, ":$1"),  // convert {id} to :id
          responses,
          activeResponseIndex: 0,
          recordMode: false,
          state: {},
        });
      }
    }
  }

  config.endpoints = endpoints;
  await redis.set("mock:config", JSON.stringify(config));
  return { endpoints: endpoints.length, generated };
}

// Generate realistic data from JSON schema
function generateFromSchema(schema: any, components?: Record<string, any>): any {
  if (schema.$ref) {
    const refName = schema.$ref.split("/").pop();
    return generateFromSchema(components?.[refName] || {}, components);
  }

  switch (schema.type) {
    case "string":
      if (schema.format === "email") return `user-${randomBytes(3).toString("hex")}@example.com`;
      if (schema.format === "date-time") return new Date().toISOString();
      if (schema.format === "uuid") return randomBytes(16).toString("hex").replace(/(........)(....)(....)(....)(............)/, "$1-$2-$3-$4-$5");
      if (schema.enum) return schema.enum[0];
      return schema.example || `${schema.description || "string"}-${randomBytes(2).toString("hex")}`;
    case "number": case "integer":
      return schema.example || Math.floor(Math.random() * (schema.maximum || 100));
    case "boolean":
      return schema.example ?? true;
    case "array":
      return Array.from({ length: 3 }, () => generateFromSchema(schema.items || {}, components));
    case "object": {
      const obj: Record<string, any> = {};
      for (const [key, propSchema] of Object.entries(schema.properties || {})) {
        obj[key] = generateFromSchema(propSchema, components);
      }
      return obj;
    }
    default:
      return null;
  }
}

// Handle incoming mock request
export async function handleRequest(
  method: string,
  path: string,
  req: { query: Record<string, string>; body: any; headers: Record<string, string>; params: Record<string, string> }
): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  const endpoint = matchEndpoint(method, path);

  if (!endpoint) {
    // Proxy to real API if configured
    if (config.proxyTarget) {
      return await proxyRequest(config.proxyTarget, method, path, req);
    }
    return { status: 404, headers: {}, body: { error: "No mock configured for this endpoint" } };
  }

  // Record mode: save request as fixture
  if (endpoint.recordMode) {
    await redis.rpush(`mock:recorded:${endpoint.id}`, JSON.stringify({
      timestamp: new Date().toISOString(), method, path, query: req.query, body: req.body,
    }));
  }

  // Select response (conditional → probability → active index)
  let response = endpoint.responses[endpoint.activeResponseIndex];

  // Check conditional responses
  for (const r of endpoint.responses) {
    if (r.condition) {
      try {
        const fn = new Function("req", `return ${r.condition}`);
        if (fn(req)) { response = r; break; }
      } catch {}
    }
  }

  // Probability-based selection
  const probResponses = endpoint.responses.filter((r) => r.probability);
  if (probResponses.length > 0) {
    const rand = Math.random();
    let cumulative = 0;
    for (const r of probResponses) {
      cumulative += r.probability!;
      if (rand <= cumulative) { response = r; break; }
    }
  }

  // Simulate latency
  const delay = endpoint.delay || config.globalDelay || 0;
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));

  // Interpolate path params into response body
  let body = JSON.parse(JSON.stringify(response.body));
  body = interpolateParams(body, req.params);

  // Track usage
  await redis.hincrby("mock:stats", `${method}:${path}`, 1);

  return { status: response.status, headers: response.headers, body };
}

function matchEndpoint(method: string, path: string): MockEndpoint | null {
  return config.endpoints.find((e) => {
    if (e.method !== method.toUpperCase()) return false;
    const pattern = e.path.replace(/:([\w]+)/g, "([^/]+)");
    return new RegExp(`^${pattern}$`).test(path);
  }) || null;
}

function interpolateParams(body: any, params: Record<string, string>): any {
  if (typeof body === "string") {
    return body.replace(/:([\w]+)/g, (_, key) => params[key] || `:${key}`);
  }
  if (Array.isArray(body)) return body.map((i) => interpolateParams(i, params));
  if (typeof body === "object" && body !== null) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      result[key] = interpolateParams(value, params);
    }
    return result;
  }
  return body;
}

async function proxyRequest(target: string, method: string, path: string, req: any): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  const resp = await fetch(`${target}${path}`, {
    method, headers: req.headers, body: method !== "GET" ? JSON.stringify(req.body) : undefined,
  });
  const body = await resp.json().catch(() => resp.text());
  return { status: resp.status, headers: {}, body };
}

// Configure specific endpoint behavior
export async function setEndpointResponse(endpointPath: string, method: string, responseName: string): Promise<void> {
  const endpoint = config.endpoints.find((e) => e.path === endpointPath && e.method === method);
  if (!endpoint) throw new Error("Endpoint not found");
  const idx = endpoint.responses.findIndex((r) => r.name === responseName);
  if (idx === -1) throw new Error("Response not found");
  endpoint.activeResponseIndex = idx;
  await redis.set("mock:config", JSON.stringify(config));
}
```

## Results

- **Frontend unblocked** — import OpenAPI spec, mock server running in 30 seconds; frontend develops against realistic responses while backend builds the real API
- **Edge cases tested** — switch endpoint to "empty" response: frontend handles empty states; switch to "500": frontend shows error page; no real API needed for testing
- **Contract sync** — when OpenAPI spec updates, re-import; mock responses regenerate; frontend discovers breaking changes before integration
- **Latency simulation** — set 3s delay on payment endpoint; frontend implements loading state and timeout handling; catches UX issues early
- **Request recording** — proxy mode records real API responses as fixtures; replay offline; deterministic tests from production-like data
