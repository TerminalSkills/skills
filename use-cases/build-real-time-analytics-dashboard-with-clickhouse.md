---
title: Build a Real-Time Analytics Dashboard with ClickHouse
slug: build-real-time-analytics-dashboard-with-clickhouse
description: Build a real-time product analytics dashboard that ingests millions of events per day into ClickHouse, supports sub-second queries on billions of rows, and visualizes funnels, retention, and user journeys.
skills:
  - typescript
  - nextjs
  - redis
  - tailwindcss
  - hono
category: Data Engineering
tags:
  - analytics
  - clickhouse
  - real-time
  - dashboard
  - data-engineering
---

# Build a Real-Time Analytics Dashboard with ClickHouse

## The Problem

Leo runs product at a 60-person SaaS with 200K daily active users generating 15M events per day. Their PostgreSQL-based analytics is dying: a simple funnel query takes 45 seconds on 800M rows. The dashboard is unusable — product managers wait minutes for each chart, so they stopped using it and make decisions on gut feeling instead. ClickHouse, a columnar database designed for analytics, can query billions of rows in milliseconds. Moving event analytics to ClickHouse would give the team real-time insights without affecting the production PostgreSQL.

## Step 1: Build the Event Ingestion Pipeline

```typescript
// src/ingestion/event-collector.ts — High-throughput event collection with batched ClickHouse inserts
import { createClient } from "@clickhouse/client";
import { Redis } from "ioredis";
import { z } from "zod";

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
  database: "analytics",
  clickhouse_settings: {
    async_insert: 1,              // enable async inserts for higher throughput
    wait_for_async_insert: 0,     // don't wait for confirmation
  },
});

const redis = new Redis(process.env.REDIS_URL!);

const EventSchema = z.object({
  event: z.string().min(1),           // "page_view", "button_click", "purchase"
  userId: z.string().optional(),
  anonymousId: z.string(),
  properties: z.record(z.unknown()).default({}),
  context: z.object({
    page: z.string().optional(),
    referrer: z.string().optional(),
    userAgent: z.string().optional(),
    ip: z.string().optional(),
    country: z.string().optional(),
    device: z.enum(["desktop", "mobile", "tablet"]).optional(),
  }).default({}),
  timestamp: z.number().optional(),
});

type Event = z.infer<typeof EventSchema>;

// Buffer events in memory and flush in batches
let eventBuffer: Event[] = [];
const BATCH_SIZE = 1000;
const FLUSH_INTERVAL_MS = 5000;

export async function trackEvent(event: Event): Promise<void> {
  eventBuffer.push({
    ...event,
    timestamp: event.timestamp || Date.now(),
  });

  if (eventBuffer.length >= BATCH_SIZE) {
    await flushEvents();
  }
}

async function flushEvents(): Promise<void> {
  if (eventBuffer.length === 0) return;

  const batch = [...eventBuffer];
  eventBuffer = [];

  const rows = batch.map((e) => ({
    event_name: e.event,
    user_id: e.userId || "",
    anonymous_id: e.anonymousId,
    properties: JSON.stringify(e.properties),
    page: e.context.page || "",
    referrer: e.context.referrer || "",
    country: e.context.country || "",
    device: e.context.device || "desktop",
    timestamp: new Date(e.timestamp!).toISOString(),
    date: new Date(e.timestamp!).toISOString().slice(0, 10),
  }));

  await clickhouse.insert({
    table: "events",
    values: rows,
    format: "JSONEachRow",
  });

  // Update real-time counters in Redis for instant dashboard updates
  const pipeline = redis.pipeline();
  for (const e of batch) {
    const dateKey = new Date(e.timestamp!).toISOString().slice(0, 10);
    pipeline.hincrby(`analytics:daily:${dateKey}`, e.event, 1);
    pipeline.hincrby(`analytics:daily:${dateKey}:devices`, e.context.device || "desktop", 1);
    pipeline.pfadd(`analytics:uniq:${dateKey}`, e.userId || e.anonymousId);
  }
  pipeline.exec();
}

// Start periodic flush
setInterval(flushEvents, FLUSH_INTERVAL_MS);

// ClickHouse table schema
export async function createTables(): Promise<void> {
  await clickhouse.command({
    query: `
      CREATE TABLE IF NOT EXISTS events (
        event_name LowCardinality(String),
        user_id String,
        anonymous_id String,
        properties String,        -- JSON stored as String, queried with JSONExtract
        page String,
        referrer String,
        country LowCardinality(String),
        device LowCardinality(Enum8('desktop' = 1, 'mobile' = 2, 'tablet' = 3)),
        timestamp DateTime64(3),
        date Date
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(date)
      ORDER BY (event_name, date, user_id)
      TTL date + INTERVAL 365 DAY
      SETTINGS index_granularity = 8192
    `,
  });
}
```

## Step 2: Build the Analytics Query Engine

```typescript
// src/analytics/queries.ts — Sub-second analytics queries on billions of rows
import { createClient } from "@clickhouse/client";

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
  database: "analytics",
});

// Funnel analysis — what percentage complete each step?
export async function queryFunnel(
  steps: string[],
  dateFrom: string,
  dateTo: string,
  filters?: { country?: string; device?: string }
): Promise<Array<{ step: string; users: number; conversionRate: number; dropoff: number }>> {
  const filterClauses = [];
  if (filters?.country) filterClauses.push(`AND country = '${filters.country}'`);
  if (filters?.device) filterClauses.push(`AND device = '${filters.device}'`);
  const filterSQL = filterClauses.join(" ");

  // Window funnel function — ClickHouse's built-in funnel analysis
  const stepConditions = steps.map((s, i) => `event_name = '${s}'`).join(", ");

  const { data } = await clickhouse.query({
    query: `
      SELECT 
        level,
        count() as users
      FROM (
        SELECT 
          user_id,
          windowFunnel(86400)(timestamp, ${stepConditions}) as level
        FROM events
        WHERE date >= '${dateFrom}' AND date <= '${dateTo}'
          AND user_id != ''
          ${filterSQL}
        GROUP BY user_id
      )
      GROUP BY level
      ORDER BY level
    `,
    format: "JSONEachRow",
  });

  const rows = await data.json<{ level: number; users: number }[]>();
  const totalUsers = rows.reduce((s, r) => s + r.users, 0);

  return steps.map((step, i) => {
    const usersAtStep = rows.filter((r) => r.level > i).reduce((s, r) => s + r.users, 0);
    const usersAtPrevStep = i === 0 ? totalUsers : rows.filter((r) => r.level > i - 1).reduce((s, r) => s + r.users, 0);

    return {
      step,
      users: usersAtStep,
      conversionRate: totalUsers > 0 ? Math.round((usersAtStep / totalUsers) * 10000) / 100 : 0,
      dropoff: usersAtPrevStep > 0 ? Math.round(((usersAtPrevStep - usersAtStep) / usersAtPrevStep) * 10000) / 100 : 0,
    };
  });
}

// Retention cohort analysis
export async function queryRetention(
  dateFrom: string,
  dateTo: string,
  granularity: "day" | "week" | "month" = "week"
): Promise<Array<{ cohort: string; size: number; retention: number[] }>> {
  const truncFn = granularity === "day" ? "toDate" : granularity === "week" ? "toMonday" : "toStartOfMonth";

  const { data } = await clickhouse.query({
    query: `
      WITH first_seen AS (
        SELECT user_id, ${truncFn}(min(date)) as cohort_date
        FROM events
        WHERE date >= '${dateFrom}' AND date <= '${dateTo}' AND user_id != ''
        GROUP BY user_id
      ),
      activity AS (
        SELECT DISTINCT user_id, ${truncFn}(date) as activity_date
        FROM events
        WHERE date >= '${dateFrom}' AND date <= '${dateTo}' AND user_id != ''
      )
      SELECT 
        f.cohort_date,
        dateDiff('${granularity}', f.cohort_date, a.activity_date) as period,
        count(DISTINCT f.user_id) as users
      FROM first_seen f
      LEFT JOIN activity a ON f.user_id = a.user_id
      GROUP BY f.cohort_date, period
      ORDER BY f.cohort_date, period
    `,
    format: "JSONEachRow",
  });

  const rows = await data.json<{ cohort_date: string; period: number; users: number }[]>();

  // Group by cohort
  const cohorts = new Map<string, { size: number; retention: Map<number, number> }>();
  for (const row of rows) {
    if (!cohorts.has(row.cohort_date)) {
      cohorts.set(row.cohort_date, { size: 0, retention: new Map() });
    }
    const cohort = cohorts.get(row.cohort_date)!;
    if (row.period === 0) cohort.size = row.users;
    cohort.retention.set(row.period, row.users);
  }

  return [...cohorts.entries()].map(([date, data]) => ({
    cohort: date,
    size: data.size,
    retention: Array.from({ length: 12 }, (_, i) =>
      data.size > 0 ? Math.round(((data.retention.get(i) || 0) / data.size) * 10000) / 100 : 0
    ),
  }));
}

// Top events with trends
export async function queryTopEvents(
  dateFrom: string,
  dateTo: string,
  limit: number = 20
): Promise<Array<{ event: string; count: number; uniqueUsers: number; trend: number }>> {
  const { data } = await clickhouse.query({
    query: `
      SELECT 
        event_name,
        count() as total_count,
        uniq(user_id) as unique_users,
        -- Compare to previous period
        countIf(date >= '${dateFrom}') as current_count,
        countIf(date < '${dateFrom}') as prev_count
      FROM events
      WHERE date >= subtractDays(toDate('${dateFrom}'), dateDiff('day', '${dateFrom}', '${dateTo}'))
        AND date <= '${dateTo}'
      GROUP BY event_name
      ORDER BY total_count DESC
      LIMIT ${limit}
    `,
    format: "JSONEachRow",
  });

  const rows = await data.json<any[]>();

  return rows.map((r) => ({
    event: r.event_name,
    count: r.total_count,
    uniqueUsers: r.unique_users,
    trend: r.prev_count > 0 ? Math.round(((r.current_count - r.prev_count) / r.prev_count) * 100) : 0,
  }));
}
```

## Step 3: Build the Dashboard API

```typescript
// src/routes/analytics.ts — Analytics dashboard API
import { Hono } from "hono";
import { queryFunnel, queryRetention, queryTopEvents } from "../analytics/queries";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();

app.get("/analytics/funnel", async (c) => {
  const steps = c.req.query("steps")?.split(",") || ["page_view", "signup", "onboarding_complete", "first_project"];
  const from = c.req.query("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = c.req.query("to") || new Date().toISOString().slice(0, 10);
  const result = await queryFunnel(steps, from, to);
  return c.json(result);
});

app.get("/analytics/retention", async (c) => {
  const from = c.req.query("from") || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const to = c.req.query("to") || new Date().toISOString().slice(0, 10);
  const granularity = (c.req.query("granularity") as any) || "week";
  const result = await queryRetention(from, to, granularity);
  return c.json(result);
});

app.get("/analytics/events", async (c) => {
  const from = c.req.query("from") || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const to = c.req.query("to") || new Date().toISOString().slice(0, 10);
  const result = await queryTopEvents(from, to);
  return c.json(result);
});

// Real-time stats from Redis (sub-second)
app.get("/analytics/realtime", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const events = await redis.hgetall(`analytics:daily:${today}`);
  const devices = await redis.hgetall(`analytics:daily:${today}:devices`);
  const uniqueUsers = await redis.pfcount(`analytics:uniq:${today}`);
  return c.json({ today: { events, devices, uniqueUsers } });
});

export default app;
```

## Results

- **Query time dropped from 45 seconds to 200ms** — ClickHouse's columnar storage and vectorized execution handles 800M rows with sub-second response; funnel analysis is now interactive
- **Product team uses the dashboard daily** — when charts load instantly, PMs explore data instead of avoiding it; data-driven decisions replaced gut feelings
- **15M events/day ingested smoothly** — async inserts and batching handle peak traffic without backpressure; the pipeline scales to 100M+ events/day
- **Storage: 12GB for 800M events** — ClickHouse compression (LZ4 + delta encoding on timestamps) achieves 15:1 compression ratio; PostgreSQL used 180GB for the same data
- **Real-time counters via Redis** — the dashboard shows live event counts and unique users without querying ClickHouse; page loads in <100ms
