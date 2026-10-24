---
name: zipkin
description: >-
  Deploy and configure Zipkin for distributed tracing and request flow
  visualization. Use when a user needs to set up trace collection, instrument
  Java/Spring or other services with Zipkin, analyze service dependencies,
  or configure storage backends for trace data.
license: Apache-2.0
compatibility: "Zipkin server 3.x (Docker), Spring Boot 3.x or 4.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/openzipkin/zipkin
  category: devops
  tags: ["zipkin", "tracing", "distributed-tracing", "spring-boot", "observability"]
---

# Zipkin

## Overview

Set up Zipkin for distributed tracing to visualize request flows across services. Covers deployment, instrumentation with Spring Boot and OpenTelemetry, storage configuration, and dependency analysis. The current server release is 3.6.1; the `openzipkin/zipkin:3` image listens on port 9411 for the UI, the span API (`POST /api/v2/spans`) and queries (`/api/v2/*`). Zipkin does not receive OTLP itself; OpenTelemetry SDKs must send Zipkin JSON, or go through an OpenTelemetry Collector with the `zipkin` exporter.

## Instructions

### Task A: Deploy Zipkin

```yaml
# docker-compose.yml — Zipkin with Elasticsearch storage
services:
  zipkin:
    image: openzipkin/zipkin:3
    environment:
      - STORAGE_TYPE=elasticsearch
      - ES_HOSTS=http://elasticsearch:9200
      - ES_INDEX=zipkin
      - ES_INDEX_REPLICAS=1
      - ES_INDEX_SHARDS=3
      - SELF_TRACING_ENABLED=true
      - JAVA_OPTS=-Xms512m -Xmx512m
    ports:
      - "127.0.0.1:9411:9411"
    depends_on:
      - elasticsearch

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
    volumes:
      - es_data:/usr/share/elasticsearch/data

volumes:
  es_data:
```

```bash
# Quick start with in-memory storage (development only; data is lost on restart)
docker run -d --name zipkin -p 127.0.0.1:9411:9411 openzipkin/zipkin:3
curl -s http://localhost:9411/health   # "status" : "UP"
```

### Task B: Instrument Spring Boot Application

```xml
<!-- pom.xml — Spring Boot 4: one starter, version managed by the parent -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-zipkin</artifactId>
</dependency>

<!-- Spring Boot 3 instead: these two artifacts, plus spring-boot-starter-actuator -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-brave</artifactId>
</dependency>
<dependency>
    <groupId>io.zipkin.reporter2</groupId>
    <artifactId>zipkin-reporter-brave</artifactId>
</dependency>
```

```yaml
# application.yml — Spring Boot tracing configuration (Spring Boot 4 property names)
spring:
  application:
    name: order-service
management:
  tracing:
    sampling:
      probability: 1.0        # default is 0.1 (10% of requests)
    export:
      zipkin:
        endpoint: http://zipkin:9411/api/v2/spans
# Spring Boot 3 uses management.zipkin.tracing.endpoint for the same setting
logging:
  pattern:
    level: "%5p [${spring.application.name:},%X{traceId:-},%X{spanId:-}]"
```

```java
// OrderController.java — Spring Boot controller with automatic tracing
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final RestClient restClient;     // build it from the injected RestClient.Builder
    private final OrderService orderService;

    @PostMapping
    public ResponseEntity<Order> createOrder(@RequestBody OrderRequest req) {
        // Spans are created automatically for @RestController methods
        Order order = orderService.create(req);

        // A RestClient created from the Spring-managed RestClient.Builder propagates trace context
        PaymentResult payment = restClient.post()
            .uri("http://payment-service/api/charge")
            .body(new ChargeRequest(order.getId(), order.getTotal()))
            .retrieve()
            .body(PaymentResult.class);

        return ResponseEntity.status(201).body(order);
    }
}
```

### Task C: Instrument with OpenTelemetry (Generic)

```python
# tracing.py — Python service sending traces to Zipkin (pip install opentelemetry-sdk opentelemetry-exporter-zipkin-json)
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.zipkin.json import ZipkinExporter
from opentelemetry.sdk.resources import Resource

resource = Resource.create({"service.name": "inventory-service"})
provider = TracerProvider(resource=resource)

zipkin_exporter = ZipkinExporter(endpoint="http://zipkin:9411/api/v2/spans")
provider.add_span_processor(BatchSpanProcessor(zipkin_exporter))
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("inventory-service")
with tracer.start_as_current_span("reserve-stock") as span:
    span.set_attribute("http.status_code", 500)   # searchable with annotationQuery
```

OpenTelemetry has deprecated its Zipkin exporters (the specification drops them in December 2026), though they still work. For new setups, send OTLP to an OpenTelemetry Collector and use its `zipkin` exporter pointed at `http://zipkin:9411/api/v2/spans`.

