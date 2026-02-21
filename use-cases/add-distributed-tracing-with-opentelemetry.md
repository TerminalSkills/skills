---
title: Add Distributed Tracing with OpenTelemetry
slug: add-distributed-tracing-with-opentelemetry
description: Instrument a microservices architecture with OpenTelemetry to trace requests across services, correlate logs with traces, and identify the exact service causing latency spikes — reducing mean time to resolution from 2 hours to 15 minutes.
skills:
  - opentelemetry
  - error-monitoring
  - docker-helper
category: Observability
tags:
  - tracing
  - monitoring
  - microservices
  - debugging
  - performance
---

# Add Distributed Tracing with OpenTelemetry

Tomás runs infrastructure at a 25-person e-commerce company. Their checkout flow touches six services: API gateway, cart, inventory, payments, notifications, and shipping. When a customer reports "checkout took 30 seconds," the team spends two hours grepping logs across six services trying to reconstruct what happened. Last month a P1 incident took four hours to diagnose because the root cause was a slow database query in the inventory service, buried under misleading error messages from downstream services that timed out waiting for it. He wants a single trace ID that follows a request across every service, showing exactly where time is spent.

## Step 1 — Set Up the OpenTelemetry Collector

The Collector sits between applications and backends. It receives telemetry data via OTLP, processes it (batching, sampling, enrichment), and exports to one or more backends. This decouples applications from the observability vendor — switching from Jaeger to Grafana Tempo requires changing one Collector config, not six services.

```yaml
# otel-collector-config.yaml — Collector pipeline configuration.
# Receives OTLP from all services, processes in batches, exports to
# Jaeger (traces), Prometheus (metrics), and Loki (logs).

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317      # gRPC — primary protocol, used by SDKs
      http:
        endpoint: 0.0.0.0:4318      # HTTP — fallback for environments that block gRPC

processors:
  # Batch telemetry to reduce export overhead
  batch:
    timeout: 5s                      # Flush every 5 seconds
    send_batch_size: 1024            # Or when 1024 items accumulate

  # Prevent OOM if a service floods telemetry data
  memory_limiter:
    check_interval: 1s
    limit_mib: 512                   # Hard limit — start dropping data
    spike_limit_mib: 128             # Soft limit — start throttling

  # Add deployment metadata to all telemetry
  resource:
    attributes:
      - key: deployment.environment
        value: production
        action: upsert
      - key: service.namespace
        value: checkout-platform
        action: upsert

  # Tail-based sampling: keep 100% of error traces, 10% of successful ones
  tail_sampling:
    decision_wait: 10s               # Wait 10s for all spans of a trace to arrive
    policies:
      - name: errors-always
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow-requests
        type: latency
        latency: { threshold_ms: 2000 }  # Keep all traces slower than 2s
      - name: sample-rest
        type: probabilistic
        probabilistic: { sampling_percentage: 10 }

exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true                 # Internal network — TLS handled by service mesh

  prometheus:
    endpoint: 0.0.0.0:8889          # Prometheus scrapes this endpoint
    resource_to_telemetry_conversion:
      enabled: true                  # service.name becomes a Prometheus label

  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, tail_sampling, batch, resource]
      exporters: [otlp/jaeger]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource]
      exporters: [loki]
```

The tail-based sampling policy is the most important decision here. It keeps 100% of error traces and slow traces (the ones you actually investigate) while sampling only 10% of successful fast requests (the ones you rarely look at). This cuts storage costs by ~90% without losing debugging capability.

## Step 2 — Instrument the Node.js Services

Auto-instrumentation captures HTTP requests, database queries, and external calls without modifying application code. Custom spans add business context that auto-instrumentation can't know about — like which payment provider was used or how many items were in the cart.

