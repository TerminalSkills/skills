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
  category: monitoring
  tags: ["thanos", "prometheus", "long-term-storage", "global-query", "compaction"]
---

# Thanos

## Overview

Deploy Thanos to extend Prometheus with unlimited retention via object storage, global query view across clusters, and automated downsampling.

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
    volumes:
      - prom_data:/prometheus:ro
      - ./bucket.yml:/etc/thanos/bucket.yml:ro

volumes:
  prom_data:
```

```yaml
# bucket.yml — S3 object storage configuration
type: S3
config:
  bucket: "thanos-metrics-production"
  endpoint: "s3.us-east-1.amazonaws.com"
  region: "us-east-1"
  access_key: "${AWS_ACCESS_KEY_ID}"
  secret_key: "${AWS_SECRET_ACCESS_KEY}"
```

### Task B: Thanos Query (Global View)

```yaml
# docker-compose-query.yml — Global query across clusters
services:
  thanos-query:
    image: thanosio/thanos:v0.34.0
    command:
      - 'query'
      - '--http-address=0.0.0.0:9090'
      - '--store=thanos-sidecar-cluster-a:10901'
      - '--store=thanos-sidecar-cluster-b:10901'
      - '--store=thanos-store-gateway:10901'
      - '--query.replica-label=replica'
      - '--query.auto-downsampling'
    ports:
      - "9090:9090"
```

```bash
# Query across all clusters
curl -s "http://thanos-query:9090/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_requests_total[5m])) by (cluster, service)' \
  --data-urlencode 'dedup=true' | jq '.data.result[]'
```

### Task C: Store Gateway

```yaml
# docker-compose-store.yml — Store gateway for querying object storage
services:
  thanos-store:
    image: thanosio/thanos:v0.34.0
    command:
      - 'store'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
      - '--data-dir=/thanos/store'
      - '--index-cache-size=1GB'
      - '--chunk-pool-size=2GB'
    volumes:
      - ./bucket.yml:/etc/thanos/bucket.yml:ro
```

### Task D: Compactor

```yaml
# docker-compose-compactor.yml — Downsampling and retention
services:
  thanos-compactor:
    image: thanosio/thanos:v0.34.0
    command:
      - 'compact'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
      - '--data-dir=/thanos/compact'
      - '--retention.resolution-raw=30d'
      - '--retention.resolution-5m=90d'
      - '--retention.resolution-1h=365d'
      - '--compact.concurrency=2'
      - '--wait'
      - '--wait-interval=5m'
    volumes:
      - ./bucket.yml:/etc/thanos/bucket.yml:ro
```

### Task E: Ruler

```yaml
# docker-compose-ruler.yml — Global recording and alerting rules
services:
  thanos-ruler:
    image: thanosio/thanos:v0.34.0
    command:
      - 'rule'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
      - '--rule-file=/etc/thanos/rules/*.yml'
      - '--query=thanos-query:9090'
      - '--alertmanagers.url=http://alertmanager:9093'
    volumes:
      - ./bucket.yml:/etc/thanos/bucket.yml:ro
      - ./rules:/etc/thanos/rules:ro
```

```yaml
# rules/global-alerts.yml — Global alert rules
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
          summary: "Global error rate above 5% for {{ $labels.service }}"

      - record: global:request_rate:5m
        expr: sum(rate(http_requests_total[5m])) by (service, cluster)
```

## Best Practices

- Set Prometheus `min-block-duration=2h` and `max-block-duration=2h` for sidecar compatibility
- Use `--query.replica-label` to deduplicate HA Prometheus pairs
- Run exactly one compactor per object storage bucket to avoid corruption
- Configure retention per resolution: raw shorter, downsampled longer
- Enable `--query.auto-downsampling` for automatic resolution selection
