---
name: influxdb
description: >-
  InfluxDB is an open-source time-series database for metrics, events and
  sensor data. Use when a user needs to run InfluxDB 2 or InfluxDB 3 Core,
  create buckets, databases and API tokens, write line protocol, query with
  Flux, SQL or InfluxQL, set retention periods, downsample data with tasks,
  or alert on thresholds.
license: Apache-2.0
compatibility: "InfluxDB OSS 2.9 with the influx CLI 2.8 (Flux), or InfluxDB 3 Core 3.11 (SQL and InfluxQL)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/influxdata/influxdb
  tags: ["influxdb", "time-series", "flux", "metrics", "monitoring"]
---

# InfluxDB

## Overview

Configure InfluxDB for time-series data storage and analysis. Two generations are in use and they are not interchangeable:

- **InfluxDB 2** (OSS 2.9.1, port 8086): buckets, the Flux language, tasks, checks, a built-in UI, the `influx` CLI. Tasks A–F below. Flux is in maintenance mode — still supported on 1.x and 2.x, never coming to 3.
- **InfluxDB 3 Core** (3.11.5, port 8181): databases and tables, SQL and InfluxQL, the `influxdb3` CLI, no Flux and no tasks (a Python processing engine replaces them). Task G.

## Instructions

### Task A: Initial Setup and Configuration

```bash
# Deploy InfluxDB 2 with Docker. Pin the tag: `latest` is announced to move to InfluxDB 3 Core.
docker run -d --name influxdb \
  -p 8086:8086 \
  -v influxdb_data:/var/lib/influxdb2 \
  -v influxdb_config:/etc/influxdb2 \
  -e DOCKER_INFLUXDB_INIT_MODE=setup \
  -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
  -e DOCKER_INFLUXDB_INIT_PASSWORD="$INFLUXDB_ADMIN_PASSWORD" \
  -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN="$INFLUX_TOKEN" \
  -e DOCKER_INFLUXDB_INIT_ORG=myorg \
  -e DOCKER_INFLUXDB_INIT_BUCKET=metrics \
  -e DOCKER_INFLUXDB_INIT_RETENTION=30d \
  influxdb:2.9
```

```yaml
# /etc/influxdb2/config.yml — InfluxDB 2 options are flat keys, the same names as the influxd flags.
# 1.x-style sections ([http], [logging]) make influxd refuse to start.
# Keep both paths and use YAML with the Docker image: without them data lands outside the volume,
# and its entrypoint misreads a TOML bolt-path, re-runs setup and the container exits on restart.
bolt-path: /var/lib/influxdb2/influxd.bolt
engine-path: /var/lib/influxdb2/engine
http-bind-address: ":8086"
log-level: info
storage-cache-snapshot-memory-size: 26214400
storage-max-concurrent-compactions: 2
reporting-disabled: true
```

```bash
# Point the influx CLI at the server once; later commands need no --host or --token
influx config create --config-name production \
  --host-url http://localhost:8086 --org myorg --token "$INFLUX_TOKEN" --active
```

### Task B: Bucket and Token Management

```bash
# Create buckets via CLI
influx bucket create --name infrastructure --retention 30d --org myorg
influx bucket create --name app-metrics --retention 90d --org myorg
influx bucket create --name downsampled --retention 365d --org myorg
```

```bash
# Scoped tokens take bucket IDs, not names
INFRA_ID=$(influx bucket list --name infrastructure --hide-headers | cut -f 1)
APP_ID=$(influx bucket list --name app-metrics --hide-headers | cut -f 1)

# Write-only token for Telegraf
influx auth create --org myorg --description "Telegraf write token" \
  --write-bucket "$INFRA_ID" --write-bucket "$APP_ID"

# Read-only token for Grafana
influx auth create --org myorg --description "Grafana read token" \
  --read-bucket "$INFRA_ID" --read-bucket "$APP_ID"
```

Copy the token from the `auth create` output immediately. Since 2.9.0 tokens are stored hashed: `influx auth list` no longer shows them and they cannot be recovered.

### Task C: Write Data via API

