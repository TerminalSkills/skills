---
name: otel-js
description: >-
  Instrument Node.js apps with OpenTelemetry. Use when a user asks to add
  distributed tracing, collect metrics, instrument HTTP requests, trace
  database queries, or set up observability for microservices.
license: Apache-2.0
compatibility: 'Node.js 16+, Express, Fastify, NestJS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - opentelemetry
    - tracing
    - metrics
    - nodejs
    - observability
---

# OpenTelemetry for Node.js

## Overview

OpenTelemetry (OTel) is the standard for distributed tracing, metrics, and logs. Instrument your Node.js services once, and send telemetry to any backend (Jaeger, Grafana Tempo, Datadog, Honeycomb). Auto-instrumentation captures HTTP, database, and gRPC calls without code changes.

## Instructions

### Step 1: Auto-Instrumentation

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
```

```typescript
// instrumentation.ts — OpenTelemetry setup (import BEFORE app code)
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { Resource } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'api-service',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/metrics',
    }),
    exportIntervalMillis: 30000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingPaths: ['/health', '/ready'],    // don't trace health checks
      },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
      '@opentelemetry/instrumentation-redis': { enabled: true },
    }),
  ],
})

sdk.start()
console.log('OpenTelemetry initialized')

process.on('SIGTERM', () => sdk.shutdown())
```

### Step 2: Custom Spans

```typescript
// services/orders.ts — Manual instrumentation for business logic
import { trace, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('order-service')

export async function processOrder(orderId: string) {
  return tracer.startActiveSpan('processOrder', async (span) => {
    span.setAttribute('order.id', orderId)

    try {
      // Child span for payment
      const payment = await tracer.startActiveSpan('chargePayment', async (paymentSpan) => {
        paymentSpan.setAttribute('payment.provider', 'stripe')
        const result = await stripe.charges.create({ amount: 9999 })
        paymentSpan.setAttribute('payment.id', result.id)
        paymentSpan.end()
        return result
      })

      span.setAttribute('order.status', 'completed')
      span.setAttribute('payment.id', payment.id)
      span.setStatus({ code: SpanStatusCode.OK })
    } catch (err) {
      span.recordException(err)
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
      throw err
    } finally {
      span.end()
    }
  })
}
```

### Step 3: Run

```bash
# Start app with instrumentation loaded first
node --import ./instrumentation.ts src/server.ts

# Or in package.json
# "start": "node --import ./instrumentation.ts dist/server.js"
```

## Guidelines

- Import instrumentation BEFORE your app code — auto-instrumentation patches libraries on import.
- Use `--import` flag (ESM) or `-r` flag (CJS) to load instrumentation first.
- Auto-instrumentation covers HTTP, Express, Fastify, PostgreSQL, Redis, MongoDB, gRPC.
- Add custom spans for business logic (order processing, payment flows) — auto-instrumentation only covers infrastructure.
- Send telemetry to an OTLP collector (Grafana Alloy, OTel Collector) for routing to multiple backends.
