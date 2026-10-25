---
name: thanos
description: >-
  Thanos extends Prometheus with long-term metric storage in object storage, a
  global query view across many Prometheus servers, downsampling and
  deduplication of HA pairs. Use when asked to keep Prometheus metrics for
  months or years, query several clusters from one place, run Prometheus in
  high availability, or set up Thanos sidecar, query, store gateway, compactor
  or ruler.
license: Apache-2.0
compatibility: "Thanos 0.42+, Prometheus 2.x or 3.x, S3-compatible or GCS object storage"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/thanos-io/thanos
  tags: "thanos, prometheus, long-term-storage, global-query, compaction"
---

# Thanos

## Overview

Thanos is a set of components around Prometheus. The sidecar uploads Prometheus's 2-hour TSDB blocks to object storage, the store gateway serves those blocks, the querier fans a PromQL query out to all of them and deduplicates the result, the compactor merges, downsamples and expires blocks, and the ruler evaluates rules against the global view. Release 0.42.4 is current at the time of writing; Thanos is pre-1.0, so flags can change between minor versions. Check `thanos <component> --help` for the version you run. All flags below were checked against 0.42.4.

Images: `quay.io/thanos/thanos:v0.42.4` (the Docker Hub `thanosio/thanos` repository mirrors it). Pin a version tag, never `latest`.

## Instructions

### Step 1: Prometheus and sidecar

Every Prometheus needs `external_labels` that are unique across the whole system (Thanos uses them to tell sources apart and to find HA replicas). Equal `min-block-duration` and `max-block-duration` turn off Prometheus's local compaction, which would otherwise rewrite blocks the sidecar is uploading.

```yaml
# prometheus.yml
global:
  scrape_interval: 30s
  external_labels:
    cluster: eu-west-1
    replica: prom-0        # differs between the two members of an HA pair
scrape_configs:
  - job_name: node
    static_configs:
      - targets: ["node-exporter:9100"]
```

```yaml
# docker-compose.yml: Prometheus with a Thanos sidecar uploading to S3
services:
  prometheus:
    image: prom/prometheus:v3.15.1
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.min-block-duration=2h'
      - '--storage.tsdb.max-block-duration=2h'
      - '--web.enable-lifecycle'
      - '--web.enable-admin-api'
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prom_data:/prometheus
    ports: ["127.0.0.1:9090:9090"]

  thanos-sidecar:
    image: quay.io/thanos/thanos:v0.42.4
    command:
      - 'sidecar'
      - '--tsdb.path=/prometheus'
      - '--prometheus.url=http://prometheus:9090'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
      - '--grpc-address=0.0.0.0:10901'
      - '--http-address=0.0.0.0:10902'
    environment:
      AWS_ACCESS_KEY_ID: ${THANOS_S3_ACCESS_KEY}
      AWS_SECRET_ACCESS_KEY: ${THANOS_S3_SECRET_KEY}
    volumes:
      - prom_data:/prometheus        # read-write: the sidecar records upload state here
      - ./bucket.yml:/etc/thanos/bucket.yml:ro

volumes:
  prom_data:
```

Thanos does not expand `${VAR}` inside its config files. For S3, leave out `access_key` and `secret_key` and the client reads `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from the environment (or set `aws_sdk_auth: true` for instance roles and web identity).

```yaml
# bucket.yml: object storage (S3)
type: S3
config:
  bucket: "metrics-prod-eu-west-1"
  endpoint: "s3.eu-west-1.amazonaws.com"
  region: "eu-west-1"
```

```yaml
# bucket.yml: GCS alternative. Credentials come from GOOGLE_APPLICATION_CREDENTIALS
# (the `service_account` key takes the JSON content itself, not a path).
type: GCS
config:
  bucket: "metrics-prod-eu-west-1"
```

For quick local tests only, `type: FILESYSTEM` with `config: {directory: /var/thanos/bucket}` works with every component.

### Step 2: Querier (global view)

`--endpoint` lists the gRPC addresses of sidecars, store gateways, rulers and other queriers. The old `--store` flag was removed and now fails with `unknown long flag '--store'`. Static `--endpoint` flags are marked deprecated in favour of a service-discovery file, which can be reloaded without a restart:

```yaml
# endpoints.yml, passed with --endpoint.sd-config-file=/etc/thanos/endpoints.yml
endpoints:
  - address: "thanos-sidecar-eu:10901"
  - address: "thanos-sidecar-us:10901"
  - address: "thanos-store:10901"
  - address: "thanos-ruler:10901"
```

```yaml
# docker-compose-query.yml
services:
  thanos-query:
    image: quay.io/thanos/thanos:v0.42.4
    command:
      - 'query'
      - '--http-address=0.0.0.0:9091'
      - '--grpc-address=0.0.0.0:10901'
      - '--endpoint.sd-config-file=/etc/thanos/endpoints.yml'
      - '--query.replica-label=replica'
      - '--query.auto-downsampling'
    volumes:
      - ./endpoints.yml:/etc/thanos/endpoints.yml:ro
    ports: ["127.0.0.1:9091:9091"]
