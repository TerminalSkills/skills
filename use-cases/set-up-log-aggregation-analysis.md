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

Your logs are everywhere — stdout on one service, JSON files on another, syslog on your proxy, and CloudWatch for your Lambda functions. When something breaks, you SSH into three different servers, grep through gigabytes of unstructured text, and try to correlate timestamps manually. A 10-person backend team spends 30% of their debugging time just finding the right log lines. Worse, there is no way to search logs historically — once they rotate off disk, that context is gone forever.

## The Solution

Use the **docker-helper** skill to deploy a centralized logging stack, the **coding-agent** to configure structured log shipping from all services, and **data-analysis** to build queries that surface error patterns and anomalies.

```bash
npx terminal-skills install docker-helper coding-agent data-analysis
```

## Step-by-Step Walkthrough

### 1. Describe your current logging landscape

```text
We have 4 services: an Express API on EC2, a Python worker on EC2, a Next.js
frontend on Vercel, and a Postgres database on RDS. Logs are all over the place.
Help me set up centralized logging with search and alerting. We want to self-host
on our existing EC2 infrastructure.
```

### 2. The agent designs a logging architecture

```text
Recommended Stack: Loki + Grafana (lightweight, cost-effective for your scale)

Architecture:
- Promtail agent on each EC2 instance (ships logs to Loki)
- Loki for log storage and indexing (runs on a dedicated t3.medium)
- Grafana for search, dashboards, and alerting
- Vercel logs: webhook to a small ingestion Lambda that forwards to Loki

Why Loki over ELK: Your volume (~5GB/day) doesn't justify Elasticsearch overhead.
Loki indexes labels only, storing compressed log chunks — 10x cheaper at your scale.
```

### 3. The agent generates Docker Compose and configuration

```yaml
# docker-compose.logging.yml
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

### 4. The agent standardizes your log format

```text
Created structured logging configurations:

Express API (api/src/logger.js):
- Winston logger with JSON format
- Fields: timestamp, level, service, requestId, method, path, duration, error

Python Worker (worker/logging_config.py):
- structlog with JSON renderer
- Fields: timestamp, level, service, task_name, job_id, duration, error

Both services now emit consistent JSON logs with shared fields,
making cross-service correlation possible via requestId.
```

### 5. The agent builds Grafana dashboards and alerts

```text
Created 3 Grafana dashboards:
1. Service Overview: error rate, log volume, and top error messages per service
2. Request Tracing: filter by requestId to see a request's journey across services
3. Error Deep Dive: stack traces grouped by fingerprint with occurrence counts

Alerts configured:
- Error rate > 5% for any service over 5 minutes → Slack #ops-alerts
- Zero logs from any service for > 10 minutes → PagerDuty
- New error fingerprint not seen in past 7 days → Slack #engineering
```

## Real-World Example

Suki is a backend developer at a 10-person SaaS startup. Last week, customers reported intermittent 500 errors. Suki spent two hours SSH-ing between servers before finding the cause: the Python worker was timing out on a downstream API call, but the Express API was retrying silently, creating a cascade.

1. Suki asks the agent to set up centralized logging for their four services
2. The agent deploys Loki and Grafana via Docker Compose, configures Promtail on both EC2 instances, and sets up a Vercel log webhook
3. It standardizes both services to emit JSON logs with a shared requestId field
4. The next time an error occurs, Suki searches by requestId in Grafana and sees the full chain — Express request, worker timeout, retry, second timeout — in a single view
5. Debugging time drops from hours to minutes, and the alerting catches new error patterns before customers report them
