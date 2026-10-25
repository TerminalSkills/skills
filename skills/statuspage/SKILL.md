---
name: statuspage
description: >-
  Atlassian Statuspage is a hosted status page service with a REST API for components, incidents and scheduled maintenance. Use this skill to list and update component status, open, update and resolve incidents, schedule maintenance windows, and automate all of it from monitoring alerts with curl or Python. Use when someone says "update our status page", "create a Statuspage incident", "schedule maintenance on the status page" or "post alerts to Statuspage".
license: Apache-2.0
compatibility: "Atlassian Statuspage REST API v1, curl, jq, Python 3 with requests"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "statuspage, incident-communication, status-page, uptime, components"
---

# Statuspage

## Overview

Atlassian Statuspage exposes a REST API at `https://api.statuspage.io/v1/`. Everything hangs off a page (`pages/{page_id}`): components (the things users see, each with a status), and incidents. Scheduled maintenance is also an incident, with `scheduled_*` fields.

Authentication is an API key from the Statuspage account's API info page, sent as `Authorization: OAuth <key>` (the word is `OAuth`, not `Bearer`). Each key is limited to 1 request per second over a 60-second rolling window; 420 and 429 mean you were throttled, so space out bulk updates. The examples read `STATUSPAGE_API_KEY` and `STATUSPAGE_PAGE_ID` from the environment. IDs are short alphanumeric strings such as `4g812xxgm6ws`, taken from the list calls.

Values you need:
- Component status: `operational`, `under_maintenance`, `degraded_performance`, `partial_outage`, `major_outage`.
- Real-time incident status: `investigating`, `identified`, `monitoring`, `resolved`.
- Scheduled maintenance status: `scheduled`, `in_progress`, `verifying`, `completed`.
- `impact_override`: `none`, `minor`, `major`, `critical`.

## Instructions

### Task A: Components

```bash
curl -s "https://api.statuspage.io/v1/pages/${STATUSPAGE_PAGE_ID}/components" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" | jq '.[] | {id, name, status}'

curl -s -X POST "https://api.statuspage.io/v1/pages/${STATUSPAGE_PAGE_ID}/components" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" -H "Content-Type: application/json" \
  -d '{"component": {"name": "Payment API", "description": "Card payments and billing", "status": "operational", "showcase": true}}'

curl -s -X PATCH "https://api.statuspage.io/v1/pages/${STATUSPAGE_PAGE_ID}/components/${COMPONENT_ID}" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" -H "Content-Type: application/json" \
  -d '{"component": {"status": "degraded_performance"}}'
```

Add a `group_id` field with the id of an existing component group (for example `"group_id": "kz3m8w1x6vq2"`) to file a component under that group.

### Task B: Incident lifecycle

Create with the affected components in both `component_ids` and the `components` map (id to status). The status page and subscribers update immediately unless you add `"deliver_notifications": false`.

```bash
curl -s -X POST "https://api.statuspage.io/v1/pages/${STATUSPAGE_PAGE_ID}/incidents" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" -H "Content-Type: application/json" \
  -d '{"incident": {
    "name": "Elevated error rates on Payment API",
    "status": "investigating",
    "impact_override": "minor",
    "body": "We are investigating elevated error rates on payments. Some transactions may fail.",
    "component_ids": ["'"${COMPONENT_ID}"'"],
    "components": {"'"${COMPONENT_ID}"'": "degraded_performance"}
  }}' | jq '{id, status, shortlink}'
```

Post updates by PATCHing the incident, moving through `identified` and `monitoring` to `resolved`. Resolve with the components set back to `operational`, otherwise they stay degraded on the page:

```bash
curl -s -X PATCH "https://api.statuspage.io/v1/pages/${STATUSPAGE_PAGE_ID}/incidents/${INCIDENT_ID}" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" -H "Content-Type: application/json" \
  -d '{"incident": {"status": "resolved",
       "body": "The connection pool was resized and payments are back to normal.",
       "components": {"'"${COMPONENT_ID}"'": "operational"}}}'
```

`GET /pages/{page_id}/incidents/unresolved` lists open incidents, which is how automation finds the one to update.

### Task C: Scheduled maintenance

