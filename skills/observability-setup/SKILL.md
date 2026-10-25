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
compatibility: "Node.js 18.19+ or 20.6+, Python 3.10+. Grafana LGTM stack via Docker."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/open-telemetry/opentelemetry-js"
  category: devops
  tags: "observability, opentelemetry, grafana, tracing, monitoring"
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

   // Endpoint and service name come from OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_SERVICE_NAME;
   // the exporters append /v1/traces and /v1/metrics themselves.
   const sdk = new NodeSDK({
     traceExporter: new OTLPTraceExporter(),
     metricReader: new PeriodicExportingMetricReader({
       exporter: new OTLPMetricExporter(),
       exportIntervalMillis: 15000,
     }),
     instrumentations: [getNodeAutoInstrumentations()],
   });
   sdk.start();
   process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
   ```
   (`@opentelemetry/sdk-metrics` is installed as a dependency of the SDK; add it explicitly if your package manager is strict.)

3. Load it before the app. Plain Node cannot `--require` a `.ts` file, so use the compiled file or a TypeScript runner:
   `node --require ./dist/instrumentation.js dist/index.js` or `npx tsx --import ./src/instrumentation.ts src/index.ts`. ESM apps additionally need `--experimental-loader=@opentelemetry/instrumentation/hook.mjs`. Set `OTEL_SEMCONV_STABILITY_OPT_IN=http` to get the stable `http.server.request.duration` metric used in the queries below.

4. Add custom spans for business-critical operations:
   ```ts
   import { trace, SpanStatusCode } from '@opentelemetry/api';
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

1. Install: `pip install opentelemetry-distro opentelemetry-exporter-otlp`, then `opentelemetry-bootstrap -a install` to add instrumentation for the libraries you already use.
2. Run: `opentelemetry-instrument --service_name notification-service python app.py` (endpoint from `OTEL_EXPORTER_OTLP_ENDPOINT`; set `OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` to export logs too).
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
{"level":"error","msg":"payment failed","trace_id":"abc123...","span_id":"def456...","service":"payment-service","error":"timeout","timestamp":"2026-10-13T10:30:00Z"}
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
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128

exporters:
  otlphttp/tempo:
    endpoint: http://tempo:4318
  prometheusremotewrite:
    endpoint: http://mimir:9009/api/v1/push
  otlphttp/loki:                       # the old `loki` exporter was removed from contrib
    endpoint: http://loki:3100/otlp

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

Put `memory_limiter` first in each pipeline, and use the `otel/opentelemetry-collector-contrib` image (the core image lacks `prometheusremotewrite`). Validate with `otelcol-contrib validate --config=otel-collector-config.yaml`.

### Grafana Dashboard Provisioning

Create dashboards as JSON files in `grafana/dashboards/`. Key panels:

**Service Overview Dashboard:**
- Request rate: `sum(rate(http_server_request_duration_seconds_count[5m])) by (service_name)`
- P95 latency: `histogram_quantile(0.95, sum(rate(http_server_request_duration_seconds_bucket[5m])) by (le, service_name))`
- Error rate: `sum(rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m])) / sum(rate(http_server_request_duration_seconds_count[5m]))`

**Alert Rules:**
- Error rate > 5 % for 5 min → P2
- P99 latency > 2s for 5 min → P3
- Service health check failing for 1 min → P1

### Signal Correlation in Grafana

1. Loki data source: add a derived field linking to Tempo, with matcher regex `"trace_id":"(\w+)"` for JSON logs (`trace_id=(\w+)` for logfmt). Logs ingested over OTLP carry the trace ID as structured metadata instead.
2. Tempo data source: enable "Trace to logs" linking to Loki with filter `{service_name="$service"} | trace_id="$traceId"`.
3. Metrics → Logs: use exemplars in Mimir to link metric data points to trace IDs.

## Examples

### Example 1 — Quick OTel setup for Express app

**Input:** "Add observability to my Express API."

**Output:** Create `src/instrumentation.ts` with the Node SDK config above, add the `--require` flag to the start script, set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` and `OTEL_SERVICE_NAME=api-gateway` in the environment. A successful run shows `api-gateway` in Grafana Explore under the Tempo data source within seconds.

### Example 2 — Local backend for development

**Input:** "Give me an observability backend I can run on my laptop."

**Output:** Grafana's all-in-one development image bundles the collector, Prometheus, Tempo, Loki, Pyroscope and Grafana (not for production):
```bash
docker run --rm -p 3000:3000 -p 4317:4317 -p 4318:4318 grafana/otel-lgtm
```
Open http://localhost:3000 (login admin/admin), send telemetry to `http://localhost:4318`, and find traces in Explore with the Tempo data source. For production use the separate Tempo, Loki and Mimir (or Prometheus) deployments behind your own collector config above, with pinned image tags from each project's releases page.

## Guidelines

- **Instrument before you optimize.** You cannot improve what you cannot see.
- **Auto-instrumentation first, custom spans second.** Auto-instrumentation covers 80 % of what you need. Add custom spans only for business-critical paths.
- **Always correlate signals.** A trace without logs is incomplete. A metric spike without a trace is unactionable.
- **Set resource limits on the collector.** Without `memory_limiter`, a traffic spike can OOM the collector and create a cascading failure.
- **Use service.name consistently.** It is the primary grouping key across all three signal types. Mismatched names break correlation.
