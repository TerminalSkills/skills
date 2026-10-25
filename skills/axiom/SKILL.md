---
name: axiom
description: Axiom is a cloud log management and analytics platform for ingesting logs, traces and events and querying them with APL (Axiom Processing Language). Use when sending app logs to Axiom from Node.js, Pino or Next.js, writing APL queries, tailing datasets with the axiom CLI, or setting up monitors and alerts.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  repository: https://github.com/axiomhq/axiom-js
  version: 1.1.0
  category: devops
  tags: "logging, analytics, serverless, observability, s3"
---

# Axiom — Serverless Log Analytics


## Overview


Axiom is a cloud log management and analytics platform. You send events to named datasets over HTTP (SDKs, the CLI, Pino, Next.js integrations or OpenTelemetry), query them with APL, a Kusto-style query language, and build dashboards and monitors on top.


## Instructions

### Ingestion

Create an API token in the Axiom Console with ingest permission for the dataset, and export it as `AXIOM_TOKEN`. `@axiomhq/js` 2.x needs Node.js 20 or newer and exports a named `Axiom` class. To target a region, pass `edge` (for example `eu-central-1.aws.edge.axiom.co`, no scheme) instead of putting a regional host in `url`; edge routing needs an API token (`xaat-`), not a personal one.

```typescript
import { Axiom } from "@axiomhq/js";

const axiom = new Axiom({ token: process.env.AXIOM_TOKEN! });

// ingest() queues events and sends them in batches in the background
axiom.ingest("api-logs", [
  {
    level: "info",
    message: "Order processed",
    orderId: "ord_abc123",
    userId: "usr_456",
    amount: 99.99,
    duration_ms: 245,
    region: "us-east-1",
    _time: new Date().toISOString(), // optional: Axiom sets it when missing
  },
  {
    level: "error",
    message: "Payment failed",
    orderId: "ord_def789",
    error: "Card declined",
    duration_ms: 1200,
  },
]);

// Flush before the process exits
await axiom.flush();

// The same client can run APL queries
const res = await axiom.query(`['api-logs'] | where level == 'error' | limit 10`);
```

```typescript
// Pino transport (npm install pino @axiomhq/pino)
import pino from "pino";

const logger = pino(
  { level: "info" },
  pino.transport({
    target: "@axiomhq/pino",
    options: {
      dataset: process.env.AXIOM_DATASET,
      token: process.env.AXIOM_TOKEN,
    },
  }),
);

logger.info({ orderId: "ord_123", userId: "usr_456", amount: 99.99 }, "Order created");
logger.error({ orderId: "ord_123", error: "timeout" }, "Payment processing timeout");
```

### APL Queries (Axiom Processing Language)

```kusto
// APL is based on Kusto Query Language (KQL) — same as Azure Data Explorer

// Error rate over time (5-minute buckets)
['api-logs']
| where level == "error"
| summarize errors = count() by bin(_time, 5m)
| order by _time asc

// P95 latency per endpoint
['api-logs']
| where isnotnull(duration_ms)
| summarize p95 = percentile(duration_ms, 95), avg_ms = avg(duration_ms), count = count()
    by endpoint
| order by p95 desc

// Top errors in the last hour
['api-logs']
| where _time > ago(1h) and level == "error"
| summarize count = count() by message, error
| order by count desc
| take 10

// Revenue by region (last 24h)
['api-logs']
| where _time > ago(24h) and message == "Order processed"
| summarize total_revenue = sum(amount), orders = count() by region
| order by total_revenue desc

// Slow requests (> 1s) with user context
['api-logs']
| where duration_ms > 1000
| project _time, endpoint, duration_ms, userId, orderId
| order by duration_ms desc
| take 20

// Unique active users per hour
['api-logs']
| where isnotnull(userId)
| summarize active_users = dcount(userId) by bin(_time, 1h)
```

### Next.js

`next-axiom` is deprecated (bug fixes only). New projects use `@axiomhq/nextjs`, which also captures Web Vitals, HTTP logs and traces without Vercel Drains.

```bash
npm install --save @axiomhq/js @axiomhq/logging @axiomhq/nextjs @axiomhq/react
```

```typescript
// lib/axiom/axiom.ts
import { Axiom } from "@axiomhq/js";
export default new Axiom({ token: process.env.NEXT_PUBLIC_AXIOM_TOKEN! });
```

```typescript
// lib/axiom/server.ts
import axiomClient from "@/lib/axiom/axiom";
import { Logger, AxiomJSTransport } from "@axiomhq/logging";
import { createAxiomRouteHandler, nextJsFormatters } from "@axiomhq/nextjs";

export const logger = new Logger({
  transports: [
    new AxiomJSTransport({ axiom: axiomClient, dataset: process.env.NEXT_PUBLIC_AXIOM_DATASET! }),
  ],
  formatters: nextJsFormatters,
});

export const withAxiom = createAxiomRouteHandler(logger);
```