```javascript
// tracing.js — Node.js service sending traces to Zipkin
const { NodeSDK } = require('@opentelemetry/sdk-node')
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin')
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')

const sdk = new NodeSDK({
  traceExporter: new ZipkinExporter({ url: 'http://zipkin:9411/api/v2/spans' }),
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: 'notification-service',
})
sdk.start()
```

### Task D: Query Traces via API

```bash
# Find traces by service name and time range
curl -s "http://localhost:9411/api/v2/traces?serviceName=order-service&limit=10&lookback=3600000" | \
  jq '.[] | {traceId: .[0].traceId, spans: length, root: .[0].name, duration: (.[0].duration / 1000)}'
```

```bash
# Get service dependency graph (with Elasticsearch, MySQL or Cassandra storage this is empty until
# the zipkin-dependencies job has run; in-memory storage computes it on the fly)
curl -s "http://localhost:9411/api/v2/dependencies?endTs=$(date +%s000)&lookback=86400000" | \
  jq '.[] | "\(.parent) -> \(.child) (\(.callCount) calls)"'
```

```bash
# Find traces with specific tag
curl -s "http://localhost:9411/api/v2/traces?annotationQuery=http.status_code%3D500&serviceName=order-service" | \
  jq '.[0][] | {name: .name, service: .localEndpoint.serviceName, duration: .duration}'
```

### Task E: Zipkin with MySQL Storage

The official MySQL image is a demo image, not for production. Use a normal MariaDB 11.8 server (the version Zipkin's own tests run against) and load Zipkin's schema (`mysql.sql` from `zipkin-storage/mysql-v1/src/main/resources/` in the Zipkin repository, saved next to the compose file). MySQL 8.4 does not work here: Zipkin's MariaDB JDBC driver fails with "RSA public key is not available client side" on its default `caching_sha2_password` login over a non-TLS connection.

```yaml
# docker-compose.yml — Zipkin with MariaDB through the mysql storage type
services:
  zipkin:
    image: openzipkin/zipkin:3
    environment:
      - STORAGE_TYPE=mysql
      - MYSQL_HOST=mysql
      - MYSQL_TCP_PORT=3306
      - MYSQL_DB=zipkin
      - MYSQL_USER=zipkin
      - MYSQL_PASS=${ZIPKIN_MYSQL_PASSWORD}
    ports:
      - "127.0.0.1:9411:9411"
    depends_on:
      - mysql

  mysql:
    image: mariadb:11.8
    environment:
      - MARIADB_DATABASE=zipkin
      - MARIADB_USER=zipkin
      - MARIADB_PASSWORD=${ZIPKIN_MYSQL_PASSWORD}
      - MARIADB_RANDOM_ROOT_PASSWORD=yes
    volumes:
      - ./mysql.sql:/docker-entrypoint-initdb.d/zipkin.sql:ro
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
```

Zipkin 3 still supports `STORAGE_TYPE` values `mem`, `mysql`, `cassandra3` and `elasticsearch`; the `openzipkin/zipkin-slim` image supports only in-memory and Elasticsearch.

## Best Practices

- Use sampling rates below 100% in production for high-traffic services to control storage costs
- Include trace IDs in application logs for log-trace correlation
- Spring Boot propagates W3C `traceparent` headers by default; set `management.tracing.propagation.type: B3` only when talking to services that expect B3
- Set appropriate storage TTL — 7 days for detailed traces, dependency data is lightweight
- Monitor Zipkin's own health with the `/health` endpoint; `SELF_TRACING_ENABLED=true` makes it trace its own requests
- Expose port 9411 only to your internal network: the UI and span endpoint have no authentication
- Prefer Elasticsearch over MySQL for production workloads with high trace volume

## Examples

### Example 1: "Run Zipkin locally and see whether my Python service reports spans"

Start the in-memory container from Task A, run the `tracing.py` snippet with `reserve-stock` pointed at `http://localhost:9411/api/v2/spans`, then `curl -s http://localhost:9411/api/v2/services`. The output is `["inventory-service"]`, and the trace appears in the UI at `http://localhost:9411` after "Run Query".

### Example 2: "Find the failing checkout requests from the last hour"

`curl -s "http://localhost:9411/api/v2/traces?serviceName=order-service&annotationQuery=http.status_code%3D500&lookback=3600000&limit=20"` returns a JSON array of traces (each an array of spans); pipe through `jq '.[] | .[0].traceId'` to list the trace IDs to open in the UI.

## Guidelines

- Never expose Zipkin publicly without an authenticating proxy; it stores request metadata (URLs, tags) from every service.
- Limit sampling in production and set a retention period on the storage backend (Elasticsearch index lifecycle or a MySQL purge job).
- Pin the image tag to a minor version for repeatable deployments.
