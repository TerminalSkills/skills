---
name: tinybird
description: >-
  Build real-time analytics APIs with Tinybird — ingest millions of events and
  query with SQL over HTTP. Use when someone asks to "build analytics API",
  "Tinybird", "real-time analytics", "event analytics", "ClickHouse as a
  service", "usage metering", or "product analytics backend". Covers data
  ingestion, SQL pipes, API endpoints, and real-time dashboards.
license: Apache-2.0
compatibility: "REST API. Any language. ClickHouse SQL dialect."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["analytics", "tinybird", "real-time", "clickhouse", "events"]
---

# Tinybird

## Overview

Tinybird turns raw event data into real-time analytics APIs. Ingest millions of events per second, write SQL queries (ClickHouse dialect), and publish them as HTTP API endpoints — all without managing infrastructure. Think "ClickHouse as a service with built-in API layer." Used for product analytics, usage metering, real-time dashboards, and any workload where you need fast aggregations over large datasets.

## When to Use

- Product analytics (page views, clicks, feature usage)
- Usage metering for billing (API calls per customer)
- Real-time dashboards (live metrics, monitoring)
- Event processing at scale (IoT, logs, user activity)
- Need ClickHouse performance without managing ClickHouse

## Instructions

### Setup

```bash
pip install tinybird-cli
tb auth --token YOUR_TOKEN
```

### Define Data Sources

```sql
-- datasources/events.datasource
DESCRIPTION >
  Raw user events ingested from the application

SCHEMA >
  `event_id` String,
  `user_id` String,
  `event_type` String,
  `properties` String,  -- JSON string
  `timestamp` DateTime
ENGINE MergeTree
ENGINE_SORTING_KEY timestamp, user_id
```

### Ingest Events

```typescript
// src/analytics/track.ts — Send events to Tinybird
const TINYBIRD_URL = "https://api.tinybird.co/v0/events";
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN;

async function trackEvent(event: {
  userId: string;
  eventType: string;
  properties?: Record<string, any>;
}) {
  await fetch(`${TINYBIRD_URL}?name=events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TINYBIRD_TOKEN}` },
    body: JSON.stringify({
      event_id: crypto.randomUUID(),
      user_id: event.userId,
      event_type: event.eventType,
      properties: JSON.stringify(event.properties || {}),
      timestamp: new Date().toISOString(),
    }),
  });
}

// Usage
await trackEvent({ userId: "user_123", eventType: "page_view", properties: { page: "/pricing" } });
await trackEvent({ userId: "user_123", eventType: "button_click", properties: { button: "signup" } });
```

### SQL Pipes (Queries → APIs)

```sql
-- pipes/daily_active_users.pipe
DESCRIPTION >
  Daily active users over the last 30 days

NODE daily_counts
SQL >
  SELECT
    toDate(timestamp) AS date,
    uniqExact(user_id) AS active_users
  FROM events
  WHERE timestamp >= now() - INTERVAL 30 DAY
  GROUP BY date
  ORDER BY date DESC

-- This becomes an API endpoint:
-- GET https://api.tinybird.co/v0/pipes/daily_active_users.json
```

```sql
-- pipes/user_activity.pipe
DESCRIPTION >
  Activity breakdown for a specific user

NODE activity
SQL >
  SELECT
    event_type,
    count() AS event_count,
    max(timestamp) AS last_seen
  FROM events
  WHERE user_id = {{ String(user_id, required=True) }}
    AND timestamp >= now() - INTERVAL {{ Int32(days, 7) }} DAY
  GROUP BY event_type
  ORDER BY event_count DESC

-- API: GET /v0/pipes/user_activity.json?user_id=user_123&days=30
```

### Query from Your App

```typescript
// src/analytics/query.ts — Fetch analytics from Tinybird API
async function getDailyActiveUsers(): Promise<Array<{ date: string; active_users: number }>> {
  const res = await fetch(
    "https://api.tinybird.co/v0/pipes/daily_active_users.json",
    { headers: { Authorization: `Bearer ${TINYBIRD_TOKEN}` } }
  );
  const data = await res.json();
  return data.data;
}

async function getUserActivity(userId: string, days = 7) {
  const res = await fetch(
    `https://api.tinybird.co/v0/pipes/user_activity.json?user_id=${userId}&days=${days}`,
    { headers: { Authorization: `Bearer ${TINYBIRD_TOKEN}` } }
  );
  return (await res.json()).data;
}
```

## Examples

### Example 1: Build a product analytics dashboard

**User prompt:** "Track user events in our SaaS app and build a real-time analytics dashboard."

The agent will set up Tinybird event ingestion, create SQL pipes for key metrics (DAU, retention, feature usage), and build API endpoints for the dashboard.

### Example 2: Usage metering for API billing

**User prompt:** "Track API calls per customer per month for usage-based billing."

The agent will create a data source for API calls, aggregate by customer and billing period, and expose a metering API endpoint.

## Guidelines

- **Events API for ingestion** — HTTP POST, supports batching
- **SQL Pipes for queries** — ClickHouse SQL dialect with template parameters
- **Pipes become APIs** — each pipe is a queryable HTTP endpoint
- **Template parameters** — `{{ String(param) }}` for dynamic API queries
- **MergeTree engine** — sort by timestamp + key columns for fast queries
- **Materialized views** — pre-aggregate for sub-second dashboard queries
- **Free tier: 10GB storage, unlimited queries** — generous for startups
- **No JOINs on large tables** — denormalize data at ingestion time
- **Batch ingestion** — NDJSON format for bulk loading
- **CLI for development** — `tb push` deploys pipes, `tb sql` for ad-hoc queries
