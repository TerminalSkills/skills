---
name: otel-js
description: >-
  OpenTelemetry for Node.js adds distributed tracing and metrics to a service and exports them over OTLP to any backend. Use when a user asks to add distributed tracing, collect metrics, instrument HTTP requests, trace database queries, or set up observability for microservices. Covers the current SDK (resourceFromAttributes, ESM loader hook, OTLP endpoint rules).
license: Apache-2.0
compatibility: 'Node.js 22.15+, OpenTelemetry JS SDK 2.x / 0.2xx+, Express, Fastify, NestJS'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/open-telemetry/opentelemetry-js
  category: devops
  tags: "opentelemetry, tracing, metrics, nodejs, observability"
---

# OpenTelemetry for Node.js

## Overview

OpenTelemetry (OTel) is the standard for distributed tracing, metrics, and logs. Instrument a Node.js service once and send telemetry to any OTLP-capable backend (Jaeger, Grafana Tempo, Honeycomb, Datadog, an OpenTelemetry Collector). Auto-instrumentation captures HTTP, Express, database and gRPC calls without code changes. This skill was verified against `@opentelemetry/sdk-node` 0.300 (SDK 3.0, which requires Node.js 22.15 or newer) with a local OTLP receiver.

## Instructions

### Step 1: Install and set up the SDK

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-metrics @opentelemetry/resources @opentelemetry/semantic-conventions
```

```typescript
// instrumentation.ts - load BEFORE any application code
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'orders-api',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '1.0.0',
  }),
  traceExporter: new OTLPTraceExporter(),            // endpoint comes from OTEL_EXPORTER_OTLP_ENDPOINT
  metricReaders: [new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
    exportIntervalMillis: 30000,
  })],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => req.url === '/health' || req.url === '/ready',
      },
      '@opentelemetry/instrumentation-fs': { enabled: false },   // very noisy
    }),
  ],
})

sdk.start()
process.on('SIGTERM', () => { sdk.shutdown().finally(() => process.exit(0)) })
```

Configure the destination with environment variables, not code: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` is a **base URL**; the exporters append `/v1/traces` and `/v1/metrics` themselves. Only a URL passed in code (`new OTLPTraceExporter({ url })`) must contain the full path. `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES` also work.

### Step 2: Custom spans

```typescript
// services/orders.ts - manual spans for business logic
import { trace, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('order-service')

export async function processOrder(orderId: string) {
  return tracer.startActiveSpan('processOrder', async (span) => {
    try {
      span.setAttribute('order.id', orderId)
      const payment = await tracer.startActiveSpan('chargePayment', async (paymentSpan) => {
        try {
          return await chargeCard(orderId, 9999)      // your payment client call
        } finally {
          paymentSpan.end()
        }
      })
      span.setAttribute('payment.id', payment.id)
      return payment
    } catch (err) {
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message })
      throw err
    } finally {
      span.end()
    }
  })
}
```

### Step 3: Run

```bash
# Node 22.18+ / 24 run TypeScript directly; older 22.x: compile first and pass the .js file
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 node --import ./instrumentation.ts src/server.ts

# ESM app ("type": "module") that needs Express/pg/redis spans: add the module hook
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  node --experimental-loader=@opentelemetry/instrumentation/hook.mjs --import ./instrumentation.ts src/server.ts

# CommonJS build
node --require ./dist/instrumentation.js dist/server.js
```

## Examples

### Example 1: Trace an Express route end to end

Request: "Add tracing to our orders API and send it to the collector on port 4318."

After the setup above, `GET /orders/ord-1042` produces one trace: an HTTP server span named `GET /orders/:id` (attribute `http.route=/orders/:id`, status 200), the Express router/handler spans, and the custom `processOrder` span with its child `chargePayment`. `/health` produces no span. Metrics include `http.server.request.duration`. With a local receiver on port 4318 the exporter POSTs to `/v1/traces` and `/v1/metrics`.

### Example 2: Point at a hosted backend with headers

Request: "Send to Honeycomb without changing code."

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
export OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=${HONEYCOMB_API_KEY}"
export OTEL_SERVICE_NAME=orders-api
node --import ./instrumentation.ts src/server.ts
```

Keep the key in the environment (secret store), never in `instrumentation.ts`.

## Guidelines

- Load the instrumentation first: auto-instrumentation patches libraries when they are loaded. Use `--import` (ESM) or `--require` (CJS).
- In ESM apps the `--experimental-loader=@opentelemetry/instrumentation/hook.mjs` hook is what makes Express, pg and similar libraries traced; without it, in a test only the HTTP server span and custom spans appeared. Node prints an experimental warning for the flag.
- SDK 2.x/3.x removed the `Resource` class (use `resourceFromAttributes`) and the HTTP option `ignoreIncomingPaths` (use `ignoreIncomingRequestHook`). Copy-pasted 1.x snippets fail on both.
- Always `end()` every span exactly once, in `finally`; ending in both the happy path and `finally` double-ends.
- Auto-instrumentation covers infrastructure only; add custom spans for business steps and keep attribute values low-cardinality.
- Send to an OpenTelemetry Collector or Grafana Alloy when you need to route to several backends or add sampling.
- `sdk.shutdown()` flushes pending data; call it on SIGTERM or the last spans are lost.
