---
name: telegraf
description: >-
  Configure Telegraf as a metrics collection agent for infrastructure and
  application monitoring. Use when a user needs to collect system metrics,
  set up input plugins for databases and services, configure output to
  InfluxDB or Prometheus, or build custom metric pipelines.
license: Apache-2.0
compatibility: "Telegraf 1.38+ (checked against 1.40), InfluxDB 2.x or 3.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/influxdata/telegraf"
  category: devops
  tags: ["telegraf", "metrics", "influxdb", "monitoring", "observability"]
---

# Telegraf

## Overview

Set up Telegraf to collect, process, and forward metrics from systems, databases, and applications. Covers input/output plugin configuration, metric filtering, aggregation processors, and deployment patterns.

Two behaviours matter on current releases (1.38 and later):

- **Strict environment-variable handling is the default.** `$VAR` and `${VAR}` are substituted only inside quoted string values; a variable that is not set is **not** reported: `${NAME}` stays as literal text (or the value ends up empty), so write `${NAME:?NAME is required}` for anything mandatory, and a literal `$` must be written `$$`. Start with `--non-strict-env-handling` only as a stop-gap.
- **`fieldpass`/`fielddrop` are deprecated.** Use `fieldinclude`/`fieldexclude`; `namepass`, `namedrop`, `tagpass`, `taginclude` and friends are unchanged.

Install with the vendor's apt/yum repository (package `telegraf`, config in `/etc/telegraf/`) or run the `telegraf` Docker image (see Task F). Validate before every deploy:

```bash
telegraf --config /etc/telegraf/telegraf.conf --config-directory /etc/telegraf/telegraf.d --test   # one gather, prints line protocol, writes nothing
```

## Instructions

### Task A: Basic System Metrics Collection

```toml
# /etc/telegraf/telegraf.conf — Collect system metrics and send to InfluxDB
[global_tags]
  environment = "production"
  region = "us-east-1"

[agent]
  interval = "10s"
  round_interval = true
  metric_batch_size = 1000
  metric_buffer_limit = 10000
  flush_interval = "10s"
  hostname = ""
  omit_hostname = false
  skip_processors_after_aggregators = true   # do not re-run processors on aggregator output

[[outputs.influxdb_v2]]
  urls = ["http://influxdb:8086"]
  token = "${INFLUX_TOKEN:?INFLUX_TOKEN is required}"   # set in /etc/default/telegraf or the unit environment
  organization = "myorg"
  bucket = "infrastructure"

[[inputs.cpu]]
  percpu = true
  totalcpu = true
  collect_cpu_time = false

[[inputs.mem]]
[[inputs.disk]]
  ignore_fs = ["tmpfs", "devtmpfs", "devfs", "iso9660", "overlay", "aufs", "squashfs"]

[[inputs.diskio]]
[[inputs.net]]
  interfaces = ["eth0", "ens5"]

[[inputs.system]]
[[inputs.processes]]
[[inputs.kernel]]
```

### Task B: Application and Database Inputs

```toml
# /etc/telegraf/telegraf.d/databases.conf — Database monitoring inputs
[[inputs.postgresql]]
  address = "postgres://telegraf:${PG_PASSWORD}@localhost:5432/myapp?sslmode=disable"
  databases = ["myapp"]
  [inputs.postgresql.tags]
    service = "postgres"

[[inputs.mysql]]
  servers = ["telegraf:${MYSQL_PASSWORD}@tcp(localhost:3306)/"]
  metric_version = 2
  gather_table_schema = true
  gather_process_list = true
  gather_replica_status = true
  [inputs.mysql.tags]
    service = "mysql"

[[inputs.redis]]
  servers = ["tcp://localhost:6379"]
  password = "$REDIS_PASSWORD"
  [inputs.redis.tags]
    service = "redis"

[[inputs.nginx]]                    # needs ngx_http_stub_status_module enabled
  urls = ["http://localhost:8080/nginx_status"]
  [inputs.nginx.tags]
    service = "nginx"
```

```toml
# /etc/telegraf/telegraf.d/docker.conf — Container metrics
[[inputs.docker]]
  endpoint = "unix:///var/run/docker.sock"
  gather_services = false
  container_name_include = []
  perdevice_include = ["cpu"]
  total_include = ["cpu", "blkio", "network"]
  [inputs.docker.tags]
    input = "docker"
```

### Task C: Prometheus Input/Output

```toml
# /etc/telegraf/telegraf.d/prometheus.conf — Scrape Prometheus endpoints
[[inputs.prometheus]]
  urls = [
    "http://app-server:8080/metrics",
    "http://payment-service:8080/metrics",
  ]
  metric_version = 2
  url_tag = "scrape_url"

# Expose metrics as Prometheus endpoint for Prometheus to scrape
[[outputs.prometheus_client]]
  listen = ":9273"
  metric_version = 2
  export_timestamp = true
```

### Task D: Metric Processing and Filtering

Filter at the plugin that produces the metric whenever you can; it is cheaper than dropping later. `namepass` on a *processor* only restricts which metrics that processor touches, the rest still flow on.

