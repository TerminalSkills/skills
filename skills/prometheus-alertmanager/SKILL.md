---
name: prometheus-alertmanager
description: >-
  Configure Prometheus Alertmanager for alert routing, grouping, silencing,
  and notification delivery. Use when a user needs to set up alert receivers
  (Slack, PagerDuty, email), define routing trees, manage silences and
  inhibition rules, or troubleshoot alert delivery pipelines.
license: Apache-2.0
compatibility: "Alertmanager 0.25+, Prometheus 2.45+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["alertmanager", "prometheus", "alerts", "routing", "notifications", "on-call"]
---

# Prometheus Alertmanager

## Overview

Configure Alertmanager to handle alerts from Prometheus, route them to the correct receivers, group related alerts, suppress duplicates, and manage silences. Covers routing trees, receiver configuration, inhibition rules, and high-availability setup.

## Instructions

### Task A: Basic Alertmanager Configuration

```yaml
# alertmanager.yml — Main Alertmanager configuration
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.example.com:587'
  smtp_from: 'alerts@example.com'
  smtp_auth_username: 'alerts@example.com'
  smtp_auth_password: '<SMTP_PASSWORD>'
  slack_api_url: 'https://hooks.slack.com/services/T00/B00/XXXX'
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

route:
  receiver: 'default-slack'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      group_wait: 10s
      repeat_interval: 1h
    - match:
        severity: warning
      receiver: 'slack-warnings'
      repeat_interval: 4h
    - match_re:
        service: ^(payment|billing)$
      receiver: 'payments-team'
      routes:
        - match:
            severity: critical
          receiver: 'pagerduty-payments'

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
      - service_key: '<PD_SERVICE_KEY>'
        severity: '{{ if eq .CommonLabels.severity "critical" }}critical{{ else }}warning{{ end }}'
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
      - service_key: '<PD_PAYMENTS_KEY>'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'cluster', 'service']
  - source_match:
      alertname: 'ClusterDown'
    target_match_re:
      alertname: '.+'
    equal: ['cluster']
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
        expr: rate(kube_pod_container_status_restarts_total[15m]) * 60 * 15 > 3
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
# Create a silence via Alertmanager API — Maintenance window
curl -X POST http://localhost:9093/api/v2/silences \
  -H "Content-Type: application/json" \
  -d '{
    "matchers": [
      { "name": "instance", "value": "web-01:9090", "isRegex": false },
      { "name": "severity", "value": "warning|critical", "isRegex": true }
    ],
    "startsAt": "2026-02-20T02:00:00Z",
    "endsAt": "2026-02-20T06:00:00Z",
    "createdBy": "marta",
    "comment": "Scheduled maintenance on web-01"
  }'
```

```bash
# List active silences
curl -s http://localhost:9093/api/v2/silences | jq '.[] | select(.status.state=="active") | {id: .id, comment: .comment, endsAt: .endsAt}'
```

```bash
# Delete (expire) a silence
curl -X DELETE http://localhost:9093/api/v2/silence/<SILENCE_ID>
```

### Task D: High Availability Setup

```yaml
# docker-compose.yml — Alertmanager HA cluster with 3 instances
services:
  alertmanager-1:
    image: prom/alertmanager:v0.27.0
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
    image: prom/alertmanager:v0.27.0
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--cluster.peer=alertmanager-1:9094'
      - '--cluster.peer=alertmanager-3:9094'
      - '--storage.path=/alertmanager'

  alertmanager-3:
    image: prom/alertmanager:v0.27.0
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--cluster.peer=alertmanager-1:9094'
      - '--cluster.peer=alertmanager-2:9094'
      - '--storage.path=/alertmanager'
```

### Task E: Test Alert Configuration

```bash
# Send a test alert to Alertmanager
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
    },
    "startsAt": "2026-02-19T23:00:00Z"
  }]'
```

```bash
# Check which route an alert matches using amtool
amtool config routes test --config.file=alertmanager.yml \
  severity=critical service=payment
```

## Best Practices

- Use `group_by` to batch related alerts into single notifications and reduce noise
- Always set `send_resolved: true` on Slack receivers so teams know when issues clear
- Use inhibition rules to suppress warnings when a critical alert already fires for the same target
- Test routing with `amtool config routes test` before deploying changes
- Keep `group_wait` short (10-30s) for critical alerts and longer for warnings
- Use time-based muting for known maintenance windows instead of disabling alerts
