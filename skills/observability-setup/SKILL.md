---
name: observability-setup
description: >-
  Set up end-to-end observability for microservices. Use when someone asks to
  "add tracing", "set up monitoring", "configure OpenTelemetry", "build Grafana
  dashboards", "distributed tracing", "structured logging", "metrics collection",
  or "debug production issues". Covers OpenTelemetry instrumentation, collector
  configuration, Grafana LGTM stack deployment, dashboard provisioning, and
  alert rules.
license: Apache-2.0
compatibility: "Node.js 18+, Python 3.9+, Go 1.21+. Grafana LGTM stack via Docker."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["observability", "opentelemetry", "grafana", "tracing", "monitoring"]
---

# Observability Setup

## Overview

This skill helps AI agents implement the three pillars of observability — traces, metrics, and structured logs — across microservice architectures. It uses OpenTelemetry as the instrumentation standard and Grafana's LGTM stack (Loki, Grafana, Tempo, Mimir) as the backend, though patterns apply to any OTel-compatible backend.

## Instructions

### OpenTelemetry Instrumentation (Node.js)

1. Install packages:
   ```bash
   npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
     @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
   ```

2. Create `src/instrumentation.ts` — this file must be loaded BEFORE any other imports:
   ```ts
   import { NodeSDK } from '@opentelemetry/sdk-node';
   import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
   import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
   import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
   import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

   const sdk = new NodeSDK({
     serviceName: process.env.OTEL_SERVICE_NAME || 'my-service',
     traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/traces' }),
     metricReader: new PeriodicExportingMetricReader({
       exporter: new OTLPMetricExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/metrics' }),
       exportIntervalMillis: 15000,
     }),
     instrumentations: [getNodeAutoInstrumentations()],
   });
   sdk.start();
   ```

3. Add to start script: `node --require ./src/instrumentation.ts src/index.ts`

4. Add custom spans for business-critical operations:
   ```ts
   import { trace } from '@opentelemetry/api';
   const tracer = trace.getTracer('payment-service');
   
   async function processPayment(order) {
     return tracer.startActiveSpan('process-payment', async (span) => {
       span.setAttribute('order.id', order.id);
       span.setAttribute('payment.amount_cents', order.totalCents);
       try {
         const result = await paymentGateway.charge(order);
         span.setAttribute('payment.status', result.status);
         return result;
       } catch (error) {
         span.recordException(error);
         span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
         throw error;
       } finally {
         span.end();
       }
     });
   }
   ```

### OpenTelemetry Instrumentation (Python)

1. Install: `pip install opentelemetry-distro opentelemetry-exporter-otlp`
2. Run: `opentelemetry-instrument --service_name notification-service python app.py`
3. For structured logs with trace context:
   ```python
   import structlog
   from opentelemetry import trace

   def add_trace_context(logger, method_name, event_dict):
       span = trace.get_current_span()
       ctx = span.get_span_context()
       if ctx.is_valid:
           event_dict['trace_id'] = format(ctx.trace_id, '032x')
           event_dict['span_id'] = format(ctx.span_id, '016x')
       return event_dict

   structlog.configure(processors=[add_trace_context, structlog.dev.ConsoleRenderer()])
   ```

### Structured Logging with Trace Correlation

Every log line must include `trace_id` and `span_id`. Use JSON format:
```json
{"level":"error","msg":"payment failed","trace_id":"abc123...","span_id":"def456...","service":"payment-service","error":"timeout","timestamp":"2025-01-15T10:30:00Z"}
```

For Node.js, use pino with a custom mixin:
```js
const pino = require('pino');
const { trace } = require('@opentelemetry/api');

const logger = pino({
  mixin() {
    const span = trace.getActiveSpan();
    if (span) {
      const ctx = span.spanContext();
      return { trace_id: ctx.traceId, span_id: ctx.spanId };
    }
    return {};
  }
});
```

### OTel Collector Configuration

```yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: "0.0.0.0:4317" }
      http: { endpoint: "0.0.0.0:4318" }

processors:
  batch:
    timeout: 5s
    send_batch_size: 1000
  memory_limiter:
    limit_mib: 512

exporters:
  otlphttp/tempo:
    endpoint: http://tempo:4318
  prometheusremotewrite:
    endpoint: http://mimir:9009/api/v1/push
  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/tempo]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [loki]
```

### Grafana Dashboard Provisioning

Create dashboards as JSON files in `grafana/dashboards/`. Key panels:

**Service Overview Dashboard:**
- Request rate: `sum(rate(http_server_request_duration_seconds_count[5m])) by (service_name)`
- P95 latency: `histogram_quantile(0.95, sum(rate(http_server_request_duration_seconds_bucket[5m])) by (le, service_name))`
- Error rate: `sum(rate(http_server_request_duration_seconds_count{http_status_code=~"5.."}[5m])) / sum(rate(http_server_request_duration_seconds_count[5m]))`

**Alert Rules:**
- Error rate > 5 % for 5 min → P2
- P99 latency > 2s for 5 min → P3
- Service health check failing for 1 min → P1

### Signal Correlation in Grafana

1. Loki data source: add derived field with regex `trace_id=(\w+)` linking to Tempo.
2. Tempo data source: enable "Trace to logs" linking to Loki with filter `{service_name="$service"} | trace_id="$traceId"`.
3. Metrics → Logs: use exemplars in Mimir to link metric data points to trace IDs.

## Examples

### Example 1 — Quick OTel setup for Express app

**Input:** "Add observability to my Express API."

**Output:** Create `src/instrumentation.ts` with the Node SDK config above, add the `--require` flag to the start script, set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` and `OTEL_SERVICE_NAME=api-gateway` in `.env`.

### Example 2 — Docker Compose for LGTM stack

**Input:** "Give me a docker-compose for the observability backend."

**Output:**
```yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.96.0
    volumes: ["./otel-collector-config.yaml:/etc/otelcol/config.yaml"]
    ports: ["4317:4317", "4318:4318"]
  tempo:
    image: grafana/tempo:2.4.0
    command: ["-config.file=/etc/tempo.yaml"]
    volumes: ["./tempo.yaml:/etc/tempo.yaml"]
  loki:
    image: grafana/loki:3.0.0
    ports: ["3100:3100"]
  mimir:
    image: grafana/mimir:2.11.0
    command: ["-config.file=/etc/mimir.yaml"]
    volumes: ["./mimir.yaml:/etc/mimir.yaml"]
  grafana:
    image: grafana/grafana:10.4.0
    ports: ["3000:3000"]
    volumes: ["./grafana/provisioning:/etc/grafana/provisioning", "./grafana/dashboards:/var/lib/grafana/dashboards"]
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: Admin
```

## Guidelines

- **Instrument before you optimize.** You cannot improve what you cannot see.
- **Auto-instrumentation first, custom spans second.** Auto-instrumentation covers 80 % of what you need. Add custom spans only for business-critical paths.
- **Always correlate signals.** A trace without logs is incomplete. A metric spike without a trace is unactionable.
- **Set resource limits on the collector.** Without `memory_limiter`, a traffic spike can OOM the collector and create a cascading failure.
- **Use service.name consistently.** It is the primary grouping key across all three signal types. Mismatched names break correlation.
