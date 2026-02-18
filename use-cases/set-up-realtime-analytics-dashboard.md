---
title: "Set Up a Real-Time Analytics Dashboard from Scratch"
slug: set-up-realtime-analytics-dashboard
description: "Build a live analytics dashboard that ingests event streams, aggregates metrics, and renders updating charts — without relying on expensive third-party platforms."
skills: [realtime-analytics, data-analysis, docker-helper]
category: data-ai
tags: [analytics, real-time, dashboard, event-streaming, clickhouse]
---

# Set Up a Real-Time Analytics Dashboard from Scratch

## The Problem

Your product team wants a live dashboard showing active users, conversion funnels, and feature adoption — updated every few seconds, not every 24 hours. Third-party analytics tools cost thousands per month at your event volume, and self-hosted options like Matomo are not truly real-time. You need a custom pipeline: ingest events, aggregate them on the fly, and render live charts.

## The Solution

Wire together an event ingestion API, a columnar database optimized for analytics queries (ClickHouse), and a lightweight frontend that polls or streams aggregated data. Three skills handle each layer.

```bash
npx terminal-skills install realtime-analytics data-analysis docker-helper
```

## Step-by-Step Walkthrough

### 1. Design the event schema

```text
Design an analytics event schema for a SaaS product. Events include page_view, button_click, signup_started, signup_completed, feature_used, and error_occurred. Each event needs: event_name, timestamp, session_id, user_id (nullable for anonymous), device_type, country_code, and a properties JSON column for event-specific data. Output a ClickHouse CREATE TABLE statement optimized for time-range queries.
```

The agent generates:

```sql
CREATE TABLE events (
    event_name   LowCardinality(String),
    timestamp    DateTime64(3),
    session_id   String,
    user_id      Nullable(String),
    device_type  LowCardinality(String),
    country_code LowCardinality(FixedString(2)),
    properties   String,  -- JSON stored as string, extracted at query time
    date         Date DEFAULT toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (event_name, timestamp)
TTL date + INTERVAL 90 DAY;
```

### 2. Build the ingestion endpoint

```text
Create a Node.js ingestion service in src/ingest/ that accepts POST /events with a JSON array of up to 500 events. Validate each event against the schema. Batch-insert into ClickHouse every 2 seconds or when the buffer reaches 1000 events, whichever comes first. Add a health check at GET /health that returns buffer size and last flush time.
```

### 3. Create aggregation queries

```text
Write ClickHouse SQL queries for these dashboard panels:
1. Active users in the last 5 minutes (count distinct session_id)
2. Signup funnel: signup_started → signup_completed, grouped by hour for the last 24h
3. Top 10 features used today, ranked by unique users
4. Error rate per minute for the last hour
Return each query as a named .sql file in src/queries/.
```

### 4. Build the dashboard frontend

```text
Create a React dashboard with four chart panels matching the aggregation queries. Use recharts for rendering. Each panel polls its API endpoint every 5 seconds. Add a connection status indicator and a time-range selector (last 1h, 6h, 24h). Style it with Tailwind — dark theme, grid layout, responsive for tablet and desktop.
```

### 5. Containerize and deploy

```text
Write a docker-compose.yml that runs ClickHouse, the ingestion service, and the dashboard frontend. Pin ClickHouse to version 24.1. Add volume mounts for ClickHouse data persistence. Include an init script that creates the events table on first boot. Add a .env.example with all required environment variables.
```

## Real-World Example

A product manager at a fast-growing fintech startup needs to see real-time signup funnels during a marketing campaign launch. The existing analytics tool updates daily, which is useless for a 4-hour campaign window.

1. She asks the agent to design the event schema — the ClickHouse table is ready in 2 minutes
2. The ingestion service goes up with batching and validation, handling 5000 events/second on a single node
3. Four aggregation queries power the dashboard: live users, funnel, feature ranking, error rate
4. The React frontend shows updating charts with 5-second refresh
5. Docker Compose bundles everything — `docker compose up` and the dashboard is live
6. During the campaign, the team spots a 40 % funnel drop-off at the email verification step and fixes the flow in real time
