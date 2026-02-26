---
name: opentelemetry-js
description: >-
  Add distributed tracing, metrics, and logging to Node.js/TypeScript applications
  with OpenTelemetry. Use when someone asks to "add tracing", "monitor my API",
  "distributed tracing", "OpenTelemetry setup", "trace requests across services",
  "application performance monitoring", "APM without vendor lock-in", or "add
  observability to my Node app". Covers auto-instrumentation, custom spans,
  metrics, exporters (Jaeger, OTLP, Grafana), and context propagation.
license: Apache-2.0
compatibility: "Node.js 18+. Any OTLP-compatible backend (Jaeger, Grafana, Datadog, etc.)."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["observability", "tracing", "metrics", "opentelemetry", "apm", "monitoring"]
---

# OpenTelemetry JS

## Overview

OpenTelemetry is the vendor-neutral standard for application observability. Add tracing, metrics, and logging to your Node.js app with one setup — then send data to any backend (Jaeger, Grafana, Datadog, New Relic). No vendor lock-in. Auto-instrumentation captures HTTP, database, and framework calls without code changes.

## When to Use

- Need to trace requests across multiple microservices
- Want APM (Application Performance Monitoring) without vendor lock-in
- Debugging slow API endpoints — need to see where time is spent
- Adding custom metrics (request count, queue depth, business KPIs)
- Replacing Datadog/New Relic with open-source (Jaeger + Grafana)

## Instructions

### Setup with Auto-Instrumentation

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
```

```typescript
// instrumentation.ts — OpenTelemetry setup (import FIRST, before anything else)
/**
 * Must be imported before any other module.
 * Auto-instruments: HTTP, Express, Fastify, Prisma, pg, Redis, fetch.
 * Run: node --import ./instrumentation.ts src/index.ts
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: "my-api",
    [ATTR_SERVICE_VERSION]: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  }),

  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
  }),

  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/metrics",
    }),
    exportIntervalMillis: 10000,  // Export every 10 seconds
  }),

  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },  // Too noisy
    }),
  ],
});

sdk.start();
console.log("📊 OpenTelemetry initialized");

process.on("SIGTERM", () => sdk.shutdown());
```

### Custom Spans

```typescript
// src/services/order.ts — Add custom spans for business logic
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("order-service");

async function processOrder(orderId: string): Promise<Order> {
  // Create a custom span
  return tracer.startActiveSpan("processOrder", async (span) => {
    span.setAttribute("order.id", orderId);

    try {
      // Child span — payment processing
      const payment = await tracer.startActiveSpan("chargePayment", async (paymentSpan) => {
        paymentSpan.setAttribute("payment.method", "stripe");
        const result = await stripe.charges.create({ amount: order.total });
        paymentSpan.setAttribute("payment.id", result.id);
        paymentSpan.end();
        return result;
      });

      // Child span — send confirmation email
      await tracer.startActiveSpan("sendConfirmation", async (emailSpan) => {
        await sendEmail(order.email, "Order confirmed!");
        emailSpan.end();
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return order;

    } catch (error: any) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Custom Metrics

```typescript
// src/metrics.ts — Business metrics with OpenTelemetry
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("my-api");

// Counter — total requests
const requestCounter = meter.createCounter("http.requests.total", {
  description: "Total HTTP requests",
});

// Histogram — response time distribution
const responseTime = meter.createHistogram("http.response.time", {
  description: "HTTP response time in milliseconds",
  unit: "ms",
});

// Up/Down Counter — active connections
const activeConnections = meter.createUpDownCounter("ws.connections.active", {
  description: "Active WebSocket connections",
});

// Usage in middleware
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  requestCounter.add(1, { method: req.method, path: req.path });

  res.on("finish", () => {
    responseTime.record(Date.now() - start, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
    });
  });

  next();
}
```

### Docker Compose with Jaeger

```yaml
# docker-compose.yml — Local observability stack
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"   # Jaeger UI
      - "4318:4318"     # OTLP HTTP receiver
    environment:
      COLLECTOR_OTLP_ENABLED: true

  my-api:
    build: .
    environment:
      OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4318
    depends_on: [jaeger]
```

## Examples

### Example 1: Trace slow API endpoints

**User prompt:** "My API has random slow responses. Add tracing to see where the time is spent."

The agent will set up auto-instrumentation to capture HTTP + database spans, add custom spans around business logic, and configure Jaeger for visualization.

### Example 2: Monitor microservice health with metrics

**User prompt:** "Add request count, error rate, and response time metrics to my Express API."

The agent will create custom metrics with the Meter API, add middleware to record them, and configure OTLP export to Grafana/Prometheus.

## Guidelines

- **Import instrumentation FIRST** — before any other module; use `--import` flag
- **Auto-instrumentation covers 80%** — HTTP, databases, Redis, gRPC all captured automatically
- **Custom spans for business logic** — auto-instrumentation doesn't know about your domain
- **Always `span.end()`** — forgetting to end spans causes memory leaks
- **Record exceptions with `span.recordException()`** — errors are visible in traces
- **Attributes = searchable metadata** — add order IDs, user IDs, feature flags to spans
- **Metrics for dashboards, traces for debugging** — they serve different purposes
- **OTLP is the standard** — use OTLP exporters; all major backends support it
- **Start with Jaeger locally** — single docker image, web UI at port 16686
- **Sampling in production** — don't trace 100% of requests; 10% is usually enough
