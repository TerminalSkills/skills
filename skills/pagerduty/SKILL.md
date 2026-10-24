---
name: pagerduty
description: >-
  Configure PagerDuty for incident management, on-call scheduling, alert
  routing, and escalation policies. Use when a user needs to set up PagerDuty
  services, create escalation policies, configure integrations with monitoring
  tools, manage on-call rotations, or automate incident workflows.
license: Apache-2.0
compatibility: "PagerDuty REST API v2 and Events API v2; curl, jq and a REST API key (PD_API_KEY) or OAuth token"
metadata:
  author: terminal-skills
  repository: https://github.com/PagerDuty/api-schema
  version: "1.1.0"
  category: devops
  tags: ["pagerduty", "incident-management", "on-call", "escalation", "alerting"]
---

# PagerDuty

## Overview

Set up PagerDuty for incident management with on-call schedules, escalation policies, and integrations. Covers service creation, Events API for triggering alerts, schedule management, and automation via the REST API.

## Instructions

REST calls go to `https://api.pagerduty.com` with `Authorization: Token token=${PD_API_KEY}` (an OAuth access token uses `Authorization: Bearer ...`). The API expects `Accept: application/vnd.pagerduty+json;version=2` for versioning; the snippets below omit it for brevity, so add `-H "Accept: application/vnd.pagerduty+json;version=2"` in real scripts. Events API calls need no API key, only the integration's routing key (`PD_ROUTING_KEY`).

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
        {
          "escalation_delay_in_minutes": 10,
          "targets": [
            { "id": "P1AB2CD", "type": "schedule_reference" }
          ]
        },
        {
          "escalation_delay_in_minutes": 15,
          "targets": [
            { "id": "PXYZ789", "type": "user_reference" }
          ]
        }
      ],
      "num_loops": 2
    }
  }'
```

```bash
# Create a service with the escalation policy
curl -X POST "https://api.pagerduty.com/services" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "service": {
      "name": "Payment Service - Production",
      "description": "Payment processing microservice",
      "escalation_policy": { "id": "PESCAL1", "type": "escalation_policy_reference" },
      "alert_creation": "create_alerts_and_incidents",
      "auto_resolve_timeout": 14400,
      "acknowledgement_timeout": 1800,
      "incident_urgency_rule": {
        "type": "use_support_hours",
        "during_support_hours": { "type": "constant", "urgency": "high" },
        "outside_support_hours": { "type": "constant", "urgency": "low" }
      },
      "support_hours": {
        "type": "fixed_time_per_day",
        "time_zone": "America/New_York",
        "days_of_week": [1, 2, 3, 4, 5],
        "start_time": "08:00:00",
        "end_time": "20:00:00"
      }
    }
  }'
```

Alert grouping on a service is configured through the Alert Grouping Settings resource; the `alert_grouping_parameters` field on a service is deprecated.

```bash
curl -X POST "https://api.pagerduty.com/alert_grouping_settings" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "alert_grouping_setting": {
      "name": "Payment alerts by component",
      "type": "content_based",
      "config": { "time_window": 900, "aggregate": "all", "fields": ["summary", "component"] },
      "services": [{ "id": "PSVC_PAY", "type": "service_reference" }]
    }
  }'
```

Grouping features depend on the plan; the API returns an error if yours does not include the chosen type.

### Task B: Send Alerts via Events API

```bash
# Trigger an alert
curl -X POST "https://events.pagerduty.com/v2/enqueue" \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "'"${PD_ROUTING_KEY}"'",
    "event_action": "trigger",
    "dedup_key": "payment-service/high-error-rate/prod",
    "payload": {
      "summary": "Payment Service: Error rate exceeded 5% (currently 8.3%)",
      "severity": "critical",
      "source": "prometheus-alertmanager",
      "component": "payment-service",
      "group": "production",
      "class": "error_rate",
      "custom_details": {
        "error_rate": "8.3%",
        "threshold": "5%",
        "affected_endpoints": ["/api/charge", "/api/refund"],
        "runbook": "https://wiki.internal/runbooks/payment-errors"
      }
    },
    "links": [
      { "href": "https://grafana.internal/d/payments", "text": "Grafana Dashboard" }
    ]
  }'
```

```bash
# Acknowledge an alert
curl -X POST "https://events.pagerduty.com/v2/enqueue" \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "'"${PD_ROUTING_KEY}"'",
    "event_action": "acknowledge",
    "dedup_key": "payment-service/high-error-rate/prod"
  }'
```

```bash
# Resolve an alert
curl -X POST "https://events.pagerduty.com/v2/enqueue" \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "'"${PD_ROUTING_KEY}"'",
    "event_action": "resolve",
    "dedup_key": "payment-service/high-error-rate/prod"
  }'
