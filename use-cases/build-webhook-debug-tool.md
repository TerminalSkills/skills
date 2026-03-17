---
title: Build a Webhook Debug Tool
slug: build-webhook-debug-tool
description: Build a webhook debug tool with temporary URL generation, request inspection, response mocking, replay functionality, and sharing for debugging webhook integrations.
skills:
  - redis
  - hono
  - zod
category: development
tags:
  - webhooks
  - debugging
  - testing
  - development
  - inspection
---

# Build a Webhook Debug Tool

## The Problem

Alex leads integrations at a 20-person company. Debugging webhooks is painful: set up ngrok, configure the provider, trigger the event, check logs, fix, repeat. Temporary URLs expire. There's no way to see the raw request body, headers, and timing. When a webhook fails, re-triggering the event from the provider is complex. Sharing a webhook capture with a teammate requires screenshots. They need a debug tool: generate temporary URLs, capture all requests, inspect headers/body, mock responses, replay requests, and share captures.

## Step 1: Build the Debug Tool

```typescript
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface DebugEndpoint { id: string; url: string; createdAt: string; expiresAt: string; responseConfig: { status: number; headers: Record<string, string>; body: any; delay: number }; requestCount: number; }
interface CapturedRequest { id: string; endpointId: string; method: string; path: string; headers: Record<string, string>; query: Record<string, string>; body: string; bodyParsed: any; ip: string; timestamp: string; size: number; contentType: string; }

const DEFAULT_TTL = 86400; // 24 hours

// Create debug endpoint
export async function createEndpoint(options?: { responseStatus?: number; responseBody?: any; responseHeaders?: Record<string, string>; responseDelay?: number; ttlHours?: number }): Promise<DebugEndpoint> {
  const id = randomBytes(12).toString("hex");
  const ttl = (options?.ttlHours || 24) * 3600;
  const url = `${process.env.APP_URL || 'https://hooks.example.com'}/debug/${id}`;

  const endpoint: DebugEndpoint = {
    id, url, createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    responseConfig: { status: options?.responseStatus || 200, headers: options?.responseHeaders || { "Content-Type": "application/json" }, body: options?.responseBody || { ok: true }, delay: options?.responseDelay || 0 },
    requestCount: 0,
  };

  await redis.setex(`debug:endpoint:${id}`, ttl, JSON.stringify(endpoint));
  return endpoint;
}

// Handle incoming webhook request
export async function handleRequest(endpointId: string, req: { method: string; path: string; headers: Record<string, string>; query: Record<string, string>; body: string; ip: string }): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  const endpointData = await redis.get(`debug:endpoint:${endpointId}`);
  if (!endpointData) throw new Error("Endpoint not found or expired");
  const endpoint: DebugEndpoint = JSON.parse(endpointData);

  // Capture request
  const requestId = randomBytes(6).toString("hex");
  let bodyParsed: any = null;
  try { bodyParsed = JSON.parse(req.body); } catch {}

  const captured: CapturedRequest = {
    id: requestId, endpointId, method: req.method, path: req.path,
    headers: req.headers, query: req.query, body: req.body,
    bodyParsed, ip: req.ip, timestamp: new Date().toISOString(),
    size: Buffer.byteLength(req.body || ""),
    contentType: req.headers["content-type"] || "unknown",
  };

  // Store request
  await redis.rpush(`debug:requests:${endpointId}`, JSON.stringify(captured));
  await redis.ltrim(`debug:requests:${endpointId}`, -100, -1); // keep last 100
  await redis.expire(`debug:requests:${endpointId}`, DEFAULT_TTL);

  // Update count
  endpoint.requestCount++;
  await redis.setex(`debug:endpoint:${endpointId}`, DEFAULT_TTL, JSON.stringify(endpoint));

  // Publish for real-time viewing
  await redis.publish(`debug:live:${endpointId}`, JSON.stringify(captured));

  // Simulate delay
  if (endpoint.responseConfig.delay > 0) {
    await new Promise((r) => setTimeout(r, endpoint.responseConfig.delay));
  }

  return { status: endpoint.responseConfig.status, headers: endpoint.responseConfig.headers, body: endpoint.responseConfig.body };
}

// Get captured requests
export async function getRequests(endpointId: string): Promise<CapturedRequest[]> {
  const raw = await redis.lrange(`debug:requests:${endpointId}`, 0, -1);
  return raw.map((r) => JSON.parse(r)).reverse(); // newest first
}

// Replay a captured request to a target URL
export async function replayRequest(endpointId: string, requestId: string, targetUrl: string): Promise<{ status: number; headers: Record<string, string>; body: string; latency: number }> {
  const requests = await getRequests(endpointId);
  const request = requests.find((r) => r.id === requestId);
  if (!request) throw new Error("Request not found");

  const start = Date.now();
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: ["POST", "PUT", "PATCH"].includes(request.method) ? request.body : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const body = await response.text();
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: body.slice(0, 10000), latency: Date.now() - start };
}

// Generate shareable link
export async function getShareLink(endpointId: string): Promise<string> {
  return `${process.env.APP_URL}/debug/${endpointId}/inspect`;
}

// Update response configuration
export async function updateResponse(endpointId: string, config: Partial<DebugEndpoint["responseConfig"]>): Promise<void> {
  const data = await redis.get(`debug:endpoint:${endpointId}`);
  if (!data) throw new Error("Endpoint not found");
  const endpoint: DebugEndpoint = JSON.parse(data);
  endpoint.responseConfig = { ...endpoint.responseConfig, ...config };
  await redis.setex(`debug:endpoint:${endpointId}`, DEFAULT_TTL, JSON.stringify(endpoint));
}
```

## Results

- **Debug URL in 1 second** — generate endpoint, paste into provider, trigger webhook, see full request instantly; no ngrok setup
- **Full request inspection** — headers, body (raw + parsed JSON), query params, IP, content-type, size; everything visible in one view
- **Response mocking** — return 500 to test error handling; add 3s delay to test timeouts; return custom body; test every scenario
- **Replay to local** — capture request from production webhook, replay to localhost:3000; debug with exact production payload; no manual recreation
- **Shareable** — send link to teammate; they see all captured requests; no screenshots; real-time updates via WebSocket
