---
name: zipkin
description: >-
  Deploy and configure Zipkin for distributed tracing and request flow
  visualization. Use when a user needs to set up trace collection, instrument
  Java/Spring or other services with Zipkin, analyze service dependencies,
  or configure storage backends for trace data.
license: Apache-2.0
compatibility: "Zipkin 2.24+, Spring Boot 3+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["zipkin", "tracing", "distributed-tracing", "spring-boot", "observability"]
---

# Zipkin

## Overview

Set up Zipkin for distributed tracing to visualize request flows across services. Covers deployment, instrumentation with Spring Boot and OpenTelemetry, storage configuration, and dependency analysis.

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
      - "9411:9411"
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
# Quick start with in-memory storage (development only)
docker run -d -p 9411:9411 openzipkin/zipkin:3
```

### Task B: Instrument Spring Boot Application

```xml
<!-- pom.xml — Zipkin dependencies for Spring Boot 3 -->
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
# application.yml — Spring Boot tracing configuration
spring:
  application:
    name: order-service
management:
  tracing:
    sampling:
      probability: 1.0
  zipkin:
    tracing:
      endpoint: http://zipkin:9411/api/v2/spans
logging:
  pattern:
    level: "%5p [${spring.application.name:},%X{traceId:-},%X{spanId:-}]"
```

```java
// OrderController.java — Spring Boot controller with automatic tracing
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final RestClient restClient;
    private final ObservationRegistry registry;

    @PostMapping
    public ResponseEntity<Order> createOrder(@RequestBody OrderRequest req) {
        // Spans are created automatically for @RestController methods
        Order order = orderService.create(req);

        // RestClient propagates trace context automatically
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
# tracing.py — Python service sending traces to Zipkin via OTLP
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
```

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
# Get service dependency graph
curl -s "http://localhost:9411/api/v2/dependencies?endTs=$(date +%s000)&lookback=86400000" | \
  jq '.[] | "\(.parent) -> \(.child) (\(.callCount) calls)"'
```

```bash
# Find traces with specific tag
curl -s "http://localhost:9411/api/v2/traces?annotationQuery=http.status_code%3D500&serviceName=order-service" | \
  jq '.[0][] | {name: .name, service: .localEndpoint.serviceName, duration: .duration}'
```

### Task E: Zipkin with MySQL Storage

```yaml
# docker-compose.yml — Zipkin with MySQL for durable storage
services:
  zipkin:
    image: openzipkin/zipkin:3
    environment:
      - STORAGE_TYPE=mysql
      - MYSQL_HOST=mysql
      - MYSQL_TCP_PORT=3306
      - MYSQL_USER=zipkin
      - MYSQL_PASS=zipkin_password
    ports:
      - "9411:9411"
    depends_on:
      - mysql

  mysql:
    image: openzipkin/zipkin-mysql:3
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
```

## Best Practices

- Use sampling rates below 100% in production for high-traffic services to control storage costs
- Include trace IDs in application logs for log-trace correlation
- Use B3 propagation headers for cross-service context propagation in Spring Boot
- Set appropriate storage TTL — 7 days for detailed traces, dependency data is lightweight
- Monitor Zipkin's own health with `/health` endpoint and `SELF_TRACING_ENABLED=true`
- Prefer Elasticsearch over MySQL for production workloads with high trace volume