```typescript
// src/telemetry/setup.ts — OpenTelemetry initialization.
// This file MUST be imported before any other module — the SDK needs
// to patch HTTP, Express, etc. before they're loaded.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";

const collectorUrl = process.env.OTEL_COLLECTOR_URL || "http://otel-collector:4317";

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME || "unknown-service",
    [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION || "0.0.0",
    "deployment.environment": process.env.NODE_ENV || "development",
  }),

  traceExporter: new OTLPTraceExporter({ url: collectorUrl }),

  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: collectorUrl }),
    exportIntervalMillis: 15000,  // Export metrics every 15 seconds
  }),

  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({ url: collectorUrl })
  ),

  instrumentations: [
    getNodeAutoInstrumentations({
      // Customize which libraries to instrument
      "@opentelemetry/instrumentation-http": {
        // Don't trace health checks — they create noise
        ignoreIncomingRequestHook: (req) =>
          req.url === "/health" || req.url === "/ready",
      },
      "@opentelemetry/instrumentation-express": { enabled: true },
      "@opentelemetry/instrumentation-pg": {
        // Include SQL query text in spans (careful: may contain PII)
        enhancedDatabaseReporting: true,
      },
      "@opentelemetry/instrumentation-redis": { enabled: true },
      // Disable noisy instrumentations
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
    }),
  ],
});

sdk.start();

// Graceful shutdown — flush pending telemetry before process exits
process.on("SIGTERM", () => {
  sdk.shutdown()
    .then(() => console.log("Telemetry SDK shut down"))
    .catch((err) => console.error("Error shutting down SDK", err))
    .finally(() => process.exit(0));
});

export { sdk };
```

```typescript
// src/routes/checkout.ts — Checkout handler with custom spans.
// Auto-instrumentation captures the HTTP request and database queries.
// Custom spans add business context: payment provider, cart value, item count.

import { trace, SpanStatusCode, context } from "@opentelemetry/api";
import type { Request, Response } from "express";

const tracer = trace.getTracer("checkout-service", "1.0.0");

export async function handleCheckout(req: Request, res: Response) {
  // Custom span wraps the entire checkout business logic
  return tracer.startActiveSpan("checkout.process", async (span) => {
    try {
      const { cartId, paymentMethod } = req.body;

      // Add business attributes — these show up in Jaeger/Grafana
      span.setAttribute("checkout.cart_id", cartId);
      span.setAttribute("checkout.payment_method", paymentMethod);

      // Step 1: Validate cart (calls inventory service via HTTP)
      const cart = await tracer.startActiveSpan("checkout.validate_cart", async (cartSpan) => {
        const result = await inventoryClient.validateCart(cartId);
        cartSpan.setAttribute("cart.item_count", result.items.length);
        cartSpan.setAttribute("cart.total_cents", result.totalCents);
        cartSpan.end();
        return result;
      });

      span.setAttribute("checkout.total_cents", cart.totalCents);
      span.setAttribute("checkout.item_count", cart.items.length);

      // Step 2: Process payment (calls payment service)
      const payment = await tracer.startActiveSpan("checkout.process_payment", async (paySpan) => {
        paySpan.setAttribute("payment.provider", paymentMethod);
        paySpan.setAttribute("payment.amount_cents", cart.totalCents);

        try {
          const result = await paymentClient.charge(cart.totalCents, paymentMethod);
          paySpan.setAttribute("payment.transaction_id", result.transactionId);
          paySpan.setStatus({ code: SpanStatusCode.OK });
          paySpan.end();
          return result;
        } catch (err) {
          paySpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : "Payment failed",
          });
          paySpan.recordException(err as Error);
          paySpan.end();
          throw err;
        }
      });

      // Step 3: Reserve inventory (calls inventory service)
      await inventoryClient.reserve(cartId, payment.transactionId);

      // Step 4: Send confirmation (calls notification service)
      // Fire-and-forget — don't block the response
      notificationClient.sendConfirmation(req.user.email, payment.transactionId)
        .catch((err) => span.addEvent("notification_failed", { error: err.message }));

      span.setStatus({ code: SpanStatusCode.OK });
      res.json({ orderId: payment.transactionId, status: "confirmed" });
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : "Checkout failed",
      });
      span.recordException(err as Error);
      res.status(500).json({ error: "Checkout failed" });
    } finally {
      span.end();
    }
  });
}
```

The nested spans (`checkout.process` → `checkout.validate_cart` → `checkout.process_payment`) create a tree structure in the trace visualizer. When checkout takes 30 seconds, the team sees instantly: "validate_cart: 200ms, process_payment: 28s, reserve: 500ms" — the payment service is the bottleneck.

