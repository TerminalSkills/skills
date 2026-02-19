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

Nina leads the platform team at a SaaS company with 200 paying customers. When the payment service goes down at 2 AM, nobody gets paged — the alert sits in a Slack channel until someone checks it in the morning. When a major outage happens, the support team fields dozens of tickets asking "is the service down?" because there is no public status page. The on-call rotation exists on a shared spreadsheet that nobody updates.

Nina needs alerts to page the right person automatically, escalate if nobody responds, and update a public status page so customers know what is happening without opening a support ticket.

## The Solution

Wire Prometheus Alertmanager to PagerDuty and Opsgenie for alert routing and escalation, then automate Statuspage updates when incidents are created. Each tool handles one step in the pipeline: detect → notify → escalate → communicate.

```bash
# Install the skills
npx terminal-skills install pagerduty prometheus-alertmanager statuspage opsgenie
```

## Step-by-Step Walkthrough

### 1. Define Alert Rules in Prometheus

Nina starts by defining the alert rules that will trigger the incident pipeline. These run in Prometheus and fire when conditions are met.

```yaml
# prometheus/rules/critical-alerts.yml — Alert rules for the incident pipeline
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
          description: "{{ $labels.job }} on {{ $labels.instance }} has been unreachable for 2 minutes."
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
          description: "{{ $labels.service }} error rate is {{ $value | humanizePercentage }}."

      - alert: HighLatency
        expr: |
          histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)) > 5
        for: 10m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "P99 latency above 5s on {{ $labels.service }}"
```

### 2. Configure Alertmanager Routing

Alertmanager receives these alerts and routes them to PagerDuty for critical alerts and Opsgenie for warnings. Critical alerts also trigger the status page automation.

```yaml
# alertmanager.yml — Route alerts to PagerDuty and Opsgenie
global:
  resolve_timeout: 5m
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'
  opsgenie_api_url: 'https://api.opsgenie.com/'

route:
  receiver: 'opsgenie-default'
  group_by: ['alertname', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      group_wait: 10s
      repeat_interval: 1h
      continue: true
    - match:
        severity: critical
      receiver: 'statuspage-webhook'
    - match:
        severity: warning
      receiver: 'opsgenie-warning'
      repeat_interval: 4h

receivers:
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '<PD_INTEGRATION_KEY>'
        severity: critical
        description: '{{ .CommonLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        details:
          service: '{{ .CommonLabels.service }}'
          runbook: '{{ .CommonAnnotations.runbook }}'

  - name: 'opsgenie-default'
    opsgenie_configs:
      - api_key: '<OG_API_KEY>'
        message: '{{ .CommonLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        priority: 'P3'
        tags: '{{ .CommonLabels.team }}'

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

### 3. Set Up PagerDuty Escalation Policies

Nina configures PagerDuty with a proper on-call schedule and escalation policy so critical alerts always reach someone.

```bash
# Create the on-call schedule — weekly rotation
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
# Create escalation policy — page on-call, then team lead, then everyone
curl -X POST "https://api.pagerduty.com/escalation_policies" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "escalation_policy": {
      "name": "Platform Critical Escalation",
      "escalation_rules": [
        {
          "escalation_delay_in_minutes": 5,
          "targets": [{ "id": "PSCHED1", "type": "schedule_reference" }]
        },
        {
          "escalation_delay_in_minutes": 10,
          "targets": [{ "id": "PNINA01", "type": "user_reference" }]
        },
        {
          "escalation_delay_in_minutes": 15,
          "targets": [{ "id": "PTEAM_ALL", "type": "user_reference" }]
        }
      ],
      "repeat_enabled": true,
      "num_loops": 3
    }
  }'
