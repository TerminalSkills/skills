---
name: uptime-robot
description: >-
  Monitor website uptime with UptimeRobot. Use when a user asks to monitor
  website availability, get alerts when a site goes down, create a public
  status page, or set up HTTP/ping/port monitoring.
license: Apache-2.0
compatibility: 'Any website or API (cloud service)'
metadata:
  author: terminal-skills
  version: 1.0.0
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

UptimeRobot monitors websites, APIs, and servers every 5 minutes (free) or 60 seconds (paid). Sends alerts via email, SMS, Slack, Telegram, webhook when something goes down. Includes public status pages.

## Instructions

### Step 1: API Setup

```typescript
// lib/uptime.ts — Manage monitors via UptimeRobot API
const API_KEY = process.env.UPTIMEROBOT_API_KEY!
const BASE_URL = 'https://api.uptimerobot.com/v2'

// Create a new HTTP monitor
await fetch(`${BASE_URL}/newMonitor`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    api_key: API_KEY,
    friendly_name: 'Production API',
    url: 'https://api.example.com/health',
    type: 1,          // 1=HTTP, 2=keyword, 3=ping, 4=port
    interval: 300,    // check every 5 minutes (seconds)
    alert_contacts: 'contact_id_1-contact_id_2',
  }),
})
```

### Step 2: Get Monitor Status

```typescript
// Check all monitors
const response = await fetch(`${BASE_URL}/getMonitors`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    api_key: API_KEY,
    response_times: 1,
    response_times_limit: 24,    // last 24 response times
  }),
})
const { monitors } = await response.json()
// status: 0=paused, 1=not checked, 2=up, 8=seems down, 9=down
```

### Step 3: Status Page

Create a public status page at status.uptimerobot.com or embed on your domain. Configure in UptimeRobot dashboard → Status Pages.

## Guidelines

- Free tier: 50 monitors, 5-minute intervals, email alerts.
- Pro ($7/mo): 1-minute intervals, SMS, more monitors, advanced alerts.
- For self-hosted alternative, use Uptime Kuma (open-source, unlimited).
- Combine with Uptime Kuma for internal monitoring, UptimeRobot for external.
