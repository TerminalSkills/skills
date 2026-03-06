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

Instrument all services with OpenTelemetry for unified traces, metrics, and structured logs. Ship telemetry to Grafana's LGTM stack (Loki for logs, Grafana for dashboards, Tempo for traces, Mimir for metrics) running in Docker. Build dashboards that answer the three critical questions: What failed? Where? Why?

## Step-by-Step Walkthrough

### Step 1: Instrument Services with OpenTelemetry

```text
I have 4 Node.js services (api-gateway, user-service, order-service, payment-service) and 1 Python service (notification-service). Add OpenTelemetry auto-instrumentation to each. Configure trace propagation using W3C TraceContext. Set up metric collection for: HTTP request duration, request count by status code, and active database connections. Add structured JSON logging with trace_id and span_id in every log line.
```

Auto-instrumentation handles most of the work. Each Node.js service gets the same pattern — a single file loaded before anything else:

```javascript
// tracing.js — loaded before anything else via node --require ./tracing.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: 'http://otel-collector:4318/v1/traces' }),
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: process.env.SERVICE_NAME,
});
sdk.start();
```

This single file auto-instruments HTTP, Express, PostgreSQL, and Redis calls without touching any application code. Every outgoing request carries a W3C TraceContext header, so downstream services automatically join the same trace. A request that starts at the API gateway and flows through user-service, order-service, and payment-service becomes one continuous trace with spans for each hop.

The Python notification service uses `opentelemetry-distro` with auto-instrumentation and structlog with a trace_id processor — same concept, different language. The payment service gets one extra touch: a custom span wrapping the payment gateway call, because that's the most latency-sensitive operation in the system and needs dedicated visibility.

Every service's logger injects `trace_id` and `span_id` into every log line. This is what makes the magic happen later — any log line becomes a doorway into the full distributed trace.

### Step 2: Deploy the Observability Stack

```text
Write a docker-helper.yml for the observability backend: OpenTelemetry Collector receiving OTLP, Tempo for traces, Loki for logs, Mimir for metrics, and Grafana with pre-provisioned data sources. Pin all versions. Add a collector config that routes traces to Tempo, metrics to Mimir, and logs to Loki. Include health checks and resource limits.
```

The OpenTelemetry Collector sits at the center of the architecture. Every service sends all telemetry to one endpoint, and the Collector routes it to the right backend:

- **Traces** go to Tempo — distributed tracing storage designed for high-volume trace data
- **Metrics** go to Mimir — Prometheus-compatible long-term storage with global query support
- **Logs** go to Loki — label-indexed log aggregation that keeps costs down by not indexing full text
- **Grafana** connects to all three as data sources, pre-provisioned via YAML config files

The Collector config defines receivers (OTLP over gRPC and HTTP), processors (batch processing to reduce write pressure, memory limiter to prevent OOM), and exporters (one per backend). All images are pinned to specific versions — no `latest` tags that break on Tuesday morning. Health checks ensure Grafana waits for the backends to be ready before serving dashboards. Resource limits prevent any single component from consuming the entire host.

The entire stack comes up with `docker compose up -d` and is ready to receive telemetry in under a minute.

### Step 3: Build the Dashboards

```text
Create three Grafana dashboards as JSON provisioning files:

1. Service Overview — panels: request rate per service, p50/p95/p99 latency, error rate, top 5 slowest endpoints
2. Trace Explorer — panel linking to Tempo trace search, filtered by service, minimum duration, and error status
3. Infrastructure — panels: CPU and memory per service container, active DB connections, message queue depth

Use variables for service name and time range. Add alert rules: error rate > 5% for 5 minutes, p99 latency > 2s for 5 minutes.
```

The dashboards are provisioned as JSON files in `grafana/dashboards/`, which means they exist on first boot — no manual clicking required. Three dashboards cover the three levels of debugging:

1. **Service Overview** answers "what's happening right now?" — request rates per service, latency broken into p50/p95/p99 percentiles, error rates as a percentage, and the top 5 slowest endpoints. This is the dashboard you open first during an incident.

2. **Trace Explorer** answers "what happened to this specific request?" — search by service name, minimum duration (to find slow requests), or error status. Click a trace and see the full waterfall: every service hop, database query, and external API call with exact timing.

3. **Infrastructure** answers "is it the code or the machine?" — CPU and memory per service container, active database connections (to catch connection pool exhaustion), and message queue depth (to spot backlog buildup).

Template variables for service name and time range make every panel reusable across all 8 services. Two alert rules fire when things cross thresholds: error rate above 5% for 5 minutes, or p99 latency above 2 seconds for 5 minutes.

### Step 4: Add Correlation Between Signals

```text
Configure Grafana so that: clicking a spike in the error rate metric jumps to Loki logs filtered by that time range and service, and log lines with trace_ids link directly to the full trace in Tempo. Set up derived fields in the Loki data source to parse trace_id and create a Tempo link.
```

This is the step that turns three separate tools into one coherent debugging system. Without correlation, you have metrics in one tab, logs in another, and traces in a third — essentially three separate tools you have to mentally stitch together. With correlation, each signal links to the next.

**Metric to Logs:** Click a spike in the error rate panel, and Grafana opens Loki pre-filtered to that exact time range and service. No more guessing when the error happened or manually adjusting time ranges.

**Logs to Traces:** Loki's derived fields parse the `trace_id` from each JSON log line and render it as a clickable link to Tempo. One click shows the full distributed trace — every service the request touched, how long each hop took, and where it failed.

The investigation flow becomes: see a spike on the Service Overview dashboard, click to see the error logs, find a trace_id, click through to the full trace showing the payment service waited 8 seconds for a third-party API. From "something is wrong" to "here's exactly what happened and why" in two clicks.

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
{service="payment-service"} |= "error" | json | trace_id != ""
```

Copy, paste, find the trace. The on-call engineer doesn't need to be a distributed tracing expert — the steps are already written down with the exact commands. "Latency spike across all services" walks through checking database connection pool usage, network latency between services, and recent deployment timestamps. "Service completely down" starts with health check verification and ends with a rollback procedure.

## Real-World Example

Kai joins as platform engineer on a team running 8 microservices on Kubernetes. Last week, checkout was slow for 20 minutes — the team spent 3 hours across Slack threads and SSH sessions before finding that the payment service was retrying a failing downstream call.

He instruments all 5 core services with OpenTelemetry in under 30 minutes — auto-instrumentation handles HTTP, database, and Redis calls without touching application code. The observability stack goes up via Docker Compose: Collector, Tempo, Loki, Mimir, Grafana. Three dashboards are provisioned automatically on first boot. Signal correlation is wired up: metric spike, to relevant logs, to full distributed trace in two clicks.

The next latency incident is identified in 4 minutes instead of 3 hours. A trace shows the payment service waiting 8 seconds for a third-party API that usually responds in 200ms. The team adds a circuit breaker with a 2-second timeout before users even start complaining. The runbook means the on-call engineer — who wasn't even on the team when the observability stack was set up — can diagnose the incident independently. The steps are already written.
