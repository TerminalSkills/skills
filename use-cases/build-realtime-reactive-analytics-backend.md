---
title: "Build a Real-Time Reactive Analytics Backend"
slug: build-realtime-reactive-analytics-backend
description: "Combine a reactive database with an event ingestion pipeline to power live dashboards that update the instant data changes."
skills:
  - convex
  - realtime-analytics
  - mongodb
category: data-ai
tags:
  - real-time
  - analytics
  - convex
  - clickhouse
  - mongodb
---

# Build a Real-Time Reactive Analytics Backend

## The Problem

A SaaS company with 8,000 active users needs a dashboard that shows live metrics: active sessions, feature usage, conversion funnels, and error rates -- all updating in real time without page refreshes. Their current setup polls a PostgreSQL database every 30 seconds, which causes stale data, wasted queries, and a dashboard that feels sluggish. When a deployment causes an error spike, the team does not see it for 30 seconds to 2 minutes, and by then hundreds of users have already been affected. They need sub-second data freshness for operational metrics and efficient historical aggregation for trend analysis.

## The Solution

Using the **convex**, **realtime-analytics**, and **mongodb** skills, the workflow builds a three-tier data architecture: Convex handles the reactive frontend state so dashboards update instantly when data changes, ClickHouse ingests and aggregates high-volume event streams for analytical queries, and MongoDB stores the flexible document data that powers user-facing features and configuration.

## Step-by-Step Walkthrough

### 1. Design the event schema and ingestion pipeline

Set up a ClickHouse-based event pipeline that can ingest thousands of events per second with sub-second query latency for aggregations.

> Build a real-time analytics event ingestion service. Design the event schema for page_view, feature_used, error_occurred, and conversion_step events. Use ClickHouse with a MergeTree engine partitioned by day. Create a Node.js ingestion endpoint that batches events (flush every 500ms or 100 events) and writes to ClickHouse. Include materialized views for 1-minute and 1-hour rollups.

The ClickHouse schema and rollup setup looks like this:

```sql
CREATE TABLE events (
    event_id     UUID DEFAULT generateUUIDv4(),
    event_type   Enum8('page_view'=1, 'feature_used'=2,
                        'error_occurred'=3, 'conversion_step'=4),
    user_id      String,
    session_id   String,
    properties   String,  -- JSON payload
    timestamp    DateTime64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (event_type, user_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- Rollup table: counts are summed, unique users are kept as a mergeable state
CREATE TABLE events_1m (
    minute      DateTime,
    event_type  Enum8('page_view'=1, 'feature_used'=2,
                      'error_occurred'=3, 'conversion_step'=4),
    event_count SimpleAggregateFunction(sum, UInt64),
    users       AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
ORDER BY (minute, event_type);

-- The materialized view runs on every insert block and writes partial states into events_1m
CREATE MATERIALIZED VIEW events_1m_mv TO events_1m AS
SELECT
    toStartOfMinute(timestamp) AS minute,
    event_type,
    count()                    AS event_count,
    uniqState(user_id)         AS users
FROM events
GROUP BY minute, event_type;
```

Each insert block produces its own partial row, and ClickHouse merges them in the background, so queries must finish the aggregation themselves:

```sql
SELECT minute, event_type, sum(event_count) AS events, uniqMerge(users) AS unique_users
FROM events_1m
WHERE minute >= now() - INTERVAL 24 HOUR
GROUP BY minute, event_type
ORDER BY minute;
```

Storing `uniqExact(user_id)` directly in a plain rollup table would be wrong: unique counts from separate insert blocks cannot be added together. An hourly rollup follows the same pattern with `toStartOfHour`. A "feature usage last 24 hours" query reads about 1,440 merged rollup rows per event type instead of scanning the raw events table.

### 2. Set up MongoDB for user and configuration data

Configure MongoDB for the application data layer -- user profiles, dashboard configurations, alert rules, and team settings that need flexible schemas and fast reads.

> Set up a MongoDB schema for the analytics platform: users collection with embedded team membership and notification preferences, dashboards collection with flexible widget configurations stored as nested documents, and alert_rules collection with conditions and action webhooks. Create indexes on users.teamId, dashboards.ownerId, and alert_rules.isActive. Use a change stream on alert_rules so the evaluator reloads rules when they change (change streams need a replica set, so run MongoDB as a single-node replica set even in development).

MongoDB's flexible document model is ideal here because dashboard configurations vary widely -- one widget might track a simple counter while another defines a multi-step funnel with filters. Embedding these as nested documents avoids complex joins and keeps reads fast.

### 3. Build the reactive frontend layer with Convex

Create a Convex backend that subscribes to data changes and pushes updates to connected dashboard clients in real time, eliminating polling entirely.

