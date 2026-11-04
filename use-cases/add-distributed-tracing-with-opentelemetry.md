---
title: Add Distributed Tracing with OpenTelemetry
slug: add-distributed-tracing-with-opentelemetry
description: Instrument a microservices architecture with OpenTelemetry to trace requests across services, correlate logs with traces, and find the exact service causing latency spikes.
skills:
  - otel-js
  - error-monitoring
  - docker-helper
category: devops
tags:
  - tracing
  - monitoring
  - microservices
  - debugging
  - performance
---

# Add Distributed Tracing with OpenTelemetry

Tomás runs infrastructure at a 25-person e-commerce company. Their checkout flow touches six services: API gateway, cart, inventory, payments, notifications, and shipping. When a customer reports "checkout took 30 seconds," the team spends two hours grepping logs across six services trying to reconstruct what happened. Last month a P1 incident took four hours to diagnose because the root cause was a slow database query in the inventory service, buried under misleading timeout errors from downstream services. He wants one trace ID that follows a request across every service and shows where the time went.

## Step 1 — Run the Collector and the backends

The OpenTelemetry Collector receives OTLP from every service, processes it, and exports to the backends. Applications only know the Collector's address, so switching Jaeger for Grafana Tempo is a Collector change, not six service deploys. The **docker-helper** skill writes the Compose file; this one starts Jaeger (traces), Prometheus (metrics), Loki (logs) and Grafana, with every published port bound to `127.0.0.1`.

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317        # inside the container; published on 127.0.0.1 only
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:                      # always first in every pipeline
    check_interval: 1s
    limit_mib: 512                     # above this the collector refuses new data
    spike_limit_mib: 128               # headroom: soft limit = limit_mib - spike_limit_mib

  batch:
    timeout: 5s
    send_batch_size: 1024

  resource:
    attributes:
      - { key: deployment.environment.name, value: production, action: upsert }
      - { key: service.namespace, value: checkout-platform, action: upsert }

  # Keep every error trace and every trace slower than 2s, plus 10% of the rest.
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors-always
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow-requests
        type: latency
        latency: { threshold_ms: 2000 }
      - name: sample-rest
        type: probabilistic
        probabilistic: { sampling_percentage: 10 }

exporters:
  otlp_grpc/jaeger:
    endpoint: jaeger:4317
    tls: { insecure: true }            # same private Docker network

  prometheus:
    endpoint: 0.0.0.0:8889
    resource_constant_labels:          # resource attributes that become metric labels
      included: ["service*", "deployment.*"]

  otlp_http/loki:                       # Loki's native OTLP endpoint (the old loki exporter is gone)
    endpoint: http://loki:3100/otlp

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, tail_sampling, batch, resource]
      exporters: [otlp_grpc/jaeger]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource]
      exporters: [otlp_http/loki]
```

The tail-sampling policy decides after the whole trace is in: it keeps every error trace and every trace slower than 2 seconds, and 10% of the rest. It only works if all spans of a trace reach the same Collector instance; with several Collector replicas, put a load-balancing exporter in front that routes by trace ID.

```yaml
# compose.observability.yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.164.0
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otelcol/config.yaml:ro
    ports:
      - "127.0.0.1:4317:4317"   # OTLP gRPC
      - "127.0.0.1:4318:4318"   # OTLP HTTP
    depends_on: [jaeger, loki]

  jaeger:                        # Jaeger v2 (v1 all-in-one is end of life); OTLP on 4317 inside the network
    image: jaegertracing/jaeger:2.22.0
    ports:
      - "127.0.0.1:16686:16686"  # UI

  prometheus:
    image: prom/prometheus:v3.15.1
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    ports:
      - "127.0.0.1:9090:9090"

  loki:
    image: grafana/loki:3.7.9    # accepts OTLP logs at /otlp
    ports:
      - "127.0.0.1:3100:3100"

  grafana:
    image: grafana/grafana:13.3.0
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?set GRAFANA_ADMIN_PASSWORD}
    ports:
      - "127.0.0.1:3000:3000"
```

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: otel-collector
    static_configs:
      - targets: ["otel-collector:8889"]
```

```console
$ export GRAFANA_ADMIN_PASSWORD=<choose-a-password>
$ docker compose -f compose.observability.yaml up -d
$ docker compose -f compose.observability.yaml ps
```

Jaeger v2 (the `jaegertracing/jaeger` image) accepts OTLP on 4317 and 4318 by default, and serves its UI on 16686. Loki 3 ingests OTLP logs natively at `/otlp`, which is why the Collector uses a plain OTLP/HTTP exporter instead of the removed `loki` exporter. In Grafana, add the three data sources by URL (`http://jaeger:16686`, `http://prometheus:9090`, `http://loki:3100`).

## Step 2 — Instrument the Node.js services

The **otel-js** skill covers the SDK. Install the packages and load the instrumentation file before any application code:

```console
$ npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
    @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http \
    @opentelemetry/exporter-logs-otlp-http @opentelemetry/sdk-metrics @opentelemetry/sdk-logs \
    @opentelemetry/resources @opentelemetry/semantic-conventions pino
```

