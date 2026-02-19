---
name: uptime-kuma
category: devops
version: 1.0.0
description: >-
  Monitor service uptime with Uptime Kuma — HTTP, TCP, DNS, Docker, and keyword
  checks, multi-channel alerts (Slack, email, webhook, Telegram, Discord),
  status pages, maintenance windows, and API automation. Use when tasks involve
  monitoring website or service availability, setting up alerting, creating
  public status pages, or tracking SLA metrics.
author: terminal-skills
tags: [uptime-kuma, monitoring, alerts, status-page, uptime, self-hosted]
---

# Uptime Kuma

Self-hosted monitoring tool for tracking service availability with alerts and status pages.

## Setup

### Docker (recommended)

```bash
docker run -d --name uptime-kuma --restart always \
  -p 3001:3001 \
  -v uptime-kuma-data:/app/data \
  louislam/uptime-kuma:1
```

### Docker Compose

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    restart: always
    ports:
      - "3001:3001"
    volumes:
      - uptime-kuma-data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock:ro  # Optional: Docker monitoring

volumes:
  uptime-kuma-data:
```

Dashboard at `http://localhost:3001`. Set admin credentials on first visit.

## Monitor Types

### HTTP(S)

```
URL: https://api.example.com/health
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
URL: https://api.example.com/health
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
Hostname: example.com
Record type: A
Expected value: 93.184.216.34
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
URL: grpc://api.example.com:50051
Service name: health.v1.HealthService
```

## Notifications

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
Username: monitoring@example.com
Password: app-specific-password
From: Uptime Kuma <monitoring@example.com>
To: oncall@example.com
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
URL: https://your-endpoint.com/alerts
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

## Status Pages

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

Point `status.example.com` to the Uptime Kuma server. Configure reverse proxy:

```caddyfile
status.example.com {
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

## Maintenance Windows

Prevent false alerts during planned downtime:

1. Maintenance → Add
2. **Strategy**: Manual / Single / Recurring / Cron
3. **Affected monitors**: Select which monitors to suppress
4. **Cron example**: `0 2 * * 0` (every Sunday at 2 AM)

During maintenance:
- No alerts fire for affected monitors
- Status page shows "Scheduled Maintenance"
- Uptime calculations exclude maintenance periods

## API

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
      url: "https://new-api.example.com/health",
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

## Backup and Restore

Data stored in SQLite database at `/app/data/kuma.db`:

```bash
# Backup
docker cp uptime-kuma:/app/data/kuma.db ./kuma-backup-$(date +%F).db

# Restore
docker stop uptime-kuma
docker cp ./kuma-backup.db uptime-kuma:/app/data/kuma.db
docker start uptime-kuma
```

## Guidelines

- **Keyword checks over status-code checks** — a reverse proxy can return 200 when the backend is down. Keyword verification catches this.
- **Set retries to 2-3** — single-check failures are often network blips. Retrying reduces false alerts.
- **Different intervals for different criticality** — production API: 60s, marketing site: 300s, internal tools: 600s
- **Monitor from outside your network** — if Uptime Kuma runs on the same server as your services, a server crash takes down monitoring too. Ideally, monitor from a separate machine.
- **Keep status pages simple** — customers don't need to see "Redis Cache" or "Worker Process." Group monitors into customer-facing categories.
- **Maintenance windows prevent alert fatigue** — false alerts during deploys train the team to ignore alerts. Always set maintenance windows for planned work.
- **Back up `kuma.db` regularly** — all configuration, history, and uptime data is in one SQLite file. Easy to back up, easy to lose.
- **Use Docker socket monitoring for containers** — TCP port checks only verify the port is open. Docker monitoring catches OOM kills, health check failures, and restart loops.
