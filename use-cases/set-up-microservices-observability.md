---
title: "Set Up End-to-End Observability for Microservices"
slug: set-up-microservices-observability
description: "Instrument your microservices with distributed traces, metrics, and structured logs using OpenTelemetry — and wire them into dashboards that actually help you debug production issues."
skills: [observability-setup, docker-helper, cicd-pipeline]
category: devops
tags: [observability, opentelemetry, tracing, metrics, logging, grafana]
---

# Set Up End-to-End Observability for Microservices

## The Problem

Your system has 8 microservices. When a user reports a slow checkout, you SSH into three different servers, grep through unstructured log files, guess which service is the bottleneck, and hope the timestamps align. There are no traces connecting a request across services, no metrics showing latency percentiles, and no dashboards — just scattered `console.log` statements. Debugging a production issue takes hours instead of minutes.

Last week, checkout was slow for 20 minutes. The team spent 3 hours across Slack threads and SSH sessions before finding that the payment service was retrying a failing downstream call. Three hours to find a problem that should have been visible in seconds. And the worst part: nobody can confidently say it won't happen again next week, because there's no way to see it coming.

## The Solution

Instrument all services with OpenTelemetry for unified traces, metrics, and structured logs. Send telemetry to an OpenTelemetry Collector, which routes it to Grafana's backends: Tempo for traces, Mimir (or any Prometheus-compatible store) for metrics, Loki for logs, with Grafana for dashboards. Build dashboards that answer the three critical questions: What failed? Where? Why?

## Step-by-Step Walkthrough

### Step 1: Instrument Services with OpenTelemetry

```text
I have 4 Node.js services (api-gateway, user-service, order-service, payment-service) and 1 Python service (notification-service). Add OpenTelemetry auto-instrumentation to each. Configure trace propagation using W3C TraceContext. Collect HTTP request duration and request count by status code. Add structured JSON logging with trace_id and span_id in every log line.
```

Auto-instrumentation handles most of the work. Each Node.js service gets the same file, loaded before anything else. Endpoint and service name come from environment variables, so the file is identical in every service:

```javascript
// tracing.js: node --require ./tracing.js server.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

// OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_SERVICE_NAME come from the environment;
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

Install `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/exporter-metrics-otlp-http` and `@opentelemetry/sdk-metrics`. Set `OTEL_SERVICE_NAME=payment-service` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318` per service, and `OTEL_SEMCONV_STABILITY_OPT_IN=http` to get the stable `http.server.request.duration` metric used by the dashboards. ESM apps additionally need `--experimental-loader=@opentelemetry/instrumentation/hook.mjs`.

The auto-instrumentation covers HTTP, Express, PostgreSQL and Redis calls without touching application code. Every outgoing request carries a W3C TraceContext header (the default propagator), so downstream services join the same trace: a request from the API gateway through user-service, order-service and payment-service becomes one trace with a span per hop.

The Python notification service uses `opentelemetry-distro` and `opentelemetry-exporter-otlp`: run `opentelemetry-bootstrap -a install` once, then start the app with `opentelemetry-instrument --service_name notification-service python app.py`. The payment service gets one custom span (`tracer.startActiveSpan('process-payment', ...)` from `@opentelemetry/api`) around the payment gateway call, because that is the most latency-sensitive operation.

Logs carry the trace context. For Node, a pino `mixin` adds the IDs to every line, and `pino-opentelemetry-transport` ships the logs over OTLP with the same environment variables:

```javascript
const pino = require('pino');
const { trace } = require('@opentelemetry/api');

const logger = pino({
  mixin() {
    const span = trace.getActiveSpan();
    if (!span) return {};
    const { traceId, spanId } = span.spanContext();
    return { trace_id: traceId, span_id: spanId };
  },
  transport: { target: 'pino-opentelemetry-transport' },
});
```

In Python, a structlog processor reads `trace.get_current_span().get_span_context()` and formats `trace_id` with `format(ctx.trace_id, '032x')`, and `OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true` exports the logs. Any log line becomes a doorway into the full distributed trace.

### Step 2: Deploy the Collector and Backends