```bash
curl -s -X POST "https://api.statuspage.io/v1/pages/${STATUSPAGE_PAGE_ID}/incidents" \
  -H "Authorization: OAuth ${STATUSPAGE_API_KEY}" -H "Content-Type: application/json" \
  -d '{"incident": {
    "name": "Database maintenance: read-only window",
    "status": "scheduled",
    "scheduled_for": "2026-11-14T02:00:00Z",
    "scheduled_until": "2026-11-14T04:00:00Z",
    "body": "We will run database maintenance. Writes are unavailable for up to 2 hours.",
    "component_ids": ["'"${COMPONENT_ID}"'"]
  }}'
```

Use future dates; subscribers get the reminder you configured on the page. Move it forward with `"status": "in_progress"`, then `"completed"`.

### Task D: Automate from monitoring alerts

The script opens an incident per alert, resolves it on recovery, and backs off when throttled (HTTP 420 or 429). `STATUSPAGE_API_BASE` exists so you can point it at a local stub in tests.

```python
# statuspage_alerts.py: mirror monitoring alerts on the status page
import os
import time
import requests

API = os.environ.get("STATUSPAGE_API_BASE", "https://api.statuspage.io/v1")
PAGE_ID = os.environ["STATUSPAGE_PAGE_ID"]
HEADERS = {"Authorization": f"OAuth {os.environ['STATUSPAGE_API_KEY']}"}

# service name in your alerts -> Statuspage component id
COMPONENTS = {"payment-service": "4g812xxgm6ws", "api-gateway": "gynp8g27p5xw"}


def call(method: str, path: str, **kwargs):
    for attempt in range(3):
        resp = requests.request(method, f"{API}/pages/{PAGE_ID}{path}", headers=HEADERS, timeout=15, **kwargs)
        if resp.status_code in (420, 429):
            time.sleep(2 ** attempt)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError("Statuspage rate limit: giving up")


def open_incident(service: str, severity: str, description: str) -> str:
    component = COMPONENTS[service]
    critical = severity == "critical"
    incident = call("POST", "/incidents", json={"incident": {
        "name": f"{service}: {description[:80]}",
        "status": "investigating",
        "impact_override": "major" if critical else "minor",
        "body": f"We are investigating an issue with {service}.",
        "component_ids": [component],
        "components": {component: "major_outage" if critical else "degraded_performance"},
    }})
    return incident["id"]


def resolve_incident(incident_id: str, service: str) -> None:
    component = COMPONENTS[service]
    call("PATCH", f"/incidents/{incident_id}", json={"incident": {
        "status": "resolved",
        "body": f"The issue with {service} is resolved and the service is operating normally.",
        "components": {component: "operational"},
    }})
```

Store the returned incident ID in your alerting system (or look it up through `/incidents/unresolved`) so the recovery alert resolves the same incident.

## Examples

### Example 1: "Payments are failing, tell customers"
Find the id with the Task A list call (`jq` shows `Payment API` as `4g812xxgm6ws`), create the incident from Task B with `major_outage` and `impact_override: major`, and note the `id` in the response. Customers see "Payment API: Major outage" and subscribers are emailed. When fixed, PATCH with `resolved` and `operational`; the page returns to green.

### Example 2: "Announce Saturday's database upgrade a week ahead"
POST the Task C request with `scheduled_for` and `scheduled_until` in the next week. The response has `"status": "scheduled"` and a `shortlink` you can paste into release notes. On the day, PATCH `in_progress`, then `completed`.

## Guidelines

- Update the page within minutes of confirming impact; silence costs more trust than the incident.
- Write plain-language updates for customers, not stack traces. Follow investigating, identified, monitoring, resolved in order.
- Always reset components when resolving; a resolved incident does not restore them by itself.
- Keep the API key in a secret store; it can post to your public page. Create it per automation so it can be revoked alone.
- Respect the 1 request per second limit when doing bulk updates.
- Do not hard-code component IDs you have not listed; wrong IDs return a 4xx with the validation error in the body.
- Self-hosting is a different product: Cachet 2.x last released in 2023 and 3.x is a rewrite in development, so this skill does not cover it.
