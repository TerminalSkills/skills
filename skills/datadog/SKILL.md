---
name: datadog
description: >-
  Datadog is a hosted observability platform for infrastructure monitoring,
  application performance monitoring (APM), log management, and alerting. Use
  when a user needs to set up Datadog agents, create dashboards, configure
  monitors and alerts, integrate services, or query metrics and logs through
  Datadog's API.
license: Apache-2.0
compatibility: "Datadog Agent 7 (7.63+ for ddtrace 4, 7.70+ for built-in secret backends), Datadog API v1/v2, Python 3.9+ for ddtrace"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["datadog", "monitoring", "apm", "logs", "observability"]
---

# Datadog

## Overview

Set up and manage Datadog for full-stack observability including infrastructure metrics, APM traces, log aggregation, dashboards, and alerting. Covers agent installation, integration configuration, monitor creation, and API usage.

Every account lives on one Datadog site, and the Agent `site` setting and the API host both depend on it: `datadoghq.com` (US1), `us3.datadoghq.com`, `us5.datadoghq.com`, `datadoghq.eu` (EU1), `ap1.datadoghq.com`, `ap2.datadoghq.com`, `uk1.datadoghq.com`, `ddog-gov.com`, `us2.ddog-gov.com`. The commands below read `DD_SITE`, `DD_API_KEY` and `DD_APP_KEY` from the environment and call `https://api.${DD_SITE}`.

## Instructions

### Task A: Install and Configure the Datadog Agent

1. Install the agent on the target host
2. Configure the main `datadog.yaml` with API key and site
3. Enable relevant integrations

```bash
# Container hosts: run the Agent as a container (one per host)
docker run -d --cgroupns host --pid host --name dd-agent \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /proc/:/host/proc/:ro \
  -v /sys/fs/cgroup/:/host/sys/fs/cgroup:ro \
  -e DD_SITE="${DD_SITE}" \
  -e DD_API_KEY="${DD_API_KEY}" \
  registry.datadoghq.com/agent:7
```

For a Linux host or VM, Datadog generates the install command in the app (Fleet Automation → Install Agent → Linux), with your site already filled in. It installs the `datadog-agent` package from Datadog's signed apt or yum repository; review the command before running it as root, or use the official Ansible role, Chef cookbook or Puppet module for fleets.

```yaml
# /etc/datadog-agent/datadog.yaml — Main agent configuration
api_key: ENC[prod/datadog;api_key]   # or omit and set DD_API_KEY in the Agent's environment
site: "datadoghq.com"
hostname: "web-server-01"
tags:
  - env:production
  - service:web-api
  - team:platform
logs_enabled: true
apm_config:
  enabled: true
  env: production
process_config:
  process_collection:
    enabled: true

# Agent 7.70+: resolve ENC[secretId;key] handles from AWS Secrets Manager
secret_backend_type: aws.secrets
secret_backend_config:
  aws_session:
    aws_region: us-east-1
```

```bash
sudo systemctl restart datadog-agent     # apply config changes
sudo datadog-agent status                # running checks, forwarder, logs and APM state
sudo datadog-agent configcheck           # every loaded integration config, resolved
sudo datadog-agent diagnose              # connectivity to Datadog
```

### Task B: Configure Integrations

Each integration lives in `/etc/datadog-agent/conf.d/<name>.d/conf.yaml`; a `conf.yaml.example` next to it lists every option.

```yaml
# /etc/datadog-agent/conf.d/postgres.d/conf.yaml — PostgreSQL integration
init_config:

instances:
  - host: localhost
    port: 5432
    username: datadog
    password: "ENC[prod/postgres;datadog_password]"
    dbname: shop_production
    tags:
      - env:production
      - service:database
    collect_activity_metrics: true
    collect_database_size_metrics: true
```

The `datadog` database user needs `grant pg_monitor to datadog;` (PostgreSQL 10+).

```yaml
# /etc/datadog-agent/conf.d/nginx.d/conf.yaml — Nginx integration
init_config:

instances:
  - nginx_status_url: http://localhost:8080/nginx_status
    tags:
      - env:production
      - service:web-proxy
```

NGINX must expose `stub_status` at that URL. Run one check without waiting for the next cycle: `sudo -u dd-agent -- datadog-agent check postgres`.

