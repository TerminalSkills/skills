---
title: Build an Observability Stack with OpenTelemetry
slug: build-observability-stack-with-opentelemetry
description: Build a full observability stack with OpenTelemetry — distributed tracing, metrics, and structured logging across microservices with automatic instrumentation and Grafana dashboards.
skills:
  - typescript
  - redis
  - postgresql
  - hono
category: DevOps & Infrastructure
tags:
  - observability
  - opentelemetry
  - tracing
  - metrics
  - monitoring
---

# Build an Observability Stack with OpenTelemetry

## The Problem

Piotr leads SRE at a 45-person company with 15 microservices. When a request is slow, nobody knows which service is the bottleneck. Logs are scattered across services with no correlation. Metrics exist for each service individually, but there's no way to trace a single user request across services. Last week a p99 latency spike took 4 hours to debug because the team checked each service manually. They need distributed tracing that follows requests across services, correlated logs, and unified metrics — all with a single instrumentation standard.

## Step 1: Build the OpenTelemetry Instrumentation

```typescript
// src/telemetry/setup.ts — OpenTelemetry auto-instrumentation for Node.js
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { W3CTraceContextPropagator } from "@opentelemetry/core";

const SERVICE_NAME = process.env.SERVICE_NAME || "unknown-service";
const OTEL_ENDPOINT = process.env.OTEL_ENDPOINT || "http://localhost:4318";

export function initTelemetry(): NodeSDK {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION || "0.0.0",
      "deployment.environment": process.env.NODE_ENV || "development",
    }),

    // Distributed tracing
    traceExporter: new OTLPTraceExporter({
      url: `${OTEL_ENDPOINT}/v1/traces`,
    }),

    // Metrics
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${OTEL_ENDPOINT}/v1/metrics`,
      }),
      exportIntervalMillis: 15000, // export every 15s
    }),

    // Auto-instrument everything: HTTP, pg, Redis, Express/Hono
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-http": {
          requestHook: (span, request) => {
            span.setAttribute("http.request_id", request.headers?.["x-request-id"] || "");
          },
        },
        "@opentelemetry/instrumentation-pg": {
          enhancedDatabaseReporting: true,
        },
        "@opentelemetry/instrumentation-redis": {
          dbStatementSerializer: (cmdName, cmdArgs) => `${cmdName} ${cmdArgs[0] || ""}`,
        },
      }),
    ],

    textMapPropagator: new W3CTraceContextPropagator(),
  });

  sdk.start();
  console.log(`[Telemetry] OpenTelemetry initialized for ${SERVICE_NAME}`);

  // Graceful shutdown
  process.on("SIGTERM", () => sdk.shutdown());

  return sdk;
}
```

```typescript
// src/telemetry/custom-spans.ts — Custom spans for business logic
import { trace, SpanStatusCode, metrics } from "@opentelemetry/api";

const tracer = trace.getTracer("app");
const meter = metrics.getMeter("app");

// Custom metrics
const orderCounter = meter.createCounter("orders.created", {
  description: "Number of orders created",
});

const orderDuration = meter.createHistogram("orders.processing_duration_ms", {
  description: "Order processing time in milliseconds",
  unit: "ms",
});

const activeUsers = meter.createUpDownCounter("users.active", {
  description: "Currently active users",
});

// Wrap business logic in custom spans
export async function processOrder(orderId: string, userId: string): Promise<any> {
  return tracer.startActiveSpan("process_order", async (span) => {
    span.setAttribute("order.id", orderId);
    span.setAttribute("user.id", userId);

    const startTime = Date.now();

    try {
      // Step 1: Validate inventory
      const inventory = await tracer.startActiveSpan("validate_inventory", async (inventorySpan) => {
        const result = await checkInventory(orderId);
        inventorySpan.setAttribute("inventory.available", result.available);
        inventorySpan.setAttribute("inventory.quantity", result.quantity);
        inventorySpan.end();
        return result;
      });

      if (!inventory.available) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: "Out of stock" });
        span.setAttribute("order.status", "rejected");
        span.end();
        throw new Error("Out of stock");
      }

      // Step 2: Charge payment
      const payment = await tracer.startActiveSpan("charge_payment", async (paymentSpan) => {
        paymentSpan.setAttribute("payment.amount", inventory.total);
        paymentSpan.setAttribute("payment.currency", "USD");
        const result = await chargePayment(userId, inventory.total);
        paymentSpan.setAttribute("payment.id", result.paymentId);
        paymentSpan.end();
        return result;
      });

      // Step 3: Create order record
      await tracer.startActiveSpan("create_order_record", async (dbSpan) => {
        await saveOrder(orderId, userId, payment.paymentId);
        dbSpan.end();
      });

      // Metrics
      orderCounter.add(1, { status: "success", payment_method: "card" });
      orderDuration.record(Date.now() - startTime, { status: "success" });

      span.setAttribute("order.status", "completed");
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return { orderId, status: "completed", paymentId: payment.paymentId };
    } catch (err: any) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);
      orderCounter.add(1, { status: "failed" });
      orderDuration.record(Date.now() - startTime, { status: "failed" });
      span.end();
      throw err;
    }
  });
}

// Structured logging with trace correlation
export function log(level: string, message: string, attributes: Record<string, any> = {}): void {
  const activeSpan = trace.getActiveSpan();
  const traceId = activeSpan?.spanContext().traceId || "";
  const spanId = activeSpan?.spanContext().spanId || "";

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    traceId,
    spanId,
    service: process.env.SERVICE_NAME,
    ...attributes,
  };

  console.log(JSON.stringify(logEntry));
}

async function checkInventory(orderId: string) { return { available: true, quantity: 1, total: 99.99 }; }
async function chargePayment(userId: string, amount: number) { return { paymentId: `pay_${Date.now()}` }; }
async function saveOrder(orderId: string, userId: string, paymentId: string) { /* db insert */ }
```

## Step 2: Middleware for Automatic Request Tracing

```typescript
// src/middleware/tracing.ts — Request tracing middleware
import { Context, Next } from "hono";
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("http");

export function tracingMiddleware() {
  return async (c: Context, next: Next) => {
    const span = trace.getActiveSpan();

    if (span) {
      // Add request attributes
      span.setAttribute("http.user_id", c.get("userId") || "anonymous");
      span.setAttribute("http.route", c.req.routePath || c.req.path);

      // Add trace ID to response headers (for debugging)
      c.header("X-Trace-ID", span.spanContext().traceId);
    }

    try {
      await next();

      if (span && c.res.status >= 400) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${c.res.status}` });
      }
    } catch (err: any) {
      if (span) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        span.recordException(err);
      }
      throw err;
    }
  };
}
```

## Results

- **p99 debugging time: 4 hours → 10 minutes** — distributed traces show exactly which service and which database query is the bottleneck; one click from slow request to root cause
- **Logs correlated across 15 services** — every log entry includes traceId; searching for one request ID shows logs from all services it touched, in order
- **Custom business metrics** — order processing rate, payment success rate, and duration histograms visible in Grafana; product team monitors without asking engineering
- **Auto-instrumentation covers 90% of spans** — HTTP, PostgreSQL, Redis, and inter-service calls traced automatically; only business logic needs manual spans
- **Vendor-neutral** — OpenTelemetry standard means switching from Jaeger to Tempo or from Prometheus to Datadog requires changing only the exporter config, not instrumentation code
