---
name: thanos
description: >-
  Deploy and configure Thanos for long-term Prometheus metric storage, global
  querying across multiple Prometheus instances, and data compaction. Use when
  a user needs durable metric storage in object storage, a unified query view
  across clusters, downsampling for historical data, or high-availability
  Prometheus with deduplication.
license: Apache-2.0
compatibility: "Thanos 0.33+, Prometheus 2.45+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["thanos", "prometheus", "long-term-storage", "global-query", "compaction"]
---

# Thanos

## Overview

Deploy Thanos to extend Prometheus with unlimited metric retention via object storage, global query view across multiple Prometheus instances, and automated downsampling. Covers sidecar, store, query, compactor, and ruler components.

## Instructions

### Task A: Thanos Sidecar with Prometheus

```yaml
# docker-compose.yml — Prometheus with Thanos sidecar uploading to S3
services:
  prometheus:
    image: prom/prometheus:v2.49.0
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.min-block-duration=2h'
      - '--storage.tsdb.max-block-duration=2h'
      - '--web.enable-lifecycle'
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prom_data:/prometheus
    ports:
      - "9090:9090"

  thanos-sidecar:
    image: thanosio/thanos:v0.34.0
    command:
      - 'sidecar'
      - '--tsdb.path=/prometheus'
      - '--prometheus.url=http://prometheus:9090'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
      - '--grpc-address=0.0.0.0:10901'
      - '--http-address=0.0.0.0:10902'
    volumes:
      - prom_data:/prometheus:ro
      - ./bucket.yml:/etc/thanos/bucket.yml:ro

volumes:
  prom_data:
```

```yaml
# bucket.yml — Object storage configuration (S3)
type: S3
config:
  bucket: "thanos-metrics-production"
  endpoint: "s3.us-east-1.amazonaws.com"
  region: "us-east-1"
  access_key: "${AWS_ACCESS_KEY_ID}"
  secret_key: "${AWS_SECRET_ACCESS_KEY}"
  insecure: false
```

```yaml
# bucket.yml — GCS configuration alternative
type: GCS
config:
  bucket: "thanos-metrics-production"
  service_account: "/etc/thanos/gcs-sa.json"
```

### Task B: Thanos Query (Global View)

```yaml
# docker-compose-query.yml — Thanos Query for global metric view
services:
  thanos-query:
    image: thanosio/thanos:v0.34.0
    command:
      - 'query'
      - '--http-address=0.0.0.0:9090'
      - '--grpc-address=0.0.0.0:10901'
      - '--store=thanos-sidecar-cluster-a:10901'
      - '--store=thanos-sidecar-cluster-b:10901'
      - '--store=thanos-store-gateway:10901'
      - '--store=thanos-ruler:10901'
      - '--query.replica-label=replica'
      - '--query.replica-label=prometheus_replica'
      - '--query.auto-downsampling'
    ports:
      - "9090:9090"
```

```bash
# Query across all clusters via Thanos Query API
curl -s "http://thanos-query:9090/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_requests_total[5m])) by (cluster, service)' \
  --data-urlencode 'dedup=true' | \
  jq '.data.result[] | {cluster: .metric.cluster, service: .metric.service, rate: .value[1]}'
```

### Task C: Thanos Store Gateway

```yaml
# docker-compose-store.yml — Store gateway for querying object storage
services:
  thanos-store:
    image: thanosio/thanos:v0.34.0
    command:
      - 'store'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
      - '--data-dir=/thanos/store'
      - '--grpc-address=0.0.0.0:10901'
      - '--http-address=0.0.0.0:10902'
      - '--index-cache-size=1GB'
      - '--chunk-pool-size=2GB'
      - '--max-time=-2h'
    volumes:
      - ./bucket.yml:/etc/thanos/bucket.yml:ro
      - store_cache:/thanos/store

volumes:
  store_cache:
```

### Task D: Thanos Compactor

```yaml
# docker-compose-compactor.yml — Compactor for downsampling and retention
services:
  thanos-compactor:
    image: thanosio/thanos:v0.34.0
    command:
      - 'compact'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
      - '--data-dir=/thanos/compact'
      - '--http-address=0.0.0.0:10902'
      - '--retention.resolution-raw=30d'
      - '--retention.resolution-5m=90d'
      - '--retention.resolution-1h=365d'
      - '--compact.concurrency=2'
      - '--downsample.concurrency=2'
      - '--wait'
      - '--wait-interval=5m'
    volumes:
      - ./bucket.yml:/etc/thanos/bucket.yml:ro
      - compact_data:/thanos/compact

volumes:
  compact_data:
```

### Task E: Thanos Ruler

```yaml
# docker-compose-ruler.yml — Ruler for recording and alerting rules
services:
  thanos-ruler:
    image: thanosio/thanos:v0.34.0
    command:
      - 'rule'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
      - '--data-dir=/thanos/ruler'
      - '--rule-file=/etc/thanos/rules/*.yml'
      - '--query=thanos-query:9090'
      - '--alertmanagers.url=http://alertmanager:9093'
      - '--grpc-address=0.0.0.0:10901'
      - '--http-address=0.0.0.0:10902'
      - '--label=ruler_cluster="global"'
    volumes:
      - ./bucket.yml:/etc/thanos/bucket.yml:ro
      - ./rules:/etc/thanos/rules:ro
```

```yaml
# rules/global-alerts.yml — Global alert rules evaluated by Thanos Ruler
groups:
  - name: global-service-health
    rules:
      - alert: GlobalHighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
          / sum(rate(http_requests_total[5m])) by (service) > 0.05
        for: 10m
        labels:
          severity: critical
          scope: global
        annotations:
          summary: "Global error rate above 5% for {{ $labels.service }} across all clusters"

      - record: global:request_rate:5m
        expr: sum(rate(http_requests_total[5m])) by (service, cluster)
```

### Task F: Kubernetes Deployment

```yaml
# thanos-sidecar-container.yml — Add Thanos sidecar to Prometheus StatefulSet
containers:
  - name: thanos-sidecar
    image: thanosio/thanos:v0.34.0
    args:
      - sidecar
      - --tsdb.path=/prometheus
      - --prometheus.url=http://localhost:9090
      - --objstore.config=$(OBJSTORE_CONFIG)
    env:
      - name: OBJSTORE_CONFIG
        valueFrom:
          secretKeyRef:
            name: thanos-objstore-config
            key: bucket.yml
    ports:
      - name: grpc
        containerPort: 10901
      - name: http
        containerPort: 10902
    volumeMounts:
      - name: prometheus-data
        mountPath: /prometheus
```

## Best Practices

- Set Prometheus `--storage.tsdb.min-block-duration=2h` and `max-block-duration=2h` for Thanos sidecar compatibility
- Use `--query.replica-label` to deduplicate metrics from HA Prometheus pairs
- Run exactly one compactor instance per object storage bucket to avoid data corruption
- Configure retention per resolution: keep raw data shorter, downsampled longer
- Use store gateway's `--max-time` flag to avoid overlap with sidecar's recent data
- Enable `--query.auto-downsampling` on Thanos Query for automatic resolution selection
