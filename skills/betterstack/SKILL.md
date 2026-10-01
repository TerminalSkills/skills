---
name: betterstack
description: Better Stack (formerly Better Uptime + Logtail) is an observability platform that combines uptime monitoring, log management, incident response with on-call escalation, and status pages. Use when a user asks to set up uptime monitors or heartbeat monitoring for cron jobs, create escalation policies, send logs with @logtail/node or the Pino transport, manage Better Stack through its API or Terraform provider, or publish status page updates.
license: Apache-2.0
compatibility: Better Stack account with an API token; Node.js for the @logtail packages; Terraform 0.14+ for the provider
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
  - uptime
  - logging
  - incident-management
  - status-page
  - on-call
---

# Better Stack — Uptime, Logs, and Incident Management

## Overview

Better Stack (formerly Better Uptime + Logtail) is the observability platform combining uptime monitoring, log management, incident response, and status pages. It helps developers set up comprehensive monitoring with alerting, on-call schedules, and public status pages.

Monitors, heartbeats, incidents, escalation policies and status pages are also managed through a JSON:API-style REST API — the reference documents it at `https://incidents.betterstack.com`, while older examples and the Terraform provider use the earlier host `uptime.betterstack.com` — and through the `BetterStackHQ/better-uptime` Terraform provider. Requests use `Authorization: Bearer $TOKEN`. Tokens come from **Better Stack → API tokens**: a team-scoped Uptime API token, or a global token (then pass `team_name` when creating resources). Logs use a separate per-source token and ingesting host.

## Instructions

### Uptime Monitoring

```hcl
# main.tf — the provider reads the token from BETTERUPTIME_API_TOKEN
provider "betteruptime" {}

resource "betteruptime_monitor" "api" {
  url                   = "https://api.northwind-shop.com/health"
  pronounceable_name    = "Northwind API"
  monitor_type          = "expected_status_code"
  expected_status_codes = [200]
  check_frequency       = 30                  # seconds
  confirmation_period   = 60                  # wait 60 s of failures before opening an incident
  regions               = ["us", "eu", "as"]  # allowed: us, eu, as, au
  ssl_expiration        = 30                  # alert 30 days before the certificate expires
  policy_id             = betteruptime_policy.default.id

  request_headers = [{
    name  = "Authorization"
    value = "Bearer ${var.health_check_token}"   # declare as a sensitive variable
  }]
}

resource "betteruptime_monitor" "database" {
  url             = "db.northwind-shop.com"
  monitor_type    = "tcp"
  port            = "5432"
  check_frequency = 60
  policy_id       = betteruptime_policy.default.id
}
```

Monitor types: `status` (any 2XX), `expected_status_code`, `keyword`, `keyword_absence`, `ping`, `tcp`, `udp`, `smtp`, `pop`, `imap`, `dns`, `playwright`. There is no separate SSL monitor type: `ssl_expiration` and `domain_expiration` are attributes of an HTTP monitor (valid values 1, 2, 3, 7, 14, 30, 60 days). Maintenance windows are set per monitor with `maintenance_days`, `maintenance_from`, `maintenance_to`, `maintenance_timezone`.

The same monitor through the API is `POST https://incidents.betterstack.com/api/v2/monitors` with these attributes as a JSON body (see Example 1).

### Log Management (Logtail)

Create a source under **Sources** in the Better Stack dashboard; every source has its own source token and ingesting host. Both are required — the client must be pointed at the source's own host.

```typescript
// Send structured logs to Better Stack
import { Logtail } from "@logtail/node";

const logtail = new Logtail(process.env.BETTERSTACK_SOURCE_TOKEN!, {
  endpoint: `https://${process.env.BETTERSTACK_INGESTING_HOST}`,
});

logtail.info("Order processed", {
  orderId: "ord_8f3k2",
  userId: "usr_456",
  amount: 99.99,
  duration_ms: 245,
});

logtail.error("Payment failed", {
  orderId: "ord_9d1m7",
  stripe_error_code: "card_declined",
  retryable: true,
});

await logtail.flush();   // logs are batched; flush before the process exits

// Pino integration (Pino 7+)
import pino from "pino";

