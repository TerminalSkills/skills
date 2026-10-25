---
name: opsgenie
description: >-
  Opsgenie is Atlassian's alert and on-call management service, driven through
  its REST API v2. Use when a user needs to set up alert routing, escalation
  policies, on-call rotations, Alertmanager integration, or to plan the move
  away from Opsgenie before its April 2027 end of support.
license: Apache-2.0
compatibility: "Opsgenie API v2"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "opsgenie, alert-management, on-call, routing, incident-response"
---

# Opsgenie

## Overview

Set up Opsgenie for centralized alert management with routing rules, on-call schedules, escalation policies, and integrations, using the REST API v2 with a `GenieKey` API key.

**Lifecycle warning:** Atlassian stopped selling Opsgenie on 4 June 2025 and ends support on 5 April 2027. Existing subscriptions keep working until then. Atlassian's documented migration paths move Opsgenie into a Jira Service Management Cloud site; do not recommend Opsgenie to a team that does not already have it.

Accounts in the EU region must use `https://api.eu.opsgenie.com` instead of `https://api.opsgenie.com` in every command below. Keep the key in an environment variable (`OG_API_KEY`); use a key with only the access rights the task needs.

## Instructions

Create things in this order, because each refers to the previous one by name: team, schedule (Task C), escalation (Task D), routing rule (Task A, second command). Most name-based lookups need the matching `...IdentifierType=name` query parameter; without it the API treats the value as an id.

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
      { "user": { "username": "marta@shipfast.io" }, "role": "admin" },
      { "user": { "username": "tom@shipfast.io" }, "role": "user" },
      { "user": { "username": "nina@shipfast.io" }, "role": "user" }
    ]
  }'
```

```bash
# Create a routing rule for the team
curl -X POST "https://api.opsgenie.com/v2/teams/Platform%20Engineering/routing-rules?teamIdentifierType=name" \
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
    "notify": {
      "type": "escalation",
      "name": "Platform Critical Escalation"
    },
    "timezone": "America/New_York"
  }'
```

### Task B: Create Alerts

```bash
# Create an alert
curl -X POST "https://api.opsgenie.com/v2/alerts" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Payment Service: Error rate exceeded 5%",
    "alias": "payment-service-error-rate-prod",
    "description": "Error rate for payment-service in production has exceeded the 5% threshold. Current rate: 8.3%.\n\nAffected endpoints: /api/charge, /api/refund\nDashboard: https://grafana.internal/d/payments",
    "responders": [
      { "name": "Platform Engineering", "type": "team" }
    ],
    "tags": ["production", "payment", "critical"],
    "priority": "P1",
    "entity": "payment-service",
    "source": "prometheus-alertmanager",
    "details": {
      "error_rate": "8.3%",
      "threshold": "5%",
      "runbook": "https://wiki.internal/runbooks/payment-errors"
    }
  }'
```

```bash
# Acknowledge an alert
curl -X POST "https://api.opsgenie.com/v2/alerts/payment-service-error-rate-prod/acknowledge?identifierType=alias" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "user": "marta@shipfast.io", "note": "Investigating — checking database connections." }'
```

```bash
# Close an alert
curl -X POST "https://api.opsgenie.com/v2/alerts/payment-service-error-rate-prod/close?identifierType=alias" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "user": "marta@shipfast.io", "note": "Fixed connection pool sizing. Error rate back to normal." }'
```

### Task C: On-Call Schedules

```bash
# Create an on-call schedule with weekly rotation
curl -X POST "https://api.opsgenie.com/v2/schedules" \
  -H "Authorization: GenieKey ${OG_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Platform Primary On-Call",
    "ownerTeam": { "name": "Platform Engineering" },
    "timezone": "America/New_York",
    "enabled": true,
    "rotations": [
      {
        "name": "Weekday Rotation",
        "type": "weekly",
        "startDate": "2026-02-23T09:00:00Z",
        "participants": [
          { "type": "user", "username": "marta@shipfast.io" },
          { "type": "user", "username": "tom@shipfast.io" },
          { "type": "user", "username": "nina@shipfast.io" }
        ],
        "timeRestriction": {
          "type": "weekday-and-time-of-day",
          "restrictions": [
            { "startDay": "monday", "startHour": 9, "startMin": 0, "endDay": "friday", "endHour": 18, "endMin": 0 }
          ]
        }
      }
    ]
  }'
```

```bash
# Get current on-call participants
curl -s "https://api.opsgenie.com/v2/schedules/Platform%20Primary%20On-Call/on-calls?scheduleIdentifierType=name&flat=true" \
  -H "Authorization: GenieKey ${OG_API_KEY}" | \
  jq '.data.onCallRecipients'
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
      {
        "condition": "if-not-acked",
        "notifyType": "default",
        "delay": { "timeAmount": 5 },
        "recipient": { "type": "schedule", "name": "Platform Primary On-Call" }
      },
      {
        "condition": "if-not-acked",
        "notifyType": "default",
        "delay": { "timeAmount": 15 },
        "recipient": { "type": "user", "username": "marta@shipfast.io" }
      },
      {
        "condition": "if-not-acked",
        "notifyType": "all",
        "delay": { "timeAmount": 30 },
        "recipient": { "type": "team", "name": "Platform Engineering" }
      }
    ],
    "repeat": { "waitInterval": 10, "count": 3, "resetRecipientStates": true }
  }'
```

### Task E: Integration with Prometheus Alertmanager

```yaml
# alertmanager.yml — Opsgenie receiver configuration
receivers:
  - name: 'opsgenie-critical'
    opsgenie_configs:
      - api_key_file: '/etc/alertmanager/secrets/opsgenie_api_key'
        # api_url: 'https://api.eu.opsgenie.com/'   # EU accounts only
        message: '{{ .CommonLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        description: '{{ .CommonAnnotations.description }}'
        priority: '{{ if eq .CommonLabels.severity "critical" }}P1{{ else if eq .CommonLabels.severity "warning" }}P3{{ else }}P5{{ end }}'
        tags: '{{ .CommonLabels.environment }},{{ .CommonLabels.service }}'
        entity: '{{ .CommonLabels.service }}'
        source: 'prometheus'
        responders:
          - name: 'Platform Engineering'
            type: 'team'
        details:
          alertname: '{{ .CommonLabels.alertname }}'
          cluster: '{{ .CommonLabels.cluster }}'
```

## Examples

### Example 1: "Page the platform team when payments errors spike"

Run Task A (team), Task C (schedule), Task D (escalation), then the routing rule. Send the alert from Task B. Result: the create call answers `202` with `"result": "Request will be processed"` and a `requestId`; the alert appears for Platform Engineering, notifies the on-call user, and escalates after 5, 15 and 30 minutes until acknowledged.

### Example 2: "Who is on call right now?"

Run the on-calls request from Task C with `flat=true`. Result: `{"data": {"onCallRecipients": ["marta@shipfast.io"], ...}}`.

## Guidelines

- Use alert aliases for deduplication so the same issue doesn't create multiple alerts
- Configure notification policies per user — allow P1 alerts to phone at night, P3 only during work hours
- Use routing rules to direct alerts to the correct team based on tags and priority
- Set escalation timeouts based on SLA requirements — shorter for P1, longer for P3
- Add runbook URLs and dashboard links in alert details for faster resolution
- Use heartbeat monitoring to detect when integrations stop sending alerts
