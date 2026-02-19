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
    volumes:
      - es_data:/usr/share/elasticsearch/data

volumes:
  es_data:
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

    @PostMapping
    public ResponseEntity<Order> createOrder(@RequestBody OrderRequest req) {
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

### Task C: Instrument with OpenTelemetry

```python
# tracing.py — Python service sending traces to Zipkin
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
```

### Task D: Query Traces via API

```bash
# Find traces by service name
curl -s "http://localhost:9411/api/v2/traces?serviceName=order-service&limit=10&lookback=3600000" | \
  jq '.[] | {traceId: .[0].traceId, spans: length, root: .[0].name}'
```

```bash
# Get service dependency graph
curl -s "http://localhost:9411/api/v2/dependencies?endTs=$(date +%s000)&lookback=86400000" | \
  jq '.[] | "\(.parent) -> \(.child) (\(.callCount) calls)"'
```

## Best Practices

- Use sampling rates below 100% in production for high-traffic services
- Include trace IDs in application logs for log-trace correlation
- Use B3 propagation headers for cross-service context propagation
- Prefer Elasticsearch over MySQL for production workloads with high trace volume
- Monitor Zipkin's own health with `/health` endpoint
