---
name: realtime-analytics
description: >-
  Build real-time analytics pipelines from scratch. Use when someone asks to
  "set up analytics", "build a dashboard", "track events in real time",
  "ClickHouse analytics", "event ingestion pipeline", or "live metrics".
  Covers event schema design, ingestion services with batching, ClickHouse
  table optimization, aggregation queries, and dashboard wiring.
license: Apache-2.0
compatibility: "Node.js 18+, ClickHouse 23.8+, Docker recommended"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["analytics", "real-time", "clickhouse", "event-tracking"]
---

# Real-Time Analytics

## Overview

This skill enables AI agents to build self-hosted, real-time analytics systems. It covers the full pipeline from event ingestion through storage to query and visualization, using ClickHouse as the analytical database for sub-second query performance at scale.

## Instructions

### Event Schema Design

1. Every event must have these base fields:
   - `event_name` — LowCardinality(String) for efficient storage
   - `timestamp` — DateTime64(3) for millisecond precision
   - `session_id` — String, client-generated UUID
   - `user_id` — Nullable(String) for anonymous tracking
   - `device_type` — LowCardinality(String): desktop, mobile, tablet
   - `country_code` — LowCardinality(FixedString(2))
   - `properties` — String containing JSON for event-specific data

2. ClickHouse table optimization rules:
   - Use `MergeTree()` engine, partition by `toYYYYMM(date)`
   - ORDER BY should start with the most filtered column (usually `event_name`)
   - Add TTL for automatic data expiration (default 90 days)
   - Use `LowCardinality()` for any string column with fewer than 10,000 distinct values

### Ingestion Service

1. Build as a stateless HTTP service accepting `POST /events` with JSON array body.
2. Validate incoming events: reject if `event_name` or `timestamp` is missing.
3. Buffer events in memory. Flush when either condition is met:
   - Buffer reaches 1,000 events
   - 2 seconds have elapsed since last flush
4. Use ClickHouse's `INSERT ... FORMAT JSONEachRow` for batch inserts.
5. On flush failure, retry 3 times with exponential backoff, then write to a dead-letter file.
6. Expose `GET /health` returning: `{ "buffer_size": N, "last_flush": "ISO timestamp", "status": "ok" }`.

### Aggregation Queries

Write queries as named `.sql` files. Common dashboard panels:

**Active users (last N minutes):**
```sql
SELECT count(DISTINCT session_id) AS active_users
FROM events
WHERE timestamp > now() - INTERVAL 5 MINUTE;
```

**Funnel analysis (two-step):**
```sql
SELECT
  toStartOfHour(timestamp) AS hour,
  countIf(event_name = 'signup_started') AS started,
  countIf(event_name = 'signup_completed') AS completed,
  round(completed / started * 100, 1) AS conversion_pct
FROM events
WHERE date = today()
GROUP BY hour
ORDER BY hour;
```

**Top features by unique users:**
```sql
SELECT
  JSONExtractString(properties, 'feature') AS feature,
  count(DISTINCT user_id) AS unique_users
FROM events
WHERE event_name = 'feature_used' AND date = today()
GROUP BY feature
ORDER BY unique_users DESC
LIMIT 10;
```

**Error rate per minute:**
```sql
SELECT
  toStartOfMinute(timestamp) AS minute,
  count() AS error_count
FROM events
WHERE event_name = 'error_occurred'
  AND timestamp > now() - INTERVAL 1 HOUR
GROUP BY minute
ORDER BY minute;
```

### Dashboard API Layer

1. Create one REST endpoint per dashboard panel (e.g., `GET /api/dashboard/active-users`).
2. Each endpoint runs its SQL query and returns JSON.
3. Add a `time_range` query param: `1h`, `6h`, `24h`, `7d`. Adjust the WHERE clause accordingly.
4. Cache results for 3-5 seconds to avoid hammering ClickHouse on concurrent dashboard loads.

### Docker Compose Setup

Provide a `docker-compose.yml` with:
- ClickHouse service (pinned version, volume for data)
- Ingestion service (builds from Dockerfile)
- Dashboard frontend (builds from Dockerfile or served via nginx)
- An init container or entrypoint script that creates the events table

## Examples

### Example 1 — Schema for an e-commerce app

**Input:** "Design analytics events for an e-commerce checkout flow."

**Output:**
```sql
-- Core events: product_viewed, add_to_cart, checkout_started,
-- payment_submitted, order_completed, order_failed

CREATE TABLE events (
    event_name   LowCardinality(String),
    timestamp    DateTime64(3),
    session_id   String,
    user_id      Nullable(String),
    device_type  LowCardinality(String),
    country_code LowCardinality(FixedString(2)),
    properties   String,
    date         Date DEFAULT toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (event_name, timestamp)
TTL date + INTERVAL 180 DAY;
```

Properties JSON per event:
- `product_viewed`: `{"product_id": "p-42", "category": "electronics", "price_cents": 4999}`
- `add_to_cart`: `{"product_id": "p-42", "quantity": 1}`
- `payment_submitted`: `{"method": "card", "amount_cents": 9998}`

### Example 2 — Ingestion buffer logic

**Input:** "Show the buffer flush logic in Node.js."

**Output:**
```js
const FLUSH_INTERVAL_MS = 2000;
const FLUSH_SIZE = 1000;
let buffer = [];

async function addEvents(events) {
  buffer.push(...events);
  if (buffer.length >= FLUSH_SIZE) await flush();
}

setInterval(async () => {
  if (buffer.length > 0) await flush();
}, FLUSH_INTERVAL_MS);

async function flush() {
  const batch = buffer.splice(0, buffer.length);
  const rows = batch.map(e => JSON.stringify(e)).join('\n');
  await clickhouse.insert({
    table: 'events',
    values: batch,
    format: 'JSONEachRow',
  });
}
```

## Guidelines

- **Partition wisely.** Monthly partitions work for most apps. Daily only if you ingest > 100M events/day.
- **Do not use Kafka unless asked.** For under 50K events/second, direct HTTP ingestion with in-memory buffering is simpler and sufficient.
- **Always add TTL.** Unbounded analytical tables grow fast. Default to 90 days; let the user override.
- **Test with realistic volume.** Generate synthetic events to validate the pipeline handles expected throughput before going live.
- **Avoid SELECT *.** Always specify columns in aggregation queries to minimize I/O.