```bash
# Write metrics using line protocol: measurement,tags fields timestamp
curl -X POST "http://localhost:8086/api/v2/write?org=myorg&bucket=app-metrics&precision=s" \
  -H "Authorization: Token ${INFLUX_TOKEN}" \
  -H "Content-Type: text/plain" \
  --data-binary '
http_requests,service=api-gateway,method=GET,status=200 count=1523,latency_ms=45.2 1790848800
http_requests,service=api-gateway,method=POST,status=201 count=234,latency_ms=120.5 1790848800
http_requests,service=payment,method=POST,status=500 count=3,latency_ms=5020.0 1790848800
queue_depth,service=order-processor queue_size=142,consumers=5 1790848800
'
```

A successful write returns HTTP 204 with an empty body. Numbers are floats unless suffixed with `i` (`consumers=5i`); a field keeps the type of its first write, and a later write with another type is rejected.

### Task D: Flux Queries

```flux
// Query: CPU usage over last hour, grouped by host
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
  |> filter(fn: (r) => r._measurement == "http_requests" and r._field == "count" and r.status =~ /^5/)
  |> group(columns: ["service"])
  |> sum()
  |> group()
  |> sort(columns: ["_value"], desc: true)
  |> limit(n: 5)
```

```flux
// Query: Calculate error rate percentage per service
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

```flux
// Query: P95 latency with moving average
from(bucket: "app-metrics")
  |> range(start: -6h)
  |> filter(fn: (r) => r._measurement == "http_requests" and r._field == "latency_ms")
  |> aggregateWindow(every: 5m, fn: (tables=<-, column) =>
    tables |> quantile(q: 0.95, column: column))
  |> movingAverage(n: 6)
```

Save a query to a file and run it with `influx query --file top-errors.flux`.

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
# Create the task, then check its runs and logs
influx task create --org myorg -f downsample-infra.flux
TASK_ID=$(influx task list --org myorg --hide-headers | grep downsample-infra | cut -f 1)
influx task run list --task-id "$TASK_ID" --limit 10
influx task log list --task-id "$TASK_ID"
```

### Task F: Alerting and Checks

```flux
// Check: Alert when CPU exceeds 85%
import "influxdata/influxdb/monitor"
import "influxdata/influxdb/schema"

option task = {name: "cpu-alert", every: 1m}

check = {_check_id: "cpu-usage-high", _check_name: "High CPU", _type: "custom", tags: {}}

from(bucket: "infrastructure")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "cpu" and r._field == "usage_percent" and r.cpu == "cpu-total")
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
  |> schema.fieldsAsCols()
  |> monitor.check(
    crit: (r) => r.usage_percent > 85.0,
    warn: (r) => r.usage_percent > 70.0,
    messageFn: (r) => "CPU at ${string(v: r.usage_percent)}% on ${r.host}",
    data: check,
  )
```

`monitor.check()` needs pivoted input (`schema.fieldsAsCols()`, so the thresholds read `r.usage_percent`, not `r._value`), a `_time` column (a bare `mean()` drops it) and a `data` record with `_check_id`, `_check_name`, `_type` and `tags`. Statuses land in the `_monitoring` bucket; read them with `monitor.from(start: -1h)`. Sending them to Slack or PagerDuty takes a notification endpoint and rule, created in the UI under Alerts.

### Task G: InfluxDB 3 Core

```bash
# Bind to localhost first: until an admin token exists, anyone who reaches the port can claim it
docker run -d --name influxdb3 -p 127.0.0.1:8181:8181 -v influxdb3_data:/var/lib/influxdb3 \
  influxdb:3-core influxdb3 serve --node-id host01 --object-store file --data-dir /var/lib/influxdb3/data

docker exec influxdb3 influxdb3 create token --admin     # printed once — store it
export INFLUXDB3_AUTH_TOKEN="$(cat ~/.secrets/influxdb3-admin-token)"

influxdb3 create database sensors --retention-period 30d
influxdb3 write --database sensors --precision s \
  'home,room=kitchen temp=22.4,hum=36.1,co=0i 1790848800'
influxdb3 query --database sensors \
  "SELECT room, avg(temp) AS avg_temp FROM home WHERE time >= now() - INTERVAL '1 hour' GROUP BY room"
influxdb3 query --database sensors --language influxql \
  "SELECT MEAN(temp) FROM home WHERE time > now() - 1h GROUP BY room"
```

