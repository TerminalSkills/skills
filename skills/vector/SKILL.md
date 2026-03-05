---
name: vector
description: Expert guidance for Vector, the high-performance observability data pipeline built in Rust by Datadog. Helps developers collect, transform, and route logs, metrics, and traces from any source to any destination with minimal resource usage. Vector replaces Logstash, Fluentd, and Filebeat with a single, faster tool.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - log-pipeline
  - data-pipeline
  - observability
  - rust
  - transform
---

# Vector — High-Performance Observability Data Pipeline


## Overview


Vector, the high-performance observability data pipeline built in Rust by Datadog. Helps developers collect, transform, and route logs, metrics, and traces from any source to any destination with minimal resource usage. Vector replaces Logstash, Fluentd, and Filebeat with a single, faster tool.


## Instructions

### Configuration

```toml
# vector.toml — Collect, transform, and route observability data

# --- Sources: Where data comes from ---

# Collect from files (like Filebeat)
[sources.app_logs]
type = "file"
include = ["/var/log/app/*.log"]
read_from = "beginning"

# Receive via Syslog
[sources.syslog]
type = "syslog"
address = "0.0.0.0:514"
mode = "tcp"

# Receive via HTTP (for apps that POST logs)
[sources.http_logs]
type = "http_server"
address = "0.0.0.0:8686"
encoding = "json"

# Collect host metrics (CPU, memory, disk, network)
[sources.host_metrics]
type = "host_metrics"
collectors = ["cpu", "memory", "disk", "network"]
scrape_interval_secs = 15

# Receive OpenTelemetry data
[sources.otel]
type = "opentelemetry"
grpc.address = "0.0.0.0:4317"
http.address = "0.0.0.0:4318"

# --- Transforms: Process and enrich data ---

# Parse JSON logs
[transforms.parse_json]
type = "remap"
inputs = ["app_logs"]
source = '''
  # Parse JSON from log line
  . = parse_json!(.message)

  # Add environment tag
  .environment = get_env_var("ENVIRONMENT") ?? "production"

  # Redact sensitive fields
  if exists(.email) {
    .email = redact(.email, filters: ["pattern"], redactor: "full",
      patterns: [r'\S+@\S+'])
  }

  # Parse timestamp
  .timestamp = parse_timestamp!(.timestamp, format: "%Y-%m-%dT%H:%M:%S%.fZ")
'''

# Filter out health check noise
[transforms.filter_noise]
type = "filter"
inputs = ["parse_json"]
condition = '''
  !includes(["GET /health", "GET /ready", "GET /metrics"], .message) &&
  .level != "debug"
'''

# Sample high-volume logs (keep 10% of info logs, 100% of errors)
[transforms.sample]
type = "sample"
inputs = ["filter_noise"]
rate = 10
condition = '.level == "info"'
exclude = '.level == "error" || .level == "warn"'

# Add derived fields
[transforms.enrich]
type = "remap"
inputs = ["sample"]
source = '''
  # Categorize by service from log path or field
  .service = .service ?? "unknown"

  # Calculate log size for billing tracking
  .log_size_bytes = length(encode_json(.))

  # Normalize severity levels
  .severity = if .level == "fatal" || .level == "critical" { "error" }
              else if .level == "warning" { "warn" }
              else { .level }
'''

# Aggregate metrics (reduce cardinality)
[transforms.aggregate_metrics]
type = "aggregate"
inputs = ["host_metrics"]
interval_ms = 60000

# --- Sinks: Where data goes ---

# Send logs to Elasticsearch/OpenSearch
[sinks.elasticsearch]
type = "elasticsearch"
inputs = ["enrich"]
endpoints = ["https://es.example.com:9200"]
bulk.index = "logs-%Y-%m-%d"
auth.user = "${ES_USER}"
auth.password = "${ES_PASSWORD}"
compression = "gzip"
batch.max_bytes = 10485760
batch.timeout_secs = 5

# Send to S3 for long-term archive (cheap storage)
[sinks.s3_archive]
type = "aws_s3"
inputs = ["enrich"]
bucket = "logs-archive"
key_prefix = "logs/{{ service }}/year=%Y/month=%m/day=%d/"
compression = "gzip"
encoding.codec = "json"
batch.max_bytes = 104857600        # 100MB files for efficient S3 storage
batch.timeout_secs = 300

# Send metrics to Prometheus
[sinks.prometheus]
type = "prometheus_exporter"
inputs = ["aggregate_metrics"]
address = "0.0.0.0:9598"

# Route errors to Slack for immediate visibility
[sinks.slack_errors]
type = "http"
inputs = ["enrich"]
uri = "${SLACK_WEBHOOK_URL}"
method = "post"
encoding.codec = "json"
condition = '.level == "error" || .level == "fatal"'
batch.max_events = 1
request.rate_limit_num = 5         # Max 5 Slack messages per second
```

