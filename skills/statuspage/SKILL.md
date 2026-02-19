---
name: statuspage
description: >-
  Configure and manage status pages for incident communication and service
  health transparency. Use when a user needs to set up Atlassian Statuspage
  or open-source alternatives, manage components and incidents, automate
  status updates, or integrate with monitoring and alerting tools.
license: Apache-2.0
compatibility: "Atlassian Statuspage API v1, Cachet, Instatus"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["statuspage", "incident-communication", "status-page", "uptime", "components"]
---

# Statuspage

## Overview

Set up and manage status pages for communicating service health to users and stakeholders. Covers Atlassian Statuspage API, component management, incident lifecycle, and automation.

## Instructions

### Task A: Manage Components

```bash
# List all components
curl -s "https://api.statuspage.io/v1/pages/${PAGE_ID}/components" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" | \
  jq '.[] | {id: .id, name: .name, status: .status}'
```

```bash
# Create a component
curl -X POST "https://api.statuspage.io/v1/pages/${PAGE_ID}/components" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "component": {
      "name": "Payment API",
      "description": "Handles payment processing and billing",
      "status": "operational",
      "showcase": true
    }
  }'
```

```bash
# Update component status
curl -X PATCH "https://api.statuspage.io/v1/pages/${PAGE_ID}/components/${COMPONENT_ID}" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "component": { "status": "degraded_performance" } }'
```

### Task B: Create and Manage Incidents

```bash
# Create a new incident
curl -X POST "https://api.statuspage.io/v1/pages/${PAGE_ID}/incidents" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "incident": {
      "name": "Elevated error rates on Payment API",
      "status": "investigating",
      "impact_override": "minor",
      "body": "We are investigating elevated error rates affecting payment processing.",
      "component_ids": ["payment-api-component-id"],
      "components": { "payment-api-component-id": "degraded_performance" }
    }
  }'
```

```bash
# Update incident with progress
curl -X PATCH "https://api.statuspage.io/v1/pages/${PAGE_ID}/incidents/${INCIDENT_ID}" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "incident": {
      "status": "identified",
      "body": "The issue has been identified as a misconfigured connection pool. A fix is being deployed."
    }
  }'
```

```bash
# Resolve incident
curl -X PATCH "https://api.statuspage.io/v1/pages/${PAGE_ID}/incidents/${INCIDENT_ID}" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "incident": {
      "status": "resolved",
      "body": "The connection pool has been reconfigured. Service is operating normally.",
      "components": { "payment-api-component-id": "operational" }
    }
  }'
```

### Task C: Scheduled Maintenance

```bash
# Create a scheduled maintenance window
curl -X POST "https://api.statuspage.io/v1/pages/${PAGE_ID}/incidents" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "incident": {
      "name": "Database maintenance - Read-only mode",
      "status": "scheduled",
      "scheduled_for": "2026-02-22T02:00:00Z",
      "scheduled_until": "2026-02-22T04:00:00Z",
      "body": "Database maintenance requiring a 2-hour read-only window.",
      "component_ids": ["database-component-id"]
    }
  }'
```

### Task D: Automation Script

```python
# statuspage_automation.py — Auto-update status page from monitoring alerts
import requests
import os

STATUSPAGE_API = "https://api.statuspage.io/v1"
PAGE_ID = os.environ["STATUSPAGE_PAGE_ID"]
API_KEY = os.environ["STATUSPAGE_API_KEY"]
HEADERS = {"Authorization": f"OAuth {API_KEY}", "Content-Type": "application/json"}

COMPONENT_MAP = {
    "payment-service": "component-id-payment",
    "order-service": "component-id-orders",
    "api-gateway": "component-id-gateway",
}

def create_incident(service: str, severity: str, description: str) -> str:
    component_id = COMPONENT_MAP.get(service)
    impact = "major" if severity == "critical" else "minor"
    component_status = "major_outage" if severity == "critical" else "degraded_performance"

    resp = requests.post(f"{STATUSPAGE_API}/pages/{PAGE_ID}/incidents", headers=HEADERS, json={
        "incident": {
            "name": f"{service}: {description[:80]}",
            "status": "investigating",
            "impact_override": impact,
            "body": f"We are investigating an issue with {service}. Details: {description}",
            "component_ids": [component_id] if component_id else [],
            "components": {component_id: component_status} if component_id else {},
        }
    })
    return resp.json()["id"]

def resolve_incident(incident_id: str, service: str):
    component_id = COMPONENT_MAP.get(service)
    requests.patch(f"{STATUSPAGE_API}/pages/{PAGE_ID}/incidents/{incident_id}", headers=HEADERS, json={
        "incident": {
            "status": "resolved",
            "body": f"The issue with {service} has been resolved.",
            "components": {component_id: "operational"} if component_id else {},
        }
    })
```

## Best Practices

- Update status pages within 5 minutes of detecting an incident
- Use clear, non-technical language in incident updates
- Follow the lifecycle: investigating → identified → monitoring → resolved
- Automate component status updates from monitoring alerts
- Schedule maintenance windows at least 48 hours in advance
