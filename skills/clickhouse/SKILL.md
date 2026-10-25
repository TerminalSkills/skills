---
name: clickhouse
description: >-
  ClickHouse is a columnar OLAP database for real-time analytical queries over billions of rows.
  It speaks SQL, stores data in MergeTree tables, and rolls up data at insert time with
  materialized views. Use when the user wants to run ClickHouse in Docker, design MergeTree
  tables, load events or logs, write aggregation or retention queries, build rollups, or connect
  from Node.js. Trigger words: clickhouse, olap, mergetree, columnar database, analytics database.
license: Apache-2.0
compatibility: "Docker (or a native ClickHouse install); examples tested on ClickHouse 26.10 and @clickhouse/client 1.24 (Node >= 20)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: "https://github.com/ClickHouse/ClickHouse"
  tags: "database, analytics, olap, columnar, sql"
---

# ClickHouse

## Overview

ClickHouse is a column-oriented database for online analytical processing: it scans and aggregates very large tables quickly through columnar storage, vectorized execution and compression. It is a poor fit for frequent single-row updates or deletes and for transactional workloads; keep those in PostgreSQL or MySQL and send analytical copies to ClickHouse. New feature releases come monthly (26.10 at the time of writing), with some versions designated long-term support; pin a version tag in production instead of `latest`.

## Instructions

### Run it with Docker

The image's `default` user cannot be used from outside the container without a password, so create a user at startup. Publish ports on loopback only unless you have put TLS and a firewall in front.

```bash
export CLICKHOUSE_PASSWORD="$(openssl rand -hex 16)"
docker run -d --name clickhouse-server \
  -p 127.0.0.1:8123:8123 -p 127.0.0.1:9000:9000 \
  -e CLICKHOUSE_USER=analytics -e CLICKHOUSE_PASSWORD="$CLICKHOUSE_PASSWORD" \
  --ulimit nofile=262144:262144 \
  -v clickhouse-data:/var/lib/clickhouse \
  clickhouse/clickhouse-server:26.10

docker exec -it clickhouse-server clickhouse-client -u analytics --password "$CLICKHOUSE_PASSWORD"
curl -s -u "analytics:$CLICKHOUSE_PASSWORD" http://127.0.0.1:8123/ --data-binary 'SELECT version()'
```

Without credentials the HTTP call returns `Code: 194 ... Authentication failed (REQUIRED_PASSWORD)`.

### Design MergeTree tables

- `ENGINE = MergeTree` is the default choice. `ORDER BY` is the sorting and sparse primary key: put columns you filter on most first, low-cardinality ones before high-cardinality ones. Queries that filter on a prefix of it skip whole granules.
- `PARTITION BY toYYYYMM(created_at)` is for data lifecycle (dropping or moving old months), not for speed. Keep partitions to tens or hundreds, never thousands.
- Use `LowCardinality(String)` for columns with fewer than roughly 10,000 distinct values, and the narrowest numeric and date types that fit.
- Insert in batches of thousands of rows at a time or more. Many tiny inserts create many parts and slow everything down.
- `ReplacingMergeTree(version)` removes duplicates only during background merges, so read with `FINAL` (or `argMax`) when you need the latest row now.

### Rollups with materialized views

A materialized view runs on every insert into its source table and writes into a target table. Rolling up distinct counts needs aggregate states, because summing `uniq` results from different inserts double counts users. Use `AggregatingMergeTree` with `uniqState` on write and `uniqMerge` on read. `SummingMergeTree` is only correct for plain additive numbers. A view does not backfill rows inserted before it was created.

### Query from Node.js

`npm install @clickhouse/client` (the official client; uses the HTTP interface on port 8123). Pass values as typed query parameters (`{days:UInt32}`), never by string interpolation, and read credentials from the environment.

## Examples

### Example 1: Event table, batch load and daily active users

**User request:** "Track page views and signups, and show me daily active users for the last 30 days"

```sql
CREATE TABLE events (
    event_id   UUID DEFAULT generateUUIDv4(),
    user_id    UInt64,
    event_name LowCardinality(String),
    properties String,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (event_name, toStartOfHour(created_at), user_id);

INSERT INTO events (user_id, event_name, properties) VALUES
    (1001, 'page_view',    '{"page": "/dashboard"}'),
    (1001, 'button_click', '{"button": "export"}'),
    (1002, 'page_view',    '{"page": "/settings"}'),
    (1003, 'signup',       '{}');

SELECT toDate(created_at) AS day, uniqExact(user_id) AS dau
FROM events
WHERE created_at >= now() - INTERVAL 30 DAY
GROUP BY day
ORDER BY day;
```

