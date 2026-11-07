---
title: Build an Observability Stack with OpenTelemetry
slug: build-observability-stack-with-opentelemetry
description: Build a full observability stack with OpenTelemetry — distributed tracing, metrics, and structured logging across microservices with automatic instrumentation and Grafana dashboards.
skills:
  - observability-setup
  - typescript
  - redis
  - postgresql
  - hono
category: devops
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

Current OpenTelemetry JS (SDK 2.x, `@opentelemetry/sdk-node` 0.3xx) needs Node.js 22.15 or newer. Install the packages:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-metrics \
  @opentelemetry/resources @opentelemetry/semantic-conventions \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/auto-instrumentations-node
```

```typescript
// src/instrumentation.ts — loaded BEFORE the app (see "Run it" below)
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

// Endpoint comes from OTEL_EXPORTER_OTLP_ENDPOINT (default http://localhost:4318);
// the exporters append /v1/traces and /v1/metrics themselves.
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "unknown-service",
    [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? "0.0.0",
    "deployment.environment.name": process.env.NODE_ENV ?? "development",
  }),
  traceExporter: new OTLPTraceExporter(),
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15000,
    }),
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-http": {
        requestHook: (span, request) => {
          const id = "headers" in request ? request.headers["x-request-id"] : undefined;
          if (typeof id === "string") span.setAttribute("app.request_id", id);
        },
      },
      "@opentelemetry/instrumentation-pg": { enhancedDatabaseReporting: false },
      "@opentelemetry/instrumentation-redis": {
        dbStatementSerializer: (cmdName, cmdArgs) => `${cmdName} ${cmdArgs[0] ?? ""}`,
      },
    }),
  ],
});

sdk.start();
process.on("SIGTERM", () => sdk.shutdown().finally(() => process.exit(0)));
```

The SDK reads `OTEL_SERVICE_NAME` and `OTEL_EXPORTER_OTLP_ENDPOINT` itself, so every service uses the same file and only the environment differs. Auto-instrumentation covers HTTP, `pg` and `redis`; it does not know about Hono, so the server span comes from the Node HTTP layer and Step 2 enriches it.

```typescript
// src/telemetry/custom-spans.ts — custom spans and metrics for business logic
import { trace, SpanStatusCode, metrics, type Span } from "@opentelemetry/api";

const tracer = trace.getTracer("app");
const meter = metrics.getMeter("app");

const orderCounter = meter.createCounter("orders.created", { description: "Orders created" });
const orderDuration = meter.createHistogram("orders.processing_duration", {
  description: "Order processing time",
  unit: "ms",
});

// One helper owns the span lifecycle: the span always ends, errors are always recorded.
async function withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}

export async function processOrder(orderId: string, userId: string) {
  const start = performance.now();
  try {
    const result = await withSpan("process_order", async (span) => {
      span.setAttribute("order.id", orderId);
      const inventory = await withSpan("validate_inventory", async (s) => {
        const r = await checkInventory(orderId);
        s.setAttribute("inventory.available", r.available);
        return r;
      });
      if (!inventory.available) throw new Error("Out of stock");
      const payment = await withSpan("charge_payment", async (s) => {
        s.setAttribute("payment.currency", "USD");
        return chargePayment(userId, inventory.total);
      });
      await withSpan("create_order_record", () => saveOrder(orderId, userId, payment.paymentId));
      return { orderId, status: "completed", paymentId: payment.paymentId };
    });
    orderCounter.add(1, { status: "success" });
    return result;
  } catch (err) {
    orderCounter.add(1, { status: "failed" });
    throw err;
  } finally {
    orderDuration.record(performance.now() - start);
  }
}

// Structured log line with trace correlation (Loki derived fields can link trace_id to Tempo)
export function log(level: string, message: string, attributes: Record<string, unknown> = {}): void {
  const ctx = trace.getActiveSpan()?.spanContext();
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      trace_id: ctx?.traceId ?? "",
      span_id: ctx?.spanId ?? "",
      service: process.env.OTEL_SERVICE_NAME,
      ...attributes,
    }),
  );
}

// Stubs standing in for your inventory, payment and database calls
async function checkInventory(_orderId: string) { return { available: true, total: 99.99 }; }
async function chargePayment(_userId: string, _amount: number) { return { paymentId: `pay_${Date.now()}` }; }
async function saveOrder(_orderId: string, _userId: string, _paymentId: string) {}
```

## Step 2: Middleware for Request Enrichment

```typescript
// src/middleware/tracing.ts — enrich the HTTP server span that auto-instrumentation already created
import type { Context, Next } from "hono";
import { routePath } from "hono/route";
import { trace, SpanStatusCode } from "@opentelemetry/api";

export function tracingMiddleware() {
  return async (c: Context, next: Next) => {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute("app.user_id", c.get("userId") ?? "anonymous");
      c.header("X-Trace-ID", span.spanContext().traceId); // handy when a user reports a slow request
    }
    await next(); // Hono turns thrown errors into c.res, so inspect the response afterwards
    if (span) {
      span.updateName(`${c.req.method} ${routePath(c)}`);
      if (c.error) span.recordException(c.error);
      if (c.res.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${c.res.status}` });
    }
  };
}
```

## Step 3: Run It Against a Local Backend

The instrumentation file must load before the application. For an ESM app such as Hono on Node, add the module-hook loader too, then run the app with the environment set:

```bash
docker run -d --name otel-lgtm -p 127.0.0.1:3000:3000 -p 127.0.0.1:4317:4317 -p 127.0.0.1:4318:4318 grafana/otel-lgtm:0.39.0

OTEL_SERVICE_NAME=orders-api OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
OTEL_SEMCONV_STABILITY_OPT_IN=http \
  node --experimental-loader=@opentelemetry/instrumentation/hook.mjs --import ./dist/instrumentation.js dist/index.js
```

`grafana/otel-lgtm` is Grafana's all-in-one development image (collector, Prometheus, Tempo, Loki, Pyroscope and Grafana; not for production). Open http://localhost:3000 (login admin/admin) and find traces in Explore with the Tempo data source. In production run Tempo, Loki and Mimir or Prometheus separately behind your own OpenTelemetry Collector, as in the observability-setup skill, and pin image tags.

## Results

Piotr's team rolled this out across the 15 services. These are the team's own results, not benchmarks:

- **p99 debugging time: 4 hours to about 10 minutes**: a trace shows which service and which database query is the bottleneck.
- **Logs correlated across services**: every log line carries `trace_id`, so one trace ID finds the logs from every service the request touched.
- **Custom business metrics**: order rate and processing-duration histograms are visible in Grafana without asking engineering.
- **Vendor-neutral**: switching the backend (Tempo, Jaeger, a hosted vendor) means changing the exporter endpoint, not the instrumentation code.

## Related Skills

- [observability-setup](/skills/observability-setup): OpenTelemetry instrumentation, collector configuration and the Grafana LGTM stack
- [typescript](/skills/typescript): typed instrumentation and helpers
- [redis](/skills/redis): traced Redis commands
- [postgresql](/skills/postgresql): traced `pg` queries
- [hono](/skills/hono): the HTTP framework being traced
