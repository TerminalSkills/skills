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

## The Solution

Instrument all services with OpenTelemetry for unified traces, metrics, and structured logs. Ship telemetry to Grafana's LGTM stack (Loki for logs, Grafana for dashboards, Tempo for traces, Mimir for metrics) running in Docker. Build dashboards that answer the three critical questions: What failed? Where? Why?

```bash
npx terminal-skills install observability-setup docker-helper cicd-pipeline
```

## Step-by-Step Walkthrough

### 1. Instrument services with OpenTelemetry

```text
I have 4 Node.js services (api-gateway, user-service, order-service, payment-service) and 1 Python service (notification-service). Add OpenTelemetry auto-instrumentation to each. Configure trace propagation using W3C TraceContext. Set up metric collection for: HTTP request duration, request count by status code, and active database connections. Add structured JSON logging with trace_id and span_id in every log line.
```

The agent configures each service:

```text
Instrumentation complete for 5 services:

api-gateway (Node.js):
  + @opentelemetry/sdk-node with auto-instrumentations
  + HTTP, Express, and pg instrumentations enabled
  + OTLP exporter → http://otel-collector:4318
  + Structured logger: pino with trace_id injection

user-service (Node.js): same pattern
order-service (Node.js): same pattern + Redis instrumentation
payment-service (Node.js): same pattern + custom span for payment gateway calls

notification-service (Python):
  + opentelemetry-distro with auto-instrumentation
  + OTLP exporter → http://otel-collector:4318
  + structlog with trace_id processor
```

### 2. Deploy the observability stack

```text
Write a docker-compose.yml for the observability backend: OpenTelemetry Collector receiving OTLP, Tempo for traces, Loki for logs, Mimir for metrics, and Grafana with pre-provisioned data sources. Pin all versions. Add a collector config that routes traces to Tempo, metrics to Mimir, and logs to Loki. Include health checks and resource limits.
```

### 3. Build the dashboards

```text
Create three Grafana dashboards as JSON provisioning files:

1. Service Overview — panels: request rate per service, p50/p95/p99 latency, error rate, top 5 slowest endpoints
2. Trace Explorer — panel linking to Tempo trace search, filtered by service, minimum duration, and error status
3. Infrastructure — panels: CPU and memory per service container, active DB connections, message queue depth

Use variables for service name and time range. Add alert rules: error rate > 5% for 5 minutes, p99 latency > 2s for 5 minutes.
```

### 4. Add correlation between signals

```text
Configure Grafana so that: clicking a spike in the error rate metric jumps to Loki logs filtered by that time range and service, and log lines with trace_ids link directly to the full trace in Tempo. Set up derived fields in the Loki data source to parse trace_id and create a Tempo link.
```

### 5. Create a runbook for common incidents

```text
Based on the dashboards, write a troubleshooting runbook in docs/runbook.md covering these scenarios:
1. High error rate on a single service — how to find the trace, identify the root span, check downstream dependencies
2. Latency spike across all services — how to check if it's database, network, or code
3. Service completely down — how to verify using health checks, check recent deployments, and roll back
Include the exact Grafana queries and Loki LogQL patterns for each scenario.
```

## Real-World Example

A platform engineer joins a team running 8 microservices on Kubernetes. Last week, checkout was slow for 20 minutes — the team spent 3 hours across Slack threads and SSH sessions before finding that the payment service was retrying a failing downstream call.

1. He asks the agent to instrument all 5 services with OpenTelemetry — auto-instrumentation is added in under 30 minutes
2. The observability stack deploys via Docker Compose: Collector, Tempo, Loki, Mimir, Grafana
3. Three dashboards are provisioned automatically — service overview, trace explorer, infrastructure
4. Signal correlation is configured: metric spike → relevant logs → full distributed trace in two clicks
5. A runbook documents exactly how to diagnose the three most common incident types
6. The next latency incident is identified in 4 minutes: a trace shows the payment service waiting 8 seconds for a third-party API, and the team adds a circuit breaker before users notice
