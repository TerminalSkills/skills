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

Marta runs a dozen microservices on Kubernetes for an e-commerce platform. When customers report slow checkouts, her team spends hours guessing which service is the bottleneck. Errors surface in Slack messages from frustrated developers grepping individual pod logs. There is no centralized view of system health, no distributed tracing to follow a request across services, and no alerting — the team finds out about outages from customer support tickets.

She needs metrics, tracing, and alerting working together so her team can detect issues before customers do, trace slow requests to their root cause, and get paged when something breaks at 3 AM instead of finding out the next morning.

## The Solution

Deploy Prometheus for metrics collection, Grafana for dashboards, Jaeger for distributed tracing, and Alertmanager for routing notifications. Each tool handles one concern, and together they give full observability across every service.

```bash
# Install the skills
npx terminal-skills install prometheus-monitoring grafana jaeger prometheus-alertmanager
```

## Step-by-Step Walkthrough

### 1. Deploy Prometheus for Metrics Collection

Marta starts with Prometheus to scrape metrics from all services. Every microservice already exposes a `/metrics` endpoint using the Prometheus client library for their language.

```yaml
# prometheus.yml — Scrape config for Kubernetes service discovery
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

She deploys Prometheus as a StatefulSet with persistent storage so metrics survive pod restarts.

### 2. Instrument Services with OpenTelemetry for Tracing

Next, Marta adds distributed tracing so her team can follow a single checkout request from the API gateway through the order service, payment service, and inventory service. She uses OpenTelemetry to send traces to Jaeger.

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
    resource = Resource.create({
        "service.name": service_name,
        "deployment.environment": "production",
    })
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint="http://jaeger-collector:4317", insecure=True)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    FlaskInstrumentor().instrument()
    RequestsInstrumentor().instrument()
```

Each service calls `init_tracing("service-name")` at startup. HTTP calls between services automatically propagate trace context, so Jaeger shows the complete request path.

### 3. Deploy Jaeger for Trace Storage and Visualization

```yaml
# jaeger-deployment.yml — Jaeger collector and query with Elasticsearch backend
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
            - containerPort: 14268
```

Marta's team can now open the Jaeger UI, search for a slow checkout request, and see every span — the API gateway took 50ms, the order service took 120ms, and the payment service took 4.2 seconds calling the external payment provider. The bottleneck is immediately visible.

### 4. Configure Alertmanager for Notification Routing

With metrics flowing, Marta defines alert rules in Prometheus and routes them through Alertmanager to the right team channels.

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

      - alert: HighLatencyP99
        expr: |
          histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)) > 3
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "P99 latency above 3s on {{ $labels.service }}"
```

```yaml
# alertmanager.yml — Route alerts to the right team
route:
  receiver: 'default-slack'
  group_by: ['alertname', 'service']
  group_wait: 30s
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
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'service']
```

### 5. Build Grafana Dashboards

Finally, Marta creates Grafana dashboards that pull metrics from Prometheus and link to Jaeger traces. When someone sees a latency spike on the dashboard, they click through to the exact traces from that time window.

She configures two data sources in Grafana — Prometheus at `http://prometheus:9090` and Jaeger at `http://jaeger-query:16686` — and uses Grafana's trace-to-metrics correlation to link them.

The team now has a single service overview dashboard showing request rate, error rate, and latency (the RED method) for every service, with drill-down to traces for any anomaly.

## The Result

Within the first week, Marta's team catches a memory leak in the inventory service through a gradual latency increase visible on the dashboard — before any customer noticed. When the payment provider has a brief outage, Alertmanager pages the on-call engineer within 30 seconds, and they confirm the issue through Jaeger traces in under a minute. Mean time to detection drops from hours to minutes.
