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

Your team runs 6 services, a PostgreSQL primary with a replica behind a connection pooler, Redis, a message queue, and 3 third-party integrations. When something goes down, the first 10 minutes are wasted on triage: "Is it the API or the database?" "Is Stripe down or is it us?" "Is staging broken too?" Engineers ping each other on Slack, support asks for updates, and the PM wants an ETA, all before anyone has started debugging.

Last week the payments service went down because of a Stripe outage. Five engineers investigated independently for 15 minutes before someone realized it was not an internal problem. There was no single place to look.

Hosted status page products are built for customer-facing communication: clean, minimal, deliberately vague. Internal engineering needs are different: automatic detection of service health, a dependency graph that shows cascading failures at a glance, and enough context that the on-call engineer can open the right runbook immediately.

## The Solution

Using the **coding-agent**, **frontend-design**, and **api-tester** skills, the agent builds a health check runner that probes all 14 components every 30 seconds, a dashboard with a dependency graph and incident timeline, and Slack alerts with enough context to skip the triage phase.

## Step-by-Step Walkthrough

### Step 1: Map Services and Health Endpoints

Start by cataloging every component and what "healthy" means for each one, and let **api-tester** confirm that each endpoint answers the way the map says:

```text
List all our services, their health check endpoints, dependencies, and what "healthy" means for each. Include databases, queues, and third-party services. Then call each internal health endpoint once with curl (--max-time 10) and record status code and latency.
```

| Tier | Components |
|------|-----------|
| **Services** (6) | api-gateway, auth, orders, payments, worker, frontend |
| **Infrastructure** (5) | postgresql-primary, postgresql-replica, pgbouncer, redis-cache, rabbitmq |
| **Third-party** (3) | stripe-api, sendgrid, s3-storage |

Each component gets a health endpoint, a latency threshold and a dependency list. `orders` depends on pgbouncer, redis and rabbitmq; `payments` depends on pgbouncer and stripe; `worker` depends on redis, rabbitmq, sendgrid and s3. When postgresql-primary goes down, the page shows orders, payments and worker as affected before anyone investigates.

Third-party status feeds are a poor signal on their own: they are updated by humans, sometimes late, and not every vendor publishes a machine-readable one. Probe the integration you actually use instead, with a cheap authenticated read-only call and a restricted key (`$STRIPE_PROBE_KEY`, `$SENDGRID_PROBE_KEY`) stored as an environment variable, and a `HeadBucket` call for the S3 bucket. That tells you whether *your* integration works, which is the question during an incident.

### Step 2: Build the Health Check System

```text
Create a health check runner that probes all 14 components every 30 seconds. Store results with latency and error details. Detect degraded states, not just up/down.
```

The runner executes three kinds of probe in parallel:

- **HTTP probe** for services and third-party APIs: status code, response time, optionally a body check.
- **TCP probe** for PostgreSQL, Redis and RabbitMQ: connection and round-trip time.
- **Custom probe** for service-specific metrics such as queue depth, replication lag and Redis memory.

The core of an HTTP probe is small. Every request has a hard timeout so one hung dependency cannot stall the loop:

```typescript
type State = 'operational' | 'degraded' | 'major_outage';

export async function probeHttp(url: string, baselineMs: number): Promise<{ state: State; ms: number; error?: string }> {
  const start = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const ms = Math.round(performance.now() - start);
    if (!res.ok) return { state: 'major_outage', ms, error: `HTTP ${res.status}` };
    return { state: ms > baselineMs * 2 ? 'degraded' : 'operational', ms };
  } catch (err) {
    return { state: 'major_outage', ms: Math.round(performance.now() - start), error: String(err) };
  }
}
```

Health states go beyond up/down, because "degraded" is often the more useful signal:

| State | Meaning | Example |
|-------|---------|---------|
| **Operational** | All checks pass, latency within normal range | API responding in 45ms (baseline: 50ms) |
| **Degraded** | Passing but latency above 2x baseline | API responding in 340ms (baseline: 50ms) |
| **Partial Outage** | Some checks failing, service still responding | 2 of 5 health check endpoints failing |
| **Major Outage** | Health check failing or timing out | No response after 10s |