```typescript
// instrumentation.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

// The endpoint comes from OTEL_EXPORTER_OTLP_ENDPOINT (a base URL such as
// http://otel-collector:4318); the exporters append /v1/traces, /v1/metrics, /v1/logs.
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "unknown-service",
    [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? "0.0.0",
  }),
  traceExporter: new OTLPTraceExporter(),
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15000,
    }),
  ],
  logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-http": {
        ignoreIncomingRequestHook: (req) => req.url === "/health" || req.url === "/ready",
      },
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      // SQL text can contain personal data; the default keeps only a sanitized statement.
      "@opentelemetry/instrumentation-pg": { enhancedDatabaseReporting: false },
      // Adds trace_id / span_id to every pino line and forwards pino records as OTLP logs.
      "@opentelemetry/instrumentation-pino": { enabled: true },
    }),
  ],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0)); // flush pending telemetry first
});
```

Current SDK releases (`sdk-node` 0.300, `sdk-logs` 3.0) need Node.js 22.15 or newer and have API changes from 1.x tutorials: `resourceFromAttributes` replaces `new Resource(...)`, the metric readers go in `metricReaders: [...]`, and `BatchLogRecordProcessor` takes `{ exporter }` as an options object. Start each service with the endpoint as an environment variable (a base URL; the exporters add `/v1/traces` and so on):

```console
$ OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 OTEL_SERVICE_NAME=checkout \
    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs --import ./instrumentation.ts src/server.ts
```

The loader hook is needed for ESM apps; without it Express and pino are not patched. In containers, set the endpoint to `http://otel-collector:4318`. Use `--require ./dist/instrumentation.js` for a CommonJS build.

Auto-instrumentation records the HTTP request and the downstream calls. Custom spans add the business context it cannot know. Every span is ended exactly once, in `finally`:

```typescript
// src/routes/checkout.ts (inside the Express handler)
await tracer.startActiveSpan("checkout.process", async (span) => {
  try {
    span.setAttribute("checkout.cart_id", cartId);
    const cart = await tracer.startActiveSpan("checkout.validate_cart", async (s) => {
      try { return await inventoryClient.validateCart(cartId); } finally { s.end(); }
    });
    const payment = await tracer.startActiveSpan("checkout.process_payment", async (s) => {
      try {
        s.setAttribute("payment.amount_cents", cart.totalCents);
        return await paymentClient.charge(cart.totalCents, paymentMethod);
      } catch (err) {
        s.recordException(err as Error);
        s.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally { s.end(); }
    });
    checkoutCounter.add(1, { payment_method: paymentMethod });
    checkoutValue.record(cart.totalCents);
    res.json({ orderId: payment.transactionId, status: "confirmed" });
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
    res.status(500).json({ error: "Checkout failed" });
  } finally {
    span.end();
  }
});
```

The counter and histogram come from `metrics.getMeter("checkout-service")`, created once at module level (`createCounter("checkout.completed")`, `createHistogram("checkout.value", { advice: { explicitBucketBoundaries: [500, 1000, 2500, 5000, 10000] } })`). Prometheus shows them as `checkout_completed_total` and `checkout_value_bucket`.

When checkout takes 30 seconds, the trace tree reads at a glance: `validate_cart` 200ms, `process_payment` 28s, so the payment service is the bottleneck.

## Step 3 — Correlate logs with traces

The pino instrumentation inside the auto-instrumentation bundle adds `trace_id`, `span_id` and `trace_flags` to every log line written inside a span, and forwards the line to the logs pipeline, so no custom logger wrapper is needed:

```typescript
import pino from "pino";
const logger = pino();
logger.info({ cartId }, "checkout confirmed");
// {"level":30,"trace_id":"165994374b304041808abfbb4bd87700","span_id":"64cfe8401a2792d2","trace_flags":"01","cartId":"c2","msg":"checkout confirmed"}
```

In Loki the same line is queryable as `{service_name="checkout"}`. Copy the trace ID from a slow trace in Jaeger, filter Loki on it, and see only that request's logs from all six services.

## Step 4 — Triage errors against traces

Tracing shows one slow request; the **error-monitoring** skill finds out which failures matter. Pull the last 14 days of unresolved Sentry issues with the Organization Issues API (token in `$SENTRY_AUTH_TOKEN`), or export from Datadog or Rollbar, and give the file to the agent:

```text
Analyze errors-export.json. Group by root cause, rank by users affected, and list the three groups I should open a trace for first. For each, give the endpoint and a time window so I can search Jaeger.
```

The report ranks groups P1 to P3. Tomás takes the top P1 group (failed payment submissions), searches Jaeger for `checkout.process_payment` spans with status error in that window, and reads the exception recorded on the span.

## Results

Tomás rolled out OpenTelemetry one service per week over six weeks, and the team saw value after the second service:

- Clicking a slow trace shows which service, which query and which span is responsible, so the two-hour log-grepping sessions stop. The team's own estimate was that typical diagnosis dropped to about 15 minutes.
- The first week caught three hidden issues: a missing index in the inventory service (800ms queries that should take 5ms), a retry storm between cart and payments caused by misconfigured backoff, and a DNS delay adding 200ms to each inter-service call.
- Tail sampling kept every error and slow trace while storing only a tenth of healthy traffic, so trace storage stayed affordable.
- Every log line carries a trace ID, so "which logs are mine?" has an answer.
- Checkout completion rate and average order value sit next to p99 latency in the same Grafana dashboard, which exposed a Wednesday latency increase that matched a drop in completed checkouts.
