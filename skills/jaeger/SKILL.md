---
name: jaeger
description: >-
  Deploy and use Jaeger for distributed tracing across microservices. Use when
  a user needs to set up trace collection, instrument applications with
  OpenTelemetry, analyze trace data to find latency bottlenecks, or configure
  Jaeger storage backends and sampling strategies.
license: Apache-2.0
compatibility: "Jaeger 1.50+, OpenTelemetry SDK"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["jaeger", "tracing", "distributed-tracing", "opentelemetry", "observability", "spans"]
---

# Jaeger

## Overview

Set up Jaeger for distributed tracing to track requests across microservices. Covers deployment, OpenTelemetry instrumentation, storage configuration, sampling strategies, and trace analysis for debugging latency issues.

## Instructions

### Task A: Deploy Jaeger

```yaml
# docker-compose.yml — Jaeger all-in-one for development
services:
  jaeger:
    image: jaegertracing/all-in-one:1.54
    environment:
      - COLLECTOR_OTLP_ENABLED=true
      - SPAN_STORAGE_TYPE=badger
      - BADGER_EPHEMERAL=false
      - BADGER_DIRECTORY_VALUE=/badger/data
      - BADGER_DIRECTORY_KEY=/badger/key
    ports:
      - "16686:16686"   # Jaeger UI
      - "4317:4317"     # OTLP gRPC
      - "4318:4318"     # OTLP HTTP
      - "14268:14268"   # Jaeger HTTP collector
    volumes:
      - jaeger_data:/badger

volumes:
  jaeger_data:
```

```yaml
# docker-compose.yml — Production Jaeger with Elasticsearch backend
services:
  jaeger-collector:
    image: jaegertracing/jaeger-collector:1.54
    environment:
      - SPAN_STORAGE_TYPE=elasticsearch
      - ES_SERVER_URLS=http://elasticsearch:9200
      - ES_INDEX_PREFIX=jaeger
      - ES_NUM_SHARDS=3
      - ES_NUM_REPLICAS=1
      - COLLECTOR_OTLP_ENABLED=true
    ports:
      - "4317:4317"
      - "14268:14268"

  jaeger-query:
    image: jaegertracing/jaeger-query:1.54
    environment:
      - SPAN_STORAGE_TYPE=elasticsearch
      - ES_SERVER_URLS=http://elasticsearch:9200
      - ES_INDEX_PREFIX=jaeger
    ports:
      - "16686:16686"
```

### Task B: Instrument with OpenTelemetry (Python)

```python
# tracing.py — OpenTelemetry setup for Python service
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

def init_tracing(service_name: str):
    resource = Resource.create({
        "service.name": service_name,
        "service.version": "1.2.0",
        "deployment.environment": "production",
    })

    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint="http://jaeger:4317", insecure=True)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    # Auto-instrument libraries
    FlaskInstrumentor().instrument()
    RequestsInstrumentor().instrument()

    return trace.get_tracer(service_name)
```

```python
# app.py — Flask app with custom spans
from flask import Flask, request
from tracing import init_tracing

app = Flask(__name__)
tracer = init_tracing("order-service")

@app.route("/api/orders", methods=["POST"])
def create_order():
    with tracer.start_as_current_span("validate_order") as span:
        span.set_attribute("order.items_count", len(request.json.get("items", [])))
        validate(request.json)

    with tracer.start_as_current_span("save_to_database") as span:
        order = save_order(request.json)
        span.set_attribute("order.id", order["id"])

    with tracer.start_as_current_span("notify_payment_service") as span:
        span.set_attribute("payment.method", request.json.get("payment_method"))
        requests.post("http://payment-service/charge", json=order)

    return {"order_id": order["id"]}, 201
```

### Task C: Instrument with OpenTelemetry (Node.js)

```javascript
// tracing.js — OpenTelemetry setup for Node.js service
const { NodeSDK } = require('@opentelemetry/sdk-node')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc')
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')
const { Resource } = require('@opentelemetry/resources')
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions')

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'api-gateway',
    [ATTR_SERVICE_VERSION]: '3.1.0',
  }),
  traceExporter: new OTLPTraceExporter({
    url: 'http://jaeger:4317',
  }),
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },
  })],
})

sdk.start()
process.on('SIGTERM', () => sdk.shutdown())
```

### Task D: Configure Sampling

```yaml
# jaeger-sampling.json — Adaptive sampling configuration
{
  "service_strategies": [
    {
      "service": "api-gateway",
      "type": "probabilistic",
      "param": 0.5
    },
    {
      "service": "payment-service",
      "type": "probabilistic",
      "param": 1.0
    }
  ],
  "default_strategy": {
    "type": "probabilistic",
    "param": 0.1,
    "operation_strategies": [
      {
        "operation": "/health",
        "type": "probabilistic",
        "param": 0.001
      }
    ]
  }
}
```

### Task E: Query Traces via API

```bash
# Find traces for a specific service with minimum duration
curl -s "http://localhost:16686/api/traces?service=order-service&limit=20&minDuration=500ms&lookback=1h" | \
  jq '.data[] | {traceID: .traceID, spans: (.spans | length), duration: (.spans[0].duration / 1000 | tostring + "ms")}'
```

```bash
# Get a specific trace by ID
curl -s "http://localhost:16686/api/traces/abc123def456" | \
  jq '.data[0].spans[] | {operation: .operationName, service: .processID, duration: (.duration / 1000), tags: [.tags[] | {(.key): .value}]}'
```

```bash
# Find traces with errors
curl -s "http://localhost:16686/api/traces?service=order-service&tags=%7B%22error%22%3A%22true%22%7D&limit=10" | \
  jq '.data[] | {traceID: .traceID, operations: [.spans[] | .operationName]}'
```

## Best Practices

- Use OpenTelemetry SDK instead of Jaeger client libraries (Jaeger clients are deprecated)
- Set lower sampling rates for high-traffic health/readiness endpoints
- Sample 100% of traces for critical paths like payments and authentication
- Add meaningful span attributes (order IDs, user IDs, status codes) for debugging
- Use Elasticsearch or Cassandra for production storage; badger is for development only
- Set span storage TTL to control disk usage (7-14 days is typical)
