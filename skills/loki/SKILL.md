---
name: loki
description: >
  Loki is a horizontally scalable log aggregation system built by Grafana Labs. Unlike traditional log
  platforms that index the full text of every log line, Loki indexes only metadata labels, making it
  significantly cheaper to operate. Use when someone asks to "set up Loki", "ship Docker logs to Loki",
  "write a LogQL query", "replace Promtail with Alloy", or "show logs in Grafana".
license: Apache-2.0
compatibility: 'linux, macos, windows'
metadata:
  author: terminal-skills
  repository: https://github.com/grafana/loki
  version: 1.1.0
  category: data-ai
  tags:
    - logging
    - observability
    - log-aggregation
    - grafana
    - logql
---

# Loki

## Overview

Loki indexes only the labels attached to log streams; the log lines themselves are compressed into chunks. Writes are fast and storage is cheap, and LogQL (a PromQL-like language) still lets you filter, parse and aggregate lines. This skill covers a single-node Docker deployment (Loki 3.7), shipping logs with Grafana Alloy, LogQL queries, and the Grafana integration.

Promtail reached end of life on 2 March 2026 and receives no updates. Use Grafana Alloy as the agent. Existing Promtail configs convert with `alloy convert --source-format=promtail --output=config.alloy promtail.yml`.

## Instructions

### Deploy Loki and Alloy with Docker Compose

```yaml
# docker-compose.yml
services:
  loki:
    image: grafana/loki:3.7.9
    ports:
      - "127.0.0.1:3100:3100"   # Loki has no authentication; do not expose it publicly
    volumes:
      - ./loki-config.yml:/etc/loki/config.yml:ro
      - loki-data:/loki
    command: -config.file=/etc/loki/config.yml

  alloy:
    image: grafana/alloy:v1.21.2
    volumes:
      - ./config.alloy:/etc/alloy/config.alloy:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /var/log/myapp:/var/log/myapp:ro
    command: run --server.http.listen-addr=0.0.0.0:12345 --storage.path=/var/lib/alloy/data /etc/alloy/config.alloy
    depends_on:
      - loki

volumes:
  loki-data:
```

Read access to the Docker socket is effectively root on the host. Mount it only on hosts where that is acceptable.

### Loki configuration

Single instance, filesystem storage, 30-day retention. Retention needs `compactor.delete_request_store`; without it Loki 3.x refuses to start ("delete-request-store should be configured when retention is enabled"). Schema `v13` with `tsdb` is the current one.

```yaml
# loki-config.yml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory
  replication_factor: 1
  path_prefix: /loki

schema_config:
  configs:
    - from: "2024-01-01"
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

storage_config:
  filesystem:
    directory: /loki/chunks

limits_config:
  retention_period: 720h
  max_query_series: 5000

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
```

After start, `curl http://127.0.0.1:3100/ready` answers `ready` (it says "Ingester not ready: waiting for 15s" for the first 15 seconds). To test without an agent, push a line:

```bash
curl -s -X POST -H 'Content-Type: application/json' http://127.0.0.1:3100/loki/api/v1/push \
  -d "{\"streams\":[{\"stream\":{\"service\":\"api\",\"job\":\"myapp\"},\"values\":[[\"$(date +%s%N)\",\"{\\\"level\\\":\\\"error\\\",\\\"status\\\":502,\\\"duration_ms\\\":1500}\"]]}]}"
```

A `204` means accepted. Query with `curl -G http://127.0.0.1:3100/loki/api/v1/query_range --data-urlencode 'query={service="api"}'`.

### Grafana Alloy agent

Alloy discovers targets, attaches labels and pushes to Loki. This config reads Docker container logs and JSON files:

```alloy
// config.alloy
discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

discovery.relabel "containers" {
  targets = discovery.docker.containers.targets

  rule {
    source_labels = ["__meta_docker_container_name"]
    regex         = "/(.+)"
    target_label  = "container"
  }
  rule {
    source_labels = ["__meta_docker_container_label_com_docker_compose_service"]
    target_label  = "service"
  }
}

loki.source.docker "containers" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.relabel.containers.output
  forward_to = [loki.write.default.receiver]
}

local.file_match "myapp" {
  path_targets = [{"__path__" = "/var/log/myapp/*.log", "job" = "myapp", "host" = "production-1"}]
}

loki.source.file "myapp" {
  targets    = local.file_match.myapp.targets
  forward_to = [loki.process.myapp.receiver]
}

loki.process "myapp" {
  stage.json {
    expressions = { level = "level", status = "status", duration = "duration_ms", ts = "timestamp" }
  }
  stage.labels {
    values = { level = "" }   // low-cardinality fields only
  }
  stage.timestamp {
    source = "ts"
    format = "RFC3339"
  }
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}
```

