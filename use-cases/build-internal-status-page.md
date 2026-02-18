---
title: "Build an Internal Status Page for Services"
slug: build-internal-status-page
description: "Create a real-time internal status page that monitors service health, displays incident timelines, and reduces status-check interruptions."
skills: [coding-agent, frontend-design, api-tester]
category: devops
tags: [status-page, monitoring, uptime, incidents, internal-tools]
---

# Build an Internal Status Page for Services

## The Problem

Your team runs 8 microservices, 3 databases, a message queue, and 2 third-party integrations. When something goes down, the first 10 minutes are wasted on triage: "Is it the API or the database?" "Is Stripe down or is it us?" "Is staging broken too?" Engineers ping each other on Slack, the support team asks for updates, and the PM wants an ETA.

Public status page services like Statuspage or Instatus cost $79-299/month and are designed for customer-facing communication — not internal engineering needs. You need something that auto-detects service health, shows dependency graphs, and gives engineers the context to start debugging immediately instead of playing detective.

## The Solution

Use **coding-agent** to build the status page application with health checks and incident tracking, **frontend-design** to create a clean dashboard interface, and **api-tester** to configure health check probes for each service.

## Step-by-Step Walkthrough

### 1. Map services and health check endpoints

```text
List all our services, their health check endpoints, dependencies, and what "healthy" means for each. Include databases, queues, and third-party services.
```

```text
SERVICE MAP — 14 components

SERVICES (6): api-gateway, auth, orders, payments, worker, frontend
INFRA (4): postgresql-primary, postgresql-replica, redis-cache, rabbitmq
THIRD-PARTY (3): stripe-api, sendgrid, s3-storage

Each with health endpoint, threshold, and dependency mapping:
  orders → postgresql, redis, rabbitmq
  payments → postgresql, stripe | worker → redis, rabbitmq, sendgrid, s3
```

### 2. Build the health check system

```text
Create a health check runner that probes all 14 components every 30 seconds. Store results with latency and error details. Detect degraded states, not just up/down.
```

```text
Created: status-service/

  src/checker.ts — Parallel health checks every 30 seconds
  src/probes/
    http-probe.ts — HTTP/HTTPS with timeout, status code, latency
    tcp-probe.ts — Raw TCP for databases and Redis
    custom-probe.ts — RabbitMQ queue depth, replication lag

  Health states:
    🟢 Operational — All checks pass, latency normal
    🟡 Degraded — Passing but latency >2x baseline or partial failures
    🟠 Partial outage — Some checks failing, service still responding
    🔴 Major outage — Health check failing or timeout

  Storage: SQLite for last 30 days of check results
  Alert integration: Slack webhook on state change
```

### 3. Build the dashboard UI

```text
Create a clean status page dashboard showing all services, current status, uptime percentages, and a 90-day incident timeline. Make it fast-loading and auto-refreshing.
```

```text
Created: status-service/frontend/

  ServiceGrid — colored status indicators for all 14 components
  DependencyGraph — visual map of service relationships
  UptimeBar — 90-day history per service | LatencySparkline — 24h trend
  IncidentTimeline — current and past incidents with duration

  Auto-refresh via SSE | Mobile responsive | Dark mode | <100KB bundle
```

### 4. Add incident management

```text
Add incident creation and tracking. When a service goes red, auto-create an incident. Let engineers add updates and mark resolved.
```

```text
Incident system:

  Auto-detection: service goes 🔴 → incident created, impact calculated from deps
  Manual: /incident create|update|resolve via Slack or dashboard

  Example timeline:
    14:32 🔴 payments-service failing → 14:33 auto-incident + alert
    14:38 update: "Stripe returning 503" → 15:12 🟢 recovered (40min)

  Post-incident: auto-generated summary with timeline and affected services
```

### 5. Deploy and configure alerts

```text
Deploy the status page internally. Set up Slack alerts for state changes and a daily health summary.
```

```text
Deployed: status.internal.company.com (Docker Compose, single server)

Alerts:
  State change → Slack #engineering: "🔴 orders-service: Major outage"
  Degraded >5min → Slack #on-call: "🟡 postgresql-replica lag >5s"
  Recovery → Slack #engineering: "🟢 orders-service recovered (duration: 12min)"

Daily summary (9:00 AM):
  All services operational ✅
  24h uptime: 99.97% (postgresql-replica had 8min degradation at 03:14)
  Slowest service: payments-service (avg latency: 340ms, +15% vs baseline)

Weekly report: uptime percentages, incident count, MTTR, reliability trends
```

## Real-World Example

Oscar, a platform engineer at a 20-person SaaS startup, spent the first 10 minutes of every incident figuring out what was actually broken. The team ran 8 services with complex dependencies, and Slack was the unofficial status page — "is X down?" messages flooded #engineering multiple times a week.

He built the internal status page in an afternoon using the three-skill workflow. The coding-agent created the health check system with probes for all 14 components. The frontend-design skill produced a clean dashboard with a dependency graph that showed cascading failures at a glance. The api-tester configured realistic health checks that distinguished between "down" and "degraded."

The next Monday, the PostgreSQL replica fell behind. The status page caught it in 30 seconds, auto-created an incident, and sent a Slack alert with context: "postgresql-replica degraded — replication lag 12s, affects: read-heavy queries in orders-service." The on-call engineer opened the dashboard, saw exactly which services were impacted, and started the right runbook immediately. "Is X down?" messages in Slack dropped to near zero. Average time-to-diagnosis went from 10 minutes to under 2.
