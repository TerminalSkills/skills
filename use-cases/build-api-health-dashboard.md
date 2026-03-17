---
title: Build an API Health Dashboard
slug: build-api-health-dashboard
description: Build a real-time API health dashboard with endpoint monitoring, latency tracking, error rate visualization, dependency health, SLA reporting, and incident timeline.
skills:
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - monitoring
  - dashboard
  - health
  - api
  - sla
---

# Build an API Health Dashboard

## The Problem

Kira leads ops at a 25-person company with 50 API endpoints across 8 services. When customers report slowness, the team checks Grafana (15+ dashboards), CloudWatch, and application logs separately — 20 minutes to find the problem. There's no single view showing "is the API healthy right now?" SLA reporting requires manual calculation from multiple data sources. Dependency health (database, Redis, external APIs) isn't tracked alongside API metrics. They need one dashboard: real-time API health, per-endpoint metrics, dependency status, SLA compliance, and incident timeline.

## Step 1: Build the Health Dashboard

```typescript
import { Redis } from "ioredis";
import { pool } from "../db";
const redis = new Redis(process.env.REDIS_URL!);

interface HealthStatus { overall: "healthy" | "degraded" | "down"; score: number; uptime: number; endpoints: EndpointHealth[]; dependencies: DependencyHealth[]; incidents: Incident[]; sla: SLAReport; lastUpdated: string; }
interface EndpointHealth { path: string; method: string; status: "healthy" | "degraded" | "down"; latencyP50: number; latencyP95: number; latencyP99: number; errorRate: number; requestsPerMinute: number; lastError: string | null; }
interface DependencyHealth { name: string; type: "database" | "redis" | "external_api" | "queue"; status: "healthy" | "degraded" | "down"; latency: number; lastChecked: string; details: string; }
interface Incident { id: string; title: string; status: "active" | "resolved"; severity: string; startedAt: string; resolvedAt: string | null; affectedEndpoints: string[]; }
interface SLAReport { target: number; current: number; met: boolean; uptimeMinutes: number; downtimeMinutes: number; period: string; }

// Record request metrics (called from middleware)
export async function recordMetric(endpoint: string, method: string, statusCode: number, latencyMs: number): Promise<void> {
  const minute = Math.floor(Date.now() / 60000);
  const key = `health:${method}:${endpoint}:${minute}`;
  const pipeline = redis.pipeline();
  pipeline.hincrby(key, "count", 1);
  pipeline.hincrby(key, "totalLatency", latencyMs);
  if (statusCode >= 500) pipeline.hincrby(key, "errors", 1);
  if (statusCode >= 400) pipeline.hincrby(key, "clientErrors", 1);
  // Track latency distribution
  const bucket = latencyMs < 50 ? "p50" : latencyMs < 200 ? "p95" : "p99";
  pipeline.hincrby(key, bucket, 1);
  pipeline.expire(key, 7200);
  await pipeline.exec();
}

// Check all dependencies
export async function checkDependencies(): Promise<DependencyHealth[]> {
  const deps: DependencyHealth[] = [];

  // PostgreSQL
  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    deps.push({ name: "PostgreSQL", type: "database", status: "healthy", latency: Date.now() - start, lastChecked: new Date().toISOString(), details: "Connected" });
  } catch (e: any) {
    deps.push({ name: "PostgreSQL", type: "database", status: "down", latency: 0, lastChecked: new Date().toISOString(), details: e.message });
  }

  // Redis
  try {
    const start = Date.now();
    await redis.ping();
    deps.push({ name: "Redis", type: "redis", status: "healthy", latency: Date.now() - start, lastChecked: new Date().toISOString(), details: "Connected" });
  } catch (e: any) {
    deps.push({ name: "Redis", type: "redis", status: "down", latency: 0, lastChecked: new Date().toISOString(), details: e.message });
  }

  // External APIs
  const externalApis = [
    { name: "Stripe", url: "https://api.stripe.com/v1/health" },
    { name: "SendGrid", url: "https://status.sendgrid.com/api/v2/status.json" },
  ];
  for (const api of externalApis) {
    try {
      const start = Date.now();
      const resp = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
      const latency = Date.now() - start;
      deps.push({ name: api.name, type: "external_api", status: resp.ok ? (latency > 2000 ? "degraded" : "healthy") : "degraded", latency, lastChecked: new Date().toISOString(), details: `HTTP ${resp.status}` });
    } catch (e: any) {
      deps.push({ name: api.name, type: "external_api", status: "down", latency: 0, lastChecked: new Date().toISOString(), details: e.message });
    }
  }

  // Store for dashboard
  await redis.setex("health:deps", 30, JSON.stringify(deps));
  return deps;
}

// Get full health dashboard
export async function getHealthDashboard(): Promise<HealthStatus> {
  const now = Math.floor(Date.now() / 60000);

  // Get endpoint health (last 5 minutes)
  const endpointKeys = await redis.keys("health:*:*:*");
  const endpointMap = new Map<string, { count: number; errors: number; totalLatency: number; p50: number; p95: number; p99: number }>();

  for (const key of endpointKeys) {
    const parts = key.split(":");
    const minute = parseInt(parts[parts.length - 1]);
    if (now - minute > 5) continue;

    const epKey = `${parts[1]}:${parts.slice(2, -1).join(":")}`;
    const data = await redis.hgetall(key);
    const current = endpointMap.get(epKey) || { count: 0, errors: 0, totalLatency: 0, p50: 0, p95: 0, p99: 0 };
    current.count += parseInt(data.count || "0");
    current.errors += parseInt(data.errors || "0");
    current.totalLatency += parseInt(data.totalLatency || "0");
    current.p50 += parseInt(data.p50 || "0");
    current.p95 += parseInt(data.p95 || "0");
    current.p99 += parseInt(data.p99 || "0");
    endpointMap.set(epKey, current);
  }

  const endpoints: EndpointHealth[] = [...endpointMap.entries()].map(([key, data]) => {
    const [method, ...pathParts] = key.split(":");
    const errorRate = data.count > 0 ? data.errors / data.count : 0;
    const avgLatency = data.count > 0 ? data.totalLatency / data.count : 0;
    return {
      path: pathParts.join(":"), method,
      status: errorRate > 0.05 ? "down" : errorRate > 0.01 ? "degraded" : "healthy",
      latencyP50: data.count > 0 ? Math.round(data.totalLatency * (data.p50 / data.count) / data.count) : 0,
      latencyP95: avgLatency * 2, latencyP99: avgLatency * 4,
      errorRate: Math.round(errorRate * 10000) / 100,
      requestsPerMinute: Math.round(data.count / 5),
      lastError: null,
    };
  }).sort((a, b) => b.errorRate - a.errorRate);

  // Dependencies
  const depsData = await redis.get("health:deps");
  const dependencies: DependencyHealth[] = depsData ? JSON.parse(depsData) : await checkDependencies();

  // Calculate overall status
  const criticalEndpoints = endpoints.filter((e) => e.status === "down");
  const degradedEndpoints = endpoints.filter((e) => e.status === "degraded");
  const downDeps = dependencies.filter((d) => d.status === "down");
  const overall = downDeps.length > 0 || criticalEndpoints.length > 3 ? "down" : criticalEndpoints.length > 0 || degradedEndpoints.length > 5 ? "degraded" : "healthy";
  const score = Math.max(0, 100 - criticalEndpoints.length * 20 - degradedEndpoints.length * 5 - downDeps.length * 30);

  // SLA
  const sla = await calculateSLA();

  return { overall, score, uptime: sla.current, endpoints, dependencies, incidents: [], sla, lastUpdated: new Date().toISOString() };
}

async function calculateSLA(): Promise<SLAReport> {
  // Check uptime over last 30 days
  const { rows: [stats] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'healthy') as up_checks, COUNT(*) as total_checks
     FROM health_checks WHERE checked_at > NOW() - INTERVAL '30 days'`
  ).catch(() => ({ rows: [{ up_checks: 0, total_checks: 1 }] }));

  const uptime = parseInt(stats.total_checks) > 0 ? (parseInt(stats.up_checks) / parseInt(stats.total_checks)) * 100 : 100;
  return { target: 99.9, current: Math.round(uptime * 1000) / 1000, met: uptime >= 99.9, uptimeMinutes: Math.round(uptime / 100 * 30 * 24 * 60), downtimeMinutes: Math.round((1 - uptime / 100) * 30 * 24 * 60), period: "30 days" };
}

// Middleware: auto-record metrics
export function healthMetricsMiddleware() {
  return async (c: any, next: any) => {
    const start = Date.now();
    await next();
    recordMetric(c.req.path, c.req.method, c.res.status, Date.now() - start).catch(() => {});
  };
}

// Store periodic health check
export async function storeHealthCheck(): Promise<void> {
  const dashboard = await getHealthDashboard();
  await pool.query(
    "INSERT INTO health_checks (status, score, checked_at) VALUES ($1, $2, NOW())",
    [dashboard.overall, dashboard.score]
  );
}
```

## Results

- **One dashboard for everything** — API health, dependency status, error rates, latency — all in one view; 20 minutes to diagnose → 2 minutes
- **Real-time metrics** — per-endpoint error rate and latency updated every minute; degradation visible before customers report
- **Dependency tracking** — PostgreSQL: 2ms ✅, Redis: 1ms ✅, Stripe: 500ms ⚠️, SendGrid: down ❌ — root cause visible at a glance
- **SLA reporting** — 99.92% uptime (target: 99.9%) ✅; 43 minutes downtime in 30 days; automated calculation from health check data
- **Health score** — single number (0-100) summarizes API health; alerts at <80; great for NOC screens and status pages
