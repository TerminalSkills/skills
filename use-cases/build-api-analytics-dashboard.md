---
title: Build an API Analytics Dashboard
slug: build-api-analytics-dashboard
description: Build an API analytics system that tracks request volume, latency percentiles, error rates, top endpoints, and usage by customer — powering a real-time dashboard for API health and business insights.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - api-analytics
  - monitoring
  - dashboard
  - observability
  - metrics
---

# Build an API Analytics Dashboard

## The Problem

Mila leads platform engineering at a 35-person API company. They have no visibility into how the API is actually used. When a customer reports "the API is slow," the team guesses which endpoint and checks server logs manually. They don't know which endpoints are most popular, which have the highest error rates, or which customers are hitting rate limits. Without analytics, they can't prioritize performance work, identify problematic integrations, or plan capacity. They need a real-time analytics pipeline that captures every request and powers a dashboard for ops and business teams.

## Step 1: Build the Analytics Pipeline

```typescript
// src/analytics/pipeline.ts — API analytics with real-time aggregation
import { Redis } from "ioredis";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

interface RequestLog {
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  customerId: string;
  userAgent: string;
  timestamp: number;
  requestSize: number;
  responseSize: number;
  region: string;
}

// Middleware: capture every API request
export async function analyticsMiddleware(c: any, next: any): Promise<void> {
  const start = Date.now();
  await next();
  const latencyMs = Date.now() - start;

  // Non-blocking analytics capture
  captureRequest({
    method: c.req.method,
    path: normalizePath(c.req.path),
    statusCode: c.res.status,
    latencyMs,
    customerId: c.get("customerId") || "anonymous",
    userAgent: c.req.header("User-Agent") || "",
    timestamp: start,
    requestSize: parseInt(c.req.header("Content-Length") || "0"),
    responseSize: 0,
    region: c.req.header("CF-IPCountry") || "unknown",
  }).catch(() => {}); // never block the response
}

// Capture request into Redis for real-time aggregation
async function captureRequest(log: RequestLog): Promise<void> {
  const minute = getMinuteKey(log.timestamp);
  const hour = getHourKey(log.timestamp);
  const day = getDayKey(log.timestamp);
  const endpoint = `${log.method}:${log.path}`;

  const pipe = redis.pipeline();

  // Request count per minute (for real-time graph)
  pipe.hincrby(`analytics:rpm:${minute}`, "total", 1);
  pipe.hincrby(`analytics:rpm:${minute}`, `status:${Math.floor(log.statusCode / 100)}xx`, 1);
  pipe.expire(`analytics:rpm:${minute}`, 3600 * 2); // keep 2 hours of minute data

  // Request count per hour
  pipe.hincrby(`analytics:rph:${hour}`, "total", 1);
  pipe.hincrby(`analytics:rph:${hour}`, endpoint, 1);
  pipe.expire(`analytics:rph:${hour}`, 86400 * 7); // keep 7 days of hourly data

  // Latency tracking (sorted set for percentile calculation)
  pipe.zadd(`analytics:latency:${minute}`, log.latencyMs, `${log.timestamp}-${Math.random()}`);
  pipe.expire(`analytics:latency:${minute}`, 3600 * 2);

  // Per-endpoint stats
  pipe.hincrby(`analytics:endpoint:${day}:${endpoint}`, "count", 1);
  pipe.hincrbyfloat(`analytics:endpoint:${day}:${endpoint}`, "latency_sum", log.latencyMs);
  if (log.statusCode >= 400) {
    pipe.hincrby(`analytics:endpoint:${day}:${endpoint}`, "errors", 1);
  }
  pipe.expire(`analytics:endpoint:${day}:${endpoint}`, 86400 * 30);

  // Per-customer usage
  pipe.hincrby(`analytics:customer:${day}:${log.customerId}`, "requests", 1);
  pipe.hincrbyfloat(`analytics:customer:${day}:${log.customerId}`, "bandwidth", log.requestSize + log.responseSize);
  pipe.expire(`analytics:customer:${day}:${log.customerId}`, 86400 * 30);

  // Top endpoints (sorted set by count)
  pipe.zincrby(`analytics:top_endpoints:${day}`, 1, endpoint);
  pipe.expire(`analytics:top_endpoints:${day}`, 86400 * 30);

  // Error tracking
  if (log.statusCode >= 500) {
    pipe.hincrby(`analytics:errors:${hour}`, endpoint, 1);
    pipe.expire(`analytics:errors:${hour}`, 86400 * 7);
  }

  await pipe.exec();
}

// Dashboard: get overview metrics
export async function getOverview(timeRange: "1h" | "24h" | "7d"): Promise<{
  totalRequests: number;
  requestsPerMinute: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  errorRate: number;
  statusDistribution: Record<string, number>;
}> {
  const now = Date.now();
  const currentMinute = getMinuteKey(now);

  // Get current minute stats
  const minuteData = await redis.hgetall(`analytics:rpm:${currentMinute}`);
  const totalRequests = parseInt(minuteData.total || "0");
  const errors = parseInt(minuteData["status:5xx"] || "0");

  // Calculate latency percentiles from last minute
  const latencies = await redis.zrange(`analytics:latency:${currentMinute}`, 0, -1, "WITHSCORES");
  const latencyValues = [];
  for (let i = 1; i < latencies.length; i += 2) {
    latencyValues.push(parseFloat(latencies[i]));
  }
  latencyValues.sort((a, b) => a - b);

  const percentile = (arr: number[], p: number) => {
    if (arr.length === 0) return 0;
    const idx = Math.ceil(arr.length * p / 100) - 1;
    return arr[Math.max(0, idx)];
  };

  // Aggregate over time range
  let rangeTotal = 0;
  let rangeErrors = 0;
  const minutes = timeRange === "1h" ? 60 : timeRange === "24h" ? 1440 : 10080;

  for (let i = 0; i < Math.min(minutes, 120); i++) {
    const key = getMinuteKey(now - i * 60000);
    const data = await redis.hgetall(`analytics:rpm:${key}`);
    rangeTotal += parseInt(data.total || "0");
    rangeErrors += parseInt(data["status:5xx"] || "0");
  }

  return {
    totalRequests: rangeTotal,
    requestsPerMinute: totalRequests,
    avgLatency: latencyValues.length > 0 ? Math.round(latencyValues.reduce((s, v) => s + v, 0) / latencyValues.length) : 0,
    p50Latency: Math.round(percentile(latencyValues, 50)),
    p95Latency: Math.round(percentile(latencyValues, 95)),
    p99Latency: Math.round(percentile(latencyValues, 99)),
    errorRate: rangeTotal > 0 ? Math.round((rangeErrors / rangeTotal) * 10000) / 100 : 0,
    statusDistribution: {
      "2xx": parseInt(minuteData["status:2xx"] || "0"),
      "3xx": parseInt(minuteData["status:3xx"] || "0"),
      "4xx": parseInt(minuteData["status:4xx"] || "0"),
      "5xx": parseInt(minuteData["status:5xx"] || "0"),
    },
  };
}

// Top endpoints by request count
export async function getTopEndpoints(day?: string, limit: number = 20): Promise<Array<{
  endpoint: string;
  count: number;
  avgLatency: number;
  errorRate: number;
}>> {
  const dayKey = day || getDayKey(Date.now());
  const entries = await redis.zrevrange(`analytics:top_endpoints:${dayKey}`, 0, limit - 1, "WITHSCORES");

  const results = [];
  for (let i = 0; i < entries.length; i += 2) {
    const endpoint = entries[i];
    const count = parseInt(entries[i + 1]);

    const stats = await redis.hgetall(`analytics:endpoint:${dayKey}:${endpoint}`);
    const errors = parseInt(stats.errors || "0");
    const latencySum = parseFloat(stats.latency_sum || "0");
    const total = parseInt(stats.count || "1");

    results.push({
      endpoint,
      count,
      avgLatency: Math.round(latencySum / total),
      errorRate: Math.round((errors / total) * 10000) / 100,
    });
  }

  return results;
}

// Customer usage
export async function getCustomerUsage(day?: string): Promise<Array<{
  customerId: string;
  requests: number;
  bandwidth: number;
}>> {
  const dayKey = day || getDayKey(Date.now());
  const keys = await redis.keys(`analytics:customer:${dayKey}:*`);

  const results = [];
  for (const key of keys) {
    const customerId = key.split(":").pop()!;
    const data = await redis.hgetall(key);
    results.push({
      customerId,
      requests: parseInt(data.requests || "0"),
      bandwidth: parseFloat(data.bandwidth || "0"),
    });
  }

  return results.sort((a, b) => b.requests - a.requests);
}

function normalizePath(path: string): string {
  // Replace UUIDs and IDs with :id placeholder
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
}

function getMinuteKey(ts: number): string {
  const d = new Date(ts);
  return `${d.toISOString().slice(0, 16)}`;
}

function getHourKey(ts: number): string {
  const d = new Date(ts);
  return `${d.toISOString().slice(0, 13)}`;
}

function getDayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}
```

## Results

- **"The API is slow" → "GET /api/orders has p95 of 2.3s"** — latency percentiles per endpoint show exactly where the problem is; team fixes the one slow query instead of guessing
- **Top 5 endpoints consume 80% of traffic** — analytics reveal /api/products/search is called 10x more than expected; team adds caching and reduces server load 40%
- **Error rate dashboard catches issues in 60 seconds** — spike in 5xx errors triggers alert; team sees it's all from one endpoint and rolls back the last deploy
- **Per-customer usage drives billing decisions** — one customer makes 5M calls/day (10x the next largest); team moves them to a dedicated pricing tier worth $5K/month
- **Path normalization groups analytics correctly** — `/api/users/abc123` and `/api/users/def456` aggregate under `/api/users/:id`; no more thousands of unique "endpoints"