Results are stored in SQLite with a 30-day retention, and a Slack incoming webhook (`$SLACK_WEBHOOK_URL`) fires on every state change. Alert only after two consecutive failed probes so a single dropped packet does not page anyone.

### Step 3: Build the Dashboard

```text
Create a clean status page dashboard showing all services, current status, uptime percentages, and a 90-day incident timeline. Make it fast-loading and auto-refreshing. Follow the frontend-design skill: dark theme, high contrast status colors that do not rely on color alone.
```

The dashboard has five panels for two audiences, the on-call engineer who needs to diagnose quickly and the team lead who tracks reliability:

- **Service Grid**: status indicators for all 14 components, grouped by tier, with a text label next to each color.
- **Dependency Graph**: when postgresql-primary goes red, the downstream services show an unhealthy dependency. This panel saves the most triage time.
- **Uptime Bars**: 90-day history per service, click a day to see its incidents.
- **Latency Sparklines**: 24-hour trend lines. A slowly rising curve often precedes an outage.
- **Incident Timeline**: current and past incidents with duration, scope and resolution notes.

The frontend subscribes to Server-Sent Events (`EventSource`) instead of polling, and works on a phone for the engineer on call at 3 AM. Vanilla HTML, CSS and JavaScript keep it small and dependency-free.

### Step 4: Add Incident Management

```text
Add incident creation and tracking. When a service goes red, auto-create an incident. Let engineers add updates and mark resolved.
```

**Automatic:** when a component enters Major Outage, an incident is created and its impact is computed from the dependency graph. If postgresql-primary goes down, the incident lists orders, payments and worker as affected.

**Manual:** engineers create, update and resolve incidents from the dashboard, or from Slack through a slash command you register in your own Slack app. Manual incidents cover what health checks cannot see, such as data integrity problems.

A typical timeline:

> **14:32**: payments enters Major Outage. Incident auto-created, alert sent to `#engineering`.
> **14:38**: Engineer adds update: "Stripe returning 503, monitoring."
> **15:12**: payments recovers. Incident auto-resolved. Duration: 40 minutes.

On resolution the system produces a summary with the timeline, affected services and total duration, ready to paste into the post-mortem.

### Step 5: Deploy and Configure Alerts

The status page shows your internal architecture, so it must not be reachable from the public internet. Run it as a Docker Compose stack with one container for the checker, one for the web dashboard and a volume for SQLite. Publish the dashboard only on the loopback or internal interface and put your SSO or VPN in front of it, for example `ports: ["127.0.0.1:8088:8088"]` behind your internal reverse proxy. Keep the webhook URL and probe keys in environment variables, never in the repository.

Alerts to Slack:

- State change to `#engineering`: "orders: Major outage (dependency: postgresql-primary unhealthy)".
- Degraded for 5+ minutes to `#on-call`: "postgresql-replica lag above 5s (threshold: 2s)".
- Recovery to `#engineering`: "orders recovered (duration: 12 min)".

A daily 9:00 summary (uptime, slowest service, incidents) and a weekly report with uptime per service, incident count and mean time to recovery feed the team's SLO tracking.

## Real-World Example

Oscar, a platform engineer at a 20-person SaaS startup, spent the first 10 minutes of every incident working out what was actually broken. "Is X down?" messages flooded `#engineering` several times a week.

He built the page in an afternoon with the coding agent. The following Monday the PostgreSQL replica fell behind; within a minute the page opened an incident and sent: "postgresql-replica degraded, replication lag 12s, affects: read-heavy queries in orders." The on-call engineer opened the dashboard, saw which services were impacted, and started the right runbook without any Slack detective work. In Oscar's team, "is X down?" messages dropped to a handful per month and time-to-diagnosis fell from about 10 minutes to about 2.

## Related Skills

- [coding-agent](../skills/coding-agent/) -- builds the checker, dashboard and incident logic in scoped tasks
- [frontend-design](../skills/frontend-design/) -- shapes the dashboard layout and accessible status colors
- [api-tester](../skills/api-tester/) -- confirms every health endpoint answers as the service map says
