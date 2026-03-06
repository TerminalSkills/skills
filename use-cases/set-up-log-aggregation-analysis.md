---
title: "Set Up Log Aggregation and Analysis with AI"
slug: set-up-log-aggregation-analysis
description: "Centralize scattered application logs and use AI to extract patterns, detect errors, and build searchable dashboards."
skills: [coding-agent, docker-helper, data-analysis]
category: devops
tags: [logging, observability, log-analysis, elk-stack, debugging]
---

# Set Up Log Aggregation and Analysis with AI

## The Problem

Your logs are everywhere — stdout on one service, JSON files on another, syslog on your proxy, and CloudWatch for your Lambda functions. When something breaks, you SSH into three different servers, grep through gigabytes of unstructured text, and try to correlate timestamps manually. A 10-person backend team spends 30% of their debugging time just finding the right log lines.

Worse, there is no way to search logs historically. Once they rotate off disk, that context is gone forever. Last month's intermittent timeout issue? Nobody can prove what caused it because the logs from that period are gone. Every incident investigation starts from scratch.

## The Solution

Use the **docker-helper** skill to deploy a centralized logging stack, the **coding-agent** to configure structured log shipping from all services, and **data-analysis** to build queries that surface error patterns and anomalies.

## Step-by-Step Walkthrough

### Step 1: Map Your Current Logging Landscape

```text
We have 4 services: an Express API on EC2, a Python worker on EC2, a Next.js
frontend on Vercel, and a Postgres database on RDS. Logs are all over the place.
Help me set up centralized logging with search and alerting. We want to self-host
on our existing EC2 infrastructure.
```

Before touching any tooling, the first question is: how much log volume are we talking about? Four services producing roughly 5GB per day total. That number shapes the entire architecture decision — it's enough to need a real logging system, but not so much that you need a cluster.

### Step 2: Design the Logging Architecture

The knee-jerk recommendation is ELK (Elasticsearch, Logstash, Kibana), and for large teams with 50GB+ of daily logs, it's the right call. But at 5GB/day, Elasticsearch is overkill. It wants 4GB of heap minimum, indexes every field in every log line, and requires careful tuning to avoid performance issues. It's a powerful tool that creates its own maintenance burden.

Loki takes a fundamentally different approach. Instead of indexing every field, it indexes only labels — service name, log level, environment. The actual log content is stored as compressed chunks and searched on demand. At this scale, that means 10x cheaper storage and a fraction of the memory footprint. The trade-off is that free-text search is slower than Elasticsearch, but for a 10-person team, queries return in seconds either way.

The architecture:

- **Promtail** agent on each EC2 instance, tailing application logs and shipping them to Loki
- **Loki** for log storage and indexing, running on a dedicated t3.medium
- **Grafana** for search, dashboards, and alerting
- **Vercel logs** via webhook to a small ingestion Lambda that forwards to Loki

### Step 3: Deploy the Stack

The Docker Compose file gets all three components running on a single server:

```yaml
# docker-helper.logging.yml
services:
  loki:
    image: grafana/loki:2.9.4
    ports: ["3100:3100"]
    volumes:
      - ./loki-config.yml:/etc/loki/config.yml
      - loki-data:/loki
    command: -config.file=/etc/loki/config.yml

  grafana:
    image: grafana/grafana:10.3.1
    ports: ["3000:3000"]
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana-provisioning:/etc/grafana/provisioning
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}

  promtail:
    image: grafana/promtail:2.9.4
    volumes:
      - /var/log:/var/log:ro
      - ./promtail-config.yml:/etc/promtail/config.yml
```

Promtail is configured on both EC2 instances to tail application log files and ship them to Loki with labels for service name, environment, and log level. The Loki config includes a 90-day retention period and S3-compatible storage for long-term archival — no more losing logs when they rotate off disk.

### Step 4: Standardize the Log Format

This is the step that makes everything else work. Scattered log formats are the root cause of the "grep through three servers" problem. If one service logs `ERROR: connection timeout` as plain text and another logs `{"level": "error", "msg": "timeout", "service": "worker"}` as JSON, searching across both requires different queries for the same problem.

Both services get converted to structured JSON logging with shared fields.

**Express API** — Winston logger with JSON format:

```javascript
// api/src/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'api' },
  transports: [new winston.transports.Console()],
});

// Every log line now includes: timestamp, level, service, requestId, method, path, duration, error
```

**Python Worker** — structlog with JSON renderer:

```python
# worker/logging_config.py
import structlog

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ]
)

# Fields: timestamp, level, service, task_name, job_id, duration, error
```

The critical detail: both services now emit a shared `requestId` field. When the Express API fires off a task to the Python worker, it passes the request ID along in the task payload. The worker includes it in every log line for that job. This single shared field makes cross-service correlation possible — search by one request ID, see the entire request journey across both services.

### Step 5: Build Dashboards and Alerts

Three Grafana dashboards cover 90% of day-to-day debugging needs:

1. **Service Overview** — error rate, log volume, and top error messages per service. This is the "is anything on fire right now?" dashboard. A spike in error rate or a drop in log volume (which often means a service crashed) is immediately visible.

2. **Request Tracing** — filter by requestId to see a request's full journey across services. Paste in a request ID from a customer support ticket, and see every log line from every service that handled that request, in chronological order.

3. **Error Deep Dive** — stack traces grouped by fingerprint with occurrence counts. Instead of seeing the same NullPointerException 400 times in the log stream, it shows up once with a count of 400 and a first/last seen timestamp. This makes it easy to spot new errors versus recurring ones.

Alerts are configured for three scenarios:

- **Error rate above 5%** for any service over 5 minutes — notification to Slack `#ops-alerts`. Catches active incidents.
- **Zero logs from any service** for more than 10 minutes — PagerDuty. Silence means something died — this is often more urgent than errors, because a crashed service produces no error logs.
- **New error fingerprint** not seen in the past 7 days — Slack `#engineering`. Catches new failure modes before they become production incidents, without alerting on known recurring issues.

## Real-World Example

Suki is a backend developer at a 10-person SaaS startup. Last week, customers reported intermittent 500 errors. She spent two hours SSH-ing between servers before finding the cause: the Python worker was timing out on a downstream API call, but the Express API was retrying silently, creating a cascade. The correlation between the two services was invisible without centralized logs.

She sets up centralized logging on a Friday afternoon. Loki and Grafana go up via Docker Compose, Promtail gets configured on both EC2 instances, and a Vercel log webhook handles the frontend. Both services are standardized to emit JSON logs with a shared requestId field.

The next time an error occurs, Suki searches by requestId in Grafana and sees the full chain — Express request, worker timeout, retry, second timeout, final 500 to the user — in a single view. What used to take two hours of SSH-and-grep now takes 30 seconds. The "new error fingerprint" alert catches a novel database connection exhaustion pattern on Wednesday before any customer reports it. The team fixes the connection pool configuration before it becomes an incident.

Debugging time drops from hours to minutes. Historical investigations become possible instead of impossible. And the team stops losing context every time log files rotate off disk.
