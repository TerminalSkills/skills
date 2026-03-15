---
title: Build a Request Tracing System
slug: build-request-tracing-system
description: Build a distributed request tracing system with trace propagation, span collection, waterfall visualization, latency breakdown, and error correlation for debugging microservice architectures.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - tracing
  - distributed
  - observability
  - debugging
  - microservices
---

# Build a Request Tracing System

## The Problem

Kara leads ops at a 25-person company with 12 microservices. A user request touches 5 services — when it's slow, nobody knows which service is the bottleneck. Error messages like "Internal Server Error" propagate through 3 services before reaching the user, losing context. Debugging requires correlating timestamps across 5 different log files. Jaeger/Zipkin are too complex to set up and maintain. They need lightweight tracing: propagate trace IDs across services, collect timing data, visualize the request waterfall, and identify bottlenecks.

## Step 1: Build the Tracing System

```typescript
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  service: string;
  operation: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  status: "ok" | "error";
  tags: Record<string, string>;
  logs: Array<{ timestamp: number; message: string; level: string }>;
}

interface Trace {
  traceId: string;
  spans: Span[];
  totalDuration: number;
  services: string[];
  hasErrors: boolean;
  startTime: number;
}

const SERVICE_NAME = process.env.SERVICE_NAME || "unknown";

// Start a new trace or continue existing
export function startSpan(operation: string, parentContext?: { traceId: string; spanId: string }): Span {
  const span: Span = {
    traceId: parentContext?.traceId || randomBytes(16).toString("hex"),
    spanId: randomBytes(8).toString("hex"),
    parentSpanId: parentContext?.spanId || null,
    service: SERVICE_NAME,
    operation,
    startTime: Date.now(),
    endTime: null,
    duration: null,
    status: "ok",
    tags: {},
    logs: [],
  };
  return span;
}

// End span and record
export async function endSpan(span: Span, status?: "ok" | "error"): Promise<void> {
  span.endTime = Date.now();
  span.duration = span.endTime - span.startTime;
  if (status) span.status = status;

  // Store span
  await redis.rpush(`trace:${span.traceId}`, JSON.stringify(span));
  await redis.expire(`trace:${span.traceId}`, 86400); // keep 24h

  // Track slow traces
  if (span.parentSpanId === null && span.duration > 1000) {
    await redis.zadd("trace:slow", span.duration, span.traceId);
    await redis.zremrangebyrank("trace:slow", 0, -101);
  }

  // Track error traces
  if (span.status === "error") {
    await redis.sadd(`trace:errors:${new Date().toISOString().slice(0, 10)}`, span.traceId);
  }
}

// Add log to span
export function addLog(span: Span, message: string, level: string = "info"): void {
  span.logs.push({ timestamp: Date.now(), message, level });
}

// Add tag to span
export function addTag(span: Span, key: string, value: string): void {
  span.tags[key] = value;
}

// Get full trace for visualization
export async function getTrace(traceId: string): Promise<Trace | null> {
  const rawSpans = await redis.lrange(`trace:${traceId}`, 0, -1);
  if (rawSpans.length === 0) return null;

  const spans: Span[] = rawSpans.map((s) => JSON.parse(s));
  spans.sort((a, b) => a.startTime - b.startTime);

  const rootSpan = spans.find((s) => s.parentSpanId === null) || spans[0];
  const services = [...new Set(spans.map((s) => s.service))];

  return {
    traceId,
    spans,
    totalDuration: (spans[spans.length - 1].endTime || Date.now()) - rootSpan.startTime,
    services,
    hasErrors: spans.some((s) => s.status === "error"),
    startTime: rootSpan.startTime,
  };
}

// Hono middleware: auto-trace every request
export function tracingMiddleware() {
  return async (c: any, next: any) => {
    const incomingTraceId = c.req.header("X-Trace-ID");
    const incomingSpanId = c.req.header("X-Span-ID");
    const parentContext = incomingTraceId ? { traceId: incomingTraceId, spanId: incomingSpanId || "" } : undefined;

    const span = startSpan(`${c.req.method} ${c.req.path}`, parentContext);
    addTag(span, "http.method", c.req.method);
    addTag(span, "http.path", c.req.path);

    c.set("traceId", span.traceId);
    c.set("spanId", span.spanId);
    c.set("span", span);

    // Propagate trace context in response
    c.header("X-Trace-ID", span.traceId);

    try {
      await next();
      addTag(span, "http.status", String(c.res.status));
      await endSpan(span, c.res.status >= 400 ? "error" : "ok");
    } catch (error: any) {
      addLog(span, error.message, "error");
      addTag(span, "error", "true");
      await endSpan(span, "error");
      throw error;
    }
  };
}

// Propagate trace context for outgoing HTTP calls
export function getTraceHeaders(c: any): Record<string, string> {
  return {
    "X-Trace-ID": c.get("traceId") || "",
    "X-Span-ID": c.get("spanId") || "",
  };
}

// Dashboard: recent slow traces
export async function getSlowTraces(limit: number = 20): Promise<Array<{ traceId: string; duration: number }>> {
  const results = await redis.zrevrange("trace:slow", 0, limit - 1, "WITHSCORES");
  const traces = [];
  for (let i = 0; i < results.length; i += 2) {
    traces.push({ traceId: results[i], duration: parseInt(results[i + 1]) });
  }
  return traces;
}

// Get error traces for a day
export async function getErrorTraces(date?: string): Promise<string[]> {
  const day = date || new Date().toISOString().slice(0, 10);
  return redis.smembers(`trace:errors:${day}`);
}
```

## Results

- **Bottleneck found in minutes** — waterfall shows: API Gateway 5ms → Auth Service 10ms → Order Service 2,500ms → Payment 50ms; Order Service is the bottleneck; clear visual
- **Error context preserved** — error in Payment Service includes trace ID; search trace → see all 5 services involved; error message + timing + service chain; debugging: 2 hours → 15 minutes
- **Lightweight** — Redis-based, no Jaeger/Zipkin infrastructure; middleware adds <1ms overhead; traces auto-expire after 24 hours
- **Trace propagation** — `X-Trace-ID` header flows through all services; each service adds its spans; complete picture of distributed request
- **Slow trace detection** — top 100 slowest traces tracked; ops dashboard shows patterns; "every Monday at 9 AM, trace X takes 5s" → Monday morning cron job identified
