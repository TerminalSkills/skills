---
name: axiom
description: Expert guidance for Axiom, the serverless log management and analytics platform that stores and queries unlimited data at fixed cost. Helps developers ingest logs, traces, and events from any source, query them with APL (Axiom Processing Language), build dashboards, and set up alerts — all without managing infrastructure or worrying about per-GB pricing.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - logging
  - analytics
  - serverless
  - observability
  - s3
---

# Axiom — Serverless Log Analytics


## Overview


Axiom, the serverless log management and analytics platform that stores and queries unlimited data at fixed cost. Helps developers ingest logs, traces, and events from any source, query them with APL (Axiom Processing Language), build dashboards, and set up alerts — all without managing infrastructure or worrying about per-GB pricing.


## Instructions

### Ingestion

```typescript
// Send logs via HTTP API
import Axiom from "@axiomhq/js";

const axiom = new Axiom({ token: process.env.AXIOM_TOKEN! });

// Ingest events (batched automatically)
await axiom.ingest("api-logs", [
  {
    level: "info",
    message: "Order processed",
    orderId: "ord_abc123",
    userId: "usr_456",
    amount: 99.99,
    duration_ms: 245,
    region: "us-east-1",
    _time: new Date().toISOString(),       // Optional: Axiom auto-sets if missing
  },
  {
    level: "error",
    message: "Payment failed",
    orderId: "ord_def789",
    error: "Card declined",
    stripe_code: "card_declined",
    duration_ms: 1200,
  },
]);

// Flush before process exit
await axiom.flush();
```

```typescript
// Structured logging with Pino → Axiom transport
import pino from "pino";

const logger = pino({
  transport: {
    target: "@axiomhq/pino",
    options: {
      dataset: "api-logs",
      token: process.env.AXIOM_TOKEN,
    },
  },
});

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

### Vercel / Next.js Integration

```typescript
// next.config.js — Send Vercel logs to Axiom automatically
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;

// instrumentation.ts — Axiom + Vercel integration
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { AxiomWebVitals } = await import("@axiomhq/web-vitals");
    // Auto-captures Web Vitals, server-side logs, and API route traces
  }
}
```

```typescript
// app/api/route.ts — Structured logging in API routes
import { withAxiom, AxiomRequest } from "next-axiom";

export const POST = withAxiom(async (req: AxiomRequest) => {
  req.log.info("Processing webhook", { source: "stripe" });

  try {
    const body = await req.json();
    await processWebhook(body);
    req.log.info("Webhook processed", { eventType: body.type });
    return Response.json({ ok: true });
  } catch (error) {
    req.log.error("Webhook failed", { error: error.message });
    return Response.json({ error: "Failed" }, { status: 500 });
  }
});
```

### CLI Queries

```bash
# Install CLI
brew install axiomhq/tap/axiom

# Authenticate
axiom auth login

# Query from terminal
axiom query "['api-logs'] | where level == 'error' | take 10" -f json

# Stream logs in real-time (like tail -f)
axiom stream api-logs

# Ingest from file
cat access.log | axiom ingest nginx-logs

# Ingest from pipe
docker logs my-container 2>&1 | axiom ingest docker-logs
```

### Monitors and Alerts

```yaml
# Axiom Monitors — alert on query results
# Configure in UI or via Terraform provider

# Example: Error spike alert
# Query: ['api-logs'] | where level == 'error' | summarize count() by bin(_time, 5m)
# Condition: count > 100 in any 5-minute window
# Notify: Slack #alerts channel

# Example: Zero orders alert (business metric)
# Query: ['api-logs'] | where message == 'Order processed' | summarize count() by bin(_time, 15m)
# Condition: count == 0 for 15 minutes
# Notify: PagerDuty
```

## Installation

```bash
# CLI
brew install axiomhq/tap/axiom

# Node.js SDK
npm install @axiomhq/js

# Pino transport
npm install @axiomhq/pino

# Next.js integration
npm install next-axiom

# Python
pip install axiom-py
```


## Examples


### Example 1: Setting up Axiom for a microservices project

**User request:**

```
I have a Node.js API and a React frontend running in Docker. Set up Axiom for monitoring/deployment.
```

The agent creates the necessary configuration files based on patterns like `# Install CLI`, sets up the integration with the existing Docker setup, configures appropriate defaults for a Node.js + React stack, and provides verification commands to confirm everything is working.

### Example 2: Troubleshooting apl queries issues

**User request:**

```
Axiom is showing errors in our apl queries. Here are the logs: [error output]
```

The agent analyzes the error output, identifies the root cause by cross-referencing with common Axiom issues, applies the fix (updating configuration, adjusting resource limits, or correcting syntax), and verifies the resolution with appropriate health checks.


## Guidelines

1. **Datasets as logical groups** — Create separate datasets for different log types (api-logs, frontend-events, infra-metrics); each has its own retention and access controls
2. **Structured over unstructured** — Send JSON objects, not plain text; structured fields enable filtering, aggregation, and dashboards
3. **APL for power queries** — Learn APL basics (where, summarize, project, join); it's far more powerful than regex-based log search
4. **Vercel integration** — If on Vercel, use `next-axiom` for zero-config logging; Web Vitals, API traces, and server logs flow automatically
5. **Stream for debugging** — Use `axiom stream` in terminal for real-time log tailing; faster than switching to a browser
6. **Fixed pricing model** — Axiom charges per time (not per GB); ingest as much as you want without worrying about cost spikes
7. **Annotations for deploys** — Mark deployments as annotations in Axiom; correlate performance changes with releases
8. **Monitors on business metrics** — Don't just monitor errors; monitor business KPIs (orders, signups, revenue) and alert when they drop
