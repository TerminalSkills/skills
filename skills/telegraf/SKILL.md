---
name: telegraf
description: >-
  Configure Telegraf as a metrics collection agent for infrastructure and
  application monitoring. Use when a user needs to collect system metrics,
  set up input plugins for databases and services, configure output to
  InfluxDB or Prometheus, or build custom metric pipelines.
license: Apache-2.0
compatibility: "Telegraf 1.28+, InfluxDB 2.x/3.x"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["telegraf", "metrics", "influxdb", "monitoring", "collection-agent", "observability"]
---

# Telegraf

## Overview

Set up Telegraf to collect, process, and forward metrics from systems, databases, and applications. Covers input/output plugin configuration, metric filtering, aggregation processors, and deployment patterns.

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

[[outputs.influxdb_v2]]
  urls = ["http://influxdb:8086"]
  token = "$INFLUX_TOKEN"
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
  address = "postgres://telegraf:password@localhost:5432/myapp?sslmode=disable"
  databases = ["myapp"]
  [inputs.postgresql.tags]
    service = "postgres"

[[inputs.mysql]]
  servers = ["telegraf:password@tcp(localhost:3306)/"]
  metric_version = 2
  gather_table_schema = true
  gather_process_list = true
  gather_slave_status = true
  [inputs.mysql.tags]
    service = "mysql"

[[inputs.redis]]
  servers = ["tcp://localhost:6379"]
  password = "$REDIS_PASSWORD"
  [inputs.redis.tags]
    service = "redis"

[[inputs.nginx]]
  urls = ["http://localhost:8080/nginx_status"]
  [inputs.nginx.tags]
    service = "nginx"
```

```toml
# /etc/telegraf/telegraf.d/docker.conf — Container metrics
[[inputs.docker]]
  endpoint = "unix:///var/run/docker.sock"
  gather_services = false
  container_names = []
  perdevice = true
  total = true
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

```toml
# /etc/telegraf/telegraf.d/processing.conf — Filter and transform metrics
[[processors.rename]]
  [[processors.rename.replace]]
    measurement = "cpu"
    dest = "system_cpu"

[[processors.converter]]
  [processors.converter.fields]
    float = ["usage_idle", "usage_user", "usage_system"]
    integer = ["uptime"]

# Drop noisy metrics
[[processors.filter]]
  namepass = ["cpu", "mem", "disk", "net", "docker*", "postgresql*"]
  fielddrop = ["inodes_*"]

# Aggregate metrics before sending
[[aggregators.basicstats]]
  period = "60s"
  drop_original = false
  stats = ["mean", "max", "min", "count"]
  namepass = ["http_response_time"]

# Tag metrics based on field values
[[processors.starlark]]
  source = '''
def apply(metric):
    cpu = metric.fields.get("usage_percent", 0)
    if cpu > 90:
        metric.tags["cpu_alert"] = "critical"
    elif cpu > 70:
        metric.tags["cpu_alert"] = "warning"
    return metric
'''
```

### Task E: HTTP and Custom Inputs

```toml
# /etc/telegraf/telegraf.d/http.conf — HTTP endpoint checks and API polling
[[inputs.http_response]]
  urls = [
    "https://api.example.com/health",
    "https://web.example.com",
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
  commands = ["/opt/scripts/check_queue_depth.sh"]
  timeout = "5s"
  data_format = "influx"
  interval = "30s"
```

### Task F: Docker Deployment

```yaml
# docker-compose.yml — Telegraf with InfluxDB
services:
  telegraf:
    image: telegraf:1.29
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
    user: telegraf:$(stat -c '%g' /var/run/docker.sock)

  influxdb:
    image: influxdb:2.7
    ports:
      - "8086:8086"
    volumes:
      - influxdb_data:/var/lib/influxdb2
    environment:
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=admin
      - DOCKER_INFLUXDB_INIT_PASSWORD=changeme123
      - DOCKER_INFLUXDB_INIT_ORG=myorg
      - DOCKER_INFLUXDB_INIT_BUCKET=infrastructure

volumes:
  influxdb_data:
```

## Best Practices

- Use `telegraf.d/` directory for modular configs — one file per input category
- Set `metric_buffer_limit` high enough to handle output destination outages
- Use `namepass`/`namedrop` filters to reduce cardinality and storage costs
- Run Telegraf with `--test` flag to verify plugin configuration before deploying
- Use Starlark processor for complex transformations instead of chaining multiple processors
- Monitor Telegraf's internal metrics with `[[inputs.internal]]` to detect collection issues