```

### Task C: On-Call Schedules

```bash
# Create a weekly rotation schedule
curl -X POST "https://api.pagerduty.com/schedules" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "schedule": {
      "name": "Platform Team Primary On-Call",
      "time_zone": "America/New_York",
      "schedule_layers": [
        {
          "name": "Weekly Rotation",
          "start": "2026-11-02T09:00:00-05:00",
          "rotation_virtual_start": "2026-11-02T09:00:00-05:00",
          "rotation_turn_length_seconds": 604800,
          "users": [
            { "user": { "id": "PUSER01", "type": "user_reference" } },
            { "user": { "id": "PUSER02", "type": "user_reference" } },
            { "user": { "id": "PUSER03", "type": "user_reference" } }
          ],
          "restrictions": [
            {
              "type": "daily_restriction",
              "start_time_of_day": "09:00:00",
              "duration_seconds": 57600
            }
          ]
        }
      ]
    }
  }'
```

```bash
# Get who is currently on call
curl -s "https://api.pagerduty.com/oncalls?schedule_ids[]=PSCHED1&earliest=true" \
  -H "Authorization: Token token=${PD_API_KEY}" | \
  jq '.oncalls[] | {user: .user.summary, schedule: .schedule.summary, start: .start, end: .end}'
```

### Task D: Incident Management

```bash
# List open incidents
curl -s "https://api.pagerduty.com/incidents?statuses[]=triggered&statuses[]=acknowledged" \
  -H "Authorization: Token token=${PD_API_KEY}" | \
  jq '.incidents[] | {id: .id, title: .title, status: .status, urgency: .urgency, service: .service.summary, created: .created_at}'
```

```bash
# Add a note to an incident
curl -X POST "https://api.pagerduty.com/incidents/${INCIDENT_ID}/notes" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "From: maria.lopez@northwind-logistics.io" \
  -d '{
    "note": {
      "content": "Identified root cause: connection pool exhaustion on db-primary. Scaling up connections from 100 to 200."
    }
  }'
```

### Task E: Automation with Event Orchestration

```bash
# Replace the router rules of a global orchestration (rules left out of the request are deleted)
curl -X PUT "https://api.pagerduty.com/event_orchestrations/${ORCH_ID}/router" \
  -H "Authorization: Token token=${PD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "orchestration_path": {
      "sets": [
        {
          "id": "start",
          "rules": [
            {
              "label": "Route payments alerts",
              "conditions": [
                { "expression": "event.component matches part '\''payment'\''" }
              ],
              "actions": {
                "route_to": { "service": { "id": "PSVC_PAY", "type": "service_reference" } }
              }
            },
            {
              "label": "Suppress health checks",
              "conditions": [
                { "expression": "event.summary matches part '\''health check'\''" }
              ],
              "actions": { "suppress": true }
            }
          ]
        }
      ],
      "catch_all": {
        "actions": {
          "route_to": { "service": { "id": "PSVC_DEFAULT", "type": "service_reference" } }
        }
      }
    }
  }'
```

## Examples

### Example 1: Page the on-call engineer for a failing payment service

**User request:** "Wire Alertmanager to PagerDuty so a payment error rate above 5% pages whoever is on call."

Create the escalation policy and service (Task A), add an Events API v2 integration to the service in the PagerDuty UI and export its routing key as `PD_ROUTING_KEY`, then send the trigger from Task B. A successful call returns:

```json
{"status": "success", "message": "Event processed", "dedup_key": "payment-service/high-error-rate/prod"}
```

Sending the same `dedup_key` with `resolve` closes the incident when the error rate recovers.

### Example 2: Find who is on call right now

**User request:** "Who is on call for the platform schedule?"

```bash
curl -s "https://api.pagerduty.com/oncalls?schedule_ids[]=PSCHED1&earliest=true" \
  -H "Authorization: Token token=${PD_API_KEY}" | jq -r '.oncalls[] | "\(.user.summary) until \(.end)"'
```

Prints one line per escalation level, for example `Dana Whitfield until 2026-11-09T09:00:00-05:00`.

## Guidelines

- Keep `PD_API_KEY` and routing keys in environment variables or a secret store, never in the repository; a REST key can read and change the whole account unless it is read-only
- Notes, incident updates and other write calls on incidents need a `From` header with the email of a valid PagerDuty user
- List endpoints are paginated (`limit` up to 100, `offset`, `more`); loop until `more` is false
- Use `dedup_key` to prevent duplicate incidents for the same issue
- Set intelligent alert grouping to automatically correlate related alerts
- Include runbook links and dashboard URLs in alert custom details
- Configure support hours to route low-urgency alerts during business hours only
- Rotate on-call weekly and limit shifts to avoid burnout
- Use event orchestration to suppress noisy alerts and enrich events before routing
