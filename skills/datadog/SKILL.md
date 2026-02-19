---
name: datadog
description: >-
  Configure and manage Datadog for infrastructure monitoring, application
  performance monitoring (APM), log management, and alerting. Use when a user
  needs to set up Datadog agents, create dashboards, configure monitors and
  alerts, integrate services, or query metrics and logs through Datadog's API.
license: Apache-2.0
compatibility: "Datadog Agent 7+, Datadog API v1/v2"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["datadog", "monitoring", "apm", "logs", "dashboards", "alerts", "observability"]
---

# Datadog

## Overview

Set up and manage Datadog for full-stack observability including infrastructure metrics, APM traces, log aggregation, dashboards, and alerting. Covers agent installation, integration configuration, monitor creation, and API usage.

## Instructions

### Task A: Install and Configure the Datadog Agent

```yaml
# /etc/datadog-agent/datadog.yaml — Main agent configuration
api_key: "<YOUR_DD_API_KEY>"
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
```

```bash
# Install Datadog Agent on Ubuntu/Debian
DD_API_KEY="<YOUR_DD_API_KEY>" DD_SITE="datadoghq.com" \
  bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"

# Verify agent status
sudo datadog-agent status
```

### Task B: Configure Integrations

```yaml
# /etc/datadog-agent/conf.d/postgres.d/conf.yaml — PostgreSQL integration
init_config:

instances:
  - host: localhost
    port: 5432
    username: datadog
    password: "<DB_PASSWORD>"
    dbname: myapp_production
    tags:
      - env:production
      - service:database
    collect_activity_metrics: true
    collect_database_size_metrics: true
```

```yaml
# /etc/datadog-agent/conf.d/nginx.d/conf.yaml — Nginx integration
init_config:

instances:
  - nginx_status_url: http://localhost:8080/nginx_status
    tags:
      - env:production
      - service:web-proxy
```

### Task C: Create Monitors and Alerts

```bash
# Create a metric monitor via API — High CPU alert
curl -X POST "https://api.datadoghq.com/api/v1/monitor" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{
    "name": "High CPU on {{host.name}}",
    "type": "metric alert",
    "query": "avg(last_5m):avg:system.cpu.user{env:production} by {host} > 85",
    "message": "CPU usage above 85% on {{host.name}}.\n\n@slack-ops-alerts @pagerduty-infra",
    "tags": ["env:production", "team:platform"],
    "options": {
      "thresholds": { "critical": 85, "warning": 70 },
      "notify_no_data": true,
      "no_data_timeframe": 10,
      "renotify_interval": 30
    }
  }'
```

```bash
# Create a log-based monitor — Error rate spike
curl -X POST "https://api.datadoghq.com/api/v1/monitor" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{
    "name": "Error log spike in payment-service",
    "type": "log alert",
    "query": "logs(\"service:payment-service status:error\").index(\"main\").rollup(\"count\").by(\"service\").last(\"5m\") > 50",
    "message": "More than 50 error logs in 5 minutes for payment-service.\n\n@slack-payments-team",
    "options": { "thresholds": { "critical": 50, "warning": 25 }, "enable_logs_sample": true }
  }'
```

### Task D: Build Dashboards

```bash
# Create a dashboard via API — Service overview
curl -X POST "https://api.datadoghq.com/api/v1/dashboard" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{
    "title": "Web API Service Overview",
    "layout_type": "ordered",
    "widgets": [
      {
        "definition": {
          "type": "timeseries",
          "title": "Request Rate",
          "requests": [{ "q": "sum:trace.http.request.hits{service:web-api,env:production}.as_count()", "display_type": "bars" }]
        }
      },
      {
        "definition": {
          "type": "query_value",
          "title": "P99 Latency",
          "requests": [{ "q": "p99:trace.http.request.duration{service:web-api,env:production}" }],
          "precision": 2
        }
      }
    ]
  }'
```

### Task E: APM Instrumentation

```python
# app.py — Python APM auto-instrumentation with ddtrace
from ddtrace import tracer, patch_all

patch_all()
tracer.configure(hostname="localhost", port=8126, service="payment-service", env="production", version="2.1.0")

from flask import Flask
app = Flask(__name__)

@app.route("/charge", methods=["POST"])
def charge():
    with tracer.trace("payment.process", service="payment-service") as span:
        span.set_tag("payment.provider", "stripe")
        result = process_payment()
        span.set_metric("payment.amount", result["amount"])
        return {"status": "ok"}
```

### Task F: Log Collection

```yaml
# /etc/datadog-agent/conf.d/python.d/conf.yaml — Custom log collection
logs:
  - type: file
    path: /var/log/myapp/*.log
    service: web-api
    source: python
    tags:
      - env:production
    log_processing_rules:
      - type: multi_line
        name: python_traceback
        pattern: "Traceback \\(most recent call last\\)"
```

## Best Practices

- Use consistent tagging: `env`, `service`, `team` on all resources
- Set `notify_no_data` on critical monitors to catch silent failures
- Use composite monitors to reduce alert noise by correlating signals
- Configure log exclusion filters to control ingestion costs
- Use Unified Service Tagging (`DD_ENV`, `DD_SERVICE`, `DD_VERSION`) across APM, logs, and metrics