```

`--query.replica-label` names the external label that distinguishes HA replicas; series that differ only in that label are merged. The querier serves the Prometheus HTTP API and a web UI:

```bash
curl -s "http://127.0.0.1:9091/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_requests_total[5m])) by (cluster, service)' \
  --data-urlencode 'dedup=true' | jq '.data.result[] | {cluster: .metric.cluster, service: .metric.service, rate: .value[1]}'
```

### Step 3: Store gateway

The gateway serves historical blocks from the bucket. `--index-cache-size` must not be smaller than the largest index item (about 125 MB by default), otherwise the process exits at start with `max item size ... cannot be bigger than overall cache size`.

```yaml
# docker-compose-store.yml
services:
  thanos-store:
    image: quay.io/thanos/thanos:v0.42.4
    command:
      - 'store'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
      - '--data-dir=/thanos/store'
      - '--grpc-address=0.0.0.0:10901'
      - '--http-address=0.0.0.0:10902'
      - '--index-cache-size=1GB'
      - '--chunk-pool-size=2GB'
    volumes:
      - ./bucket.yml:/etc/thanos/bucket.yml:ro
      - store_cache:/thanos/store

volumes:
  store_cache:
```

### Step 4: Compactor

Run it as a long-lived service with `--wait`, or without `--wait` as a cron job (it then runs to completion). Retention applies per resolution: raw samples are usually kept shortest. A value of `0d` keeps that resolution forever, and the default is `0d`.

```yaml
# docker-compose-compactor.yml
services:
  thanos-compactor:
    image: quay.io/thanos/thanos:v0.42.4
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

Raw blocks are downsampled to 5m after 40 hours and 5m blocks to 1h after 10 days. A retention shorter than the next threshold deletes data before it is downsampled, so keep every level above 10 days; the Thanos docs suggest the same value for all three.

### Step 5: Ruler

The ruler evaluates rule files against the querier and sends alerts to Alertmanager. Rule files use the normal Prometheus format.

```yaml
# docker-compose-ruler.yml
services:
  thanos-ruler:
    image: quay.io/thanos/thanos:v0.42.4
    command:
      - 'rule'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
      - '--data-dir=/thanos/ruler'
      - '--rule-file=/etc/thanos/rules/*.yml'
      - '--query=thanos-query:9091'
      - '--alertmanagers.url=http://alertmanager:9093'
      - '--grpc-address=0.0.0.0:10901'
      - '--http-address=0.0.0.0:10902'
      - '--label=ruler_cluster="global"'
    volumes:
      - ./bucket.yml:/etc/thanos/bucket.yml:ro
      - ./rules:/etc/thanos/rules:ro
      - ruler_data:/thanos/ruler

volumes:
  ruler_data:
```

```yaml
# rules/global-alerts.yml
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
        annotations:
          summary: "Error rate above 5% for {{ $labels.service }} across all clusters"
      - record: global:request_rate:5m
        expr: sum(rate(http_requests_total[5m])) by (service, cluster)
```

### Step 6: Sidecar on Kubernetes

Add the container to the Prometheus pod and share its data volume.

```yaml
# extra container in the Prometheus StatefulSet
- name: thanos-sidecar
  image: quay.io/thanos/thanos:v0.42.4
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
    - {name: grpc, containerPort: 10901}
    - {name: http, containerPort: 10902}
  volumeMounts:
    - {name: prometheus-data, mountPath: /prometheus}
```

## Examples

### Example 1: Keep a year of metrics from one Prometheus

Request: "Our Prometheus keeps 15 days. I want a year of history in S3 and still query it in Grafana."

Apply Step 1 with the bucket `metrics-prod-eu-west-1`, then start the store gateway (Step 3), the compactor with the retentions from Step 4, and a querier (Step 2) whose endpoints are the sidecar and the store gateway. Point the Grafana Prometheus data source at the querier (`http://thanos-query:9091`). After a few hours `thanos tools bucket ls --objstore.config-file=bucket.yml` lists the uploaded block ULIDs, and a query over the last 90 days returns data that Prometheus itself no longer holds.

### Example 2: One dashboard for two clusters with HA Prometheus

Request: "We have two clusters, each with two Prometheus replicas. Show one number per service."

Give each Prometheus `cluster` (eu or us) and `replica` (prom-0 or prom-1) external labels, run a sidecar next to each, and list all four sidecars in the querier's `endpoints.yml` with `--query.replica-label=replica`. A query such as `sum(rate(http_requests_total[5m])) by (cluster, service)` now returns one series per cluster and service, not two. Open Stores in the querier UI to confirm all four endpoints are healthy.

## Guidelines

- Exactly one compactor per bucket. A second one corrupts blocks and the overlaps must be repaired by hand.
- The external label set of each Prometheus must be unique, and a replica label must differ between HA members. Equal label sets from two servers produce overlapping blocks.
- Never publish gRPC (10901) or HTTP (10902) ports beyond a private network: Thanos components have no authentication of their own. Put TLS and an authenticating proxy in front of anything reachable from outside.
- The object store credentials belong in environment variables, a secret or an instance role, not in `bucket.yml` committed to git.
- Object storage must give strong read-after-write consistency; the compactor relies on it.
- Thanos Receive (remote-write ingestion) and Query Frontend (query splitting and caching) exist for setups where sidecars are not an option or queries are heavy; they are not covered here.
- Compactor and store gateway need local disk (`--data-dir`): size it for the largest block set, not for the full bucket.
