---
name: pagerduty
description: >-
  Configure PagerDuty for incident management, on-call scheduling, alert
  routing, and escalation policies. Use when a user needs to set up PagerDuty
  services, create escalation policies, configure integrations with monitoring
  tools, manage on-call rotations, or automate incident workflows.
license: Apache-2.0
compatibility: "PagerDuty API v2, Events API v2"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["pagerduty", "incident-management", "on-call", "escalation", "alerting"]
---

# PagerDuty

## Overview

Set up PagerDuty for incident management with on-call schedules, escalation policies, and integrations. Covers service creation, Events API, schedule management, and automation.

## Instructions

### Task A: Create Services and Escalation Policies

```bash
# Create an escalation policy
curl -X POST "https://api.pagerduty.com/escalation_policies" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "escalation_policy": {
      "name": "Platform Team Escalation",
      "escalation_rules": [
        { "escalation_delay_in_minutes": 10, "targets": [{ "id": "P1AB2CD", "type": "schedule_reference" }] },
        { "escalation_delay_in_minutes": 15, "targets": [{ "id": "PXYZ789", "type": "user_reference" }] }
      ],
      "repeat_enabled": true,
      "num_loops": 2
    }
  }'
```

```bash
# Create a service
curl -X POST "https://api.pagerduty.com/services" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "service": {
      "name": "Payment Service - Production",
      "escalation_policy": { "id": "PESCAL1", "type": "escalation_policy_reference" },
      "alert_creation": "create_alerts_and_incidents",
      "alert_grouping_parameters": { "type": "intelligent" },
      "incident_urgency_rule": {
        "type": "use_support_hours",
        "during_support_hours": { "type": "constant", "urgency": "high" },
        "outside_support_hours": { "type": "constant", "urgency": "low" }
      }
    }
  }'
```

### Task B: Send Alerts via Events API

```bash
# Trigger an alert
curl -X POST "https://events.pagerduty.com/v2/enqueue" \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "<INTEGRATION_KEY>",
    "event_action": "trigger",
    "dedup_key": "payment-service/high-error-rate/prod",
    "payload": {
      "summary": "Payment Service: Error rate exceeded 5% (currently 8.3%)",
      "severity": "critical",
      "source": "prometheus-alertmanager",
      "component": "payment-service",
      "group": "production",
      "custom_details": {
        "error_rate": "8.3%",
        "runbook": "https://wiki.internal/runbooks/payment-errors"
      }
    },
    "links": [{ "href": "https://grafana.internal/d/payments", "text": "Grafana Dashboard" }]
  }'
```

```bash
# Acknowledge an alert
curl -X POST "https://events.pagerduty.com/v2/enqueue" \
  -H "Content-Type: application/json" \
  -d '{ "routing_key": "<INTEGRATION_KEY>", "event_action": "acknowledge", "dedup_key": "payment-service/high-error-rate/prod" }'
```

```bash
# Resolve an alert
curl -X POST "https://events.pagerduty.com/v2/enqueue" \
  -H "Content-Type: application/json" \
  -d '{ "routing_key": "<INTEGRATION_KEY>", "event_action": "resolve", "dedup_key": "payment-service/high-error-rate/prod" }'
```

### Task C: On-Call Schedules

```bash
# Create a weekly rotation schedule
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
          { "user": { "id": "PUSER01", "type": "user_reference" } },
          { "user": { "id": "PUSER02", "type": "user_reference" } },
          { "user": { "id": "PUSER03", "type": "user_reference" } }
        ]
      }]
    }
  }'
```

```bash
# Get who is currently on call
curl -s "https://api.pagerduty.com/oncalls?schedule_ids[]=PSCHED1&earliest=true" \
  -H "Authorization: Token token=${PD_API_KEY}" | \
  jq '.oncalls[] | {user: .user.summary, start: .start, end: .end}'
```

### Task D: Manage Incidents

```bash
# List open incidents
curl -s "https://api.pagerduty.com/incidents?statuses[]=triggered&statuses[]=acknowledged" \
  -H "Authorization: Token token=${PD_API_KEY}" | \
  jq '.incidents[] | {id: .id, title: .title, status: .status, service: .service.summary}'
```

```bash
# Add a note to an incident
curl -X POST "https://api.pagerduty.com/incidents/${INCIDENT_ID}/notes" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "From: oncall@example.com" \
  -d '{ "note": { "content": "Root cause: connection pool exhaustion. Scaling up." } }'
```

## Best Practices

- Use `dedup_key` to prevent duplicate incidents for the same issue
- Set intelligent alert grouping to correlate related alerts
- Include runbook links and dashboard URLs in alert details
- Configure support hours to route low-urgency alerts during business hours only
- Rotate on-call weekly and limit shifts to avoid burnout
