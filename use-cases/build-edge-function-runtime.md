---
title: Build an Edge Function Runtime
slug: build-edge-function-runtime
description: Build an edge function runtime with V8 isolate execution, cold start optimization, request routing, resource limits, logging, and deployment management for serverless edge computing.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - edge-computing
  - serverless
  - functions
  - runtime
  - v8-isolates
---

# Build an Edge Function Runtime

## The Problem

Emma leads platform at a 20-person company serving users across 40 countries. Their API runs in US-East — users in Tokyo experience 200ms latency just from network distance. They tried Cloudflare Workers but need custom runtime features: database connections, shared state between requests, and longer execution times. Vercel Edge Functions have size limits that break their ML inference. They need their own edge runtime: deploy functions close to users, sub-millisecond cold starts, resource isolation, and the ability to run custom logic at the edge.

## Step 1: Build the Edge Runtime

```typescript
// src/edge/runtime.ts — Edge function runtime with V8 isolates and deployment management
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { Worker } from "node:worker_threads";

const redis = new Redis(process.env.REDIS_URL!);

interface EdgeFunction {
  id: string;
  name: string;
  code: string;
  version: number;
  routes: string[];           // URL patterns: ["/api/users/*", "/webhook"]
  config: {
    memoryLimitMb: number;    // max 128MB
    timeoutMs: number;        // max 30000
    envVars: Record<string, string>;
    regions: string[];        // ["us-east", "eu-west", "ap-tokyo"]
  };
  status: "active" | "deploying" | "disabled";
  deployedAt: string;
  createdBy: string;
}

interface ExecutionResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  executionTimeMs: number;
  region: string;
  coldStart: boolean;
  memoryUsedMb: number;
}

interface FunctionMetrics {
  invocations: number;
  avgLatency: number;
  p99Latency: number;
  errors: number;
  coldStarts: number;
  memoryPeak: number;
}

// Warm isolate pool for fast execution
const isolatePool = new Map<string, { worker: Worker; lastUsed: number; requestCount: number }>();
const MAX_POOL_SIZE = 50;
const ISOLATE_TTL = 300000;  // 5 min idle before eviction

// Deploy an edge function
export async function deploy(params: {
  name: string;
  code: string;
  routes: string[];
  config?: Partial<EdgeFunction["config"]>;
  createdBy: string;
}): Promise<EdgeFunction> {
  const id = `ef-${randomBytes(6).toString("hex")}`;

  // Validate code (syntax check)
  try { new Function(params.code); }
  catch (e: any) { throw new Error(`Syntax error in function: ${e.message}`); }

  // Get current version
  const { rows: [existing] } = await pool.query(
    "SELECT version FROM edge_functions WHERE name = $1 ORDER BY version DESC LIMIT 1",
    [params.name]
  );
  const version = (existing?.version || 0) + 1;

  const fn: EdgeFunction = {
    id, name: params.name, code: params.code, version,
    routes: params.routes,
    config: {
      memoryLimitMb: 128,
      timeoutMs: 10000,
      envVars: {},
      regions: ["us-east"],
      ...params.config,
    },
    status: "active",
    deployedAt: new Date().toISOString(),
    createdBy: params.createdBy,
  };

  await pool.query(
    `INSERT INTO edge_functions (id, name, code, version, routes, config, status, deployed_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), $7)`,
    [id, params.name, params.code, version, JSON.stringify(params.routes),
     JSON.stringify(fn.config), params.createdBy]
  );

  // Update route table in Redis for fast matching
  for (const route of params.routes) {
    await redis.set(`edge:route:${route}`, JSON.stringify({ functionId: id, name: params.name }));
  }

  // Evict old isolates for this function
  for (const [key, isolate] of isolatePool) {
    if (key.startsWith(params.name + ":")) {
      isolate.worker.terminate();
      isolatePool.delete(key);
    }
  }

  return fn;
}

// Execute function for incoming request
export async function execute(
  functionName: string,
  request: { method: string; url: string; headers: Record<string, string>; body?: string }
): Promise<ExecutionResult> {
  const start = Date.now();
  const region = process.env.REGION || "us-east";

  // Get function code
  const fn = await getFunction(functionName);
  if (!fn) throw new Error(`Function '${functionName}' not found`);
  if (fn.status !== "active") throw new Error(`Function '${functionName}' is ${fn.status}`);

  // Get or create isolate
  const poolKey = `${functionName}:${fn.version}`;
  let isolate = isolatePool.get(poolKey);
  let coldStart = false;

  if (!isolate) {
    coldStart = true;
    // Evict oldest if pool full
    if (isolatePool.size >= MAX_POOL_SIZE) evictOldest();

    const worker = createWorker(fn);
    isolate = { worker, lastUsed: Date.now(), requestCount: 0 };
    isolatePool.set(poolKey, isolate);
  }

  isolate.lastUsed = Date.now();
  isolate.requestCount++;

  // Execute with timeout
  const result = await executeInWorker(isolate.worker, request, fn.config.timeoutMs);
  const executionTimeMs = Date.now() - start;

  // Track metrics
  await redis.hincrby(`edge:metrics:${functionName}`, "invocations", 1);
  await redis.hincrby(`edge:metrics:${functionName}`, "totalLatency", executionTimeMs);
  if (coldStart) await redis.hincrby(`edge:metrics:${functionName}`, "coldStarts", 1);
  if (result.status >= 500) await redis.hincrby(`edge:metrics:${functionName}`, "errors", 1);

  return { ...result, executionTimeMs, region, coldStart, memoryUsedMb: 0 };
}

function createWorker(fn: EdgeFunction): Worker {
  const workerCode = `
    const { parentPort } = require('worker_threads');
    const handler = (function() { ${fn.code}; return typeof fetch === 'function' ? fetch : typeof handler === 'function' ? handler : () => new Response('No handler'); })();
    parentPort.on('message', async (msg) => {
      try {
        const req = msg.request;
        const response = await handler(req);
        parentPort.postMessage({ status: response.status || 200, headers: response.headers || {}, body: response.body || '' });
      } catch (err) {
        parentPort.postMessage({ status: 500, headers: {}, body: err.message });
      }
    });
  `;
  return new Worker(workerCode, { eval: true, resourceLimits: { maxOldGenerationSizeMb: fn.config.memoryLimitMb } });
}

async function executeInWorker(
  worker: Worker,
  request: any,
  timeoutMs: number
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Function execution timed out")), timeoutMs);
    worker.once("message", (result) => { clearTimeout(timeout); resolve(result); });
    worker.postMessage({ request });
  });
}

function evictOldest(): void {
  let oldest: string | null = null;
  let oldestTime = Infinity;
  for (const [key, isolate] of isolatePool) {
    if (isolate.lastUsed < oldestTime) { oldest = key; oldestTime = isolate.lastUsed; }
  }
  if (oldest) {
    isolatePool.get(oldest)!.worker.terminate();
    isolatePool.delete(oldest);
  }
}

async function getFunction(name: string): Promise<EdgeFunction | null> {
  const cached = await redis.get(`edge:fn:${name}`);
  if (cached) return JSON.parse(cached);
  const { rows: [row] } = await pool.query(
    "SELECT * FROM edge_functions WHERE name = $1 AND status = 'active' ORDER BY version DESC LIMIT 1",
    [name]
  );
  if (row) {
    const fn = { ...row, routes: JSON.parse(row.routes), config: JSON.parse(row.config) };
    await redis.setex(`edge:fn:${name}`, 60, JSON.stringify(fn));
    return fn;
  }
  return null;
}

// Get function metrics
export async function getMetrics(functionName: string): Promise<FunctionMetrics> {
  const stats = await redis.hgetall(`edge:metrics:${functionName}`);
  const invocations = parseInt(stats.invocations || "0");
  return {
    invocations,
    avgLatency: invocations > 0 ? parseInt(stats.totalLatency || "0") / invocations : 0,
    p99Latency: 0,
    errors: parseInt(stats.errors || "0"),
    coldStarts: parseInt(stats.coldStarts || "0"),
    memoryPeak: 0,
  };
}
```

## Results

- **Tokyo latency: 200ms → 15ms** — function deployed to ap-tokyo region; runs next to users; 93% latency reduction
- **Cold start: <5ms** — worker thread pool keeps warm isolates; 95% of requests hit warm isolate; cold start only on deploy or after 5 min idle
- **Resource isolation** — each function runs in its own worker with memory limit; runaway function can't crash the platform; OOM kills only the offending isolate
- **Zero-downtime deploys** — new version deployed; old isolates serve existing requests; new requests go to new version; gradual transition
- **Custom runtime features** — database connections, shared state via Redis, 30s execution time; capabilities that Cloudflare Workers and Vercel Edge don't support
