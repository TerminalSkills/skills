---
name: loki
description: >
  Loki is a horizontally scalable log aggregation system built by Grafana Labs. Unlike traditional log
  platforms that index the full text of every log line, Loki indexes only metadata labels, making it
  significantly cheaper to operate. It integrates natively with Grafana for querying and visualization,
  and uses LogQL — a query language inspired by PromQL — to filter, parse, and aggregate log streams.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-infrastructure
  tags:
    - logging
    - observability
    - log-aggregation
    - grafana
    - logql
---

# Loki

Loki is a log aggregation system designed to be cost-effective and easy to operate. It takes a fundamentally different approach from Elasticsearch or Splunk: instead of indexing log content, it indexes only the labels attached to log streams. The actual log lines are compressed and stored in chunks. This means writes are fast, storage is cheap, and you still get powerful querying through LogQL.

This skill covers deploying Loki and Promtail with Docker, writing LogQL queries, and integrating Loki with Grafana for log exploration and alerting.

## Docker Deployment

A typical Loki setup has two components: the Loki server that stores and queries logs, and Promtail, an agent that ships logs from your hosts into Loki.

```yaml
# docker-compose.yml — Loki and Promtail deployment
# Loki on port 3100, Promtail tails container logs via Docker socket

version: "3.8"

services:
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yml:/etc/loki/local-config.yaml
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml

  promtail:
    image: grafana/promtail:latest
    volumes:
      - ./promtail-config.yml:/etc/promtail/config.yml
      - /var/log:/var/log:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/config.yml
    depends_on:
      - loki

volumes:
  loki-data:
```

### Loki Configuration

```yaml
# loki-config.yml — minimal Loki server configuration
# Single-instance mode with filesystem storage and 30-day retention

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
```

## Promtail Agent

Promtail discovers log targets, attaches labels, and pushes log entries to Loki. It can tail files, scrape journal entries, and read Docker container logs.

```yaml
# promtail-config.yml — Promtail agent configuration
# Scrapes Docker container logs and labels them with container name and compose service

server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        target_label: container
        regex: '/(.+)'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: service

  - job_name: system
    static_configs:
      - targets: [localhost]
        labels:
          job: syslog
          host: production-1
          __path__: /var/log/syslog
```

### Structured Metadata with Pipeline Stages

Promtail can parse log lines and extract labels or structured metadata using pipeline stages:

```yaml
# promtail-pipeline.yml — pipeline stages for JSON log parsing
# Extracts level, method, and status from JSON application logs

scrape_configs:
  - job_name: app
    static_configs:
      - targets: [localhost]
        labels:
          job: myapp
          __path__: /var/log/myapp/*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            method: method
            status: status
            duration: duration_ms
      - labels:
          level:
      - timestamp:
          source: timestamp
          format: RFC3339
```

## LogQL Queries

LogQL is Loki's query language. It starts with a log stream selector (labels in curly braces) and optionally chains filter expressions and aggregations.

### Stream Selection and Filtering

```logql
# LogQL — all logs from the API service
{service="api"}
```

```logql
# LogQL — API errors containing "timeout"
{service="api"} |= "timeout" | logfmt | level="error"
```

```logql
# LogQL — filter with regex, exclude health checks
{service="api"} |~ "POST|PUT" !~ "/healthz"
```

### Parsing and Extracting Fields

```logql
# LogQL — parse JSON logs and filter by HTTP status
{service="api"} | json | status >= 500
```

```logql
# LogQL — parse logfmt and extract specific fields
{job="myapp"} | logfmt | duration > 1000 | line_format "slow request: {{.method}} {{.path}} took {{.duration}}ms"
```

### Metric Queries

LogQL can compute metrics from logs, turning log data into time-series:

```logql
# LogQL — error rate per service over 5-minute windows
sum by (service) (rate({job="myapp"} |= "error" [5m]))
```

```logql
# LogQL — 99th percentile request duration from parsed logs
quantile_over_time(0.99, {service="api"} | json | unwrap duration_ms [5m]) by (method)
```

```logql
# LogQL — top 5 noisiest log sources by volume
topk(5, sum by (service) (rate({job=~".+"} [1h])))
```

## Grafana Integration

Loki is a first-class data source in Grafana. Adding it lets you view logs alongside metrics on the same dashboard, which is essential for correlating issues.

### Provisioning Loki as a Data Source

```yaml
# provisioning/datasources/loki.yml — Loki data source for Grafana
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      maxLines: 1000
      derivedFields:
        - name: TraceID
          matcherRegex: '"trace_id":"(\w+)"'
          url: 'http://tempo:3200/api/traces/${__value.raw}'
          datasourceUid: tempo
```

The `derivedFields` configuration extracts trace IDs from log lines and creates clickable links to a tracing backend, connecting logs to traces with zero effort.

### Log Panel in a Dashboard

```json
{
  "__comment": "dashboard-panel.json — Grafana log panel showing API errors",
  "type": "logs",
  "title": "API Errors",
  "gridPos": { "h": 10, "w": 24, "x": 0, "y": 0 },
  "datasource": { "type": "loki", "uid": "loki" },
  "targets": [
    {
      "expr": "{service=\"api\"} | json | level=\"error\"",
      "refId": "A"
    }
  ],
  "options": {
    "showTime": true,
    "showLabels": true,
    "wrapLogMessage": true,
    "sortOrder": "Descending",
    "enableLogDetails": true
  }
}
```

### Log-Based Alerts

You can create Grafana alert rules that fire when log patterns exceed a threshold:

```yaml
# provisioning/alerting/log-alerts.yml — alert on high error log volume
apiVersion: 1

groups:
  - orgId: 1
    name: log-alerts
    folder: Logs
    interval: 60s
    rules:
      - uid: high-error-logs
        title: High Error Log Volume
        condition: A
        data:
          - refId: A
            datasourceUid: loki
            model:
              expr: 'sum(rate({service="api"} |= "error" [5m]))'
              conditions:
                - evaluator:
                    type: gt
                    params: [10]
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Error log rate exceeds 10/s for the API service"
```

Loki works best when you keep label cardinality low. Use labels for broad categories like service, environment, and host — not for high-cardinality values like user IDs or request IDs. Those belong in the log line itself, where LogQL can parse them on demand.
