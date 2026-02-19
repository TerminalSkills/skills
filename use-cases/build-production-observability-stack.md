---
title: "Build a Production Observability Stack for Microservices"
slug: build-production-observability-stack
description: "Set up comprehensive monitoring with Prometheus, Grafana, Jaeger tracing, and Alertmanager for a microservices architecture running on Kubernetes."
skills: [prometheus-monitoring, grafana, jaeger, prometheus-alertmanager]
category: devops
tags: [observability, monitoring, tracing, alerting, microservices, kubernetes]
---

# Build a Production Observability Stack for Microservices

## The Problem

Marta runs a dozen microservices on Kubernetes for an e-commerce platform. When customers report slow checkouts, her team spends hours guessing which service is the bottleneck. Errors surface in Slack messages from developers grepping individual pod logs. There is no centralized view of system health, no distributed tracing, and no alerting — the team finds out about outages from customer support tickets.

## The Solution

Deploy Prometheus for metrics, Grafana for dashboards, Jaeger for distributed tracing, and Alertmanager for routing notifications.

```bash
# Install the skills
npx terminal-skills install prometheus-monitoring grafana jaeger prometheus-alertmanager
```

## Step-by-Step Walkthrough

### 1. Deploy Prometheus for Metrics Collection

Marta configures Prometheus with Kubernetes service discovery so it automatically scrapes every service that exposes a `/metrics` endpoint.

```yaml
# prometheus.yml — Scrape config with Kubernetes service discovery
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - '/etc/prometheus/rules/*.yml'

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
```

### 2. Instrument Services with OpenTelemetry for Tracing

Marta adds distributed tracing with OpenTelemetry sending spans to Jaeger. Each service calls `init_tracing()` at startup.

```python
# tracing.py — Shared tracing setup for Python services
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

def init_tracing(service_name: str):
    resource = Resource.create({"service.name": service_name, "deployment.environment": "production"})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(
        OTLPSpanExporter(endpoint="http://jaeger-collector:4317", insecure=True)
    ))
    trace.set_tracer_provider(provider)
    FlaskInstrumentor().instrument()
    RequestsInstrumentor().instrument()
```

HTTP calls between services propagate trace context automatically, so Jaeger shows the complete request path through all services.

### 3. Deploy Jaeger for Trace Storage

```yaml
# jaeger-deployment.yml — Jaeger collector with Elasticsearch backend
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jaeger-collector
  namespace: observability
spec:
  replicas: 2
  selector:
    matchLabels:
      app: jaeger-collector
  template:
    spec:
      containers:
        - name: jaeger-collector
          image: jaegertracing/jaeger-collector:1.54
          env:
            - name: SPAN_STORAGE_TYPE
              value: elasticsearch
            - name: ES_SERVER_URLS
              value: http://elasticsearch:9200
            - name: COLLECTOR_OTLP_ENABLED
              value: "true"
          ports:
            - containerPort: 4317
```

Now the team can search for a slow checkout, and see every span — the API gateway took 50ms, the order service 120ms, and the payment service 4.2 seconds calling the external provider. The bottleneck is immediately visible.

### 4. Configure Alertmanager for Notification Routing

```yaml
# alert-rules.yml — Critical alert rules
groups:
  - name: service-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
          / sum(rate(http_requests_total[5m])) by (service) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 5% on {{ $labels.service }}"
          dashboard: "https://grafana.internal/d/services?var-service={{ $labels.service }}"
```

```yaml
# alertmanager.yml — Route alerts to the right team
route:
  receiver: 'default-slack'
  group_by: ['alertname', 'service']
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-oncall'
    - match_re:
        service: ^(payment|billing)$
      receiver: 'payments-slack'

receivers:
  - name: 'default-slack'
    slack_configs:
      - channel: '#ops-alerts'
        send_resolved: true
  - name: 'pagerduty-oncall'
    pagerduty_configs:
      - service_key: '<PD_KEY>'
  - name: 'payments-slack'
    slack_configs:
      - channel: '#payments-alerts'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'service']
```

### 5. Build Grafana Dashboards

Marta configures Prometheus and Jaeger as Grafana data sources and builds a RED method dashboard (Request rate, Error rate, Duration) for every service with drill-down links to Jaeger traces.

## The Result

Within the first week, the team catches a memory leak through gradual latency increase on the dashboard — before any customer noticed. When the payment provider has a brief outage, Alertmanager pages the on-call engineer within 30 seconds, and they confirm through Jaeger traces in under a minute. Mean time to detection drops from hours to minutes.