```typescript
// app/api/webhooks/route.ts
import { withAxiom, logger } from "@/lib/axiom/server";

export const POST = withAxiom(async (req: Request) => {
  const body = await req.json();
  logger.info("Webhook received", { eventType: body.type });
  return Response.json({ ok: true });
});
```

For uncaught errors on Next.js 15+, add `export const onRequestError = createOnRequestError(logger);` (from `@axiomhq/nextjs`) in `instrumentation.ts`. For request logs, add `proxy.ts` (Next.js 16) or `middleware.ts` (15 and older) that calls `logger.info(...transformMiddlewareRequest(request))` and `event.waitUntil(logger.flush())`. A token used in client components is public: give it ingest-only permission on one dataset, or use the proxy transport.

### CLI

Install with `brew install --cask axiomhq/tap/axiom` or `go install github.com/axiomhq/cli/cmd/axiom@latest`. Log in with a personal access token (`xapt-`); the browser login flow currently fails with an OAuth error, so skip it.

```bash
# Interactive: prompts for token and organization ID
axiom auth login --auto-login=false

# Or no login at all: environment variables
export AXIOM_TOKEN="xapt-..."   # personal access token from Settings > Profile
export AXIOM_ORG_ID="acme-4xk2"  # only needed with several organizations

axiom dataset list
axiom query "['api-logs'] | where level == 'error' | take 10"
axiom stream api-logs                        # live tail
cat access.log | axiom ingest nginx-logs     # JSON, NDJSON or CSV
docker logs api-gateway 2>&1 | axiom ingest docker-logs
```

### Monitors and Alerts

Monitors run an APL query on a schedule and notify Slack, PagerDuty, email or a webhook. Create them in the Console (or with the Terraform provider). Examples:

- Error spike: `['api-logs'] | where level == 'error' | summarize count() by bin(_time, 5m)`, threshold above 100.
- Zero orders: `['api-logs'] | where message == 'Order processed' | summarize count() by bin(_time, 15m)`, comparison **below** 1 with **Alert on no data** enabled (a quiet period returns no rows rather than a 0).

## Installation

```bash
npm install @axiomhq/js            # SDK (Node.js 20+)
npm install pino @axiomhq/pino     # Pino transport
npm install @axiomhq/winston       # Winston transport
pip install axiom-py               # Python
brew install --cask axiomhq/tap/axiom  # CLI
```


## Examples

### Example 1: Ship Pino logs from an Express API

**User request:** "Our Express API logs with Pino. Send those logs to an Axiom dataset called api-logs."

Install `pino @axiomhq/pino`, replace the logger with the `pino.transport({ target: "@axiomhq/pino", options: { dataset, token } })` setup from the Ingestion section, and read `AXIOM_TOKEN` (ingest-only API token) and `AXIOM_DATASET=api-logs` from the environment. Start the app, call an endpoint, then run `axiom stream api-logs` or open the dataset in the Console: each log line appears as an event with `level`, `msg` and your structured fields.

### Example 2: Find the slowest endpoints

**User request:** "Which endpoints had the worst p95 latency in the last hour?"

```kusto
['api-logs']
| where _time > ago(1h) and isnotnull(duration_ms)
| summarize p95 = percentile(duration_ms, 95), requests = count() by endpoint
| order by p95 desc
| take 10
```

Paste it into the Console or pass it to `axiom query` as one quoted line; the result is a table with one row per endpoint, slowest first.


## Guidelines

1. **Datasets as logical groups** — Create separate datasets for different log types (api-logs, frontend-events, infra-metrics); each has its own retention and access controls
2. **Structured over unstructured** — Send JSON objects, not plain text; structured fields enable filtering, aggregation, and dashboards
3. **APL for power queries** — Learn APL basics (where, summarize, project, join); it's far more powerful than regex-based log search
4. **Vercel integration** — If on Vercel, use `@axiomhq/nextjs` (not the deprecated `next-axiom`) for route-handler logs, Web Vitals and request logs
5. **Stream for debugging** — Use `axiom stream` in the terminal for real-time log tailing
6. **Plans and limits** — Pricing and ingest limits depend on your plan; check the current pricing page before sending high volumes
7. **Annotations for deploys** — Mark deployments as annotations in Axiom; correlate performance changes with releases
8. **Monitors on business metrics** — Don't just monitor errors; monitor business KPIs (orders, signups, revenue) and alert when they drop