const logger = pino(
  pino.transport({
    target: "@logtail/pino",
    options: {
      sourceToken: process.env.BETTERSTACK_SOURCE_TOKEN,
      options: { endpoint: `https://${process.env.BETTERSTACK_INGESTING_HOST}` },
    },
  })
);

logger.info({ orderId: "ord_8f3k2", userId: "usr_456" }, "Order created");
```

Any language can post JSON to the ingesting host directly:

```bash
curl -X POST "https://$BETTERSTACK_INGESTING_HOST" \
  -H "Authorization: Bearer $BETTERSTACK_SOURCE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"message":"deploy finished","service":"checkout","dt":"2026-10-01 07:03:30+00:00"}]'
```

A `202` means accepted; `402` quota or spending limit reached, `403` invalid source token, `406` unparsable body, `413` body over 10 MiB. `dt` overrides the event time; without it the time of receipt is used.

### On-Call and Escalation

An escalation policy is a list of steps; each escalation step notifies its members after `wait_before` seconds unless the incident was acknowledged.

```hcl
data "betteruptime_severity" "high" {
  name = "High Severity"    # default severity present in every account
}

resource "betteruptime_policy" "default" {
  name         = "Production escalation"
  repeat_count = 3          # repeat the whole policy if nobody acknowledges
  repeat_delay = 1800

  steps {                   # Step 1: whoever is on call, immediately
    type        = "escalation"
    wait_before = 0
    urgency_id  = data.betteruptime_severity.high.id
    step_members { type = "current_on_call" }
  }
  steps {                   # Step 2: after 10 minutes unacknowledged, the entire team
    type        = "escalation"
    wait_before = 600
    urgency_id  = data.betteruptime_severity.high.id
    step_members { type = "entire_team" }
  }
}
```

Other member types include `user` (with `email`), `all_slack_integrations` and `policy` (chain to another policy). The API equivalent is `POST /api/v3/policies`. On-call calendars are managed in the dashboard or under `/api/v2/on-calls`. Incidents can be acknowledged and resolved from scripts: `POST /api/v3/incidents/{incident_id}/acknowledge` and `/resolve`.

### Status Pages

Hosted status pages support a custom domain, sections and resources linked to monitors, subscriber notifications and maintenance announcements. Publish an update with a status report (not with the incidents endpoint):

```typescript
const statusPageId = process.env.BETTERSTACK_STATUS_PAGE_ID;
const response = await fetch(
  `https://incidents.betterstack.com/api/v2/status-pages/${statusPageId}/status-reports`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.BETTERSTACK_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Elevated API latency",
      message: "API responses are slower than usual while a database migration runs. No data loss expected.",
      report_type: "manual",            // or "maintenance": ends_at required, every status "maintenance"
      notify_subscribers: true,         // default false
      affected_resources: [
        { status_page_resource_id: "8742113", status: "degraded" },  // resolved | degraded | downtime
      ],
    }),
  }
);
```

To page people instead, create an incident: `POST /api/v3/incidents` with `summary` and `requester_email` (required), optional `name`, `description`, `policy_id`, `call`, `sms`, `email`, `push`.

### Heartbeat Monitoring

A heartbeat expects a request every `period` seconds (plus `grace`) and opens an incident when it stops arriving. It stays "Pending" until the first ping.

```typescript
// The heartbeat's `url` attribute: https://incidents.betterstack.com/api/v1/heartbeat/ followed by its token
const heartbeatUrl = process.env.BETTERSTACK_HEARTBEAT_URL!;

