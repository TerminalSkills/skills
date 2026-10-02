---
name: signoz
description: >-
  SigNoz is an open-source observability platform that stores traces, metrics
  and logs in one UI, built natively on OpenTelemetry and available self-hosted
  or as SigNoz Cloud. Use when a user asks to install SigNoz, send OpenTelemetry
  traces, metrics or logs from a Node.js app to SigNoz, correlate logs with
  traces, build dashboards, or set up alerts as a Datadog or New Relic
  alternative.
license: Apache-2.0
compatibility: "Docker Engine 20.10+ with Compose v2 and 4 GB RAM for self-hosting; Node.js 20.6+ for the examples"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/SigNoz/signoz
  category: devops
  tags:
    - observability
    - opentelemetry
    - tracing
    - metrics
    - logs
---

# SigNoz — Open-Source Observability Platform

## Overview

SigNoz receives OpenTelemetry (OTLP) data and shows traces, metrics, logs, exceptions, dashboards and alerts in one UI, with ClickHouse as the telemetry store. Applications are instrumented with the standard OpenTelemetry SDKs; nothing is SigNoz-specific, so the same code can send to another backend. Latest release checked: v0.144.0 (2026-09-29).

## Instructions

### Deploy self-hosted with Foundry

Since v0.130.0 the old `deploy/` Docker Compose files and `install.sh` are deprecated and no longer maintained. The supported installer is `foundryctl` (Foundry), which turns one YAML "casting" into a Compose, Swarm, Kubernetes (Helm or Kustomize) or systemd deployment.

Install the binary from a release archive and verify it first (the project's own installer is a `curl | bash` script; do not pipe it blindly):

```bash
ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
VERSION=0.3.0
BASE="https://github.com/SigNoz/foundry/releases/download/v${VERSION}"
curl -fsSLO "${BASE}/foundry_linux_${ARCH}.tar.gz"
curl -fsSLO "${BASE}/foundry_${VERSION}_checksums.txt"
sha256sum --check --ignore-missing "foundry_${VERSION}_checksums.txt"     # must print OK
tar -xzf "foundry_linux_${ARCH}.tar.gz"
mkdir -p "$HOME/.local/bin" && mv foundry_*/bin/foundryctl "$HOME/.local/bin/"
foundryctl --help
```

Then describe the deployment and cast it:

```yaml
# casting.yaml
apiVersion: v1alpha1
metadata:
  name: signoz-dev
spec:
  deployment:
    mode: docker
    flavor: compose
```

```bash
foundryctl cast -f casting.yaml       # validates prerequisites, generates files into pours/, deploys
foundryctl gen examples               # writes example castings for Docker, Kubernetes, systemd, ...
```

Ports: UI on **8080** (http://localhost:8080; older versions used 3301), OTLP gRPC **4317**, OTLP HTTP **4318**, optional MCP server **8000**. On Windows use a WSL 2 distribution with Docker Engine installed inside it; Docker Desktop can crash ClickHouse Keeper.

SigNoz Cloud needs no deployment: send data to `https://ingest.<region>.signoz.cloud:443` with the header `signoz-ingestion-key=<key>` (region and key are shown under Settings in your account).

### Instrument a Node.js service

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/exporter-logs-otlp-http @opentelemetry/sdk-metrics \
  @opentelemetry/resources @opentelemetry/semantic-conventions
```

Quickest path, no code changes (traces and metrics; add `OTEL_LOGS_EXPORTER=otlp` for logs):

```bash
export OTEL_SERVICE_NAME=api-gateway
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318          # self-hosted
export OTEL_RESOURCE_ATTRIBUTES=service.version=1.4.2,deployment.environment.name=staging
export OTEL_LOGS_EXPORTER=otlp
node --require @opentelemetry/auto-instrumentations-node/register server.js
```

For SigNoz Cloud set the endpoint to the ingest URL and add `OTEL_EXPORTER_OTLP_HEADERS="signoz-ingestion-key=$SIGNOZ_INGESTION_KEY"`; for self-hosted do not set the header. Use Node 20.6+ (18.19+ at minimum).

Code-based setup (tested with `sdk-node` 0.222 and `resources` 2.x; CommonJS, loaded first with `node --require ./tracing.js server.js`):

```javascript
// tracing.js
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { OTLPMetricExporter } = require("@opentelemetry/exporter-metrics-otlp-http");
const { PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require("@opentelemetry/semantic-conventions");

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "api-gateway",
    [ATTR_SERVICE_VERSION]: "1.4.2",
    "deployment.environment.name": process.env.NODE_ENV ?? "development",
  }),
  traceExporter: new OTLPTraceExporter(),     // endpoint and headers come from OTEL_EXPORTER_OTLP_*
  metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis: 30000 })],
  instrumentations: [getNodeAutoInstrumentations({ "@opentelemetry/instrumentation-fs": { enabled: false } })],
});
sdk.start();
process.on("SIGTERM", () => sdk.shutdown());
```

In OpenTelemetry JS 2.x the `Resource` class is gone: use `resourceFromAttributes`. With ES modules, instrumentation needs the loader hooks from the OpenTelemetry docs (`--import`), otherwise libraries are not patched.

### Custom spans and metrics

```javascript
const { trace, metrics, SpanStatusCode } = require("@opentelemetry/api");
const tracer = trace.getTracer("order-service");
const ordersProcessed = metrics.getMeter("business").createCounter("orders.processed");

