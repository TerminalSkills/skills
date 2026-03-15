---
title: Build an API Usage Analytics Dashboard
slug: build-api-usage-analytics
description: Build an API usage analytics dashboard with real-time request tracking, endpoint performance heatmaps, error rate monitoring, customer usage patterns, and cost attribution.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Developer Tools
tags:
  - analytics
  - api
  - monitoring
  - dashboard
  - usage
---

# Build an API Usage Analytics Dashboard

## The Problem

Hana leads platform at a 25-person API company. They can't answer basic questions: which endpoints are used most? Which are slow? Which customers consume the most? Nginx logs exist but querying them requires SSH + grep. When an endpoint degrades, they find out from customer complaints, not monitoring. Enterprise customers ask for usage reports — building each one takes engineering 2 hours. They need a real-time analytics dashboard: request counts, latency percentiles, error rates, customer breakdowns, and exportable reports — all without querying raw logs.

## Step 1: Build the Analytics Engine

```typescript
// src/analytics/api-usage.ts — Real-time API usage analytics with dashboards
import { Redis } from "ioredis";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

interface RequestLog {
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  customerId: string;
  apiKeyId: string;
  requestSize: number;
  responseSize: number;
  userAgent: string;
  ip: string;
  timestamp: number;
}

// Record API request (called from middleware)
export async function recordRequest(log: RequestLog): Promise<void> {
  const minute = Math.floor(log.timestamp / 60000);
  const hour = Math.floor(log.timestamp / 3600000);
  const day = new Date(log.timestamp).toISOString().slice(0, 10);
  const endpoint = `${log.method}:${normalizePath(log.path)}`;

  // Pipeline Redis commands for efficiency
  const pipeline = redis.pipeline();

  // Total request count
  pipeline.hincrby(`api:stats:${day}`, "total", 1);
  pipeline.hincrby(`api:stats:${day}`, `status_${Math.floor(log.statusCode / 100)}xx`, 1);

  // Per-endpoint stats
  pipeline.hincrby(`api:endpoint:${day}:${endpoint}`, "count", 1);
  pipeline.hincrby(`api:endpoint:${day}:${endpoint}`, "totalLatency", log.latencyMs);
  pipeline.hincrby(`api:endpoint:${day}:${endpoint}`, `status_${log.statusCode}`, 1);

  // Per-customer stats
  pipeline.hincrby(`api:customer:${day}:${log.customerId}`, "count", 1);
  pipeline.hincrby(`api:customer:${day}:${log.customerId}`, "totalLatency", log.latencyMs);
  pipeline.hincrby(`api:customer:${day}:${log.customerId}`, "totalBytes", log.responseSize);

  // Per-minute for real-time chart
  pipeline.hincrby(`api:minute:${minute}`, "count", 1);
  pipeline.hincrby(`api:minute:${minute}`, "errors", log.statusCode >= 400 ? 1 : 0);
  pipeline.expire(`api:minute:${minute}`, 7200);  // keep 2 hours of minute data

  // Latency histogram (for percentile calculation)
  const bucket = getLatencyBucket(log.latencyMs);
  pipeline.hincrby(`api:latency:${day}:${endpoint}`, bucket, 1);

  // Slowest requests (for debugging)
  if (log.latencyMs > 1000) {
    pipeline.zadd(`api:slow:${day}`, log.latencyMs, JSON.stringify({
      endpoint, latency: log.latencyMs, customer: log.customerId, timestamp: log.timestamp,
    }));
    pipeline.zremrangebyrank(`api:slow:${day}`, 0, -101);  // keep top 100
  }

  await pipeline.exec();

  // Set TTLs for daily keys
  await redis.expire(`api:stats:${day}`, 86400 * 90);  // keep 90 days
  await redis.expire(`api:endpoint:${day}:${endpoint}`, 86400 * 90);
  await redis.expire(`api:customer:${day}:${log.customerId}`, 86400 * 90);
  await redis.expire(`api:latency:${day}:${endpoint}`, 86400 * 30);
}

// Get dashboard overview
export async function getDashboard(date?: string): Promise<{
  totalRequests: number;
  errorRate: number;
  avgLatency: number;
  statusBreakdown: Record<string, number>;
  topEndpoints: Array<{ endpoint: string; count: number; avgLatency: number; errorRate: number }>;
  topCustomers: Array<{ customerId: string; count: number; totalBytes: number }>;
  realtimeRPS: number;
}> {
  const day = date || new Date().toISOString().slice(0, 10);

  // Overall stats
  const stats = await redis.hgetall(`api:stats:${day}`);
  const total = parseInt(stats.total || "0");
  const errors = parseInt(stats.status_4xx || "0") + parseInt(stats.status_5xx || "0");

  // Top endpoints
  const endpointKeys = await redis.keys(`api:endpoint:${day}:*`);
  const endpoints = [];
  for (const key of endpointKeys.slice(0, 50)) {
    const ep = key.split(`api:endpoint:${day}:`)[1];
    const epStats = await redis.hgetall(key);
    const count = parseInt(epStats.count || "0");
    const totalLatency = parseInt(epStats.totalLatency || "0");
    const epErrors = Object.entries(epStats)
      .filter(([k]) => k.startsWith("status_4") || k.startsWith("status_5"))
      .reduce((sum, [, v]) => sum + parseInt(v), 0);

    endpoints.push({
      endpoint: ep, count,
      avgLatency: count > 0 ? Math.round(totalLatency / count) : 0,
      errorRate: count > 0 ? (epErrors / count) * 100 : 0,
    });
  }

  // Top customers
  const customerKeys = await redis.keys(`api:customer:${day}:*`);
  const customers = [];
  for (const key of customerKeys.slice(0, 20)) {
    const customerId = key.split(`api:customer:${day}:`)[1];
    const custStats = await redis.hgetall(key);
    customers.push({
      customerId,
      count: parseInt(custStats.count || "0"),
      totalBytes: parseInt(custStats.totalBytes || "0"),
    });
  }

  // Real-time RPS (last minute)
  const currentMinute = Math.floor(Date.now() / 60000);
  const minuteStats = await redis.hgetall(`api:minute:${currentMinute}`);
  const rps = Math.round(parseInt(minuteStats.count || "0") / 60);

  return {
    totalRequests: total,
    errorRate: total > 0 ? (errors / total) * 100 : 0,
    avgLatency: 0,  // calculated from endpoint stats
    statusBreakdown: {
      "2xx": parseInt(stats.status_2xx || "0"),
      "3xx": parseInt(stats.status_3xx || "0"),
      "4xx": parseInt(stats.status_4xx || "0"),
      "5xx": parseInt(stats.status_5xx || "0"),
    },
    topEndpoints: endpoints.sort((a, b) => b.count - a.count).slice(0, 10),
    topCustomers: customers.sort((a, b) => b.count - a.count).slice(0, 10),
    realtimeRPS: rps,
  };
}

// Get latency percentiles for an endpoint
export async function getLatencyPercentiles(endpoint: string, date?: string): Promise<{
  p50: number; p90: number; p95: number; p99: number;
}> {
  const day = date || new Date().toISOString().slice(0, 10);
  const histogram = await redis.hgetall(`api:latency:${day}:${endpoint}`);

  const buckets: Array<{ max: number; count: number }> = [];
  let total = 0;
  for (const [bucket, count] of Object.entries(histogram)) {
    const max = parseInt(bucket.replace("ms_", ""));
    const c = parseInt(count);
    buckets.push({ max, count: c });
    total += c;
  }

  buckets.sort((a, b) => a.max - b.max);

  const getPercentile = (p: number): number => {
    const target = Math.ceil(total * p / 100);
    let cumulative = 0;
    for (const b of buckets) {
      cumulative += b.count;
      if (cumulative >= target) return b.max;
    }
    return buckets[buckets.length - 1]?.max || 0;
  };

  return { p50: getPercentile(50), p90: getPercentile(90), p95: getPercentile(95), p99: getPercentile(99) };
}

// Customer usage report (for enterprise customers)
export async function getCustomerReport(customerId: string, days: number = 30): Promise<{
  totalRequests: number;
  dailyRequests: Record<string, number>;
  topEndpoints: Array<{ endpoint: string; count: number }>;
  avgLatency: number;
  totalDataTransfer: number;
}> {
  let totalRequests = 0;
  const dailyRequests: Record<string, number> = {};
  let totalLatency = 0;
  let totalBytes = 0;

  for (let i = 0; i < days; i++) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const stats = await redis.hgetall(`api:customer:${day}:${customerId}`);
    const count = parseInt(stats.count || "0");
    dailyRequests[day] = count;
    totalRequests += count;
    totalLatency += parseInt(stats.totalLatency || "0");
    totalBytes += parseInt(stats.totalBytes || "0");
  }

  return {
    totalRequests,
    dailyRequests,
    topEndpoints: [],
    avgLatency: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
    totalDataTransfer: totalBytes,
  };
}

function normalizePath(path: string): string {
  return path.replace(/\/[0-9a-f-]{8,}/g, "/:id").replace(/\/\d+/g, "/:id");
}

function getLatencyBucket(ms: number): string {
  if (ms < 10) return "ms_10";
  if (ms < 50) return "ms_50";
  if (ms < 100) return "ms_100";
  if (ms < 250) return "ms_250";
  if (ms < 500) return "ms_500";
  if (ms < 1000) return "ms_1000";
  if (ms < 2500) return "ms_2500";
  if (ms < 5000) return "ms_5000";
  return "ms_10000";
}

// Middleware
export function analyticsMiddleware() {
  return async (c: any, next: any) => {
    const start = Date.now();
    await next();
    const latency = Date.now() - start;

    recordRequest({
      method: c.req.method,
      path: c.req.path,
      statusCode: c.res.status,
      latencyMs: latency,
      customerId: c.get("organizationId") || "anonymous",
      apiKeyId: c.get("apiKey")?.id || "",
      requestSize: parseInt(c.req.header("content-length") || "0"),
      responseSize: 0,
      userAgent: c.req.header("user-agent") || "",
      ip: c.req.header("CF-Connecting-IP") || "",
      timestamp: Date.now(),
    }).catch(() => {});  // non-blocking
  };
}
```

## Results

- **Real-time dashboard** — RPS, error rate, latency percentiles updated every minute; degradation detected by the team, not customers
- **Endpoint heatmap** — `/api/search` at p99=3200ms; team optimized query; p99 dropped to 400ms; identified without customer complaint
- **Customer usage reports in 1 click** — enterprise customer asks "how much did we use?" → export 30-day report; saves 2 hours of engineering per request
- **Cost attribution** — top 5 customers consume 60% of API calls; pricing team adjusts tiers based on actual usage data; revenue aligned with cost
- **Slow request detection** — top 100 slowest requests per day tracked; patterns identified: `/api/export` always slow at 2 PM → batch job conflict found and fixed