async function dailyReport() {
  try {
    await generateReport();
    await sendReportEmail();
    await fetch(heartbeatUrl);                 // success ping
  } catch (error) {
    await fetch(`${heartbeatUrl}/fail`);       // report the failure right away
    throw error;
  }
}
```

In shell jobs, send the output and append the exit code instead: `output=$(/opt/northwind/backup.sh 2>&1); curl -d "$output" "$BETTERSTACK_HEARTBEAT_URL/$?"`.

## Installation

```bash
# Node.js logging
npm install @logtail/node
npm install @logtail/pino pino     # Pino transport
```

```hcl
terraform {
  required_providers {
    betteruptime = {
      source  = "BetterStackHQ/better-uptime"
      version = ">= 0.22.0"
    }
  }
}
```

## Examples

### Example 1: Monitor an API and a nightly cron job

**User request:**

```
We run a Node.js API at api.northwind-shop.com and a nightly Postgres backup. Monitor both with Better Stack.
```

```bash
API=https://incidents.betterstack.com/api/v2
curl -s -X POST "$API/monitors" \
  -H "Authorization: Bearer $BETTERSTACK_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"monitor_type":"expected_status_code","url":"https://api.northwind-shop.com/health",
       "pronounceable_name":"Northwind API","expected_status_codes":[200],
       "check_frequency":30,"confirmation_period":60,"regions":["us","eu","as"],"email":true,"push":true}'

curl -s -X POST "$API/heartbeats" \
  -H "Authorization: Bearer $BETTERSTACK_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Nightly database backup","period":86400,"grace":3600}'
```

Each call answers `201` with the new resource; the heartbeat response carries the URL to ping:

```json
{"data":{"id":"512044","type":"heartbeat","attributes":{
  "url":"https://incidents.betterstack.com/api/v1/heartbeat/abcd1234abcd1234abcd1234",
  "name":"Nightly database backup","period":86400,"grace":3600}}}
```

```bash
# crontab (define BETTERSTACK_HEARTBEAT_URL in the crontab too — cron does not read the shell profile): ping only on success
0 2 * * * /opt/northwind/backup.sh && curl -fsS "$BETTERSTACK_HEARTBEAT_URL" > /dev/null
```

A validation error returns `422` with an `errors` object, for example `{"errors":{"base":["URL is invalid."]}}`.

### Example 2: Logs from a Node.js service never arrive

**User request:**

```
We added @logtail/node to the checkout service but nothing shows up in Better Stack Live tail.
```

First test the source itself, outside the application:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://$BETTERSTACK_INGESTING_HOST" \
  -H "Authorization: Bearer $BETTERSTACK_SOURCE_TOKEN" -H "Content-Type: application/json" \
  -d '{"message":"connectivity test from checkout"}'
```

`202` means the token and host are right and the problem is in the code; `403` means the source token is invalid for that host. The two usual causes in code are a client created without the source's `endpoint`, and a short-lived process (script, serverless function) that exits before the batch is sent:

```typescript
const logtail = new Logtail(process.env.BETTERSTACK_SOURCE_TOKEN!, {
  endpoint: `https://${process.env.BETTERSTACK_INGESTING_HOST}`,
});
logtail.info("Checkout started", { cartId: "cart_7h2p", items: 3 });
await logtail.flush();
```

After the fix the event appears in Live tail with `cartId` and `items` as queryable fields.

## Guidelines

1. **Monitor from multiple regions** — Check from several of US, EU, Asia and Australia (`us`, `eu`, `as`, `au`); a single region can have false positives from network issues
2. **Heartbeats for cron jobs** — Use heartbeat monitors for every scheduled task; silent failures are the worst kind. Set `grace` to roughly 20% of `period`
3. **Escalation policies** — Always have an escalation chain; a single point of failure in alerting defeats the purpose
4. **Status page for trust** — Public status pages build customer trust; link monitors as status page resources so their state is shown automatically
5. **Structured logs** — Send JSON with context (userId, orderId, etc.); Better Stack's SQL queries work best with structured data
6. **Alert fatigue prevention** — Don't alert on single failures; use `confirmation_period` so an incident starts only after the failure persists, and `recovery_period` before auto-resolving
7. **Maintenance windows** — Schedule maintenance windows to suppress alerts during planned work
8. **Keep tokens apart and secret** — The API token manages monitors and incidents; a source token can only write logs to one source. Read both from environment variables, mark Terraform header values as sensitive, and treat heartbeat URLs as secrets too — anyone who has one can silence the alert
9. **Check frequency vs timeout** — `check_frequency` must be at least the request timeout; for ping/TCP monitors `request_timeout` is in milliseconds, for HTTP monitors in seconds
10. **Limits** — This is a paid service: log ingestion answers `402` once the free quota or the spending limit is reached, and a single log request is limited to 10 MiB.
