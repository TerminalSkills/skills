---
name: uptime-kuma
description: >-
  Monitor service uptime with Uptime Kuma — HTTP, TCP, DNS, Docker, and keyword
  checks, multi-channel alerts (Slack, email, webhook, Telegram, Discord),
  status pages, maintenance windows, and API automation. Use when tasks involve
  monitoring website or service availability, setting up alerting, creating
  public status pages, or tracking SLA metrics.
license: Apache-2.0
compatibility: "Requires Docker, or Node.js 20.4+ for a manual install"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/louislam/uptime-kuma
  tags: ["uptime-kuma", "monitoring", "alerts", "status-page", "uptime"]
---

# Uptime Kuma

## Overview

Self-hosted monitoring tool for tracking service availability with alerts and status pages. Checked against release 2.5.5 (September 2026): the stable Docker tag is `louislam/uptime-kuma:2` — `:1` is the older 1.x line and no longer gets new monitor types or fixes.

## Instructions

### Step 1: Setup

#### Docker (recommended)

```bash
docker run -d --name uptime-kuma --restart unless-stopped \
  -p 3001:3001 \
  -v uptime-kuma-data:/app/data \
  louislam/uptime-kuma:2
```

#### Docker Compose

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:2
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - uptime-kuma-data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock:ro  # Optional: Docker monitoring

volumes:
  uptime-kuma-data:
```

Dashboard at `http://localhost:3001`. Set admin credentials on first visit.

### Step 2: Monitor Types

### HTTP(S)

```
URL: https://billing.northwind-labs.com/health
Method: GET
Expected status: 200
Interval: 60 seconds
Timeout: 10 seconds
Retries: 3                    # Retry before alerting (avoids false positives)
Accepted status codes: 200-299
```

### HTTP with Keyword

More reliable than status-code-only — verifies the response body contains expected content:

```
URL: https://billing.northwind-labs.com/health
Expected keyword: "status":"ok"
```

Catches cases where a reverse proxy returns 200 but the actual application is down.

### TCP Port

```
Host: db-server.internal
Port: 5432
Interval: 60 seconds
```

Good for databases, Redis, SMTP, and any TCP service.

### DNS

```
Hostname: northwind-labs.com
Record type: A
Expected value: 76.76.21.142
DNS server: 8.8.8.8
```

Detects DNS hijacking or propagation issues.

### Docker Container

Requires Docker socket mounted (`/var/run/docker.sock`):

```
Container name: my-api
Expected status: running
```

Monitors container health status directly — catches OOM kills, restart loops, and crashes.

### Ping (ICMP)

```
Host: 192.168.1.1
Interval: 60 seconds
```

### gRPC

```
URL: grpc://billing.northwind-labs.com:50051
Service name: health.v1.HealthService
```

### Step 3: Notifications

### Slack

1. Create Incoming Webhook at api.slack.com/apps
2. Add notification in Uptime Kuma → Slack type
3. Paste webhook URL
4. Customize message template

### Email (SMTP)

```
SMTP Host: smtp.gmail.com
Port: 587
Security: TLS
Username: monitoring@northwind-labs.com
Password: app-specific-password
From: Uptime Kuma <monitoring@northwind-labs.com>
To: oncall@northwind-labs.com
```

### Telegram

```
Bot Token: from @BotFather
Chat ID: your chat/group ID
```

### Discord

```
Webhook URL: from channel settings → Integrations → Webhooks
```

### Webhook (generic)

```
URL: https://ops.northwind-labs.com/webhooks/uptime-kuma
Method: POST
Content-Type: application/json
Body: {
  "monitor": "{{ monitorJSON }}",
  "message": "{{ msg }}",
  "heartbeat": "{{ heartbeatJSON }}"
}
```

### PagerDuty / Opsgenie

Use the webhook notification type with the provider's event API endpoint.

### Step 4: Status Pages

Public-facing pages showing service health:

1. Status Pages → Add New
2. Configure:
   - **Title**: "Platform Status"
   - **Description**: "Real-time status of all services"
   - **Theme**: Auto / Light / Dark
   - **Show tags**: Optional
