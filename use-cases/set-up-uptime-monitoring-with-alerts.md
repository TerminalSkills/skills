---
title: Set Up Uptime Monitoring with Slack and Email Alerts
slug: set-up-uptime-monitoring-with-alerts
description: "Deploy Uptime Kuma for self-hosted monitoring — HTTP, TCP, and DNS checks, Slack and email alerts, status pages for customers, and maintenance windows."
skills: [uptime-kuma]
category: devops
tags: [uptime-kuma, monitoring, alerts, status-page, uptime, devops]
---

# Set Up Uptime Monitoring with Slack and Email Alerts

## The Problem

A startup runs six services: a marketing site, a customer-facing API, a dashboard SPA, a webhook processing worker, a cron scheduler, and a PostgreSQL database. The team finds out about outages from customer complaints — a Slack message from a frustrated user saying "is the API down?" followed by 10 minutes of frantic investigation to figure out which service is actually broken.

Last month, the database went down at 2 AM due to disk space. Nobody noticed until 8 AM when the first developer logged in. Six hours of downtime, 340 failed webhook deliveries, and an angry enterprise customer who lost confidence in the platform. The CEO's email started with "how did we not know the database was down for six hours?"

The team tried a SaaS monitoring service, but at $29/month for 50 monitors with 1-minute intervals, the cost adds up — especially when they need to monitor internal services that aren't publicly accessible. They need something that monitors both public endpoints and internal services, sends alerts to Slack and email, and provides a customer-facing status page — all self-hosted on infrastructure they already pay for.

## The Solution

Deploy **Uptime Kuma** — a self-hosted monitoring tool — using the **uptime-kuma** skill. It monitors HTTP endpoints, TCP ports, DNS records, and even Docker containers. Alerts go to Slack, email, and any webhook. A public status page shows customers real-time service health without exposing internal infrastructure details.

## Step-by-Step Walkthrough

### Step 1: Deploy Uptime Kuma

```text
Deploy Uptime Kuma on our existing VPS for monitoring our 6 services. I need 
1-minute check intervals, Slack alerts for the engineering channel, email alerts 
for the on-call engineer, and a public status page for customers.
```

```bash
docker run -d --name uptime-kuma --restart always \
  -p 3001:3001 \
  -v uptime-kuma-data:/app/data \
  louislam/uptime-kuma:1
```

Dashboard available at `http://server-ip:3001`. Set admin credentials on first visit.

For production, put it behind Caddy or Nginx with HTTPS:

```caddyfile
status.example.com {
    reverse_proxy localhost:3001
}
```

### Step 2: Configure Monitors

Add monitors through the dashboard (Settings → Add New Monitor) or the API:

**HTTP monitors** — check that endpoints return 200:

| Monitor | URL | Interval | Timeout |
|---|---|---|---|
| Marketing Site | `https://example.com` | 60s | 10s |
| API Health | `https://api.example.com/health` | 60s | 5s |
| Dashboard | `https://app.example.com` | 60s | 10s |
| Webhook Worker | `https://api.example.com/webhooks/health` | 60s | 5s |

**TCP monitors** — check that ports are reachable:

| Monitor | Host | Port | Interval |
|---|---|---|---|
| PostgreSQL | `db-server` | 5432 | 60s |
| Redis | `redis-server` | 6379 | 60s |

**Keyword monitors** — verify response contains expected content:

| Monitor | URL | Expected keyword | Note |
|---|---|---|---|
| API Version | `https://api.example.com/health` | `"status":"ok"` | Catches 200 responses with error body |

For the API health endpoint, a keyword check is more reliable than a simple HTTP check. A reverse proxy might return 200 even when the backend is down — the keyword check verifies the actual application is responding.

### Step 3: Set Up Notifications

**Slack** — alerts to #engineering-alerts channel:

1. Create a Slack Incoming Webhook at api.slack.com/apps
2. In Uptime Kuma: Settings → Notifications → Add → Slack
3. Paste the webhook URL
4. Test the notification

**Email** — for on-call engineer:

1. Settings → Notifications → Add → SMTP
2. Configure: `smtp.gmail.com`, port 587, TLS
3. From: `monitoring@example.com`
4. To: `oncall@example.com`

**Custom webhook** — for PagerDuty or custom alerting:

1. Settings → Notifications → Add → Webhook
2. URL: `https://events.pagerduty.com/v2/enqueue`
3. Body template with `{{ msg }}` and `{{ monitorJSON }}`

### Step 4: Create the Status Page

Uptime Kuma's built-in status page shows customers which services are operational without exposing internal details:

1. Go to Status Pages → Add
2. **Title**: "Platform Status"
3. **Slug**: `status` (accessible at `status.example.com/status/status`)
4. Add groups:
   - **Core Platform**: API, Dashboard
   - **Website**: Marketing site
   - **Integrations**: Webhook processing

Each group shows a green/yellow/red indicator and uptime percentage. Customers see "API — Operational (99.97% uptime)" without knowing about your database server, Redis cache, or internal monitoring tools.

Custom domain: point `status.example.com` to Uptime Kuma and configure the status page path.

### Step 5: Add Maintenance Windows

When deploying updates or running database migrations, set maintenance windows so monitoring doesn't fire false alerts:

1. Go to Maintenance → Add
2. **Title**: "Database maintenance"
3. **Affected monitors**: PostgreSQL, API Health
4. **Schedule**: one-time or recurring
5. **Duration**: 30 minutes

During maintenance, the status page shows "Scheduled Maintenance" instead of "Down", and no alerts fire. This prevents the 2 AM deploy from waking up the on-call engineer with false alarms.

### Step 6: Monitor Internal Services via Docker

If Uptime Kuma runs on the same Docker network as your services, it can monitor containers directly:

```yaml
# docker-compose.yml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    restart: always
    ports:
      - "3001:3001"
    volumes:
      - uptime-kuma-data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock:ro  # Docker monitoring
    networks:
      - internal

  api:
    image: myapp/api:latest
    networks:
      - internal

  postgres:
    image: postgres:16
    networks:
      - internal

networks:
  internal:

volumes:
  uptime-kuma-data:
```

With Docker socket access, Uptime Kuma can monitor container health status directly — not just port availability, but whether the container's health check passes.

## Real-World Example

The ops lead deploys Uptime Kuma on a Friday afternoon — 15 minutes for Docker setup, 30 minutes to add all 6 monitors and configure Slack + email notifications. The status page goes live at `status.example.com` with a link from the app's footer.

Monday at 3:17 AM, the Redis container runs out of memory and crashes. Within 60 seconds, Uptime Kuma detects the TCP port is unreachable. The on-call engineer gets a Slack notification and an email simultaneously. They SSH in, check Docker logs, increase the memory limit, and restart Redis. Total downtime: 8 minutes. The status page showed "Redis Cache — Degraded" during the incident and auto-recovered to "Operational" when the check passed again.

The following week, the team schedules a 20-minute maintenance window for a database migration at 2 AM. The status page shows "Scheduled Maintenance" starting at 1:55 AM. No alerts fire during the migration. Customers who check the status page see the maintenance notice instead of a scary red "Down" indicator.

After one month, the dashboard shows 99.97% uptime across all services. The single Redis incident is visible in the uptime graph, and the three maintenance windows are clearly marked. The CEO forwards the status page to the enterprise customer who complained about the 6-hour outage — "we've fixed this."

## Related Skills

- [uptime-kuma](../skills/uptime-kuma/) -- Advanced Uptime Kuma configuration, API, and Docker monitoring
- [coolify](../skills/coolify/) -- Self-hosted deployment platform (can run Uptime Kuma)
