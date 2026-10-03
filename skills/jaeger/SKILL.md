---
name: jaeger
description: >-
  Collects, stores and visualizes distributed traces with Jaeger v2 so you can follow a request across microservices and find latency bottlenecks. Use when a user needs to deploy Jaeger, send OpenTelemetry traces to it, pick a storage backend such as Elasticsearch or OpenSearch, configure sampling, or query traces through the API.
license: Apache-2.0
compatibility: "Jaeger v2 (2.21 checked), Docker; OpenTelemetry SDKs. Jaeger v1 is archived"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["jaeger", "tracing", "distributed-tracing", "opentelemetry", "observability"]
  repository: https://github.com/jaegertracing/jaeger
---

# Jaeger

## Overview

Jaeger is a CNCF graduated tracing backend: it receives spans, stores them and serves a UI and query API. Jaeger v2 (current line, 2.21.0 in September 2026) is built on the OpenTelemetry Collector: one binary, one image (`jaegertracing/jaeger`), configured only through a YAML file, and it receives OTLP natively. The v1 images (`all-in-one`, `jaeger-collector`, `jaeger-query`) and their `SPAN_STORAGE_TYPE` / `COLLECTOR_OTLP_ENABLED` environment variables are gone from the current docs (v1.76 is the archived last line), and the old Jaeger client libraries are deprecated: instrument with OpenTelemetry SDKs. Docs: https://www.jaegertracing.io/docs/latest/.

## Instructions

### Task A: Deploy

All-in-one with in-memory storage (data is lost on restart), good for a laptop:

```bash
docker run --rm --name jaeger -p 16686:16686 -p 4317:4317 -p 4318:4318 -p 5778:5778 -p 9411:9411 \
  cr.jaegertracing.io/jaegertracing/jaeger:2.21.0
```

UI at http://localhost:16686, OTLP gRPC on 4317, OTLP HTTP on 4318, remote sampling on 5778. Pin a version tag instead of `latest`. Any other role or storage needs `--config /path/config.yaml` mounted into the container. The config uses the OpenTelemetry Collector layout: `receivers`, `processors`, `exporters`, `service.pipelines`, plus Jaeger extensions `jaeger_storage` (backends), `jaeger_query` (UI and API) and `remote_sampling`. Values can use `${env:NAME:-default}`; `--set receivers.otlp.protocols.grpc.endpoint=0.0.0.0:4317` overrides one key. Inside a container, receivers must listen on `0.0.0.0`.

Persistent single-node setup with Badger (development or small installs):

```yaml
# config.yaml
service:
  extensions: [jaeger_storage, jaeger_query, remote_sampling]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [jaeger_storage_exporter]
extensions:
  jaeger_query:
    storage:
      traces: main_store
  jaeger_storage:
    backends:
      main_store:
        badger:
          directories: { keys: /badger/key, values: /badger/data }
          ephemeral: false
          ttl: { spans: 168h }
  remote_sampling:
    file: { path: /etc/jaeger/sampling.json, reload_interval: 30s }
    http: { endpoint: 0.0.0.0:5778 }
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }
processors:
  batch:
exporters:
  jaeger_storage_exporter:
    trace_storage: main_store
```

```yaml
# docker-compose.yml
services:
  jaeger:
    image: jaegertracing/jaeger:2.21.0
    command: ["--config", "/etc/jaeger/config.yaml"]
    ports: ["16686:16686", "4317:4317", "4318:4318", "5778:5778"]
    volumes:
      - ./config.yaml:/etc/jaeger/config.yaml:ro
      - ./sampling.json:/etc/jaeger/sampling.json:ro
      - jaeger-data:/badger
volumes:
  jaeger-data:
```

The image runs as uid 10001: a fresh named volume is owned by root and Jaeger fails with `mkdir /badger/key: permission denied`. Fix once with `docker run --rm -v <project>_jaeger-data:/badger alpine:3 chown -R 10001 /badger`.

Production storage: Cassandra, Elasticsearch and OpenSearch are the supported distributed backends (the Jaeger team recommends OpenSearch over Cassandra at scale); ClickHouse is experimental behind a feature gate; Kafka is for buffering. Swap the backend block for Elasticsearch:

```yaml
  jaeger_storage:
    backends:
      main_store:
        elasticsearch:
          server_urls: ["http://elasticsearch:9200"]
          indices:
            index_prefix: "jaeger-main"
            spans: { date_layout: "2006-01-02", rollover_frequency: "day", shards: 3, replicas: 1 }
```

A second backend under `jaeger_query.storage.traces_archive` gives an archive store for traces saved manually from the UI. Collector and query are stateless and can be scaled out; for separate roles reuse one config per role.

### Task B: Instrument with OpenTelemetry (Python)

```bash
pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-grpc opentelemetry-instrumentation-flask opentelemetry-instrumentation-requests
```

```python
# tracing.py
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

def init_tracing(service_name: str):
    resource = Resource.create({
        "service.name": service_name,
        "service.version": "1.2.0",
        "deployment.environment.name": "production",
    })
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint="http://jaeger:4317", insecure=True)))
    trace.set_tracer_provider(provider)
    RequestsInstrumentor().instrument()
    return trace.get_tracer(service_name)

# after creating the Flask app: FlaskInstrumentor().instrument_app(app)
```

Add custom spans with `with tracer.start_as_current_span("save_order") as span: span.set_attribute("order.id", order_id)`. Without code changes, `opentelemetry-instrument python app.py` with `OTEL_SERVICE_NAME=order-service OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317` also works.

