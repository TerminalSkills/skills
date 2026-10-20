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
  version: "1.1.0"
  category: devops
  repository: https://github.com/VictoriaMetrics/VictoriaMetrics
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
    image: victoriametrics/victoria-metrics:v1.154.1
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
    image: victoriametrics/vmagent:v1.154.1
    command:
      - '-promscrape.config=/etc/vmagent/scrape.yml'
      - '-remoteWrite.url=http://victoriametrics:8428/api/v1/write'
      - '-remoteWrite.tmpDataPath=/vmagent-remotewrite-data'
    volumes:
      - ./vmagent-scrape.yml:/etc/vmagent/scrape.yml:ro
      - vmagent_data:/vmagent-remotewrite-data

  vmalert:
    image: victoriametrics/vmalert:v1.154.1
    command:
      - '-datasource.url=http://victoriametrics:8428'
      - '-remoteRead.url=http://victoriametrics:8428'
      - '-remoteWrite.url=http://victoriametrics:8428'
      - '-notifier.url=http://alertmanager:9093'
      - '-rule=/etc/vmalert/rules/*.yml'
    ports:
      - "8880:8880"
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
# P99 latency per service from histogram buckets (quantile_over_time is a rollup and takes no `by`)
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))
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
    image: victoriametrics/vmstorage:v1.154.1-cluster
    command:
      - '-storageDataPath=/storage'
      - '-retentionPeriod=90d'
    volumes:
      - vmstorage1:/storage

  vmstorage-2:
    image: victoriametrics/vmstorage:v1.154.1-cluster
    command:
      - '-storageDataPath=/storage'
      - '-retentionPeriod=90d'
    volumes:
      - vmstorage2:/storage

  vminsert:
    image: victoriametrics/vminsert:v1.154.1-cluster
    command:
      - '-storageNode=vmstorage-1:8400'
      - '-storageNode=vmstorage-2:8400'
      - '-replicationFactor=2'
    ports:
      - "8480:8480"

  vmselect:
    image: victoriametrics/vmselect:v1.154.1-cluster
    command:
      - '-storageNode=vmstorage-1:8401'
      - '-storageNode=vmstorage-2:8401'
      # With replication on, vmselect needs dedup to merge the replicas it reads back,
      # independent of the scrape interval — set it low (e.g. 1ms), not to the scrape interval
      - '-dedup.minScrapeInterval=1ms'
    ports:
      - "8481:8481"

volumes:
  vmstorage1:
  vmstorage2:
```

## Examples

### Example 1: "Replace our Prometheus long-term storage with VictoriaMetrics"

Request: *"We're running Prometheus with a 15-day retention and losing history we need for
capacity planning. Add long-term storage without rewriting our existing scrape configs."*

Point vmagent at the existing `prometheus.yml` scrape config (it accepts the same
`scrape_configs` syntax unchanged), have vmagent remote-write into VictoriaMetrics with
`-retentionPeriod=90d` or more, and point Grafana's Prometheus datasource at
`http://victoriametrics:8428` instead of Prometheus — PromQL dashboards keep working because
VictoriaMetrics speaks the Prometheus HTTP API, and MetricsQL queries can be added incrementally.

### Example 2: "Alert when a service's error rate crosses 5%"

Request: *"Page the on-call engineer when any service's 5xx rate goes over 5% for five minutes
straight."*

Use the `HighErrorRate` rule under Task D (`vmalert` evaluating
`sum(rate(http_requests_total{status=~"5.."}[5m])) by (service) / sum(rate(http_requests_total[5m])) by (service) > 0.05`
with `for: 5m`), point `-notifier.url` at Alertmanager, and confirm firing alerts with
`curl -s http://localhost:8880/api/v1/alerts | jq`.

## Guidelines

- Use vmagent instead of Prometheus for scraping — it handles remote write more efficiently and migrates existing `scrape_configs` as-is
- For HA vmagent pairs scraping the same targets, set `-dedup.minScrapeInterval` equal to your scrape interval on the receiving VictoriaMetrics node to drop duplicate samples
- In cluster mode, `-dedup.minScrapeInterval` on vmselect is for merging replicas, not for HA scrape dedup — set it low (e.g. `1ms`) when `-replicationFactor` is enabled on vminsert
- Use MetricsQL extensions (`topk_avg`, `range_median`, `running_sum`) for queries standard PromQL can't express
- Set `-retentionPeriod` based on actual needs — VictoriaMetrics is storage-efficient but still plan capacity
- Use recording rules for dashboard queries to reduce query load
- In cluster mode, set `-replicationFactor=2` on vminsert for data durability across storage nodes; it needs at least `2N-1` vmstorage nodes to tolerate `N-1` node loss
- Pin image tags to a specific release (e.g. `v1.154.1`) rather than `:latest` — VictoriaMetrics ships frequent releases and `:latest` makes upgrades unpredictable