### Task C: Create Monitors and Alerts

```bash
# Create a metric monitor via API — High CPU alert
curl -X POST "https://api.${DD_SITE}/api/v1/monitor" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{
    "name": "High CPU on {{host.name}}",
    "type": "query alert",
    "query": "avg(last_5m):avg:system.cpu.user{env:production} by {host} > 85",
    "message": "CPU usage above 85% on {{host.name}}.\n{{#is_renotify}}Still elevated — escalating.{{/is_renotify}}\n\n@slack-ops-alerts @pagerduty-infra",
    "tags": ["env:production", "team:platform"],
    "priority": 2,
    "options": {
      "thresholds": { "critical": 85, "warning": 70 },
      "notify_no_data": true,
      "no_data_timeframe": 10,
      "renotify_interval": 30
    }
  }'
```

The query is `time_aggr(time_window):space_aggr:metric{tags} [by {key}] operator #`. The critical threshold is the number in the query; the warning threshold exists only in `options.thresholds`. `no_data_timeframe` and `renotify_interval` are in minutes.

```bash
# Create a log-based monitor — Error rate spike
curl -X POST "https://api.${DD_SITE}/api/v1/monitor" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{
    "name": "Error log spike in payment-service",
    "type": "log alert",
    "query": "logs(\"service:payment-service status:error\").index(\"main\").rollup(\"count\").last(\"5m\") > 50",
    "message": "More than 50 error logs in 5 minutes for payment-service.\n\n@slack-payments-team",
    "options": {
      "thresholds": { "critical": 50, "warning": 25 },
      "enable_logs_sample": true
    }
  }'
```

Send the same body to `/api/v1/monitor/validate` first to check it without creating anything. Log monitors need an application key that is not scoped.

### Task D: Build Dashboards

```bash
# Create a dashboard via API — Service overview
curl -X POST "https://api.${DD_SITE}/api/v1/dashboard" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{
    "title": "Payment Service Overview",
    "layout_type": "ordered",
    "widgets": [
      { "definition": { "type": "timeseries", "title": "Request Rate", "requests": [{
          "response_format": "timeseries",
          "queries": [{ "data_source": "metrics", "name": "hits", "query": "sum:trace.flask.request.hits{service:payment-service,env:production}.as_count()" }],
          "formulas": [{ "formula": "hits" }],
          "display_type": "bars" }] } },
      { "definition": { "type": "query_value", "title": "P99 Latency", "precision": 2, "requests": [{
          "response_format": "scalar",
          "queries": [{ "data_source": "metrics", "name": "p99", "query": "p99:trace.flask.request{service:payment-service,env:production}", "aggregator": "avg" }],
          "formulas": [{ "formula": "p99" }] }] } },
      { "definition": { "type": "toplist", "title": "Top Endpoints by Errors", "requests": [{
          "response_format": "scalar",
          "queries": [{ "data_source": "metrics", "name": "errors", "query": "sum:trace.flask.request.errors{service:payment-service,env:production} by {resource_name}.as_count()", "aggregator": "sum" }],
          "formulas": [{ "formula": "errors" }] }] } }
    ]
  }'
```

The single-string `"q"` request field still works but is deprecated in favour of `queries` plus `formulas`. APM metrics are built from the span name (`flask.request` here): `trace.flask.request.hits`, `.errors`, and plain `trace.flask.request` for the latency distribution that supports percentiles; `.duration` is legacy.

### Task E: APM Instrumentation

```python
# app.py — custom spans on top of ddtrace auto-instrumentation
from ddtrace import tracer
from flask import Flask

app = Flask(__name__)

@app.route("/charge", methods=["POST"])
def charge():
    with tracer.trace("payment.process", resource="charge") as span:
        span.set_tag("payment.provider", "stripe")
        result = process_payment()
        span.set_metric("payment.amount", result["amount"])
        return {"status": "ok"}
```

```bash
# Run with ddtrace auto-instrumentation; configuration comes from the environment
pip install ddtrace
export DD_SERVICE=payment-service DD_ENV=production DD_VERSION=2.1.0
export DD_AGENT_HOST=localhost DD_TRACE_AGENT_PORT=8126
ddtrace-run --info    # shows the Agent URL in use and whether it is reachable
ddtrace-run flask --app app run    # serves app.py on http://127.0.0.1:5000
```