async function processOrder(orderId, plan) {
  return tracer.startActiveSpan("process-order", async (span) => {
    span.setAttribute("order.id", orderId);
    try {
      await chargePayment(orderId);
      ordersProcessed.add(1, { "order.plan": plan });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();                              // always end the span
    }
  });
}
```

### Logs correlated with traces

With the auto-instrumentation (or `@opentelemetry/instrumentation-pino`) loaded first, a plain `pino()` logger gets `trace_id`, `span_id` and `trace_flags` added to every record written inside an active span, and `OTEL_LOGS_EXPORTER=otlp` ships them to SigNoz, which links a log line to its trace. No custom mixin is needed. Verified locally against a stub OTLP receiver: traces, metrics and logs each arrived on `/v1/traces`, `/v1/metrics`, `/v1/logs`.

### Dashboards and alerts

Dashboards use the query builder, PromQL or ClickHouse SQL. Alerts (UI, Alerts section) can fire on metrics, traces, logs or exceptions and notify Slack, PagerDuty, Opsgenie, Microsoft Teams, e-mail or a webhook. Useful first rules: p99 latency of a route above 2 s, error rate above 5% for 5 minutes, a business counter at zero for 10 minutes.

### Agents

SigNoz publishes an MCP server (port 8000 in the self-hosted stack) and agent skills so coding agents can query telemetry; see the SigNoz docs under "AI".

## Examples

### Instrument a Dockerized API and watch it in SigNoz

User: "My Express API runs in Docker. Get traces into a local SigNoz."

```bash
foundryctl cast -f casting.yaml
docker run --rm -p 3000:3000 \
  -e OTEL_SERVICE_NAME=checkout-api \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318 \
  -e NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register" \
  --add-host host.docker.internal:host-gateway \
  registry.northwind-outfitters.com/checkout-api:2.7.0
curl -s localhost:3000/api/orders > /dev/null
```

Result: after a minute `checkout-api` appears under Services at http://localhost:8080 with latency and error charts, and each request shows as a trace including its Postgres and HTTP client spans. The image must already contain the `@opentelemetry/*` packages.

### Find out why a checkout is slow

User: "p99 on /api/checkout jumped to 4 seconds. Where is the time going?"

Open Traces, filter `serviceName = checkout-api` and `durationNano > 2000000000`, open the slowest trace and read the waterfall: the wide child span (for example `charge-payment` or a `pg.query`) is the cause. Check the logs tab for lines carrying the same `trace_id`, then create an alert on that route's p99 so it pages next time.

## Guidelines

- Initialize OpenTelemetry before anything else is imported, or auto-instrumentation will not patch those libraries.
- Spans need `span.end()` on every path; leaked spans never export.
- Do not put secrets or personal data in span attributes or log fields; keep ingestion keys in environment variables.
- Expose OTLP ports 4317 and 4318 only to your own network; they accept unauthenticated data in the self-hosted stack.
- Budget at least 4 GB RAM for Docker; ClickHouse disk use grows with volume, so set retention in Settings and use sampling in the OpenTelemetry Collector (tail-based sampling keeps errors and slow traces) for busy services.
- Ports and install steps changed in recent releases: when an older tutorial mentions `localhost:3301` or `deploy/docker/clickhouse-setup`, use the Foundry steps above.
- Keep metric attribute values low-cardinality (plan, region), never user or order ids.
