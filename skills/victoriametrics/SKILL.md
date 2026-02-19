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
  category: monitoring
  tags: ["victoriametrics", "time-series", "metricsql", "prometheus", "vmagent"]
---

# VictoriaMetrics

## Overview

Deploy VictoriaMetrics as a fast, cost-effective Prometheus-compatible time-series database. Covers single-node and cluster deployment, vmagent configuration, MetricsQL querying, and Grafana integration.

## Instructions

### Task A: Deploy Single-Node VictoriaMetrics

```yaml
# docker-compose.yml — VictoriaMetrics with vmagent and vmalert
services:
  victoriametrics:
    image: victoriametrics/victoria-metrics:v1.96.0
    command:
      - '-storageDataPath=/victoria-metrics-data'
      - '-retentionPeriod=90d'
      - '-httpListenAddr=:8428'
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
    volumes:
      - ./vmagent-scrape.yml:/etc/vmagent/scrape.yml:ro

  vmalert:
    image: victoriametrics/vmalert:v1.96.0
    command:
      - '-datasource.url=http://victoriametrics:8428'
      - '-remoteWrite.url=http://victoriametrics:8428'
      - '-notifier.url=http://alertmanager:9093'
      - '-rule=/etc/vmalert/rules/*.yml'
    volumes:
      - ./alert-rules:/etc/vmalert/rules:ro

volumes:
  vm_data:
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

  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod

  - job_name: 'app-services'
    static_configs:
      - targets: ['api-gateway:8080', 'payment-service:8080']
```

### Task C: MetricsQL Queries

```promql
# Request rate per service
sum(rate(http_requests_total[5m])) by (service)
```

```promql
# P99 latency with MetricsQL rollup functions
quantile_over_time(0.99, http_request_duration_seconds[5m]) by (service)
```

```promql
# Top 5 services by error rate (MetricsQL extension)
topk_avg(5, sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
  / sum(rate(http_requests_total[5m])) by (service))
```

```promql
# Running total over 24h (MetricsQL extension, not in PromQL)
running_sum(increase(http_requests_total{service="api-gateway"}[1h]))
```

```bash
# Query via API
curl -s "http://localhost:8428/api/v1/query_range" \
  --data-urlencode 'query=sum(rate(http_requests_total[5m])) by (service)' \
  --data-urlencode 'start=-1h' \
  --data-urlencode 'step=60s' | jq '.data.result[]'
```

### Task D: Alert Rules for vmalert

```yaml
# alert-rules/service-alerts.yml — Alert rules
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

      - record: service:request_rate:5m
        expr: sum(rate(http_requests_total[5m])) by (service)
```

### Task E: Cluster Mode

```yaml
# docker-compose-cluster.yml — VictoriaMetrics cluster
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
    ports:
      - "8481:8481"

volumes:
  vmstorage1:
  vmstorage2:
```

## Best Practices

- Use vmagent instead of Prometheus for scraping — more efficient remote write
- Set `-dedup.minScrapeInterval` equal to your scrape interval for HA dedup
- Use MetricsQL extensions (topk_avg, range_median, running_sum) for cleaner queries
- Use recording rules for dashboard queries to reduce query load
- In cluster mode, set `-replicationFactor=2` for data durability
