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

The team looked at SaaS monitoring services, but they also need to monitor internal services that aren't publicly accessible, and per-monitor pricing adds up. They need something that monitors both public endpoints and internal services, sends alerts to Slack and email, and provides a customer-facing status page — all self-hosted on infrastructure they already pay for.

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
docker run -d --name uptime-kuma --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  -v uptime-kuma-data:/app/data \
  louislam/uptime-kuma:2
```

The `:2` tag is the current 2.x line (2.5.7 at the time of writing); the `:1` tag is the older 1.x line. The port is bound to the loopback interface so the dashboard is not exposed until a reverse proxy fronts it. Open `http://127.0.0.1:3001` (through an SSH tunnel on a remote VPS). The 2.x first-run wizard asks which database to use (the embedded SQLite option needs no extra service) and then for the admin account.

For production, put it behind Caddy or Nginx with HTTPS:

```caddyfile
status.example.com {
    reverse_proxy localhost:3001
}
```

### Step 2: Configure Monitors

Add monitors with **Add New Monitor** on the dashboard (Uptime Kuma has no REST API for creating monitors, so this is done in the UI). Set **Retries** to 2 or 3 so a single failed check does not page anyone:

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
| API Health (keyword) | `https://api.example.com/health` | `"status":"ok"` | Monitor type "HTTP(s) - Keyword"; catches 200 responses with an error body |

For the API health endpoint, a keyword check is more reliable than a simple HTTP check. A reverse proxy might return 200 even when the backend is down — the keyword check verifies the actual application is responding.

### Step 3: Set Up Notifications

**Slack** — alerts to #engineering-alerts channel:

1. Create a Slack app with an Incoming Webhook at api.slack.com/apps
2. In Uptime Kuma: Settings → Notifications → Setup Notification → Slack
3. Paste the webhook URL and press Test
4. Tick **Default enabled** (and **Apply on all existing monitors**) so every monitor uses it

**Email** — for on-call engineer:

1. Settings → Notifications → Setup Notification → Email (SMTP)
2. Host `smtp.gmail.com`, port 587, leave **Security** off (port 587 upgrades with STARTTLS; the Security switch is implicit TLS for port 465)
3. Username and password: a Google app password supplied by the mail account, not the login password
4. From: `monitoring@example.com`, To: `oncall@example.com`

**PagerDuty** — for paging:

1. Settings → Notifications → Setup Notification → PagerDuty
2. Paste the Events API v2 integration key from your PagerDuty service
3. For other tools, the generic **Webhook** type posts JSON that can include `{{ msg }}` and `{{ monitorJSON }}`

### Step 4: Create the Status Page

Uptime Kuma's built-in status page shows customers which services are operational without exposing internal details:

1. Go to Status Pages → Add
2. **Title**: "Platform Status"
3. **Slug**: `status` (the page is served at `/status/status`, for example `status.example.com/status/status`)
4. Add groups:
   - **Core Platform**: API, Dashboard
   - **Website**: Marketing site
   - **Integrations**: Webhook processing

Each group shows a green/yellow/red indicator and uptime percentage. Customers see "API — Operational (99.97% uptime)" without knowing about your database server, Redis cache, or internal monitoring tools.

Custom domain: point `status.example.com` at the Uptime Kuma server, then add the domain under **Domain Names** in the status page's edit settings; requests to that host serve the status page at the root path.

### Step 5: Add Maintenance Windows

When deploying updates or running database migrations, set maintenance windows so monitoring doesn't fire false alerts:

1. Open the Maintenance page and add a new one
2. **Title**: "Database maintenance"
3. **Affected monitors**: PostgreSQL, API Health
4. **Affected status pages**: Platform Status
5. **Strategy**: single maintenance window, recurring (interval, weekday, day of month), or a cron expression; set the time zone and a 30-minute duration

During maintenance, the affected monitors report maintenance instead of "Down" and the status page shows the maintenance notice, and no alerts fire. This prevents the 2 AM deploy from waking up the on-call engineer with false alarms.

### Step 6: Monitor Internal Services via Docker

If Uptime Kuma runs next to your services, it can monitor containers directly through the Docker API:

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:2
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"
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

Then add the socket under Settings → Docker Hosts (connection type Socket, `/var/run/docker.sock`) and create a monitor of type **Docker Container** with the container name. The monitor is down if the container is not running or paused, pending while it restarts, and follows the container's own `HEALTHCHECK` result when one is defined. Without a healthcheck, a running container counts as up, so give the service one. The `:ro` flag only makes the socket file read-only; it does not limit the Docker API, so anyone who can reach the Uptime Kuma admin account effectively controls the host's containers. Keep that login strong and the dashboard behind HTTPS.

## Real-World Example

The ops lead deploys Uptime Kuma on a Friday afternoon — 15 minutes for Docker setup, 30 minutes to add all 6 monitors and configure Slack + email notifications. The status page goes live at `status.example.com` with a link from the app's footer.

Monday at 3:17 AM, the Redis container runs out of memory and crashes. Within a couple of minutes (a 60-second interval plus the retries), Uptime Kuma detects the TCP port is unreachable. The on-call engineer gets a Slack notification and an email simultaneously. They SSH in, check Docker logs, increase the memory limit, and restart Redis. Total downtime: 8 minutes. The Redis monitor showed down during the incident, and the dashboard recovered to "Operational" when the check passed again.

The following week, the team schedules a 20-minute maintenance window for a database migration at 2 AM. The status page shows "Scheduled Maintenance" starting at 1:55 AM. No alerts fire during the migration. Customers who check the status page see the maintenance notice instead of a scary red "Down" indicator.

After one month, the dashboard shows 99.97% uptime across all services. The single Redis incident is visible in the uptime graph, and the three maintenance windows are clearly marked. The CEO forwards the status page to the enterprise customer who complained about the 6-hour outage — "we've fixed this."

## Related Skills

- [uptime-kuma](../skills/uptime-kuma/) -- Uptime Kuma monitors, notifications, status pages, and Docker monitoring
