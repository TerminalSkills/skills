---
name: victoriametrics
description: >-
  Deploy and configure VictoriaMetrics as a high-performance time-series
  database for metrics storage and querying. Use when a user needs a
  Prometheus-compatible long-term storage backend, wants to write MetricsQL
  queries, configure vmagent for metrics scraping, or set up VictoriaMetrics
  cluster mode for horizontal scaling.
license: Apache-2.0
compatibility: "VictoriaMetrics 1.95+, vmagent, vmalert"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["victoriametrics", "time-series", "metricsql", "prometheus", "vmagent"]
---

# VictoriaMetrics

## Overview

Deploy VictoriaMetrics as a fast, cost-effective Prometheus-compatible time-series database. Covers single-node and cluster deployment, vmagent configuration, MetricsQL querying, and integration with Grafana and Prometheus.

## Instructions

### Task A: Deploy Single-Node VictoriaMetrics

```yaml
# docker-compose.yml — Single-node VictoriaMetrics with vmagent and vmalert
services:
  victoriametrics:
    image: victoriametrics/victoria-metrics:v1.96.0
    command:
      - '-storageDataPath=/victoria-metrics-data'
      - '-retentionPeriod=90d'
      - '-httpListenAddr=:8428'
      - '-search.maxUniqueTimeseries=1000000'
      - '-dedup.minScrapeInterval=15s'
    ports:
      - "8428:8428"
    volumes:
      - vm_data:/victoria-metrics-data

  vmagent:
    image: victoriametrics/vmagent:v1.96.0
    command:
      - '-promscrape.config=/etc/vmagent/scrape.yml'
      - '-remoteWrite.url=http://victoriametrics:8428/api/v1/write'
      - '-remoteWrite.tmpDataPath=/vmagent-remotewrite-data'
    volumes:
      - ./vmagent-scrape.yml:/etc/vmagent/scrape.yml:ro
      - vmagent_data:/vmagent-remotewrite-data

  vmalert:
    image: victoriametrics/vmalert:v1.96.0
    command:
      - '-datasource.url=http://victoriametrics:8428'
      - '-remoteRead.url=http://victoriametrics:8428'
      - '-remoteWrite.url=http://victoriametrics:8428'
      - '-notifier.url=http://alertmanager:9093'
      - '-rule=/etc/vmalert/rules/*.yml'
    volumes:
      - ./alert-rules:/etc/vmalert/rules:ro

volumes:
  vm_data:
  vmagent_data:
```

### Task B: Configure vmagent Scraping

```yaml
# vmagent-scrape.yml — Scrape configuration (Prometheus-compatible)
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
        labels:
          environment: production

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

  - job_name: 'app-services'
    static_configs:
      - targets:
          - 'api-gateway:8080'
          - 'payment-service:8080'
          - 'order-service:8080'
    metrics_path: /metrics
    relabel_configs:
      - source_labels: [__address__]
        regex: '([^:]+):.*'
        target_label: service
```

### Task C: MetricsQL Queries

```promql
# Request rate per service (MetricsQL extends PromQL)
sum(rate(http_requests_total[5m])) by (service)
```

```promql
# P99 latency with MetricsQL's rollup functions
quantile_over_time(0.99, http_request_duration_seconds[5m]) by (service)
```

```promql
# Top 5 services by error rate using MetricsQL's topk_avg
topk_avg(5, sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
  / sum(rate(http_requests_total[5m])) by (service))
```

```promql
# MetricsQL: running total over 24h (not available in standard PromQL)
running_sum(increase(http_requests_total{service="api-gateway"}[1h]))
```

```promql
# MetricsQL: range_median for smoother visualization
range_median(cpu_usage_percent{instance=~"web-.*"})
```

```bash
# Query via API
curl -s "http://localhost:8428/api/v1/query_range" \
  --data-urlencode 'query=sum(rate(http_requests_total[5m])) by (service)' \
  --data-urlencode 'start=-1h' \
  --data-urlencode 'step=60s' | jq '.data.result[] | {service: .metric.service, values: (.values | length)}'
```

### Task D: Alert Rules for vmalert

```yaml
# alert-rules/service-alerts.yml — Alert rules for vmalert
groups:
  - name: service-health
    interval: 30s
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

      - alert: HighMemoryUsage
        expr: |
          (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)
          / node_memory_MemTotal_bytes > 0.9
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Memory usage above 90% on {{ $labels.instance }}"

      # Recording rule for dashboard performance
      - record: service:request_rate:5m
        expr: sum(rate(http_requests_total[5m])) by (service)
```

### Task E: Cluster Mode Deployment

```yaml
# docker-compose-cluster.yml — VictoriaMetrics cluster for horizontal scaling
services:
  vmstorage-1:
    image: victoriametrics/vmstorage:v1.96.0-cluster
    command:
      - '-storageDataPath=/storage'
      - '-retentionPeriod=90d'
    volumes:
      - vmstorage1:/storage

  vmstorage-2:
    image: victoriametrics/vmstorage:v1.96.0-cluster
    command:
      - '-storageDataPath=/storage'
      - '-retentionPeriod=90d'
    volumes:
      - vmstorage2:/storage

  vminsert:
    image: victoriametrics/vminsert:v1.96.0-cluster
    command:
      - '-storageNode=vmstorage-1:8400'
      - '-storageNode=vmstorage-2:8400'
      - '-replicationFactor=2'
    ports:
      - "8480:8480"

  vmselect:
    image: victoriametrics/vmselect:v1.96.0-cluster
    command:
      - '-storageNode=vmstorage-1:8401'
      - '-storageNode=vmstorage-2:8401'
      - '-dedup.minScrapeInterval=15s'
    ports:
      - "8481:8481"

volumes:
  vmstorage1:
  vmstorage2:
```

## Best Practices

- Use vmagent instead of Prometheus for scraping — it handles remote write more efficiently
- Set `-dedup.minScrapeInterval` equal to your scrape interval to handle HA duplicates
- Use MetricsQL extensions (topk_avg, range_median, running_sum) for cleaner queries
- Set `-retentionPeriod` based on actual needs — VM is storage-efficient but plan capacity
- Use recording rules for dashboard queries to reduce query load
- In cluster mode, set `-replicationFactor=2` for data durability across storage nodes