The `influxdb3` binary is both server and client; with Docker run client commands as `docker exec -e INFLUXDB3_AUTH_TOKEN influxdb3 influxdb3 query ...`. Over HTTP: `POST /api/v3/write_lp?db=sensors&precision=second` and `GET /api/v3/query_sql?db=sensors&q=...&format=json`, both with `Authorization: Bearer $INFLUXDB3_AUTH_TOKEN`. Existing v2 writers keep working against `/api/v2/write?bucket=sensors`; `/api/v2/query` (Flux) does not exist.

## Examples

### Example 1: Keep raw metrics for 30 days and hourly averages for a year

**User request:** "Our InfluxDB 2 disk keeps filling up. Keep raw host metrics for 30 days and hourly averages for a year."

```bash
influx bucket update --id "$(influx bucket list --name infrastructure --hide-headers | cut -f 1)" --retention 30d
influx bucket create --name downsampled --retention 365d --org myorg
influx task create --org myorg -f downsample-infra.flux        # the Flux script from Task E
influx task run list --task-id "$(influx task list --hide-headers | grep downsample-infra | cut -f 1)" --limit 3
```

```text
ID                TaskID            Status   ScheduledFor          StartedAt                       FinishedAt                      RequestedAt
1169ba833886e000  1169b9566f06e000  success  2026-10-01T10:00:00Z  2026-10-01T10:05:00.021826161Z  2026-10-01T10:05:00.124798932Z
```

After the first successful run, dashboards with ranges longer than 30 days must read from `downsampled`.

### Example 2: Query the last hour with SQL on InfluxDB 3 Core

**User request:** "We just moved to InfluxDB 3. Show me the average temperature and the highest CO reading per room for the last hour."

```bash
influxdb3 query --database sensors \
  "SELECT room, avg(temp) AS avg_temp, max(co) AS max_co FROM home
   WHERE time >= now() - INTERVAL '1 hour' GROUP BY room ORDER BY room"
```

```text
+---------+----------+--------+
| room    | avg_temp | max_co |
+---------+----------+--------+
| attic   | 19.0     | 0      |
| kitchen | 22.75    | 2      |
| living  | 21.9     | 1      |
+---------+----------+--------+
```

Add `--format csv` (or `json`, `jsonl`, `parquet`) for machine-readable output; `date_bin(INTERVAL '10 minutes', time)` in the SELECT and GROUP BY gives the SQL counterpart of Flux's `aggregateWindow`.

## Guidelines

- Decide the generation first. Flux scripts, tasks, checks and dashboards do not run on InfluxDB 3; plan a rewrite to SQL or InfluxQL before migrating, and prefer InfluxQL or SQL for new work that must outlive 2.x.
- Pin Docker tags (`influxdb:2.9`, `influxdb:3-core`). InfluxData announced that `latest` will point to InfluxDB 3 Core, which would replace a 2.x container with an incompatible server.
- Upgrading 2.x to 2.9 hashes all existing tokens on first start. Record the operator token and any token you still need in plaintext before upgrading; `--use-hashed-tokens=false` keeps the old behaviour.
- Use separate buckets for raw and downsampled data with different retention periods
- Create scoped tokens with minimal permissions (write-only for collectors, read-only for dashboards)
- Keep tokens and the admin password in environment variables or a secrets manager. The `influx` CLI stores its connection configs, tokens included, in `~/.influxdbv2/configs` (override with `INFLUX_CONFIGS_PATH`) — never commit that file.
- Use `aggregateWindow()` instead of `window()` + `mean()` for cleaner downsampled output
- Set `precision` in write requests to match your data granularity (seconds is usually sufficient)
- Use line protocol batch writes (multiple lines per request) to reduce HTTP overhead
- Keep tag values low-cardinality (hosts, regions, status codes). Request IDs or user IDs as tags multiply the series count and degrade InfluxDB 2.
- Monitor InfluxDB 2's own metrics at the `/metrics` endpoint for storage and query performance
- Install binaries from the package repositories or Docker. For a release archive from `dl.influxdata.com`, download the `.sha256` file published next to it and compare its hash with the output of `sha256sum` on the archive before extracting (the InfluxDB 2 files name a build path, so `sha256sum -c` cannot find the file).