Bulk load a CSV file that has a header row (the container reads it from stdin):

```bash
docker exec -i clickhouse-server clickhouse-client -u analytics --password "$CLICKHOUSE_PASSWORD" \
  --query "INSERT INTO events (user_id, event_name, properties, created_at) FORMAT CSVWithNames" < events.csv
```

**Result:** `SELECT` returns one row per day, for example `2026-10-24  3`. Extract JSON fields with `JSONExtractString(properties, 'page')`.

### Example 2: Hourly rollup with distinct users, and 7-day signup retention

**User request:** "Give me hourly event counts with unique users that stay fast as the table grows, and tell me how many signups came back within a week"

```sql
CREATE TABLE hourly_event_stats (
    hour         DateTime,
    event_name   LowCardinality(String),
    total        SimpleAggregateFunction(sum, UInt64),
    unique_users AggregateFunction(uniq, UInt64)
) ENGINE = AggregatingMergeTree
ORDER BY (hour, event_name);

CREATE MATERIALIZED VIEW mv_hourly_event_stats TO hourly_event_stats AS
SELECT toStartOfHour(created_at) AS hour, event_name,
       count() AS total, uniqState(user_id) AS unique_users
FROM events
GROUP BY hour, event_name;

-- reading the rollup: merge the partial states
SELECT hour, event_name, sum(total) AS total, uniqMerge(unique_users) AS users
FROM hourly_event_stats
GROUP BY hour, event_name
ORDER BY hour DESC, event_name;

-- 7-day retention per signup day, without a self-join
SELECT toDate(signed_up) AS signup_day,
       count() AS signups,
       countIf(arrayExists(t -> t > signed_up AND t <= signed_up + INTERVAL 7 DAY, visits)) AS retained_7d
FROM (
    SELECT user_id,
           minIf(created_at, event_name = 'signup')             AS signed_up,
           groupArrayIf(created_at, event_name != 'signup')     AS visits
    FROM events
    GROUP BY user_id
    HAVING countIf(event_name = 'signup') > 0
)
GROUP BY signup_day
ORDER BY signup_day;
```

**Result:** the view only sees rows inserted after it was created, so right after the Example 1 inserts the rollup query returns nothing; insert more events and it returns rows like `2026-10-24 18:00:00  page_view  3  2` (three views, two distinct users). On the Example 1 data the retention query returns `2026-10-24  1  0`: one signup that day (user 1003) and none who came back within seven days. A later event from that user would make `retained_7d` 1.

### Example 3: Insert and query from Node.js

```javascript
// events.mjs — run with: CLICKHOUSE_PASSWORD=... node events.mjs
import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD ?? '',
  database: 'default',
});

async function insertEvents(rows) {
  await client.insert({ table: 'events', values: rows, format: 'JSONEachRow' });
}

async function dailyActiveUsers(days) {
  const result = await client.query({
    query: `
      SELECT toString(toDate(created_at)) AS day, uniqExact(user_id) AS dau
      FROM events
      WHERE created_at >= now() - INTERVAL {days:UInt32} DAY
      GROUP BY day ORDER BY day`,
    query_params: { days },
    format: 'JSONEachRow',
  });
  return result.json();
}

try {
  await insertEvents([
    { user_id: 2001, event_name: 'page_view', properties: '{"page":"/home"}' },
    { user_id: 2002, event_name: 'signup', properties: '{}' },
  ]);
  console.log(await dailyActiveUsers(7));
} finally {
  await client.close();
}
```

**Result:** prints an array such as `[ { day: '2026-10-24', dau: 2 } ]`. For large result sets use `result.stream()` instead of `result.json()`. Keep one client for the process lifetime and batch inserts on a timer or size threshold, or enable async inserts.

## Guidelines

- Set a password for every user and never publish 8123 or 9000 to the internet; the HTTP interface runs any SQL you are authorized for.
- Pin the image tag. Upgrades between monthly versions are usually safe, but read the changelog first and test on a copy.
- Choose `ORDER BY` before loading data; changing it later means creating a new table and copying the data.
- `UPDATE` and `DELETE` are heavy operations on immutable parts; model corrections as new rows (`ReplacingMergeTree`) or drop whole partitions.
- Prefer approximate `uniq` over `uniqExact` when a small error is acceptable; it is much cheaper on large data.
- Check index use with `EXPLAIN indexes = 1 SELECT ...`: it lists parts and granules read per index. A query that reads nearly all granules for a selective filter usually has the wrong `ORDER BY`.
- Do not use ClickHouse as the system of record for data that needs transactions or foreign keys.
