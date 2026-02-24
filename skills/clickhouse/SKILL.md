---
name: clickhouse
description: >
  ClickHouse is a columnar OLAP database built for real-time analytical queries over massive datasets.
  It supports a familiar SQL interface with powerful aggregation functions, materialized views for
  pre-computed rollups, and high-throughput inserts that make it ideal for event tracking, time-series
  analytics, and ad-hoc exploration of billions of rows.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-infrastructure
  tags:
    - database
    - analytics
    - olap
    - columnar
    - sql
---

# ClickHouse

ClickHouse is a column-oriented database management system designed for online analytical processing. Where traditional row-based databases excel at transactional workloads, ClickHouse shines when you need to scan and aggregate billions of rows in seconds. It achieves this through columnar storage, vectorized query execution, and aggressive compression.

This skill walks through deploying ClickHouse with Docker, creating tables with the MergeTree engine family, inserting data, running aggregation queries, and connecting from a Node.js application.

## Deploying ClickHouse with Docker

The fastest way to get a ClickHouse instance running is with the official Docker image. This gives you both the server and the built-in `clickhouse-client` CLI.

```bash
# docker-compose.yml — ClickHouse single-node deployment
# Exposes the HTTP interface on 8123 and the native protocol on 9000

docker run -d \
  --name clickhouse-server \
  -p 8123:8123 \
  -p 9000:9000 \
  -v clickhouse-data:/var/lib/clickhouse \
  -v clickhouse-logs:/var/log/clickhouse-server \
  clickhouse/clickhouse-server:latest
```

Once the container is running, connect with the native client:

```bash
# CLI — connect to the running ClickHouse instance
docker exec -it clickhouse-server clickhouse-client
```

You can also query via HTTP, which is useful for quick health checks and lightweight integrations:

```bash
# curl — HTTP interface query example
curl 'http://localhost:8123/' --data-binary 'SELECT version()'
```

## Table Engines and MergeTree

ClickHouse organizes data through table engines, and MergeTree is the workhorse you will use for almost everything. It supports primary key indexing, data partitioning, and automatic background merges that keep query performance high even under continuous inserts.

```sql
-- DDL — create an events table using MergeTree engine
-- Partitioned by month for efficient time-range queries
-- Ordered by event timestamp and user for fast filtered aggregations

CREATE TABLE events (
    event_id     UUID DEFAULT generateUUIDv4(),
    user_id      UInt64,
    event_name   LowCardinality(String),
    properties   String,
    created_at   DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (created_at, user_id);
```

The `ORDER BY` clause defines the primary key and controls how data is physically sorted on disk. Queries that filter or group by these columns will be significantly faster because ClickHouse can skip entire data granules that don't match.

For high-cardinality string columns that still have a bounded set of values (like event names), `LowCardinality(String)` applies dictionary encoding and dramatically reduces storage and speeds up group-by queries.

### ReplacingMergeTree for Deduplication

When your ingestion pipeline might send duplicate events, `ReplacingMergeTree` collapses rows with the same sorting key during background merges:

```sql
-- DDL — deduplicated user profiles using ReplacingMergeTree
-- The latest row (by updated_at) wins during merge

CREATE TABLE user_profiles (
    user_id      UInt64,
    display_name String,
    plan         LowCardinality(String),
    updated_at   DateTime
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY user_id;
```

## Inserting Data

ClickHouse is optimized for batch inserts. Sending one row at a time works but wastes resources. Aim for batches of at least a few thousand rows.

```sql
-- DML — batch insert of event records
INSERT INTO events (user_id, event_name, properties) VALUES
    (1001, 'page_view', '{"page": "/dashboard"}'),
    (1001, 'button_click', '{"button": "export"}'),
    (1002, 'page_view', '{"page": "/settings"}'),
    (1003, 'signup', '{}');
```

For bulk loading from files, ClickHouse can ingest CSV, JSON, and Parquet directly:

```bash
# CLI — bulk insert from a CSV file via clickhouse-client
cat events.csv | docker exec -i clickhouse-server \
  clickhouse-client --query="INSERT INTO events FORMAT CSVWithNames"
```

## Aggregation Queries

This is where ClickHouse earns its keep. Aggregation queries over millions of rows return in milliseconds thanks to columnar scanning and SIMD-accelerated computation.

```sql
-- Analytics — daily active users over the last 30 days
SELECT
    toDate(created_at) AS day,
    uniqExact(user_id) AS dau
FROM events
WHERE created_at >= now() - INTERVAL 30 DAY
GROUP BY day
ORDER BY day;
```

```sql
-- Analytics — top 10 most used features this week
SELECT
    event_name,
    count() AS total,
    uniq(user_id) AS unique_users
FROM events
WHERE created_at >= toMonday(now())
GROUP BY event_name
ORDER BY total DESC
LIMIT 10;
```

```sql
-- Analytics — retention cohort: users who signed up in January
-- and returned within 7 days
SELECT
    toDate(s.created_at) AS signup_date,
    count(DISTINCT r.user_id) AS retained
FROM events s
INNER JOIN events r ON s.user_id = r.user_id
    AND r.created_at BETWEEN s.created_at AND s.created_at + INTERVAL 7 DAY
    AND r.event_name != 'signup'
WHERE s.event_name = 'signup'
    AND s.created_at BETWEEN '2025-01-01' AND '2025-01-31'
GROUP BY signup_date
ORDER BY signup_date;
```

## Materialized Views

Materialized views in ClickHouse are triggers that transform data at insert time. They read from a source table and write aggregated results into a destination table, giving you pre-computed rollups without any external scheduler.

```sql
-- DDL — destination table for hourly event counts
CREATE TABLE hourly_event_counts (
    hour       DateTime,
    event_name LowCardinality(String),
    count      UInt64,
    unique_users UInt64
) ENGINE = SummingMergeTree()
ORDER BY (hour, event_name);
```

```sql
-- DDL — materialized view that populates hourly_event_counts
-- on every INSERT into the events table
CREATE MATERIALIZED VIEW mv_hourly_events
TO hourly_event_counts
AS SELECT
    toStartOfHour(created_at) AS hour,
    event_name,
    count() AS count,
    uniq(user_id) AS unique_users
FROM events
GROUP BY hour, event_name;
```

Now every insert into `events` automatically updates the rollup. Querying `hourly_event_counts` is near-instant regardless of how large the raw events table grows.

## Node.js Client

The official `@clickhouse/client` package provides a typed, streaming-capable client for Node.js applications.

```javascript
// clickhouse-client.js — Node.js ClickHouse client setup and query example
// npm install @clickhouse/client

import { createClient } from '@clickhouse/client';

const client = createClient({
  url: 'http://localhost:8123',
  username: 'default',
  password: '',
  database: 'default',
});

// Insert a batch of events
async function insertEvents(events) {
  await client.insert({
    table: 'events',
    values: events,
    format: 'JSONEachRow',
  });
}

// Query daily active users
async function getDailyActiveUsers(days = 30) {
  const result = await client.query({
    query: `
      SELECT toDate(created_at) AS day, uniqExact(user_id) AS dau
      FROM events
      WHERE created_at >= now() - INTERVAL {days:UInt32} DAY
      GROUP BY day ORDER BY day
    `,
    query_params: { days },
    format: 'JSONEachRow',
  });
  return result.json();
}

// Usage
await insertEvents([
  { user_id: 1001, event_name: 'page_view', properties: '{"page":"/home"}' },
  { user_id: 1002, event_name: 'signup', properties: '{}' },
]);

const dau = await getDailyActiveUsers(7);
console.log('DAU last 7 days:', dau);

await client.close();
```

The client supports streaming for large result sets via `result.stream()`, which yields rows in chunks rather than buffering the entire response in memory. For high-throughput ingestion, keep a persistent client instance and batch your inserts on a timer or buffer threshold.