## Step 3 — Correlate Logs with Traces

When a trace shows an error in the payment service, the team needs to see the actual log messages from that specific request — not every log from the payment service in the last hour.

```typescript
// src/lib/logger.ts — Structured logger with trace correlation.
// Every log message includes the active trace ID and span ID.
// In Grafana, clicking a trace ID jumps directly to related logs.

import pino from "pino";
import { context, trace } from "@opentelemetry/api";

function getTraceContext() {
  const activeSpan = trace.getSpan(context.active());
  if (!activeSpan) return {};

  const spanContext = activeSpan.spanContext();
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags,
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  mixin() {
    // Automatically inject trace context into every log line
    return getTraceContext();
  },
  formatters: {
    level(label) {
      // Grafana Loki expects "level" not "lvl"
      return { level: label };
    },
  },
});

// Usage in any handler:
// logger.info({ cartId, itemCount: 5 }, "Cart validated successfully");
// Output: {"level":"info","trace_id":"abc123...","span_id":"def456...","cartId":"cart_789","itemCount":5,"msg":"Cart validated successfully"}
```

## Step 4 — Deploy the Observability Stack

```yaml
# docker-compose.observability.yml — Full observability stack.
# Jaeger for traces, Prometheus for metrics, Loki for logs, Grafana for dashboards.

services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.96.0
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"     # OTLP gRPC
      - "4318:4318"     # OTLP HTTP
      - "8889:8889"     # Prometheus metrics endpoint

  jaeger:
    image: jaegertracing/all-in-one:1.54
    ports:
      - "16686:16686"   # Jaeger UI
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  prometheus:
    image: prom/prometheus:v2.50.0
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  loki:
    image: grafana/loki:2.9.4
    ports:
      - "3100:3100"

  grafana:
    image: grafana/grafana:10.3.0
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
```

```yaml
# prometheus.yml — Scrape the OTel Collector's metrics endpoint.

global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "otel-collector"
    static_configs:
      - targets: ["otel-collector:8889"]
```

## Step 5 — Build Dashboards and Alerts

```typescript
// src/telemetry/custom-metrics.ts — Business metrics alongside technical ones.
// These metrics appear in Grafana dashboards next to latency and error rates.

import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("checkout-service", "1.0.0");

// Business metrics
export const checkoutCounter = meter.createCounter("checkout.completed", {
  description: "Number of completed checkouts",
  unit: "1",
});

export const checkoutValueHistogram = meter.createHistogram("checkout.value", {
  description: "Distribution of checkout values",
  unit: "cents",
  advice: {
    explicitBucketBoundaries: [
      500, 1000, 2500, 5000, 10000, 25000, 50000, 100000,
    ],  // $5, $10, $25, $50, $100, $250, $500, $1000
  },
});

export const cartAbandonmentCounter = meter.createCounter("cart.abandoned", {
  description: "Carts that started checkout but failed to complete",
  unit: "1",
});

// Usage in checkout handler:
// checkoutCounter.add(1, { payment_method: "stripe", status: "success" });
// checkoutValueHistogram.record(cart.totalCents, { currency: "usd" });
```

## Results

Tomás rolled out OpenTelemetry incrementally — one service per week over six weeks. The team started seeing value after the second service was instrumented:

- **Mean time to resolution (MTTR): 2 hours → 15 minutes** — clicking a slow trace shows exactly which service, which database query, and which line of code is responsible. No more log-grepping across six services.
- **The first week caught three hidden issues**: a missing database index in the inventory service (causing 800ms queries that should take 5ms), a retry storm between cart and payments (exponential backoff was misconfigured), and a DNS resolution delay adding 200ms to every inter-service call.
- **Tail-based sampling reduced storage costs by 87%** — keeping 100% of errors and slow requests while sampling 10% of normal traffic. Storage went from 50GB/day to 6.5GB/day.
- **Log correlation eliminated the "which logs are mine?" problem** — every log line includes a trace ID. Clicking a trace in Jaeger links directly to the exact logs from that request across all six services.
- **Business metrics in the same dashboard** — checkout completion rate, average order value, and cart abandonment rate next to p99 latency and error rate. The team spotted that a 500ms latency increase on Wednesday correlated with a 12% drop in checkout completion.