Check a config before deploying with `alloy validate config.alloy` and format it with `alloy fmt`. The Alloy UI listens on port 12345 and shows component health.

### LogQL

A query starts with a stream selector in braces, then optional line filters, parsers and label filters.

```logql
{service="api"}                                         # all lines of a service
{service="api"} |= "timeout" | json | level="error"     # contains text, JSON-parsed, label filter
{service="api"} |~ "POST|PUT" !~ "/healthz"             # regex include, regex exclude
{service="api"} | json | status >= 500                  # numeric filter on parsed field
{job="myapp"} | logfmt | duration > 1000
  | line_format "slow request: {{.method}} {{.path}} took {{.duration}}ms"
```

Use `| json` for JSON lines and `| logfmt` for `key=value` lines; the wrong parser silently yields no results.

Metric queries turn logs into time series:

```logql
sum by (service) (rate({job="myapp"} |= "error" [5m]))
quantile_over_time(0.99, {service="api"} | json | unwrap duration_ms [5m]) by (method)
topk(5, sum by (service) (rate({job=~".+"} [1h])))
```

Selectors need at least one label matcher that is not empty-compatible; `{job=~".+"}` is the usual "everything" selector.

### Grafana integration

Provision Loki as a data source. `derivedFields` turns a trace ID in a log line into a link to a Tempo data source (`$$` stops Grafana from expanding the variable while reading the provisioning file):

```yaml
# provisioning/datasources/loki.yml
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    uid: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      maxLines: 1000
      derivedFields:
        - name: TraceID
          matcherRegex: '"trace_id":"(\w+)"'
          url: '$${__value.raw}'
          datasourceUid: tempo
```

A logs panel in a dashboard:

```json
{
  "type": "logs",
  "title": "API Errors",
  "gridPos": { "h": 10, "w": 24, "x": 0, "y": 0 },
  "datasource": { "type": "loki", "uid": "loki" },
  "targets": [{ "expr": "{service=\"api\"} | json | level=\"error\"", "refId": "A" }],
  "options": { "showTime": true, "wrapLogMessage": true, "sortOrder": "Descending", "enableLogDetails": true }
}
```

A Grafana alert rule on log volume needs the query, a reduce step and a threshold step:

```yaml
# provisioning/alerting/log-alerts.yml
apiVersion: 1

groups:
  - orgId: 1
    name: log-alerts
    folder: Logs
    interval: 60s
    rules:
      - uid: high-error-logs
        title: High error log volume
        condition: C
        data:
          - refId: A
            relativeTimeRange: { from: 300, to: 0 }
            datasourceUid: loki
            model:
              refId: A
              expr: 'sum(rate({service="api"} |= "error" [5m]))'
              queryType: instant
          - refId: B
            datasourceUid: __expr__
            model: { refId: B, type: reduce, expression: A, reducer: last }
          - refId: C
            datasourceUid: __expr__
            model:
              refId: C
              type: threshold
              expression: B
              conditions:
                - evaluator: { type: gt, params: [10] }
        noDataState: OK
        execErrState: Error
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API error log rate above 10 lines/s"
```

## Examples

### Example 1: Ship Docker Compose logs and find the failing service
**User:** "Our compose stack has api, worker and nginx. Send all container logs to Loki and show me the api errors from the last hour."

Use the compose file and `config.alloy` above, run `docker compose up -d`, wait for `ready`, then query `{service="api"} |= "error"` in Grafana Explore (or `query_range` with `start=` an hour ago). Each container's lines carry `container` and `service` labels. A matching line looks like `{"level":"error","status":502,"msg":"upstream timeout"}`.

### Example 2: Replace Promtail
**User:** "We still run Promtail and I read it is dead. Move us to Alloy."

Run `alloy convert --source-format=promtail --output=config.alloy promtail-config.yml`, read the diagnostics it prints (anything it cannot convert is listed), run `alloy validate config.alloy`, swap the compose service for the `grafana/alloy` image, and compare `{job="syslog"}` counts for a few minutes before removing Promtail.

## Guidelines

- Keep label cardinality low: service, environment, host, level. User IDs and request IDs belong in the log line, parsed at query time with `| json`.
- Pin image tags; `latest` moves across major versions and config changes (Loki 3.x needs `delete_request_store`, `schema: v13`).
- Loki OSS has no built-in authentication. Put a reverse proxy in front, or bind to localhost, and set `X-Scope-OrgID` only if `auth_enabled: true` (multi-tenant).
- Old entries are rejected when older than the ingestion window or out of order for the stream; set the timestamp in the agent rather than shipping stale files in bulk.
- For production beyond one node use object storage (S3, GCS) instead of `filesystem`; filesystem mode cannot be shared between instances.