`ddtrace-run` (or `import ddtrace.auto` as the first import) patches Flask, requests, psycopg, redis and the other supported libraries (SQLAlchemy is not patched by default; its database driver is). Since ddtrace 3.0, `tracer.configure()` no longer takes the Agent connection arguments `hostname` and `port` (and it never took `service`, `env` or `version`) — passing them raises `TypeError`; use the environment variables above. If the Agent runs in Docker (Task A), add `-p 127.0.0.1:8126:8126/tcp` to its `docker run` so the app can reach port 8126.

### Task F: Log Collection and Pipelines

```yaml
# /etc/datadog-agent/conf.d/python.d/conf.yaml — Custom log collection
logs:
  - type: file
    path: /var/log/web-api/*.log
    service: web-api
    source: python
    tags:
      - env:production
    log_processing_rules:
      - type: multi_line
        name: new_log_start_with_date
        pattern: \d{4}-\d{2}-\d{2}
```

A `multi_line` pattern matches the start of a new entry; lines that do not match are appended to the previous one, which keeps a traceback in one log.

```bash
# Query logs via API — Find errors in last hour
curl -X POST "https://api.${DD_SITE}/api/v2/logs/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{
    "filter": { "query": "service:web-api status:error", "from": "now-1h", "to": "now" },
    "sort": "-timestamp",
    "page": { "limit": 25 }
  }'
```

`page.limit` defaults to 10 and is capped at 1000; pass the returned `meta.page.after` value as `page.cursor` for the next page.

## Examples

### Example 1: Check credentials and validate a monitor before creating it

**User request:** "Add a CPU alert for production hosts, but make sure the key and the query are right first."

```bash
curl -s "https://api.${DD_SITE}/api/v1/validate" -H "DD-API-KEY: ${DD_API_KEY}"
# {"valid":true}

curl -s -X POST "https://api.${DD_SITE}/api/v1/monitor/validate" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d @cpu-monitor.json
# {}
```

An empty object means the definition is valid; a bad query returns HTTP 400 with an `errors` array. Then send `cpu-monitor.json` (the body from Task C) to `/api/v1/monitor`: the response is the stored monitor, including its numeric `id`. A 403 on the first call means the key is invalid or belongs to another site.

### Example 2: Investigate errors from the terminal with the Pup CLI

**User request:** "What is failing in payment-service right now? Don't change anything in Datadog."

```bash
brew tap datadog-labs/pack && brew install datadog-labs/pack/pup
pup auth login                      # OAuth in the browser; skip it and pup uses DD_API_KEY and DD_APP_KEY
pup --read-only logs search --query="service:payment-service status:error" --from="1h"
pup --read-only monitors list --tags="team:payments"
pup --read-only metrics query --query="avg:system.cpu.user{service:payment-service}" --from="1h"
```

Pup is a command-line client for the Datadog API, published by Datadog. Each command prints JSON by default (`-o table` or `-o yaml` to change it), and `--read-only` blocks every create, update and delete.

## Guidelines

- Use consistent tagging: `env`, `service`, `team` on all resources
- Set `notify_no_data` on critical metric monitors to catch silent failures; log monitors use `on_missing_data` instead
- Use composite monitors to reduce alert noise by correlating signals
- Configure index exclusion filters to control log indexing costs; excluded logs are still ingested and billed for ingestion
- Use Unified Service Tagging (`DD_ENV`, `DD_SERVICE`, `DD_VERSION`) across APM, logs, and metrics
- Keep keys out of files and shell history: the API key belongs to the organisation and is what the Agent submits data with; an application key carries the permissions of the user who created it — scope application keys and rotate them
- Never paste an install one-liner that pipes a remote script into a shell without reading it; the Agent is installed as root on every host
- Sites are fully separate: a key from one site is rejected with 403 by another site's API, and an Agent configured with the wrong `site` cannot deliver data
- Datadog is a paid service billed per host, per gigabyte of ingested logs and per million indexed log events, and per custom metric (each unique combination of metric name and tag values); a high-cardinality tag such as a user ID multiplies cost
- When not to use: a self-hosted, open-source stack (Prometheus, Grafana, OpenTelemetry Collector) fits better when data must stay on your own infrastructure