3. Add monitor groups:
   - Group 1: "Core Platform" → API, Dashboard monitors
   - Group 2: "Website" → Marketing site
   - Group 3: "Database" → PostgreSQL, Redis (or hide internal services)

### Custom Domain

Point `status.northwind-labs.com` to the Uptime Kuma server. Configure reverse proxy:

```caddyfile
status.northwind-labs.com {
    reverse_proxy localhost:3001
}
```

### Incident Management

Create incidents manually from the status page:

1. Status Page → Create Incident
2. **Title**: "API Degraded Performance"
3. **Content**: "We're investigating increased response times..."
4. **Style**: Info / Warning / Danger / Primary
5. Update as incident progresses, resolve when fixed

Incidents show on the status page with timestamps and updates — customers see you're aware and working on it.

### Step 5: Maintenance Windows

Prevent false alerts during planned downtime:

1. Maintenance → Add
2. **Strategy**: Manual / Single / Recurring / Cron
3. **Affected monitors**: Select which monitors to suppress
4. **Cron example**: `0 2 * * 0` (every Sunday at 2 AM)

During maintenance:
- No alerts fire for affected monitors
- Status page shows "Scheduled Maintenance"
- Uptime calculations exclude maintenance periods

### Step 6: API Automation

Uptime Kuma has a Socket.IO-based API. For HTTP API, use the community REST API wrapper or automate via the dashboard:

```javascript
// Programmatic monitor management via Socket.IO
const { io } = require("socket.io-client");

const socket = io("http://localhost:3001");

socket.emit("login", { username: "admin", password: "secret" }, (res) => {
  if (res.ok) {
    // Add a new monitor
    socket.emit("add", {
      type: "http",
      name: "New API",
      url: "https://billing.northwind-labs.com/health",
      interval: 60,
      retryInterval: 30,
      maxretries: 3,
      accepted_statuscodes: ["200-299"],
      notificationIDList: { 1: true },  // Link to notification channel ID
    }, (res) => {
      console.log("Monitor added:", res);
    });
  }
});
```

### Step 7: Backup and Restore

Data stored in SQLite database at `/app/data/kuma.db`:

```bash
# Backup
docker cp uptime-kuma:/app/data/kuma.db ./kuma-backup-$(date +%F).db

# Restore
docker stop uptime-kuma
docker cp ./kuma-backup.db uptime-kuma:/app/data/kuma.db
docker start uptime-kuma
```

## Examples

### Example 1: "Our status page shows green but customers say checkout is down"

Switch the checkout API's monitor from a plain HTTP status check to HTTP with Keyword (Step: HTTP with Keyword), checking for `"status":"ok"` in the health response body. A reverse proxy or load balancer in front of a crashed app can still answer with `200`, so a status-code-only check misses exactly this case; the keyword check fails as soon as the body stops matching.

### Example 2: "Alert the on-call Slack channel only during business-impacting outages, not every blip"

Set `Retries: 3` and a 60s interval on the production API monitor (fewer false positives from transient network blips), add a Slack notification with the team's Incoming Webhook URL, and create a recurring maintenance window (`Strategy: Recurring`, cron `0 2 * * 0`) over the Sunday 2 AM deploy window so planned restarts don't page anyone.

## Guidelines

- **Keyword checks over status-code checks** — a reverse proxy can return 200 when the backend is down. Keyword verification catches this.
- **Set retries to 2-3** — single-check failures are often network blips. Retrying reduces false alerts.
- **Different intervals for different criticality** — production API: 60s, marketing site: 300s, internal tools: 600s
- **Monitor from outside your network** — if Uptime Kuma runs on the same server as your services, a server crash takes down monitoring too. Ideally, monitor from a separate machine.
- **Keep status pages simple** — customers don't need to see "Redis Cache" or "Worker Process." Group monitors into customer-facing categories.
- **Maintenance windows prevent alert fatigue** — false alerts during deploys train the team to ignore alerts. Always set maintenance windows for planned work.
- **Back up `kuma.db` regularly** — all configuration, history, and uptime data is in one SQLite file. Easy to back up, easy to lose.
- **Use Docker socket monitoring for containers** — TCP port checks only verify the port is open. Docker monitoring catches OOM kills, health check failures, and restart loops.
