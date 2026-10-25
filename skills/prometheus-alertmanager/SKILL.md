---
name: prometheus-alertmanager
description: >-
  Configure Prometheus Alertmanager for alert routing, grouping, silencing,
  and notification delivery. Use when a user needs to set up alert receivers
  (Slack, PagerDuty, email), define routing trees, manage silences and
  inhibition rules, or troubleshoot alert delivery pipelines.
license: Apache-2.0
compatibility: "Alertmanager 0.27+ (tested on 0.34.1), Prometheus 2.45+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "alertmanager, prometheus, alerts, routing, on-call"
---

# Prometheus Alertmanager

## Overview

Configure Alertmanager to handle alerts from Prometheus, route them to the correct receivers, group related alerts, suppress duplicates, and manage silences. Covers routing trees, receiver configuration, inhibition rules, and high-availability setup.

## Instructions

### Task A: Basic Alertmanager Configuration

Secrets stay in files that Alertmanager reads at start and reload (`*_file` options), not inside the YAML. Use `matchers` (label-matcher strings) in routes and inhibit rules: `match`, `match_re`, `source_match` and `target_match` are deprecated and only kept for compatibility. The first matching child route wins unless it sets `continue: true`, so list specific routes (payments) first.

```yaml
# alertmanager.yml — Main Alertmanager configuration
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.mailgun.org:587'
  smtp_from: 'alerts@shop.acme-ops.net'
  smtp_auth_username: 'alerts@shop.acme-ops.net'
  smtp_auth_password_file: /etc/alertmanager/secrets/smtp-password
  slack_api_url_file: /etc/alertmanager/secrets/slack-webhook-url

route:
  receiver: default-slack
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers:
        - service=~"payment|billing"
      receiver: payments-team
      routes:
        - matchers:
            - severity="critical"
          receiver: pagerduty-payments
    - matchers:
        - severity="critical"
      receiver: pagerduty-critical
      group_wait: 10s
      repeat_interval: 1h
    - matchers:
        - severity="warning"
      receiver: slack-warnings

receivers:
  - name: 'default-slack'
    slack_configs:
      - channel: '#ops-alerts'
        send_resolved: true
        title: '{{ .Status | toUpper }}: {{ .CommonLabels.alertname }}'
        text: >-
          {{ range .Alerts }}
          *{{ .Labels.alertname }}* on {{ .Labels.instance }}
          {{ .Annotations.description }}
          {{ end }}

  - name: 'pagerduty-critical'
    pagerduty_configs:
      # Events API v2 integration key (the "Integration Key" of a PagerDuty service)
      - routing_key_file: /etc/alertmanager/secrets/pagerduty-ops-key
        description: '{{ .CommonLabels.alertname }}: {{ .CommonAnnotations.summary }}'

  - name: 'slack-warnings'
    slack_configs:
      - channel: '#ops-warnings'
        send_resolved: true

  - name: 'payments-team'
    slack_configs:
      - channel: '#payments-alerts'
        send_resolved: true

  - name: 'pagerduty-payments'
    pagerduty_configs:
      - routing_key_file: /etc/alertmanager/secrets/pagerduty-payments-key

  - name: 'ops-email'
    email_configs:
      - to: 'oncall@shop.acme-ops.net'

inhibit_rules:
  - source_matchers:
      - severity="critical"
    target_matchers:
      - severity="warning"
    equal: ['alertname', 'cluster', 'service']
  - source_matchers:
      - alertname="ClusterDown"
    target_matchers:
      - alertname=~".+"
    equal: ['cluster']
```

Validate before every deploy: `amtool check-config alertmanager.yml`. Reload with `curl -X POST http://localhost:9093/-/reload` or by sending `SIGHUP`. `pagerduty_configs` with `service_key` is the older Prometheus-integration (Events v1) key; new setups use `routing_key`.

To limit a route to a schedule, define `time_intervals` and reference them with `active_time_intervals` (or silence a window with `mute_time_intervals`):

```yaml
route:
  routes:
    - matchers: [ 'service=~"payment|billing"' ]
      receiver: payments-team
      active_time_intervals: [business-hours]

time_intervals:
  - name: business-hours
    time_intervals:
      - weekdays: ['monday:friday']
        times: [{ start_time: '08:00', end_time: '18:00' }]
        location: Europe/Berlin
```

### Task B: Define Prometheus Alert Rules