```text
Write a compose.yaml for the OpenTelemetry Collector (contrib image, pinned) with an otel-collector-config.yaml that receives OTLP and routes traces to Tempo, metrics to Mimir and logs to Loki. Add memory_limiter and batch processors. Publish ports on 127.0.0.1 only.
```

The Collector sits at the center. Every service sends all telemetry to one endpoint and the Collector routes it:

- **Traces** go to Tempo over OTLP.
- **Metrics** go to Mimir (Prometheus-compatible, long-term storage) through `prometheusremotewrite`.
- **Logs** go to Loki's native OTLP endpoint. The old `loki` exporter was removed from the contrib distribution, so use `otlphttp` with the `/otlp` path.

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: "0.0.0.0:4317" }
      http: { endpoint: "0.0.0.0:4318" }

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128
  batch:
    timeout: 5s
    send_batch_size: 1000

exporters:
  otlphttp/tempo:
    endpoint: http://tempo:4318
  prometheusremotewrite:
    endpoint: http://mimir:9009/api/v1/push
  otlphttp/loki:
    endpoint: http://loki:3100/otlp

service:
  pipelines:
    traces:  { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlphttp/tempo] }
    metrics: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [prometheusremotewrite] }
    logs:    { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlphttp/loki] }
```

`memory_limiter` comes first in every pipeline so a traffic spike cannot OOM the Collector. Check the file with `docker run --rm -v "$PWD/otel-collector-config.yaml:/c.yaml:ro" otel/opentelemetry-collector-contrib:0.164.0 validate --config=/c.yaml` (this config validates cleanly on that release). The contrib image is required, because the core image lacks `prometheusremotewrite`.

```yaml
# compose.yaml (Collector; Tempo, Loki, Mimir and Grafana join the same network)
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.164.0
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes: ["./otel-collector-config.yaml:/etc/otelcol/config.yaml:ro"]
    ports: ["127.0.0.1:4317:4317", "127.0.0.1:4318:4318"]
    restart: unless-stopped
```

Pin every backend image to a release tag from its project's releases page; never use `latest`. Tempo, Loki and Mimir each need their own storage config from the Grafana docs, and Grafana's data sources are provisioned from YAML files. For a laptop or a throwaway environment, `grafana/otel-lgtm` bundles a collector, Tempo, Loki, Prometheus and Grafana in one image (`docker run --rm -p 127.0.0.1:3000:3000 -p 127.0.0.1:4318:4318 grafana/otel-lgtm`) and is not meant for production. Services running outside the Compose network send to the published `127.0.0.1:4318`.

Following **cicd-pipeline**, a GitLab CI job keeps the Collector config honest, so a typo in a pipeline does not silently drop production telemetry:

```yaml
validate-otel-config:
  stage: test
  image:
    name: otel/opentelemetry-collector-contrib:0.164.0
    entrypoint: [""]
  script:
    - /otelcol-contrib validate --config=otel-collector-config.yaml
  rules:
    - changes: [otel-collector-config.yaml]
```

The deploy job from the same skill (manual, protected variables, SSH host key pinned) then runs `docker compose up -d` on the host.

### Step 3: Build the Dashboards

```text
Create three Grafana dashboards as JSON provisioning files:

1. Service Overview — panels: request rate per service, p50/p95/p99 latency, error rate, top 5 slowest endpoints
2. Trace Explorer — panel linking to Tempo trace search, filtered by service, minimum duration, and error status
3. Dependencies — panels: latency and error rate of outgoing HTTP and database calls per service

