---
name: betterstack
category: Observability & Monitoring
tags: [uptime, logging, incident-management, status-page, on-call, monitoring]
version: 1.0.0
author: terminal-skills
---

# Better Stack — Uptime, Logs, and Incident Management

You are an expert in Better Stack (formerly Better Uptime + Logtail), the observability platform combining uptime monitoring, log management, incident response, and status pages. You help developers set up comprehensive monitoring with alerting, on-call schedules, and public status pages.

## Core Capabilities

### Uptime Monitoring

```typescript
// Better Stack monitors HTTP endpoints, TCP ports, DNS, SSL, and more.
// Configure via dashboard or Terraform.

// Terraform configuration for uptime monitors
resource "betteruptime_monitor" "api" {
  url          = "https://api.example.com/health"
  monitor_type = "status"
  check_frequency = 30                    // Check every 30 seconds
  
  request_headers = [{
    name  = "Authorization"
    value = "Bearer ${var.health_check_token}"
  }]

  // Alert if response doesn't contain expected string
  expected_status_codes = [200]
  
  // Regions to check from (catch regional outages)
  regions = ["us", "eu", "asia"]
  
  // Escalation policy
  policy_id = betteruptime_escalation_policy.default.id
}

resource "betteruptime_monitor" "database" {
  url          = "tcp://db.example.com:5432"
  monitor_type = "tcp"
  check_frequency = 60
  policy_id = betteruptime_escalation_policy.default.id
}

resource "betteruptime_monitor" "ssl_cert" {
  url          = "https://example.com"
  monitor_type = "ssl"
  // Alert 30 days before SSL certificate expires
  ssl_expiration = 30
  policy_id = betteruptime_escalation_policy.default.id
}
```

### Log Management (Logtail)

```typescript
// Send structured logs to Better Stack
import { Logtail } from "@logtail/node";

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN!);

// Structured logging with context
logtail.info("Order processed", {
  orderId: "ord_abc123",
  userId: "usr_456",
  amount: 99.99,
  duration_ms: 245,
  region: "us-east-1",
});

logtail.error("Payment failed", {
  orderId: "ord_def789",
  error: "Card declined",
  stripe_error_code: "card_declined",
  retryable: true,
});

// Pino integration (recommended for production)
import pino from "pino";

const logger = pino(
  pino.transport({
    target: "@logtail/pino",
    options: { sourceToken: process.env.LOGTAIL_SOURCE_TOKEN },
  })
);

logger.info({ orderId: "ord_123", userId: "usr_456" }, "Order created");
```

### On-Call and Escalation

```yaml
# Escalation policy configuration (via API or dashboard)
# Step 1: Notify on-call engineer via Slack + push notification
# Step 2: After 5 min unacknowledged → call on-call engineer
# Step 3: After 10 min unacknowledged → escalate to team lead
# Step 4: After 15 min unacknowledged → page entire engineering team

# On-call schedule: weekly rotation
# Week 1: engineer-a
# Week 2: engineer-b
# Week 3: engineer-c
# Override: any engineer can take over via Slack command
```

### Status Pages

```typescript
// Better Stack provides hosted status pages with:
// - Custom domain (status.yourcompany.com)
// - Automatic incident creation from monitor alerts
// - Manual incident updates
// - Subscriber notifications (email, SMS, webhook)
// - Historical uptime (90-day, 365-day)
// - Maintenance windows

// API: Create an incident programmatically
const response = await fetch("https://uptime.betterstack.com/api/v2/incidents", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.BETTERSTACK_API_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    requester_email: "ops@example.com",
    name: "Elevated API Latency",
    summary: "API response times are elevated due to database migration. No data loss expected.",
    description: "We are performing a planned database migration. Some requests may take longer than usual.",
    status_page_ids: ["12345"],
  }),
});
```

### Heartbeat Monitoring

```typescript
// Monitor cron jobs and background tasks
// Better Stack provides heartbeat URLs — if not pinged within the expected interval, it alerts.

// In your cron job:
async function dailyReport() {
  try {
    await generateReport();
    await sendReportEmail();

    // Ping heartbeat on success
    await fetch("https://uptime.betterstack.com/api/v1/heartbeat/abc123");
  } catch (error) {
    // Don't ping heartbeat — Better Stack will alert after the expected interval
    console.error("Daily report failed:", error);
  }
}
```

## Installation

```bash
# Node.js logging
npm install @logtail/node
npm install @logtail/pino          # Pino transport

# CLI
brew install betterstack/tap/better-uptime

# Terraform provider
terraform {
  required_providers {
    betteruptime = {
      source = "BetterStackHQ/better-uptime"
    }
  }
}
```

## Best Practices

1. **Monitor from multiple regions** — Check from US, EU, and Asia; a single region can have false positives from network issues
2. **Heartbeats for cron jobs** — Use heartbeat monitors for every scheduled task; silent failures are the worst kind
3. **Escalation policies** — Always have an escalation chain; a single point of failure in alerting defeats the purpose
4. **Status page for trust** — Public status pages build customer trust; auto-create incidents from monitors for transparency
5. **Structured logs** — Send JSON with context (userId, orderId, etc.); Better Stack's SQL-like queries work best with structured data
6. **Alert fatigue prevention** — Set appropriate thresholds; don't alert on single failures, use confirmation periods (2-3 consecutive failures)
7. **Maintenance windows** — Schedule maintenance windows to suppress alerts during planned work
8. **Correlate logs with incidents** — Link log sources to monitors; when an incident fires, jump directly to relevant logs
