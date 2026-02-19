---
name: influxdb
description: >-
  Set up and manage InfluxDB for time-series data storage, querying, and
  analysis. Use when a user needs to configure InfluxDB buckets, write Flux
  queries, set up retention policies, create tasks for data downsampling,
  or build dashboards for time-series metrics.
license: Apache-2.0
compatibility: "InfluxDB 2.7+, Flux query language"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["influxdb", "time-series", "flux", "metrics", "retention", "monitoring"]
---

# InfluxDB

## Overview

Configure InfluxDB for time-series data storage and analysis. Covers bucket management, Flux querying, retention policies, downsampling tasks, and API usage.

## Instructions

### Task A: Deploy and Setup

```bash
# Deploy InfluxDB with Docker
docker run -d --name influxdb \
  -p 8086:8086 \
  -v influxdb_data:/var/lib/influxdb2 \
  -e DOCKER_INFLUXDB_INIT_MODE=setup \
  -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
  -e DOCKER_INFLUXDB_INIT_PASSWORD=changeme123 \
  -e DOCKER_INFLUXDB_INIT_ORG=myorg \
  -e DOCKER_INFLUXDB_INIT_BUCKET=metrics \
  -e DOCKER_INFLUXDB_INIT_RETENTION=30d \
  influxdb:2.7
```

### Task B: Bucket and Token Management

```bash
# Create buckets with different retention periods
influx bucket create --name infrastructure --retention 30d --org myorg
influx bucket create --name app-metrics --retention 90d --org myorg
influx bucket create --name downsampled --retention 365d --org myorg
```

```bash
# Create scoped API tokens
influx auth create --org myorg --description "Telegraf write" --write-bucket infrastructure --write-bucket app-metrics
influx auth create --org myorg --description "Grafana read" --read-bucket infrastructure --read-bucket downsampled
```

### Task C: Write Data via API

```bash
# Write metrics using line protocol
curl -X POST "http://localhost:8086/api/v2/write?org=myorg&bucket=app-metrics&precision=s" \
  -H "Authorization: Token ${INFLUX_TOKEN}" \
  -H "Content-Type: text/plain" \
  --data-binary '
http_requests,service=api-gateway,method=GET,status=200 count=1523,latency_ms=45.2 1708300800
http_requests,service=payment,method=POST,status=500 count=3,latency_ms=5020.0 1708300800
queue_depth,service=order-processor queue_size=142,consumers=5 1708300800
'
```

### Task D: Flux Queries

```flux
// Query: CPU usage over last hour grouped by host
from(bucket: "infrastructure")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "cpu" and r._field == "usage_percent" and r.cpu == "cpu-total")
  |> aggregateWindow(every: 5m, fn: mean)
  |> yield(name: "cpu_usage")
```

```flux
// Query: Top 5 services by error count in last 24h
from(bucket: "app-metrics")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "http_requests" and r.status =~ /^5/)
  |> group(columns: ["service"])
  |> sum(column: "_value")
  |> sort(columns: ["_value"], desc: true)
  |> limit(n: 5)
```

```flux
// Query: Error rate percentage per service
errors = from(bucket: "app-metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "http_requests" and r._field == "count" and r.status =~ /^5/)
  |> group(columns: ["service"])
  |> sum()

total = from(bucket: "app-metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "http_requests" and r._field == "count")
  |> group(columns: ["service"])
  |> sum()

join(tables: {errors: errors, total: total}, on: ["service"])
  |> map(fn: (r) => ({ r with error_rate: (r._value_errors / r._value_total) * 100.0 }))
```

### Task E: Downsampling Tasks

```flux
// Task: Downsample infrastructure metrics hourly
option task = {name: "downsample-infra", every: 1h, offset: 5m}

from(bucket: "infrastructure")
  |> range(start: -task.every)
  |> filter(fn: (r) => r._measurement == "cpu" or r._measurement == "mem" or r._measurement == "disk")
  |> aggregateWindow(every: 1h, fn: mean)
  |> to(bucket: "downsampled", org: "myorg")
```

```bash
# Create and manage tasks
influx task create --org myorg -f downsample-infra.flux
influx task list --org myorg
```

### Task F: Alerting Checks

```flux
// Check: Alert when CPU exceeds 85%
import "influxdata/influxdb/monitor"

option task = {name: "cpu-alert", every: 1m}

data = from(bucket: "infrastructure")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "cpu" and r._field == "usage_percent" and r.cpu == "cpu-total")
  |> mean()

data
  |> monitor.check(
    crit: (r) => r._value > 85.0,
    warn: (r) => r._value > 70.0,
    messageFn: (r) => "CPU at ${string(v: r._value)}% on ${r.host}",
    data: { "_check_name": "High CPU", "_type": "threshold" }
  )
```

## Best Practices

- Use separate buckets for raw and downsampled data with different retention
- Create scoped tokens with minimal permissions
- Use `aggregateWindow()` for cleaner downsampled output
- Set `precision` in write requests to match your data granularity
- Batch writes (multiple lines per request) to reduce HTTP overhead
