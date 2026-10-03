---
name: uptime-robot
description: >-
  Monitor website uptime with UptimeRobot. Use when a user asks to monitor
  website availability, get alerts when a site goes down, create a public
  status page, or set up HTTP/ping/port monitoring.
license: Apache-2.0
compatibility: 'Any website or API (cloud service); REST API v3 needs an API key from the dashboard'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - uptime
    - monitoring
    - status-page
    - alerts
    - availability
---

# UptimeRobot

## Overview

UptimeRobot is a hosted service that checks websites, APIs and servers on a schedule and alerts you when one stops answering. Monitor types include HTTP(S), keyword, ping, port, heartbeat (cron), SSL and domain expiry, DNS, UDP and API assertions. Alerts go to email, SMS, Slack, Telegram, webhooks and more, and monitors can be published on a public status page.

The free plan covers 50 monitors at 5-minute intervals with one status page and 3 months of data (hobby and non-profit use). Paid plans (Solo, Team, Scale) shorten the interval to 60, 30 or 15 seconds, add status pages, custom domains and longer retention; check uptimerobot.com/pricing for current prices.

The current REST API is v3 (`https://api.uptimerobot.com/v3`, bearer token, JSON). The older v2 API (`api_key` in a form body, numeric `type` codes) still exists as a legacy API; new code should use v3.

## Instructions

### Step 1: Get a token

In the dashboard open Integrations, API, and create a key. Keep it in `UPTIMEROBOT_API_KEY`. The free plan allows 10 API requests per minute; paid plans scale with the monitor count. Over the limit you get HTTP 429 and a `Retry-After` header.

### Step 2: Create a monitor

```typescript
// lib/uptime.ts
const BASE_URL = 'https://api.uptimerobot.com/v3'
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.UPTIMEROBOT_API_KEY}`,
}

// Find alert contact IDs first
const contacts = await (await fetch(`${BASE_URL}/user/alert-contacts`, { headers })).json()

const res = await fetch(`${BASE_URL}/monitors`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    friendlyName: 'Production API',
    type: 'HTTP',                 // HTTP, KEYWORD, PING, PORT, HEARTBEAT, DNS, API, UDP ...
    url: 'https://api.northwind.io/health',
    interval: 300,                // seconds; the plan sets the minimum (free = 300)
    timeout: 30,
    assignedAlertContacts: [{ alertContactId: contacts[0].id, threshold: 0, recurrence: 0 }],
  }),
})
const monitor = await res.json() // 201 on success
```

Other types take the fields they need: `KEYWORD` adds `keywordType` (`ALERT_EXISTS`), `keywordValue` and `keywordCaseType`; `PORT` adds `port`; `PING` and `PORT` take a bare host in `url`; `HEARTBEAT` takes `gracePeriod` and gives you a URL your cron job must call. Threshold and recurrence are paid features (always 0 on free).

### Step 3: Check status

```typescript
const { data, nextLink } = await (
  await fetch(`${BASE_URL}/monitors?status=DOWN,LOOKS_DOWN&limit=50`, { headers })
).json()
// each item: { id, friendlyName, status, url, ... }
// status: PAUSED, STARTED, UP, LOOKS_DOWN, DOWN
```

Results are paginated with `cursor` (default 50, max 200 per page). Filters: `name`, `url`, `tags`, `groupId`. Pause, resume and delete use `POST /monitors/{id}/pause`, `POST /monitors/{id}/start` and `DELETE /monitors/{id}`.

### Step 4: Status page

Create one in the dashboard under Status Pages, or via `POST /psps` with a `friendlyName` and `monitorIds` (or `autoAddMonitors`). Custom domains need a paid plan.

## Examples

### Example 1: Monitor a new service

Request: "Alert me by email if api.northwind.io/health stops returning 200."

Run Step 2 with the alert contact for your email address. Result: the monitor is created (HTTP 201) and shows `UP` after its first check; when the endpoint stops answering it turns `DOWN` and the assigned contact is alerted.

### Example 2: Watch a nightly job

Request: "My backup cron should ping something so I know when it silently stops."

```bash
curl -s -X POST https://api.uptimerobot.com/v3/monitors \
  -H "Authorization: Bearer $UPTIMEROBOT_API_KEY" -H "Content-Type: application/json" \
  -d '{"friendlyName":"Nightly backup","type":"HEARTBEAT","interval":86400,"gracePeriod":1800}'
```

Take the heartbeat URL from the monitor's details in the dashboard and add a final `curl` to it at the end of the backup script. If no ping arrives within the interval plus grace period, the monitor goes down and alerts.

## Guidelines

- Checks run from UptimeRobot's servers, so they cover what outsiders can reach; they do not see inside a private network.
- Keep the token out of client-side code and repositories; monitor-specific and read-only keys exist for narrower access.
- Short intervals and many monitors need a paid plan; the API rejects values below your plan's minimum.
- Self-hosted alternative: Uptime Kuma (open source, unlimited monitors). Running both gives internal and external coverage.
- Do not rely on v2 snippets from older tutorials (`newMonitor`, numeric `type`, `api_key` in the body).