### VRL (Vector Remap Language)

```coffee
# VRL is Vector's data transformation language — fast, safe, type-checked

# Parse and restructure a complex log line
. = parse_json!(.message)

# Geoip enrichment
.geo = get_enrichment_table_record("geoip", {"ip": .client_ip}) ?? {}
.country = .geo.country_code ?? "unknown"
del(.geo)

# Route based on content
if starts_with(.message, "AUDIT:") {
  .metadata.sink = "audit-logs"
} else if .status_code >= 500 {
  .metadata.sink = "error-logs"
} else {
  .metadata.sink = "general-logs"
}

# Coerce types
.duration_ms = to_float(.duration_ms) ?? 0.0
.status_code = to_int(.status_code) ?? 0

# Flatten nested objects for better indexing
.user_email = del(.user.email)
.user_id = del(.user.id)
del(.user)
```

## Installation

```bash
# macOS
brew install vector

# Linux (script)
curl --proto '=https' --tlsv1.2 -sSfL https://sh.vector.dev | bash

# Docker
docker run -v $(pwd)/vector.toml:/etc/vector/vector.toml timberio/vector:latest-alpine

# Helm (Kubernetes)
helm repo add vector https://helm.vector.dev
helm install vector vector/vector

# Validate config
vector validate vector.toml

# Run
vector --config vector.toml
```


## Examples


### Example 1: Setting up Vector for a microservices project

**User request:**

```
I have a Node.js API and a React frontend running in Docker. Set up Vector for monitoring/deployment.
```

The agent creates the necessary configuration files based on patterns like `# vector.toml — Collect, transform, and route observability `, sets up the integration with the existing Docker setup, configures appropriate defaults for a Node.js + React stack, and provides verification commands to confirm everything is working.

### Example 2: Troubleshooting vrl issues

**User request:**

```
Vector is showing errors in our vrl. Here are the logs: [error output]
```

The agent analyzes the error output, identifies the root cause by cross-referencing with common Vector issues, applies the fix (updating configuration, adjusting resource limits, or correcting syntax), and verifies the resolution with appropriate health checks.


## Guidelines

1. **Replace Logstash/Fluentd** — Vector uses 10x less memory than Logstash; deploy as a drop-in replacement
2. **Filter before sending** — Remove debug logs, health checks, and noise in Vector; don't pay to store data you'll never query
3. **Sample high-volume logs** — Keep 100% of errors, sample info logs at 10-20%; reduce storage costs without losing signal
4. **S3 for archives** — Route all logs to S3 (compressed) for cheap long-term storage; route only recent/important logs to Elasticsearch
5. **VRL over regex** — VRL is compiled and type-checked; it's 5-10x faster than Logstash's Ruby filters
6. **One Vector per host** — Run Vector as an agent on each host (DaemonSet in K8s); it handles collection, transformation, and shipping
7. **Disk buffers for reliability** — Enable disk-based buffers to prevent data loss during destination outages
8. **Test transforms** — Use `vector vrl` REPL and `vector test` to validate transforms before deploying
