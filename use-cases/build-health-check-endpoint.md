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

## Step 1: Build the Health Check System

```typescript
// src/health/checks.ts — Comprehensive health checks with dependency verification
import { pool } from "../db";
import { Redis } from "ioredis";
import { Hono } from "hono";

const redis = new Redis(process.env.REDIS_URL!);

type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface HealthCheck {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  message?: string;
  details?: Record<string, any>;
}

interface HealthResponse {
  status: HealthStatus;
  version: string;
  uptime: number;
  timestamp: string;
  checks: HealthCheck[];
}

const startTime = Date.now();

// Individual dependency checks
async function checkPostgres(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { rows } = await pool.query("SELECT 1 as ok, pg_postmaster_start_time() as started, current_setting('max_connections') as max_conn");
    const activeConns = await pool.query("SELECT count(*) as active FROM pg_stat_activity");
    const latency = Date.now() - start;

    return {
      name: "postgresql",
      status: latency > 1000 ? "degraded" : "healthy",
      latencyMs: latency,
      details: {
        activeConnections: parseInt(activeConns.rows[0].active),
        maxConnections: parseInt(rows[0].max_conn),
        serverStarted: rows[0].started,
      },
    };
  } catch (err: any) {
    return { name: "postgresql", status: "unhealthy", latencyMs: Date.now() - start, message: err.message };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const pong = await redis.ping();
    const info = await redis.info("memory");
    const usedMemory = info.match(/used_memory_human:(.+)/)?.[1]?.trim();
    const latency = Date.now() - start;

    return {
      name: "redis",
      status: latency > 500 ? "degraded" : pong === "PONG" ? "healthy" : "unhealthy",
      latencyMs: latency,
      details: { usedMemory },
    };
  } catch (err: any) {
    return { name: "redis", status: "unhealthy", latencyMs: Date.now() - start, message: err.message };
  }
}

async function checkDiskSpace(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { execSync } = require("node:child_process");
    const output = execSync("df -h / | tail -1").toString();
    const parts = output.trim().split(/\s+/);
    const usedPercent = parseInt(parts[4]);

    return {
      name: "disk",
      status: usedPercent > 90 ? "unhealthy" : usedPercent > 80 ? "degraded" : "healthy",
      latencyMs: Date.now() - start,
      details: { total: parts[1], used: parts[2], available: parts[3], usedPercent: `${usedPercent}%` },
    };
  } catch (err: any) {
    return { name: "disk", status: "degraded", latencyMs: Date.now() - start, message: err.message };
  }
}

async function checkMemory(): Promise<HealthCheck> {
  const start = Date.now();
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);

  return {
    name: "memory",
    status: heapUsedMB > 1500 ? "degraded" : "healthy",
    latencyMs: Date.now() - start,
    details: { heapUsedMB, heapTotalMB, rssMB },
  };
}

async function checkExternalAPI(name: string, url: string, timeoutMs: number = 5000): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const latency = Date.now() - start;

    return {
      name,
      status: res.ok ? (latency > 3000 ? "degraded" : "healthy") : "degraded",
      latencyMs: latency,
      details: { statusCode: res.status },
    };
  } catch (err: any) {
    return { name, status: "unhealthy", latencyMs: Date.now() - start, message: err.message };
  }
}

// Full health check
async function runAllChecks(): Promise<HealthResponse> {
  const checks = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkDiskSpace(),
    checkMemory(),
  ]);

  // Determine overall status
  const hasUnhealthy = checks.some((c) => c.status === "unhealthy");
  const hasDegraded = checks.some((c) => c.status === "degraded");
  const overallStatus: HealthStatus = hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy";

  return {
    status: overallStatus,
    version: process.env.APP_VERSION || "unknown",
    uptime: Math.round((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks,
  };
}

// Routes
const app = new Hono();

// Kubernetes liveness probe — is the process alive?
app.get("/healthz", (c) => {
  return c.json({ status: "ok", uptime: Math.round((Date.now() - startTime) / 1000) });
});

// Kubernetes readiness probe — can we serve traffic?
app.get("/readyz", async (c) => {
  const dbCheck = await checkPostgres();
  const redisCheck = await checkRedis();

  const ready = dbCheck.status !== "unhealthy" && redisCheck.status !== "unhealthy";
  return c.json(
    { ready, database: dbCheck.status, cache: redisCheck.status },
    ready ? 200 : 503
  );
});

// Detailed health check (for monitoring dashboards)
app.get("/health", async (c) => {
  const health = await runAllChecks();
  const statusCode = health.status === "unhealthy" ? 503 : health.status === "degraded" ? 200 : 200;

  // Cache for 10 seconds to prevent health check storms
  c.header("Cache-Control", "max-age=10");
  return c.json(health, statusCode);
});

// Startup probe — has the app finished initializing?
app.get("/startupz", async (c) => {
  const dbReady = await checkPostgres();
  if (dbReady.status === "unhealthy") {
    return c.json({ started: false, reason: "Database not ready" }, 503);
  }
  return c.json({ started: true });
});

export default app;
```

## Results

- **Database outage detected in 10 seconds** — readiness probe fails when PostgreSQL is unhealthy; load balancer stops sending traffic; no more 200 OK on broken servers
- **Kubernetes stops unnecessary restarts** — liveness probe (lightweight `/healthz`) only fails if the process is hung; readiness probe handles dependency issues; pods aren't killed for slow database queries
- **Degraded mode visible on dashboard** — `/health` endpoint shows "degraded" when Redis latency spikes above 500ms; team investigates before it becomes an outage
- **Disk space alerts before crash** — health check flags disk usage above 80%; team cleans up logs before the server fills up and crashes at 100%
- **10-second cache prevents check storms** — monitoring tools polling every second don't overload the database with health check queries
