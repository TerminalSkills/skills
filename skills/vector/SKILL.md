---
name: vector
description: >-
  Vector is a high-performance observability data pipeline written in Rust and
  maintained by Datadog. It collects, transforms and routes logs, metrics and
  traces from any source to any destination using TOML or YAML configs and the
  VRL remap language. Use it to replace Logstash, Fluentd or Filebeat, filter
  and sample noisy logs, archive to S3, or write and debug vector.toml, VRL and
  `vector test` unit tests.
license: Apache-2.0
compatibility: Vector 0.58 or newer (config shown was validated with 0.58.0); Linux, macOS, Windows, Docker or Kubernetes
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/vectordotdev/vector
  tags:
  - log-pipeline
  - data-pipeline
  - observability
  - rust
  - transform
---

# Vector — High-Performance Observability Data Pipeline

## Overview

Vector reads data from **sources**, reshapes it with **transforms** and delivers it to **sinks**. Each component has a name and an `inputs` list that wires it to upstream components. It runs as an agent on every host (DaemonSet in Kubernetes) or as a central aggregator, and ships as a single static binary. Configuration can be TOML, YAML or JSON; this skill uses TOML.

Changes in recent releases that older tutorials get wrong:

- **0.57**: environment-variable interpolation (`${ES_PASSWORD}`) in config files is **off by default**. Re-enable it with `--dangerously-allow-env-var-interpolation` or `VECTOR_DANGEROUSLY_ALLOW_ENV_VAR_INTERPOLATION=true`, run the file through `envsubst` first, or use a secrets backend.
- **0.57**: sinks that accept `{{ field }}` templates (S3, Elasticsearch, Kafka, HTTP, Loki, file and others) refuse templates with no literal prefix, such as `topic = "{{ x }}"`. Write `topic = "logs-{{ x }}"`, or set `dangerously_allow_unconfined_template_resolution = true` only if you accept the injection risk. `vector validate` reports these at startup.
- Elasticsearch `auth` needs `auth.strategy = "basic"`; without it validation fails with "missing field `strategy`".
- The `http` sink has no `condition` option; route errors to it through a `filter` transform, and keep errors out of sampling with `exclude` on `sample`.
- Latest release when checked: 0.58.0 (26 August 2026).

## Instructions

### Install

Prefer a package manager or container image:

```bash
brew install vector                       # macOS
helm repo add vector https://helm.vector.dev
helm install vector vector/vector         # Kubernetes
docker run --rm -v "$PWD/vector.toml:/etc/vector/vector.toml:ro" \
  timberio/vector:0.58.0-alpine --config /etc/vector/vector.toml
```

For apt, yum and archive installs follow https://vector.dev/docs/setup/installation/. If you download an archive from packages.timber.io, verify its published checksum before unpacking, and avoid piping the install script into a shell.

### Configuration

```toml
# vector.toml — collect, filter, sample and route logs and metrics
data_dir = "/var/lib/vector"

# --- Sources ---
[sources.app_logs]
type = "file"
include = ["/var/log/app/*.log"]
read_from = "end"                     # "beginning" re-reads old files on first start

[sources.http_logs]                   # apps POST JSON here
type = "http_server"
address = "127.0.0.1:8686"
decoding.codec = "json"

[sources.host_metrics]
type = "host_metrics"
collectors = ["cpu", "memory", "disk", "network"]
scrape_interval_secs = 15

[sources.otel]                        # OpenTelemetry: outputs are otel.logs / otel.metrics / otel.traces
type = "opentelemetry"
grpc.address = "127.0.0.1:4317"
http.address = "127.0.0.1:4318"

# --- Transforms ---
[transforms.parse_json]
type = "remap"
inputs = ["app_logs"]
source = '''
  . = parse_json!(.message)
  .environment = get_env_var("ENVIRONMENT") ?? "production"
  .timestamp = parse_timestamp!(.timestamp, format: "%Y-%m-%dT%H:%M:%S%.fZ")
  if exists(.email) {
    .email = redact(string!(.email), filters: [r'\S+@\S+'])
  }
'''

[transforms.filter_noise]
type = "filter"
inputs = ["parse_json"]
condition = '''
  !includes(["GET /health", "GET /ready", "GET /metrics"], .request) && .level != "debug"
'''

[transforms.sample_info]              # keeps 1 in 10 events, never drops errors or warnings
type = "sample"
inputs = ["filter_noise"]
rate = 10
exclude = '.level == "error" || .level == "warn"'

[transforms.errors_only]
type = "filter"
inputs = ["filter_noise"]
condition = '.level == "error"'

[transforms.aggregate_metrics]
type = "aggregate"
inputs = ["host_metrics"]
interval_ms = 60000

# --- Sinks ---
[sinks.elasticsearch]
type = "elasticsearch"
inputs = ["sample_info"]
endpoints = ["https://es.internal.shopwave.io:9200"]
bulk.index = "logs-%Y-%m-%d"
auth.strategy = "basic"
auth.user = "${ES_USER}"              # needs env-var interpolation enabled (see Overview)
auth.password = "${ES_PASSWORD}"
compression = "gzip"
batch.max_bytes = 10485760
batch.timeout_secs = 5
buffer.type = "disk"                  # survives destination outages and restarts
buffer.max_size = 1073741824
buffer.when_full = "block"

[sinks.s3_archive]
type = "aws_s3"
inputs = ["sample_info"]
bucket = "shopwave-logs-archive"
region = "us-east-1"
key_prefix = "logs/{{ service }}/year=%Y/month=%m/day=%d/"   # literal prefix keeps 0.57+ confinement happy
compression = "gzip"
encoding.codec = "json"
batch.max_bytes = 104857600
batch.timeout_secs = 300

[sinks.prometheus]
type = "prometheus_exporter"
inputs = ["aggregate_metrics"]
address = "0.0.0.0:9598"

[sinks.slack_errors]
type = "http"
inputs = ["errors_only"]
uri = "${SLACK_WEBHOOK_URL}"
method = "post"
encoding.codec = "json"
batch.max_events = 1
request.rate_limit_duration_secs = 1
request.rate_limit_num = 5
```