> Build a Convex backend with these functions: a query that returns the current dashboard state for a user (widgets, layout, filters), a mutation to update widget configurations, and an action that fetches the latest aggregated metrics from ClickHouse every 5 seconds and writes them to a Convex table. Use Convex's reactive queries so any connected dashboard auto-updates when the metrics table changes.

The scheduled action calls ClickHouse over its HTTP interface (`POST` with the query as the body and `?default_format=JSON` in the URL, credentials in the `X-ClickHouse-User` and `X-ClickHouse-Key` headers), so the ClickHouse endpoint must be reachable from Convex over HTTPS with a read-only user. Convex actions can call external APIs; queries and mutations cannot.

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("refresh metrics", { seconds: 5 }, internal.metrics.refresh);
export default crons;
```

```typescript
// convex/metrics.ts
import { internalAction, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    const res = await fetch(`${process.env.CLICKHOUSE_URL}/?default_format=JSON`, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": process.env.CLICKHOUSE_USER!,
        "X-ClickHouse-Key": process.env.CLICKHOUSE_PASSWORD!,
      },
      body: `SELECT event_type, sum(event_count) AS events, uniqMerge(users) AS unique_users
             FROM events_1m WHERE minute >= now() - INTERVAL 5 MINUTE GROUP BY event_type`,
    });
    if (!res.ok) throw new Error(`ClickHouse ${res.status}`);
    const { data } = await res.json();
    await ctx.runMutation(internal.metrics.store, { rows: data });
  },
});

export const store = internalMutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const existing = await ctx.db.query("metrics")
        .withIndex("by_type", (q) => q.eq("eventType", row.event_type)).unique();
      const doc = { eventType: row.event_type, events: Number(row.events), uniqueUsers: Number(row.unique_users) };
      if (existing) await ctx.db.patch(existing._id, doc); else await ctx.db.insert("metrics", doc);
    }
    // An event type with no rows in the window must drop to zero, not keep its last value
    const seen = new Set(rows.map((r) => r.event_type));
    for (const m of await ctx.db.query("metrics").collect()) {
      if (!seen.has(m.eventType)) await ctx.db.patch(m._id, { events: 0, uniqueUsers: 0 });
    }
  },
});

export const latest = query({
  args: {},
  handler: async (ctx) => ctx.db.query("metrics").collect(),   // reactive: clients re-render on change
});
```

Dashboards subscribe with `useQuery(api.metrics.latest)` and re-render when the table changes, with no WebSocket or polling code in the app. Freshness is bounded by the 5-second refresh interval, not by Convex. Define the `metrics` table with a `by_type` index on `eventType` in `convex/schema.ts`. `process.env` needs `@types/node` installed and `"types": ["node"]` in `convex/tsconfig.json` (TypeScript 6 no longer loads `@types` packages on its own); set the three `CLICKHOUSE_*` variables with `npx convex env set`.

### 4. Wire up alerting and historical analysis

Connect the three data stores so alerts fire on real-time data and historical trends are queryable for post-incident analysis.

> Create an alert evaluation pipeline: a scheduled Convex action queries the 1-minute rollup and, when a metric exceeds a threshold (like error rate above 5% in a 1-minute window), writes the alert to Convex so it appears on dashboards instantly, and store the alert history in MongoDB with full context for post-incident review. Build a historical analysis query that joins ClickHouse aggregations with MongoDB user segments to answer questions like "which customer tier experienced the most errors last week."

The three-tier architecture plays to each database's strengths. ClickHouse handles the analytical heavy lifting, MongoDB stores the rich contextual data, and Convex bridges everything to the frontend with reactive updates.

Materialized views only maintain the rollups; they do not fire alerts. Evaluate thresholds by querying the rollup every 5-10 seconds, which is far cheaper than evaluating them on every raw event. Reserve Convex mutations for user-visible state changes only, and let MongoDB handle the durable audit trail of every alert that fired, who acknowledged it, and what the resolution was.

## Real-World Example

A developer tools company with 8,000 users replaces its 30-second polling dashboard with this architecture. Their own numbers after the first quarter: peak ingestion around 12,000 events per second, dashboards on the rollup tables answering in tens of milliseconds, and error spikes visible within the 5-second refresh interval instead of 30 seconds to 2 minutes. Alert history lives in MongoDB with flexible schemas, so adding fields to alert documents needed no migration. Costs and latency depend on hardware, plan and region, so measure against your own load before promising numbers.

## Related Skills

- **convex**: reactive queries, scheduled actions and cron jobs that push fresh metrics to dashboards
- **realtime-analytics**: ClickHouse event schema, batched ingestion and rollups
- **mongodb**: dashboard configuration, alert rules and the alert audit trail