```

If the on-call engineer does not acknowledge within 5 minutes, PagerDuty escalates to Nina. If she does not respond in another 10 minutes, the entire team gets paged. The policy repeats 3 times before giving up.

### 4. Configure Opsgenie for Secondary Routing

Nina uses Opsgenie as a secondary alert manager for warnings and for teams outside of platform engineering. Opsgenie handles notification preferences — some engineers prefer SMS, others prefer phone calls at night.

```bash
# Create notification policy — P1 alerts call immediately, P3 alerts only during business hours
curl -X POST "https://api.opsgenie.com/v2/users/nina@example.com/notification-rules" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Critical alerts — always call",
    "actionType": "create-alert",
    "criteria": {
      "type": "match-all-conditions",
      "conditions": [{ "field": "priority", "operation": "equals", "expectedValue": "P1" }]
    },
    "notificationTime": ["just-before"],
    "steps": [
      { "contact": { "method": "voice", "to": "+1555123456" }, "sendAfter": { "timeAmount": 0 } },
      { "contact": { "method": "sms", "to": "+1555123456" }, "sendAfter": { "timeAmount": 1 } }
    ],
    "timeRestriction": { "type": "time-of-day", "restriction": { "startHour": 0, "endHour": 24 } },
    "enabled": true
  }'
```

### 5. Automate Status Page Updates

The final piece: when a critical alert fires, the status page should update automatically so customers see the issue before they need to open a support ticket.

```python
# statuspage-bridge/app.py — Webhook receiver that updates Statuspage from Alertmanager
from flask import Flask, request
import requests
import os

app = Flask(__name__)

STATUSPAGE_API = "https://api.statuspage.io/v1"
PAGE_ID = os.environ["STATUSPAGE_PAGE_ID"]
HEADERS = {
    "Authorization": f"OAuth {os.environ['STATUSPAGE_API_KEY']}",
    "Content-Type": "application/json",
}

COMPONENT_MAP = {
    "payment-service": "comp-payment-id",
    "order-service": "comp-orders-id",
    "api-gateway": "comp-gateway-id",
}

active_incidents = {}

@app.route("/webhook", methods=["POST"])
def handle_alert():
    data = request.json
    for alert in data.get("alerts", []):
        service = alert["labels"].get("service", "unknown")
        status = alert["status"]
        component_id = COMPONENT_MAP.get(service)

        if status == "firing" and service not in active_incidents:
            # Create incident on status page
            resp = requests.post(
                f"{STATUSPAGE_API}/pages/{PAGE_ID}/incidents",
                headers=HEADERS,
                json={
                    "incident": {
                        "name": f"Degraded performance on {service}",
                        "status": "investigating",
                        "impact_override": "major" if alert["labels"].get("severity") == "critical" else "minor",
                        "body": f"We are investigating an issue affecting {service}. Our team has been automatically notified.",
                        "component_ids": [component_id] if component_id else [],
                        "components": {component_id: "major_outage"} if component_id else {},
                    }
                },
            )
            active_incidents[service] = resp.json()["id"]

        elif status == "resolved" and service in active_incidents:
            # Resolve the incident
            incident_id = active_incidents.pop(service)
            requests.patch(
                f"{STATUSPAGE_API}/pages/{PAGE_ID}/incidents/{incident_id}",
                headers=HEADERS,
                json={
                    "incident": {
                        "status": "resolved",
                        "body": f"The issue with {service} has been resolved. Service is operating normally.",
                        "components": {component_id: "operational"} if component_id else {},
                    }
                },
            )

    return {"status": "ok"}, 200
```

This bridge service runs inside the cluster. When Alertmanager sends a webhook for a firing critical alert, it creates a Statuspage incident. When Alertmanager sends the resolved webhook, it closes the incident and restores the component to operational.

### 6. Test the Full Pipeline

Nina tests the pipeline end-to-end by sending a test alert to Alertmanager.

```bash
# Send a test alert through the pipeline
curl -X POST http://alertmanager:9093/api/v2/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {
      "alertname": "ServiceDown",
      "severity": "critical",
      "service": "payment-service",
      "team": "platform"
    },
    "annotations": {
      "summary": "payment-service is down",
      "description": "Test alert to verify incident pipeline."
    }
  }]'
```

Within seconds: PagerDuty pages the on-call engineer, Opsgenie creates an alert for the team, and the public status page shows "Investigating" for the Payment API component.

## The Result

The next time the payment service has an outage at 2 AM, the on-call engineer gets a phone call within 30 seconds. The status page updates automatically, so customers see "We are investigating an issue affecting payments" instead of wondering whether the service is down. When the engineer resolves the issue, the status page clears automatically. Support ticket volume during incidents drops by 70% because customers can self-serve the status page. The entire pipeline from detection to customer communication takes under a minute with no manual intervention.