```toml
# /etc/telegraf/telegraf.d/processing.conf — Filter and transform metrics

# Drop noisy fields at the input (add this to the Task A [[inputs.disk]] instead of a second
# [[inputs.disk]] block, which would collect every disk twice)
[[inputs.disk]]
  fieldexclude = ["inodes_*"]

# Drop whole metrics from the stream (processors.filter, Telegraf 1.29+)
[[processors.filter]]
  order = 1
  default = "pass"
  [[processors.filter.rule]]
    name = ["docker_container_blkio"]
    action = "drop"

[[processors.converter]]
  order = 2
  [processors.converter.fields]
    float = ["usage_idle", "usage_user", "usage_system"]

# Tag metrics based on field values
[[processors.starlark]]
  order = 3
  namepass = ["cpu"]
  source = '''
def apply(metric):
    idle = metric.fields.get("usage_idle")
    if idle != None:
        used = 100 - idle
        if used > 90:
            metric.tags["cpu_alert"] = "critical"
        elif used > 70:
            metric.tags["cpu_alert"] = "warning"
    return metric
'''

# Rename last, so earlier plugins and filters still see the original name
[[processors.rename]]
  order = 4
  [[processors.rename.replace]]
    measurement = "cpu"
    dest = "system_cpu"

# Aggregate before sending: emits extra metrics with _mean/_max/_min/_count field suffixes
[[aggregators.basicstats]]
  period = "60s"
  drop_original = false
  stats = ["mean", "max", "min", "count"]
  namepass = ["http_response"]
```

### Task E: HTTP and Custom Inputs

```toml
# /etc/telegraf/telegraf.d/http.conf — HTTP endpoint checks and API polling
[[inputs.http_response]]
  urls = [
    "https://api.shopfront.dev/health",
    "https://www.shopfront.dev",
  ]
  response_timeout = "5s"
  method = "GET"
  follow_redirects = true
  response_status_code = 200
  [inputs.http_response.tags]
    check = "uptime"

[[inputs.http]]
  urls = ["http://app-server:8080/api/stats"]
  method = "GET"
  data_format = "json"
  json_name_key = "metric_name"
  json_time_key = "timestamp"
  json_time_format = "unix"
  [inputs.http.tags]
    source = "app-api"

# Execute custom scripts for metrics
[[inputs.exec]]
  commands = [["/opt/scripts/check_queue_depth.sh", "--queue", "orders"]]
  timeout = "5s"
  data_format = "influx"
  interval = "30s"
```

### Task F: Docker Deployment

```yaml
# docker-compose.yml — Telegraf with InfluxDB
services:
  telegraf:
    image: telegraf:1.40
    volumes:
      - ./telegraf.conf:/etc/telegraf/telegraf.conf:ro
      - ./telegraf.d:/etc/telegraf/telegraf.d:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
    environment:
      - HOST_PROC=/host/proc
      - HOST_SYS=/host/sys
      - INFLUX_TOKEN=${INFLUX_TOKEN}
    group_add:
      - "${DOCKER_GID}"   # numeric group of the socket: stat -c '%g' /var/run/docker.sock
    depends_on:
      - influxdb

  influxdb:
    image: influxdb:2.8
    ports:
      - "127.0.0.1:8086:8086"
    volumes:
      - influxdb_data:/var/lib/influxdb2
    environment:
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=admin
      - DOCKER_INFLUXDB_INIT_PASSWORD=${INFLUX_ADMIN_PASSWORD}
      - DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=${INFLUX_TOKEN}
      - DOCKER_INFLUXDB_INIT_ORG=myorg
      - DOCKER_INFLUXDB_INIT_BUCKET=infrastructure

volumes:
  influxdb_data:
```

## Examples

### Example 1: "Send host metrics from my VM to InfluxDB and check the config first"

Write the Task A file to `/etc/telegraf/telegraf.conf`, put `INFLUX_TOKEN=...` in `/etc/default/telegraf`, then:

```bash
telegraf --config /etc/telegraf/telegraf.conf --test | head -5
sudo systemctl restart telegraf
```

`--test` prints line protocol such as `cpu,cpu=cpu-total,host=web-01 usage_idle=96.2,usage_user=2.1 ...` and exits without writing. With `${INFLUX_TOKEN:?...}` an unset variable makes the load fail with your message; a plain `$INFLUX_TOKEN` or `${INFLUX_TOKEN}` would not fail, and `--test` does not start outputs, so it cannot reveal a bad token.

### Example 2: "Expose Postgres and Redis metrics for my existing Prometheus"

Put the Task B inputs for `postgresql` and `redis` in `telegraf.d/databases.conf`, replace the InfluxDB output with `[[outputs.prometheus_client]]` (`listen = ":9273"`), and add a scrape job pointing at `host:9273/metrics`. Telegraf serves the latest values of every input as Prometheus text; with `metric_version = 2` field names become labels-friendly series such as `postgresql_xact_commit`.

## Guidelines

- Use `telegraf.d/` for modular configs, one file per input category.
- Set `metric_buffer_limit` high enough to ride out an output outage; metrics beyond it are dropped.
- Prefer `namepass`/`namedrop` and `fieldinclude`/`fieldexclude` on inputs to cut cardinality and storage cost.
- Never put passwords in the config file; reference environment variables, and mark the mandatory ones with `${NAME:?message}` because strict mode does not fail on unset variables.
- Create a read-only database user for `postgresql` and `mysql`; never monitor as a superuser.
- Mounting `/var/run/docker.sock` gives the container control of the Docker daemon even when mounted read-only; use `inputs.docker` only on hosts where that is acceptable, or point `endpoint` at a socket proxy.
- Use Starlark for logic that would take several chained processors; set `order` when processors depend on one another.
- For InfluxDB 3 Core/Enterprise use `[[outputs.influxdb_v3]]` (`urls`, `token`, `database`) instead of `influxdb_v2`.
- Since 1.36 the Linux `mem` input reports `used_percent` from `MemAvailable`, so it reads higher than on older versions; recheck alert thresholds after an upgrade.
- Monitor Telegraf itself with `[[inputs.internal]]` to catch dropped metrics and slow gathers.