### Task C: Instrument with OpenTelemetry (Node.js)

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/resources @opentelemetry/semantic-conventions
```

```javascript
// tracing.js: load first, e.g. node --require ./tracing.js server.js
const { NodeSDK } = require('@opentelemetry/sdk-node')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc')
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')
const { resourceFromAttributes } = require('@opentelemetry/resources')
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions')

const sdk = new NodeSDK({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'api-gateway', [ATTR_SERVICE_VERSION]: '3.1.0' }),
  traceExporter: new OTLPTraceExporter({ url: 'http://jaeger:4317' }),
  instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })],
})
sdk.start()
process.on('SIGTERM', () => sdk.shutdown())
```

In OpenTelemetry JS 2.x the `Resource` class is gone; `new Resource(...)` throws, use `resourceFromAttributes`.

### Task D: Sampling

Jaeger's `remote_sampling` extension serves per-service strategies from a file (reloaded on change). With no file, every service gets probabilistic 0.001 (0.1%). `ratelimiting` works per service but not per operation.

```json
{
  "service_strategies": [
    { "service": "payment-service", "type": "probabilistic", "param": 1.0 },
    { "service": "api-gateway", "type": "ratelimiting", "param": 5 }
  ],
  "default_strategy": {
    "type": "probabilistic",
    "param": 0.1,
    "operation_strategies": [{ "operation": "/health", "type": "probabilistic", "param": 0.001 }]
  }
}
```

Check what an SDK would receive: `curl -s "http://localhost:5778/api/sampling?service=payment-service"`. SDKs only follow these strategies when configured with a Jaeger remote sampler (for example `OTEL_TRACES_SAMPLER=jaeger_remote` with `OTEL_TRACES_SAMPLER_ARG=endpoint=http://jaeger:5778,pollingIntervalMs=60000,initialSamplingRate=0.25` in SDKs that support it); otherwise set head sampling in the SDK. Tail-based sampling is available through a tail sampling processor in the pipeline, at the cost of memory in Jaeger. An adaptive mode computes rates from traffic.

### Task E: Query traces via the API

The stable HTTP API is `/api/v3` (OTLP JSON); gRPC `jaeger.api_v3.QueryService` is on 16685. The `/api/*` JSON that the UI uses is internal and may change.

```bash
curl -s http://localhost:16686/api/v3/services
curl -s "http://localhost:16686/api/v3/operations?service=order-service"
# traces slower than 500 ms in the last hour; the response is OTLP resourceSpans
curl -s "http://localhost:16686/api/v3/traces?query.service_name=order-service&query.start_time_min=$(date -u -d '-1 hour' +%FT%TZ)&query.start_time_max=$(date -u +%FT%TZ)&query.duration_min=500ms" \
  | jq -c '.result.resourceSpans[].scopeSpans[].spans[] | {traceId, name}'
# one trace by its 32-hex id
curl -s http://localhost:16686/api/v3/traces/5b8efff798038103d269b633813fc60c
```

`query.attributes` takes URL-encoded JSON such as `{"http.status_code":"500"}`; `query.start_time_min` and `query.start_time_max` are required, and an empty result is HTTP 404 with `No traces found`.

## Examples

### Example 1: Try tracing locally in two minutes

**User request:** "Run Jaeger on my laptop and send one test span so I can see the UI"

```bash
docker run -d --rm --name jaeger -p 16686:16686 -p 4318:4318 cr.jaegertracing.io/jaegertracing/jaeger:2.21.0
curl -s -X POST http://localhost:4318/v1/traces -H 'Content-Type: application/json' -d '{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"order-service"}}]},"scopeSpans":[{"spans":[{"traceId":"5b8efff798038103d269b633813fc60c","spanId":"eee19b7ec3c1b174","name":"POST /api/orders","kind":2,"startTimeUnixNano":"1791028939000000000","endTimeUnixNano":"1791028940000000000"}]}]}]}'
```

**Result:** the curl prints `{"partialSuccess":{}}`; http://localhost:16686 lists `order-service` and the 1-second `POST /api/orders` trace (pick a recent timestamp, or widen the UI time range). `docker stop jaeger` removes the container and its data.

### Example 2: Find slow checkouts in a Flask service

**User request:** "Trace my Flask order service and show me which step makes /api/orders slow"

Add Task B's `init_tracing("order-service")`, wrap `validate_order`, `save_to_database` and `notify_payment_service` in `start_as_current_span`, call the endpoint, then search `order-service` with Min Duration `500ms` in the UI or use the Task E query.

**Result:** each trace shows one `POST /api/orders` root span with three child spans; the widest bar names the slow step (for example `notify_payment_service` at 480 ms of 520 ms), with `order.id` attributes to search by.

## Guidelines

- Do not copy v1 compose files: `jaegertracing/all-in-one`, `jaeger-collector` and `jaeger-query` images and `SPAN_STORAGE_TYPE` are v1. v2 reads no storage env vars; use the YAML config.
- Memory storage and Badger are for development; use Elasticsearch/OpenSearch or Cassandra in production and set a retention (7 to 14 days is typical).
- Ports 4317/4318 (OTLP) and 16686 have no authentication by default: bind to localhost or put them behind a proxy or private network.
- Always sample payment and auth paths at 100% and health checks near zero; 0.1% default means a quiet service may show no traces.
- Legacy ports (14250 gRPC, 14268 Thrift HTTP, 6831/6832 UDP) exist only for old Jaeger clients; new code uses OTLP.
- Traces exported through a collector in front of Jaeger work the same way: point the collector's OTLP exporter at `jaeger:4317`.
