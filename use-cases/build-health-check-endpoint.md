---
title: Build a Health Check Endpoint System
slug: build-health-check-endpoint
description: Build comprehensive health check endpoints with dependency checks, degraded mode detection, Kubernetes readiness/liveness probes, response time monitoring, and automated alerting.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - health-check
  - monitoring
  - kubernetes
  - reliability
  - devops
---

# Build a Health Check Endpoint System

## The Problem

Tomás leads SRE at a 40-person company. Their load balancer health check hits `/` and checks for HTTP 200. When the database goes down, the app still returns 200 on `/` (it's a static page). Traffic keeps flowing to a broken server. Kubernetes restarts pods randomly because liveness probes don't distinguish between "app crashed" and "database is slow." They need health checks that verify all dependencies, report degraded states, and give Kubernetes the right signals.

## The Solution

Three separate endpoints, because Kubernetes asks three different questions:

- `/healthz` (liveness): is the process alive? It checks nothing external, so a slow database never gets pods killed.
- `/readyz` (readiness): can this pod serve traffic right now? It checks the dependencies the request path needs and returns 503 when one is down.
- `/health` (diagnostics): the detailed report for dashboards, with `healthy`, `degraded` and `unhealthy` states and per-dependency latency. Not wired to any probe.

An optional `/startupz` can hold the other probes off while a slow app boots. In Kubernetes, a `startupProbe` disables liveness and readiness checks until it first succeeds.

## Step-by-Step Walkthrough

### Step 1: Install

```bash
npm install hono @hono/node-server pg ioredis zod
npm install -D typescript tsx @types/node @types/pg
```

### Step 2: Build the health checks

```typescript
// src/health/checks.ts: dependency checks, probes and a cached detailed report
import { statfs } from "node:fs/promises";
import { Hono } from "hono";
import { Pool } from "pg";
import { Redis } from "ioredis";
import { z } from "zod";

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    APP_VERSION: z.string().default("unknown"),
    HEALTH_CACHE_MS: z.coerce.number().int().min(0).default(10_000),
  })
  .parse(process.env);

// Short timeouts: a health check must fail fast instead of hanging with the dependency
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 2000, query_timeout: 3000 });
pool.on("error", () => {}); // an idle connection dropped by a restarting database would otherwise crash the process
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, commandTimeout: 2000, enableOfflineQueue: false });
redis.on("error", () => {}); // outages show up in the check result, not as unhandled events

type Status = "healthy" | "degraded" | "unhealthy";
interface Check {
  name: string;
  status: Status;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

const startTime = Date.now();
const uptime = () => Math.round((Date.now() - startTime) / 1000);

async function timed(name: string, fn: () => Promise<Omit<Check, "name" | "latencyMs">>): Promise<Check> {
  const start = Date.now();
  try {
    return { name, latencyMs: Date.now() - start, ...(await fn()) };
  } catch (err) {
    return { name, status: "unhealthy", latencyMs: Date.now() - start, message: (err as Error).message };
  }
}

const checkPostgres = () =>
  timed("postgresql", async () => {
    const t = Date.now();
    await pool.query("SELECT 1");
    const latency = Date.now() - t;
    return { status: latency > 1000 ? "degraded" : "healthy" };
  });

const checkRedis = () =>
  timed("redis", async () => {
    const t = Date.now();
    const pong = await redis.ping();
    const latency = Date.now() - t;
    return { status: pong !== "PONG" ? "unhealthy" : latency > 500 ? "degraded" : "healthy" };
  });

const checkDisk = () =>
  timed("disk", async () => {
    const s = await statfs("/");
    const usedPercent = Math.round((1 - s.bavail / s.blocks) * 100);
    return {
      status: usedPercent > 90 ? "unhealthy" : usedPercent > 80 ? "degraded" : "healthy",
      details: { usedPercent, availableGB: Math.round((s.bavail * s.bsize) / 1e9) },
    };
  });

const checkMemory = () =>
  timed("memory", async () => {
    const m = process.memoryUsage();
    const heapUsedMB = Math.round(m.heapUsed / 1048576);
    return { status: heapUsedMB > 1500 ? "degraded" : "healthy", details: { heapUsedMB, rssMB: Math.round(m.rss / 1048576) } };
  });

// For third-party dependencies you can live without: they can only make the app "degraded"
export const checkExternal = (name: string, url: string, timeoutMs = 5000) =>
  timed(name, async () => {
    const t = Date.now();
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { status: res.ok && Date.now() - t < 3000 ? "healthy" : "degraded", details: { statusCode: res.status } };
  });

const rank: Record<Status, number> = { healthy: 0, degraded: 1, unhealthy: 2 };

async function runAllChecks() {
  const checks = await Promise.all([checkPostgres(), checkRedis(), checkDisk(), checkMemory()]);
  const status = checks.reduce<Status>((w, c) => (rank[c.status] > rank[w] ? c.status : w), "healthy");
  return { status, version: env.APP_VERSION, uptime: uptime(), timestamp: new Date().toISOString(), checks };
}

// Cache the report in-process so frequent pollers cannot turn /health into load on the database
let cached: { at: number; value: Awaited<ReturnType<typeof runAllChecks>> } | undefined;
async function getReport() {
  if (!cached || Date.now() - cached.at > env.HEALTH_CACHE_MS) {
    cached = { at: Date.now(), value: await runAllChecks() };
  }
  return cached.value;
}

const app = new Hono();

// Liveness: the process answers. No dependency checks on purpose.
app.get("/healthz", (c) => c.json({ status: "ok", uptime: uptime() }));

// Readiness: 503 takes the pod out of the Service endpoints without restarting it
app.get("/readyz", async (c) => {
  const [db, cache] = await Promise.all([checkPostgres(), checkRedis()]);
  const ready = db.status !== "unhealthy" && cache.status !== "unhealthy";
  return c.json({ ready, database: db.status, cache: cache.status }, ready ? 200 : 503);
});

// Detailed report: 503 only when something is down; "degraded" still answers 200
app.get("/health", async (c) => {
  const report = await getReport();
  return c.json(report, report.status === "unhealthy" ? 503 : 200);
});

// Startup: the app is initialized once the database answers
app.get("/startupz", async (c) => {
  const db = await checkPostgres();
  return db.status === "unhealthy" ? c.json({ started: false, reason: "database not ready" }, 503) : c.json({ started: true });
});

export default app;
```

Serve it on a private port with `@hono/node-server`:

```typescript
// src/server.ts
import { serve } from "@hono/node-server";
import app from "./health/checks";

serve({ fetch: app.fetch, port: 8080, hostname: "0.0.0.0" }); // pods are reached over the pod network
```

Do not expose `/health` on the public internet: it reveals versions, memory and dependency names. Route it only to your monitoring network, or keep only the probe endpoints reachable from outside.

### Step 3: Wire the probes in Kubernetes

```yaml
containers:
  - name: api
    startupProbe:
      httpGet: { path: /startupz, port: 8080 }
      periodSeconds: 5
      failureThreshold: 30     # up to 150 s to boot before the pod is restarted
    livenessProbe:
      httpGet: { path: /healthz, port: 8080 }
      periodSeconds: 10
      timeoutSeconds: 2
      failureThreshold: 3
    readinessProbe:
      httpGet: { path: /readyz, port: 8080 }
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 2
```

Any HTTP status from 200 up to but not including 400 counts as success, so a 503 from `/readyz` marks the pod not ready. Point your external load balancer's health check at `/readyz` too, not at `/`.

### Step 4: Check it

Start the server with a reachable Postgres and Redis and `curl` all four paths. Then stop Postgres: `/readyz` and `/health` should turn 503 while `/healthz` stays 200, which is exactly the signal Kubernetes needs.

## Real-World Example

Tomás's team points the load balancer and the Kubernetes readiness probe at `/readyz`, and the liveness probe at `/healthz`. When the database fails over, pods go not-ready within a few probe periods (`periodSeconds` times `failureThreshold`) and stop receiving traffic, but they are not restarted, so they come back by themselves once the database returns. A Grafana panel polls `/health` through the internal network and shows "degraded" when Redis latency passes 500 ms or disk use passes 80%.

## Related Skills

- `hono` for the routes
- `zod` for validating the configuration
- `postgresql` and `redis` for the dependency checks
- `typescript` for the typed report