```yaml
# prometheus/rules/alerts.yml — Alert rules for Prometheus
groups:
  - name: service-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
          / sum(rate(http_requests_total[5m])) by (service) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.service }}"
          description: "Error rate is {{ $value | humanizePercentage }} for {{ $labels.service }}."

      - alert: HighLatency
        expr: |
          histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)) > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "P99 latency above 2s on {{ $labels.service }}"
          description: "P99 latency is {{ $value }}s for {{ $labels.service }}."

      - alert: PodCrashLooping
        expr: increase(kube_pod_container_status_restarts_total[15m]) > 3
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Pod {{ $labels.pod }} is crash looping"
          description: "Pod {{ $labels.pod }} in {{ $labels.namespace }} restarted {{ $value }} times in 15m."

      - alert: DiskSpaceRunningLow
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Disk space below 10% on {{ $labels.instance }}"
          description: "{{ $labels.mountpoint }} has {{ $value | humanizePercentage }} free."
```

### Task C: Manage Silences

```bash
# Create a silence via the Alertmanager v2 API (the v1 API was removed in 0.27 and answers 410).
# endsAt must be in the future; the response is {"silenceID": "..."}
curl -X POST http://localhost:9093/api/v2/silences \
  -H "Content-Type: application/json" \
  -d '{
    "matchers": [
      { "name": "instance", "value": "web-01:9090", "isRegex": false },
      { "name": "severity", "value": "warning|critical", "isRegex": true }
    ],
    "startsAt": "2026-11-07T02:00:00Z",
    "endsAt": "2026-11-07T06:00:00Z",
    "createdBy": "marta",
    "comment": "Scheduled maintenance on web-01"
  }'
```

```bash
# Same with amtool: silence a host for two hours
amtool --alertmanager.url=http://localhost:9093 silence add 'instance="web-02:9100"' \
  --duration=2h --author=marta --comment="Kernel upgrade"
amtool --alertmanager.url=http://localhost:9093 silence query
```

```bash
# List active silences
curl -s http://localhost:9093/api/v2/silences | jq '.[] | select(.status.state=="active") | {id: .id, comment: .comment, endsAt: .endsAt}'
```

```bash
# Delete (expire) a silence
curl -X DELETE http://localhost:9093/api/v2/silence/9576efc5-9b9f-4846-b401-9bac8660a2ae
```

### Task D: High Availability Setup

```yaml
# docker-compose.yml — Alertmanager HA cluster with 3 instances
services:
  alertmanager-1:
    image: prom/alertmanager:v0.34.1
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--cluster.peer=alertmanager-2:9094'
      - '--cluster.peer=alertmanager-3:9094'
      - '--storage.path=/alertmanager'
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml

  alertmanager-2:
    image: prom/alertmanager:v0.34.1
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--cluster.peer=alertmanager-1:9094'
      - '--cluster.peer=alertmanager-3:9094'
      - '--storage.path=/alertmanager'
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml

  # alertmanager-3 is the same, peering with alertmanager-1 and alertmanager-2
```

Prometheus must list every Alertmanager instance itself; do not put a load balancer in front of the cluster, because Prometheus sends each alert to all of them and the cluster deduplicates:

```yaml
# prometheus.yml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager-1:9093', 'alertmanager-2:9093', 'alertmanager-3:9093']
```

Cluster traffic uses port 9094 (TCP and UDP) between peers; keep it off public interfaces. Mount a volume at `--storage.path` so silences survive restarts.

### Task E: Test Alert Configuration

```bash
# Send a test alert to Alertmanager. Omit startsAt (it defaults to now): a start time in the future is rejected with 400
curl -X POST http://localhost:9093/api/v2/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {
      "alertname": "TestAlert",
      "severity": "critical",
      "service": "payment",
      "instance": "web-01:9090"
    },
    "annotations": {
      "summary": "Test alert — please ignore",
      "description": "This is a test alert to verify routing."
    }
  }]'
```

```bash
# Check which route an alert matches using amtool
amtool config routes test --config.file=alertmanager.yml \
  severity=critical service=payment
# prints: pagerduty-payments
```

## Examples

### Example 1: "Page us only for payment outages, Slack for the rest"

Apply Task A, run `amtool check-config alertmanager.yml`, then `amtool config routes test --config.file=alertmanager.yml severity=critical service=payment`. It prints `pagerduty-payments`; with `severity=warning service=payment` it prints `payments-team`.

### Example 2: "Silence web-02 for two hours while we patch it"

Run the `amtool silence add` command from Task C. `amtool silence query` then lists the silence with its ID and end time, and alerts from `instance="web-02:9100"` stop notifying until it expires.

## Guidelines

- Use `group_by` to batch related alerts into single notifications and reduce noise
- Always set `send_resolved: true` on Slack receivers so teams know when issues clear
- Use inhibition rules to suppress warnings when a critical alert already fires for the same target
- Keep `group_wait` short for critical alerts, longer for warnings
- Use `time_intervals` muting for recurring windows and silences for one-off maintenance instead of disabling alerts
- Test routing for each severity: a route that matches earlier (without `continue: true`) hides the ones below it
