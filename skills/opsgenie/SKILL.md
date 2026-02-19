---
name: opsgenie
description: >-
  Configure Opsgenie for alert management, on-call scheduling, routing rules,
  and incident response. Use when a user needs to set up alert routing,
  create escalation policies, manage on-call rotations, integrate with
  monitoring tools, or automate incident workflows with Opsgenie.
license: Apache-2.0
compatibility: "Opsgenie API v2"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["opsgenie", "alert-management", "on-call", "routing", "incident-response"]
---

# Opsgenie

## Overview

Set up Opsgenie for centralized alert management with routing rules, on-call schedules, escalation policies, and integrations.

## Instructions

### Task A: Create Teams and Routing

```bash
# Create a team
curl -X POST "https://api.opsgenie.com/v2/teams" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Platform Engineering",
    "description": "Infrastructure and platform services team",
    "members": [
      { "user": { "username": "marta@example.com" }, "role": "admin" },
      { "user": { "username": "tom@example.com" }, "role": "user" }
    ]
  }'
```

```bash
# Create a routing rule
curl -X POST "https://api.opsgenie.com/v2/teams/Platform%20Engineering/routing-rules" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Critical Production Alerts",
    "order": 0,
    "criteria": {
      "type": "match-all-conditions",
      "conditions": [
        { "field": "priority", "operation": "equals", "expectedValue": "P1" },
        { "field": "tags", "operation": "contains", "expectedValue": "production" }
      ]
    },
    "notify": { "type": "escalation", "name": "Platform Critical Escalation" }
  }'
```

### Task B: Create and Manage Alerts

```bash
# Create an alert
curl -X POST "https://api.opsgenie.com/v2/alerts" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Payment Service: Error rate exceeded 5%",
    "alias": "payment-service-error-rate-prod",
    "description": "Error rate is 8.3%. Affected: /api/charge, /api/refund",
    "responders": [{ "name": "Platform Engineering", "type": "team" }],
    "tags": ["production", "payment", "critical"],
    "priority": "P1",
    "entity": "payment-service",
    "details": { "error_rate": "8.3%", "runbook": "https://wiki.internal/runbooks/payment-errors" }
  }'
```

```bash
# Acknowledge an alert
curl -X POST "https://api.opsgenie.com/v2/alerts/payment-service-error-rate-prod/acknowledge?identifierType=alias" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "user": "marta@example.com", "note": "Investigating database connections." }'
```

```bash
# Close an alert
curl -X POST "https://api.opsgenie.com/v2/alerts/payment-service-error-rate-prod/close?identifierType=alias" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "user": "marta@example.com", "note": "Fixed connection pool. Error rate normal." }'
```

### Task C: On-Call Schedules

```bash
# Create an on-call schedule
curl -X POST "https://api.opsgenie.com/v2/schedules" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Platform Primary On-Call",
    "ownerTeam": { "name": "Platform Engineering" },
    "timezone": "America/New_York",
    "enabled": true,
    "rotations": [{
      "name": "Weekly Rotation",
      "type": "weekly",
      "startDate": "2026-02-23T09:00:00Z",
      "participants": [
        { "type": "user", "username": "marta@example.com" },
        { "type": "user", "username": "tom@example.com" }
      ]
    }]
  }'
```

### Task D: Escalation Policies

```bash
# Create an escalation policy
curl -X POST "https://api.opsgenie.com/v2/escalations" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Platform Critical Escalation",
    "ownerTeam": { "name": "Platform Engineering" },
    "rules": [
      { "condition": "if-not-acked", "notifyType": "default", "delay": { "timeAmount": 5 }, "recipient": { "type": "schedule", "name": "Platform Primary On-Call" } },
      { "condition": "if-not-acked", "notifyType": "default", "delay": { "timeAmount": 15 }, "recipient": { "type": "user", "username": "marta@example.com" } },
      { "condition": "if-not-acked", "notifyType": "all", "delay": { "timeAmount": 30 }, "recipient": { "type": "team", "name": "Platform Engineering" } }
    ],
    "repeat": { "waitInterval": 10, "count": 3, "resetRecipientStates": true }
  }'
```

### Task E: Alertmanager Integration

```yaml
# alertmanager.yml — Opsgenie receiver configuration
receivers:
  - name: 'opsgenie-critical'
    opsgenie_configs:
      - api_key: '<OG_API_KEY>'
        message: '{{ .CommonLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        priority: '{{ if eq .CommonLabels.severity "critical" }}P1{{ else }}P3{{ end }}'
        tags: '{{ .CommonLabels.environment }},{{ .CommonLabels.service }}'
        responders:
          - name: 'Platform Engineering'
            type: 'team'
```

## Best Practices

- Use alert aliases for deduplication
- Configure notification policies per user — P1 calls at night, P3 during work hours only
- Use routing rules to direct alerts based on tags and priority
- Add runbook URLs and dashboard links in alert details
- Use heartbeat monitoring to detect when integrations stop sending alerts