Use variables for service name and time range. Add alert rules: error rate > 5% for 5 minutes, p99 latency > 2s for 5 minutes.
```

The dashboards are provisioned as JSON files in `grafana/dashboards/`, which means they exist on first boot — no manual clicking required. Three dashboards cover the three levels of debugging:

1. **Service Overview** answers "what's happening right now?" — request rates per service, latency broken into p50/p95/p99 percentiles, error rates as a percentage, and the top 5 slowest endpoints. This is the dashboard you open first during an incident.

2. **Trace Explorer** answers "what happened to this specific request?" — search by service name, minimum duration (to find slow requests), or error status. Click a trace and see the full waterfall: every service hop, database query, and external API call with exact timing.

3. **Dependencies** answers "is it this service or something it calls?" — latency and error rate of each service's outgoing HTTP and database calls, taken from the client spans and metrics the auto-instrumentation already emits.

Template variables for service name and time range make every panel reusable across all 8 services. Two alert rules fire when things cross thresholds: error rate above 5% for 5 minutes, or p99 latency above 2 seconds for 5 minutes.

### Step 4: Add Correlation Between Signals

```text
Configure Grafana so that: a spike in the error rate panel links to Loki logs for that time range and service, log lines with a trace_id link to the full trace in Tempo, and a trace links back to its logs. Provision all of it in the data source YAML.
```

This is the step that turns three separate tools into one debugging system. Without correlation you have metrics in one tab, logs in another, and traces in a third. With it, each signal links to the next:

- **Metric to logs:** a data link on the error-rate panel opens Explore on the Loki data source with `{service_name="$service"}` and the panel's time range. No more guessing when the error happened.
- **Logs to trace:** a derived field on the Loki data source extracts `trace_id` and links to the Tempo data source. With the pino mixin above the ID is in the JSON body, so the matcher is `"trace_id":"(\w+)"`; logs ingested over OTLP also carry it as structured metadata.
- **Trace to logs:** enable "Trace to logs" on the Tempo data source, pointing at Loki with the filter `{service_name="$service"} | trace_id="$traceId"`.
- **Metric to trace:** exemplars link individual metric data points to trace IDs.

The investigation flow becomes: see a spike on the Service Overview dashboard, jump to the error logs, click the `trace_id`, and see that the payment service waited 8 seconds for a third-party API.

### Step 5: Create a Runbook for Common Incidents

```text
Based on the dashboards, write a troubleshooting runbook in docs/runbook.md covering these scenarios:
1. High error rate on a single service — how to find the trace, identify the root span, check downstream dependencies
2. Latency spike across all services — how to check if it's database, network, or code
3. Service completely down — how to verify using health checks, check recent deployments, and roll back
Include the exact Grafana queries and Loki LogQL patterns for each scenario.
```

The runbook documents the three most common incident types with exact steps, Grafana queries, and LogQL patterns. Each scenario follows the same structure: what to check first, which dashboard to open, what the root cause usually is, and how to fix it.

For example, "high error rate on a single service" starts with the Service Overview dashboard, clicks through to the error logs, finds a trace ID, and follows the trace to the root span. The runbook includes the exact LogQL query:

```
{service_name="payment-service"} |= "error" | trace_id != ""
```

Copy, paste, find the trace. The on-call engineer doesn't need to be a distributed tracing expert — the steps are already written down with the exact commands. "Latency spike across all services" walks through checking database connection pool usage, network latency between services, and recent deployment timestamps. "Service completely down" starts with health check verification and ends with a rollback procedure.

## Real-World Example

Kai joins as platform engineer on a team running 8 microservices on Kubernetes. Last week, checkout was slow for 20 minutes — the team spent 3 hours across Slack threads and SSH sessions before finding that the payment service was retrying a failing downstream call.

He instruments all 5 core services with OpenTelemetry — auto-instrumentation handles HTTP, database, and Redis calls without touching application code. The observability stack goes up via Docker Compose: Collector, Tempo, Loki, Mimir, Grafana. Three dashboards are provisioned automatically on first boot. Signal correlation is wired up: metric spike, to relevant logs, to full distributed trace in a couple of clicks.

The next latency incident is identified in 4 minutes instead of 3 hours. A trace shows the payment service waiting 8 seconds for a third-party API that usually responds in 200ms. The team adds a circuit breaker with a 2-second timeout before users even start complaining. The runbook means the on-call engineer — who wasn't even on the team when the observability stack was set up — can diagnose the incident independently. The steps are already written.

## Related Skills

- [observability-setup](/skills/observability-setup) — Provides the OpenTelemetry Node and Python setup, the Collector pipelines, the dashboard queries and the signal-correlation steps used above.
- [docker-helper](/skills/docker-helper) — Writes the Compose file for the Collector and backends, with pinned images, loopback-only ports and health checks.
- [cicd-pipeline](/skills/cicd-pipeline) — Adds the GitLab CI job that validates the Collector config before it is deployed.
