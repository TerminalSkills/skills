---
title: Build an Edge Function Runtime
slug: build-edge-function-runtime
description: Build an edge function runtime on V8 isolates with warm isolate pooling, CPU, wall-clock and memory limits, versioned deployments in PostgreSQL, Redis metrics and a Hono front door.
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

Emma leads platform at a 20-person company serving users across 40 countries. Their API runs in US-East, so users in Tokyo pay for the network distance on every call. Managed edge platforms such as Cloudflare Workers and Vercel Edge Functions are the right default, but her team needs things those products govern for them: running next to their own databases, their own limits and billing, and a runtime they can inspect. They decide to build a small runtime they can deploy to every region they already have servers in: functions run in V8 isolates, are versioned in PostgreSQL, and are limited in CPU time, wall-clock time and memory.

## The Solution

Worker threads and `new Function()` are not a sandbox: code in them can still reach `process`, `require` and the file system. A V8 isolate created with [`isolated-vm`](https://github.com/laverdet/isolated-vm) starts with no Node.js APIs at all (no `require`, `process`, `fetch` or timers), has its own heap with a hard memory limit, and can be killed on a CPU timeout. You decide what the function can see.

- `isolated-vm` 6.x matches Node 24 (7.x targets Node 26). Run Node with `--no-node-snapshot`. The project is in maintenance mode.
- Isolates give you separate heaps, not a security boundary against V8 bugs. For hostile multi-tenant code also run the process in a container with no secrets and no network access to your internal services.
- A function is a classic script that sets `globalThis.handler = async (req) => ({ status, headers, body })`, with `req = { method, url, headers, body }`. Its environment variables arrive as the global `env`.

```bash
npm install isolated-vm@6 ioredis pg zod hono @hono/node-server
npm install -D typescript tsx @types/node @types/pg
```

## Step 1: Table

```sql
CREATE TABLE edge_functions (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  version     int  NOT NULL,
  code        text NOT NULL,
  routes      jsonb NOT NULL,
  config      jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  deployed_at timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL,
  UNIQUE (name, version)
);
```

```typescript
// src/db.ts
import pg from "pg";
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
```

## Step 2: Build the Edge Runtime

`deploy` validates the payload with Zod and syntax-checks the code by compiling it in a throwaway isolate (compiling never runs it). `execute` keeps one warm isolate per function version and enforces both a CPU timeout and a wall-clock timeout. A function that times out or exceeds its memory limit has its isolate discarded.

```typescript
// src/edge/runtime.ts: edge function runtime on V8 isolates (isolated-vm)
import ivm from "isolated-vm";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

export const DeploySchema = z.object({
  name: z.string().regex(/^[a-z0-9-]{1,48}$/),
  code: z.string().min(1).max(1_000_000),
  routes: z.array(z.string().startsWith("/")).min(1),
  config: z.object({
    memoryLimitMb: z.number().int().min(8).max(128).default(128),
    timeoutMs: z.number().int().min(10).max(30_000).default(10_000),
    envVars: z.record(z.string(), z.string()).default({}),
  }).default({ memoryLimitMb: 128, timeoutMs: 10_000, envVars: {} }),
  createdBy: z.string(),
});
export type EdgeFunction = z.infer<typeof DeploySchema> & { id: string; version: number };
export interface EdgeRequest { method: string; url: string; headers: Record<string, string>; body?: string }
export interface EdgeResponse { status: number; headers: Record<string, string>; body: string }

// Warm isolates: one per function version, evicted after 5 idle minutes or when the pool is full
type Warm = { isolate: ivm.Isolate; run: ivm.Reference<(req: string) => Promise<string>>; lastUsed: number };
const warm = new Map<string, Warm>();
const MAX_POOL_SIZE = 50;
const IDLE_MS = 300_000;

// The glue that runs inside the isolate. User code only has to set globalThis.handler.
const GLUE = `globalThis.__run = async (json) => {
  const res = await globalThis.handler(JSON.parse(json));
  return JSON.stringify({ status: res.status ?? 200, headers: res.headers ?? {}, body: String(res.body ?? "") });
};`;

export async function deploy(input: z.input<typeof DeploySchema>): Promise<EdgeFunction> {
  const p = DeploySchema.parse(input);
  // Real syntax check: compile inside a throwaway isolate. compileScript never executes the code.
  const probe = new ivm.Isolate({ memoryLimit: 8 });
  try { await probe.compileScript(p.code); }
  catch (e: any) { throw new Error(`Syntax error in function: ${e.message}`); }
  finally { probe.dispose(); }

  const { rows: [last] } = await pool.query(
    "SELECT COALESCE(MAX(version), 0) AS v FROM edge_functions WHERE name = $1", [p.name]);
  const fn: EdgeFunction = { ...p, id: `ef-${randomBytes(6).toString("hex")}`, version: last.v + 1 };
  await pool.query(
    `INSERT INTO edge_functions (id, name, version, code, routes, config, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)`,
    [fn.id, fn.name, fn.version, fn.code, JSON.stringify(fn.routes), JSON.stringify(fn.config), fn.createdBy]);
  await redis.del(`edge:fn:${fn.name}`); // next request loads the new version; old isolates age out
  return fn;
}

async function getFunction(name: string): Promise<EdgeFunction | null> {
  const cached = await redis.get(`edge:fn:${name}`);
  if (cached) return JSON.parse(cached);
  // routes/config are jsonb columns: node-postgres already returns them parsed
  const { rows: [row] } = await pool.query(
    "SELECT * FROM edge_functions WHERE name = $1 AND status = 'active' ORDER BY version DESC LIMIT 1", [name]);
  if (!row) return null;
  const fn = { ...row, createdBy: row.created_by };
  await redis.setex(`edge:fn:${name}`, 60, JSON.stringify(fn));
  return fn;
}

async function boot(fn: EdgeFunction): Promise<Warm> {
  const isolate = new ivm.Isolate({ memoryLimit: fn.config.memoryLimitMb });
  const context = await isolate.createContext();
  // The isolate has no require, process, fetch or timers: only what you hand in below.
  await context.global.set("env", new ivm.ExternalCopy(fn.config.envVars).copyInto());
  await (await isolate.compileScript(fn.code)).run(context);
  await (await isolate.compileScript(GLUE)).run(context);
  const run = await context.global.get("__run", { reference: true });
  return { isolate, run, lastUsed: Date.now() };
}

function drop(key: string) {
  const w = warm.get(key);
  if (w && !w.isolate.isDisposed) w.isolate.dispose();
  warm.delete(key);
}

export async function execute(name: string, req: EdgeRequest) {
  const fn = await getFunction(name);
  if (!fn) throw new Error(`Function '${name}' not found`);

  const key = `${name}:${fn.version}`;
  let w = warm.get(key);
  const coldStart = !w || w.isolate.isDisposed;
  const t0 = performance.now();
  if (coldStart) {
    if (warm.size >= MAX_POOL_SIZE) {
      const oldest = [...warm].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0][0];
      drop(oldest);
    }
    w = await boot(fn);
    warm.set(key, w);
  }
  w!.lastUsed = Date.now();

  let res: EdgeResponse;
  try {
    // `timeout` bounds synchronous CPU time; the race bounds time spent awaiting inside the function.
    let timer: NodeJS.Timeout;
    const wall = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error("Function execution timed out")), fn.config.timeoutMs);
    });
    const out = await Promise.race([
      w!.run.apply(undefined, [JSON.stringify(req)], { result: { promise: true }, timeout: fn.config.timeoutMs }),
      wall,
    ]).finally(() => clearTimeout(timer));
    res = JSON.parse(out as string);
  } catch (e: any) {
    drop(key); // a function that timed out, blew its memory limit or threw gets a fresh isolate next time
    res = { status: /timed out/.test(e.message) ? 504 : 500, headers: {}, body: e.message };
  }

  const executionTimeMs = performance.now() - t0;
  const m = redis.multi().hincrby(`edge:metrics:${name}`, "invocations", 1)
    .hincrbyfloat(`edge:metrics:${name}`, "totalLatencyMs", executionTimeMs);
  if (coldStart) m.hincrby(`edge:metrics:${name}`, "coldStarts", 1);
  if (res.status >= 500) m.hincrby(`edge:metrics:${name}`, "errors", 1);
  await m.exec();

  const heap = warm.get(key)?.isolate.getHeapStatisticsSync().used_heap_size ?? 0;
  return { ...res, executionTimeMs, coldStart, region: process.env.REGION ?? "local", memoryUsedMb: heap / 1048576 };
}

export async function getMetrics(name: string) {
  const s = await redis.hgetall(`edge:metrics:${name}`);
  const invocations = Number(s.invocations ?? 0);
  return {
    invocations,
    avgLatencyMs: invocations ? Number(s.totalLatencyMs ?? 0) / invocations : 0,
    errors: Number(s.errors ?? 0),
    coldStarts: Number(s.coldStarts ?? 0),
  };
}

setInterval(() => {
  for (const [key, w] of warm) if (Date.now() - w.lastUsed > IDLE_MS) drop(key);
}, 60_000).unref();
```

## Step 3: HTTP Front Door

```typescript
// src/server.ts: HTTP front door
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { HTTPException } from "hono/http-exception";
import { deploy, execute, getMetrics } from "./edge/runtime";

const app = new Hono();
app.onError((e, c) => e instanceof HTTPException ? e.getResponse() : c.json({ error: e.message }, 400)); // keep 401 from bearerAuth

// Management API: deploy needs a token. Never expose it without one.
app.post("/_deploy", bearerAuth({ token: process.env.DEPLOY_TOKEN! }), async (c) => {
  const fn = await deploy({ ...(await c.req.json()), createdBy: "api" });
  return c.json({ id: fn.id, name: fn.name, version: fn.version }, 201);
});
app.get("/_metrics/:name", bearerAuth({ token: process.env.DEPLOY_TOKEN! }), async (c) =>
  c.json(await getMetrics(c.req.param("name"))));

// Invocation: /f/<name>/<anything> runs function <name>
app.all("/f/:name/*", async (c) => {
  const name = c.req.param("name");
  const url = new URL(c.req.url);
  const res = await execute(name, {
    method: c.req.method,
    url: url.pathname.slice(`/f/${name}`.length) + url.search,
    headers: Object.fromEntries(c.req.raw.headers),
    body: ["GET", "HEAD"].includes(c.req.method) ? undefined : await c.req.text(),
  }).catch((e) => ({ status: 404, headers: {}, body: e.message, coldStart: false, executionTimeMs: 0 }));
  return new Response(res.body, {
    status: res.status,
    headers: { ...res.headers, "x-cold-start": String(res.coldStart), "x-exec-ms": res.executionTimeMs.toFixed(2) },
  });
});

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 8787 });
```

The server binds to 127.0.0.1; put your load balancer or TLS terminator in front of it. To serve users in several regions, run the same container in each region with its own `REGION`, point geo DNS or anycast at them, and give every region its own Postgres read replica (or the same database over a private network). Redis caches the function row for 60 seconds, so a new version reaches every region within a minute unless you delete `edge:fn:<name>` there.

Run it and deploy a function:

```bash
export DATABASE_URL=postgresql://... REDIS_URL=redis://127.0.0.1:6379 DEPLOY_TOKEN=$(openssl rand -hex 24)
NODE_OPTIONS=--no-node-snapshot npx tsx src/server.ts &
curl -s -H "Authorization: Bearer $DEPLOY_TOKEN" -H 'content-type: application/json' 127.0.0.1:8787/_deploy -d '{
  "name": "hello", "routes": ["/f/hello/*"], "config": { "envVars": { "GREETING": "hi" } },
  "code": "globalThis.handler = async (req) => ({ status: 200, body: JSON.stringify({ msg: env.GREETING, url: req.url }) });"
}'
curl -si 127.0.0.1:8787/f/hello/a?x=1
```

## What You Get

Measured on a development machine with Node 24.11, isolated-vm 6.2, Redis 8 and PostgreSQL 16 in local containers:

- **Cold start about 2 ms** (`x-cold-start: true`: create the isolate, run the code, load the row), **warm calls about 0.1 ms** inside the runtime, before any network.
- **Runaway code is contained.** `while(true){}` with `timeoutMs: 200` returns 504; a promise that never resolves returns 504; an allocation loop under a 16 MB limit returns 500 with "Isolate was disposed during execution due to memory limit". The server keeps serving other functions.
- **No ambient capabilities.** `typeof require`, `typeof process` and `typeof fetch` are all `undefined` inside the isolate.
- **Versioned deploys.** A new version is a new row; the Redis cache entry is dropped on deploy and new requests boot an isolate for the new version while the old one ages out after 5 idle minutes.
- **Bad input is rejected at deploy time**: syntax errors return 400 with the compiler's message, and names or routes that fail the Zod schema never reach the database.

The latency win for Tokyo users is simply that the code runs in a Tokyo region; measure it with your own regions rather than trusting a number from this page.

## Related Skills

- [typescript](/skills/typescript) for the strict types around the runtime
- [redis](/skills/redis) for the function cache and metrics counters
- [postgresql](/skills/postgresql) for versioned function storage
- [hono](/skills/hono) for the HTTP front door
- [zod](/skills/zod) for validating deploy payloads
