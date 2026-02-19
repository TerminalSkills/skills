---
title: "Set Up an Incident Management Pipeline from Alerts to Status Page"
slug: set-up-incident-management-pipeline
description: "Configure an alerting pipeline from Prometheus through PagerDuty with escalation policies, Opsgenie routing, and automatic status page updates."
skills: [pagerduty, prometheus-alertmanager, statuspage, opsgenie]
category: devops
tags: [incident-management, alerting, pagerduty, statuspage, opsgenie, on-call, escalation]
---

# Set Up an Incident Management Pipeline from Alerts to Status Page

## The Problem

Nina leads the platform team at a SaaS company with 200 paying customers. When the payment service goes down at 2 AM, nobody gets paged — the alert sits in a Slack channel until morning. When a major outage happens, support fields dozens of tickets asking "is the service down?" because there is no public status page.

## The Solution

Wire Prometheus Alertmanager to PagerDuty and Opsgenie for alert routing and escalation, then automate Statuspage updates when incidents fire.

```bash
# Install the skills
npx terminal-skills install pagerduty prometheus-alertmanager statuspage opsgenie
```

## Step-by-Step Walkthrough

### 1. Define Alert Rules in Prometheus

```yaml
# prometheus/rules/critical-alerts.yml — Alerts that feed the incident pipeline
groups:
  - name: incident-pipeline-alerts
    rules:
      - alert: ServiceDown
        expr: up{job=~"payment-service|order-service|api-gateway"} == 0
        for: 2m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "{{ $labels.job }} is down"
          runbook: "https://wiki.internal/runbooks/{{ $labels.job }}-down"

      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
          / sum(rate(http_requests_total[5m])) by (service) > 0.05
        for: 5m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Error rate above 5% on {{ $labels.service }}"
```

### 2. Configure Alertmanager Routing

```yaml
# alertmanager.yml — Route to PagerDuty, Opsgenie, and status page webhook
global:
  resolve_timeout: 5m
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

route:
  receiver: 'opsgenie-default'
  group_by: ['alertname', 'service']
  group_wait: 30s
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      group_wait: 10s
      continue: true
    - match:
        severity: critical
      receiver: 'statuspage-webhook'
    - match:
        severity: warning
      receiver: 'opsgenie-warning'

receivers:
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '<PD_INTEGRATION_KEY>'
        severity: critical
        description: '{{ .CommonLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        details:
          runbook: '{{ .CommonAnnotations.runbook }}'

  - name: 'opsgenie-default'
    opsgenie_configs:
      - api_key: '<OG_API_KEY>'
        message: '{{ .CommonLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        priority: 'P3'

  - name: 'opsgenie-warning'
    opsgenie_configs:
      - api_key: '<OG_API_KEY>'
        message: '{{ .CommonLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        priority: 'P3'
        responders:
          - name: 'Platform Engineering'
            type: 'team'

  - name: 'statuspage-webhook'
    webhook_configs:
      - url: 'http://statuspage-bridge:8080/webhook'
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'service']
```

### 3. Set Up PagerDuty Escalation

Nina configures on-call rotation and escalation so critical alerts always reach someone.

```bash
# Create on-call schedule
curl -X POST "https://api.pagerduty.com/schedules" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "schedule": {
      "name": "Platform Primary On-Call",
      "time_zone": "America/New_York",
      "schedule_layers": [{
        "name": "Weekly Rotation",
        "start": "2026-02-23T09:00:00-05:00",
        "rotation_virtual_start": "2026-02-23T09:00:00-05:00",
        "rotation_turn_length_seconds": 604800,
        "users": [
          { "user": { "id": "PNINA01", "type": "user_reference" } },
          { "user": { "id": "PTOM02", "type": "user_reference" } },
          { "user": { "id": "PSAM03", "type": "user_reference" } }
        ]
      }]
    }
  }'
```

```bash
# Create escalation policy
curl -X POST "https://api.pagerduty.com/escalation_policies" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "escalation_policy": {
      "name": "Platform Critical Escalation",
      "escalation_rules": [
        { "escalation_delay_in_minutes": 5, "targets": [{ "id": "PSCHED1", "type": "schedule_reference" }] },
        { "escalation_delay_in_minutes": 10, "targets": [{ "id": "PNINA01", "type": "user_reference" }] },
        { "escalation_delay_in_minutes": 15, "targets": [{ "id": "PTEAM_ALL", "type": "user_reference" }] }
      ],
      "repeat_enabled": true,
      "num_loops": 3
    }
  }'
```

### 4. Automate Status Page Updates

A small bridge service receives webhooks from Alertmanager and creates/resolves Statuspage incidents automatically.

```python
# statuspage-bridge/app.py — Auto-update Statuspage from Alertmanager webhooks
from flask import Flask, request
import requests, os

app = Flask(__name__)
STATUSPAGE_API = "https://api.statuspage.io/v1"
PAGE_ID = os.environ["STATUSPAGE_PAGE_ID"]
HEADERS = {"Authorization": f"OAuth {os.environ['STATUSPAGE_API_KEY']}", "Content-Type": "application/json"}
COMPONENT_MAP = {"payment-service": "comp-payment", "order-service": "comp-orders", "api-gateway": "comp-gateway"}
active_incidents = {}

@app.route("/webhook", methods=["POST"])
def handle_alert():
    for alert in request.json.get("alerts", []):
        service = alert["labels"].get("service", "unknown")
        component_id = COMPONENT_MAP.get(service)

        if alert["status"] == "firing" and service not in active_incidents:
            resp = requests.post(f"{STATUSPAGE_API}/pages/{PAGE_ID}/incidents", headers=HEADERS, json={
                "incident": {
                    "name": f"Issue detected on {service}",
                    "status": "investigating",
                    "impact_override": "major",
                    "body": f"We are investigating an issue with {service}. Our team has been notified.",
                    "components": {component_id: "major_outage"} if component_id else {},
                }
            })
            active_incidents[service] = resp.json()["id"]

        elif alert["status"] == "resolved" and service in active_incidents:
            requests.patch(f"{STATUSPAGE_API}/pages/{PAGE_ID}/incidents/{active_incidents.pop(service)}", headers=HEADERS, json={
                "incident": {
                    "status": "resolved",
                    "body": f"{service} is operating normally.",
                    "components": {component_id: "operational"} if component_id else {},
                }
            })
    return {"ok": True}
```

### 5. Test End-to-End

```bash
# Send a test alert through the full pipeline
curl -X POST http://alertmanager:9093/api/v2/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": { "alertname": "ServiceDown", "severity": "critical", "service": "payment-service", "team": "platform" },
    "annotations": { "summary": "payment-service is down" }
  }]'
```

Within seconds: PagerDuty pages the on-call engineer, Opsgenie creates a team alert, and the status page shows "Investigating" for Payment API.

## The Result

The next 2 AM outage pages the on-call engineer in 30 seconds. The status page updates automatically so customers see the issue without opening support tickets. When the fix deploys, everything resolves automatically. Support ticket volume during incidents drops 70%.