Validate, then run:

```bash
vector validate --no-environment vector.toml      # add --dangerously-allow-env-var-interpolation if the file uses ${VAR}
vector --config vector.toml
```

`--no-environment` skips network health checks, so it works offline; drop it in CI to also check that destinations are reachable. Unused sources only produce warnings.

### VRL (Vector Remap Language)

VRL is compiled and type-checked: fallible calls must be handled with `!` (abort the event on error) or `?? default`.

```coffee
. = parse_json!(.message)

if starts_with(string!(.message), "AUDIT:") {
  .route = "audit"
} else if (to_int(.status_code) ?? 0) >= 500 {
  .route = "error"
} else {
  .route = "general"
}

.duration_ms = to_float(.duration_ms) ?? 0.0
.user_id = del(.user.id)
del(.user)
```

Try snippets interactively with `vector vrl`, or watch live events with `vector tap` and `vector top` against a running instance.

### Unit tests

```toml
[[tests]]
name = "normalizes warning and redacts email"
[[tests.inputs]]
insert_at = "parse_json"
type = "log"
[tests.inputs.log_fields]
message = '{"level":"warning","status_code":"503","email":"dana@shopwave.io"}'
[[tests.outputs]]
extract_from = "parse_json"
[[tests.outputs.conditions]]
type = "vrl"
source = '''
  assert_eq!(.severity, "warn")
  assert!(!contains(string!(.email), "dana"))
'''
```

Put the `[[tests]]` next to the transforms they cover and run `vector test vector.toml`. Output: `test normalizes warning and redacts email ... passed`.

## Examples

### Example 1: Cut Elasticsearch cost for a Node.js API

**User request:** "Our Node API logs JSON to /var/log/api/*.log and Elasticsearch costs too much. Drop health checks and debug, keep all errors, sample the rest."

Create `vector.toml` from the configuration above, with `include = ["/var/log/api/*.log"]`. Run `vector validate --no-environment vector.toml`; it prints `Validated` for transforms and sinks. Start with `vector --config vector.toml` and confirm with `vector top` that `filter_noise` receives more events than `sample_info` emits. Errors and warnings all reach Elasticsearch; about one in ten info events does.

### Example 2: Fix a failing VRL remap

**User request:** "Vector says `unhandled fallible assignment` on `.timestamp = parse_timestamp(.ts, \"%+\")`."

`parse_timestamp` can fail, so VRL refuses to compile it. Change the line to `.timestamp = parse_timestamp!(.ts, format: "%+")` to drop events with a bad timestamp, or `parse_timestamp(.ts, format: "%+") ?? now()` to keep them. Add a `[[tests]]` case with a malformed `ts` and run `vector test vector.toml` to lock in the behaviour.

## Guidelines

- Pin the image or package version; upgrade one minor at a time and read the upgrade guide, since 0.57 changed env-var and template handling.
- Never put secrets in the config file. Use a secrets backend, or env vars with interpolation explicitly enabled, and keep the file out of Git.
- Filter noise and sample high-volume info logs before sinks; keep 100% of errors and warnings.
- Archive everything cheaply to S3 and send only recent or important data to Elasticsearch.
- Enable disk buffers on sinks that must not lose data during outages; the default buffer is in memory.
- Bind source addresses to `127.0.0.1` unless remote hosts must reach them; `0.0.0.0` on syslog or HTTP exposes the port.
- Prefer VRL over regex-heavy chains and test every remap with `vector test` before deploying.
