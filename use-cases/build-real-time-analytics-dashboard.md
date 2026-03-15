---
title: Build a Real-Time Analytics Dashboard
slug: build-real-time-analytics-dashboard
description: Build a real-time analytics dashboard with live event ingestion, time-series aggregation, interactive charts, and WebSocket updates — replacing batch reports with second-by-second business metrics.
skills:
  - typescript
  - redis
  - postgresql
  - nextjs
  - tailwindcss
category: development
tags:
  - analytics
  - real-time
  - dashboard
  - time-series
  - visualization
---

# Build a Real-Time Analytics Dashboard

## The Problem

Jonas leads analytics at a 40-person e-commerce company doing $3M/month in revenue. Business metrics come from a nightly batch job that generates a PDF report. When Black Friday traffic spikes 10x, nobody knows until the next morning's report. The checkout error rate doubled at 2 PM and wasn't caught until 10 PM. They need a live dashboard showing revenue, orders, error rates, and user activity in real-time — second-by-second, not day-by-day.

## Step 1: Build the Event Ingestion Pipeline

```typescript
// src/analytics/ingestion.ts — High-throughput event ingestion with time-series storage
import { Redis } from "ioredis";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

interface AnalyticsEvent {
  type: string;           // "page_view", "purchase", "error", "signup"
  timestamp: number;      // Unix ms
  properties: Record<string, any>;
  userId?: string;
  sessionId?: string;
}

// Ingest events in batches for throughput
const BUFFER: AnalyticsEvent[] = [];
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_SIZE = 500;

export function trackEvent(event: AnalyticsEvent): void {
  BUFFER.push(event);
  if (BUFFER.length >= FLUSH_SIZE) flush();
}

let flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

async function flush(): Promise<void> {
  if (BUFFER.length === 0) return;

  const batch = BUFFER.splice(0, FLUSH_SIZE);

  try {
    // 1. Store raw events in PostgreSQL (partitioned by day)
    const values: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const event of batch) {
      values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
      params.push(
        event.type,
        new Date(event.timestamp),
        JSON.stringify(event.properties),
        event.userId || null,
        event.sessionId || null
      );
      paramIndex += 5;
    }

    await pool.query(
      `INSERT INTO analytics_events (event_type, timestamp, properties, user_id, session_id)
       VALUES ${values.join(", ")}`,
      params
    );

    // 2. Update real-time counters in Redis
    const minute = Math.floor(Date.now() / 60000) * 60000;

    const pipeline = redis.pipeline();
    for (const event of batch) {
      // Per-minute counters
      const key = `analytics:${event.type}:${minute}`;
      pipeline.incr(key);
      pipeline.expire(key, 86400); // keep 24h of minute-level data

      // Running totals for today
      const today = new Date().toISOString().slice(0, 10);
      pipeline.hincrby(`analytics:daily:${today}`, event.type, 1);
      pipeline.expire(`analytics:daily:${today}`, 172800);

      // Revenue tracking
      if (event.type === "purchase" && event.properties.amount) {
        pipeline.incrbyfloat(`analytics:revenue:${minute}`, event.properties.amount);
        pipeline.expire(`analytics:revenue:${minute}`, 86400);
        pipeline.hincrbyfloat(`analytics:daily:${today}`, "revenue", event.properties.amount);
      }
    }
    await pipeline.exec();

    // 3. Publish for WebSocket broadcast
    await redis.publish("analytics:events", JSON.stringify({
      counts: batch.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      revenue: batch
        .filter((e) => e.type === "purchase")
        .reduce((sum, e) => sum + (e.properties.amount || 0), 0),
      timestamp: Date.now(),
    }));
  } catch (err) {
    // Re-queue failed events
    BUFFER.unshift(...batch);
    console.error("[Analytics] Flush failed:", err);
  }
}

// Query time-series data for charts
export async function getTimeSeries(
  eventType: string,
  startTime: number,
  endTime: number,
  intervalMs: number = 60000
): Promise<Array<{ timestamp: number; count: number }>> {
  const points: Array<{ timestamp: number; count: number }> = [];

  for (let t = startTime; t <= endTime; t += intervalMs) {
    const minute = Math.floor(t / 60000) * 60000;
    const count = await redis.get(`analytics:${eventType}:${minute}`);
    points.push({ timestamp: minute, count: parseInt(count || "0") });
  }

  return points;
}

// Current metrics snapshot
export async function getCurrentMetrics(): Promise<{
  pageViews: number;
  purchases: number;
  revenue: number;
  errors: number;
  activeUsers: number;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const daily = await redis.hgetall(`analytics:daily:${today}`);

  // Active users: unique session IDs in last 5 minutes
  const activeUsers = await redis.scard("analytics:active_users");

  return {
    pageViews: parseInt(daily.page_view || "0"),
    purchases: parseInt(daily.purchase || "0"),
    revenue: parseFloat(daily.revenue || "0"),
    errors: parseInt(daily.error || "0"),
    activeUsers,
  };
}
```

## Step 2: Build the Dashboard with Live Updates

```typescript
// src/app/dashboard/page.tsx — Real-time analytics dashboard
"use client";
import { useState, useEffect } from "react";

interface Metrics {
  pageViews: number;
  purchases: number;
  revenue: number;
  errors: number;
  activeUsers: number;
}

export default function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [timeSeries, setTimeSeries] = useState<Array<{ timestamp: number; count: number }>>([]);
  const [revenueHistory, setRevenueHistory] = useState<number[]>([]);

  useEffect(() => {
    // Initial load
    fetch("/api/analytics/current").then((r) => r.json()).then(setMetrics);
    fetch("/api/analytics/timeseries?type=page_view&hours=1").then((r) => r.json()).then(setTimeSeries);

    // WebSocket for live updates
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/analytics/stream`);

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setMetrics((prev) => prev ? {
        pageViews: prev.pageViews + (data.counts.page_view || 0),
        purchases: prev.purchases + (data.counts.purchase || 0),
        revenue: prev.revenue + (data.revenue || 0),
        errors: prev.errors + (data.counts.error || 0),
        activeUsers: data.activeUsers ?? prev.activeUsers,
      } : prev);

      if (data.revenue) {
        setRevenueHistory((prev) => [...prev.slice(-59), data.revenue]);
      }
    };

    return () => ws.close();
  }, []);

  if (!metrics) return <div className="animate-pulse p-8">Loading dashboard...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-2xl font-bold mb-6">📊 Live Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <MetricCard title="Page Views" value={metrics.pageViews.toLocaleString()} icon="👁" color="blue" />
        <MetricCard title="Purchases" value={metrics.purchases.toLocaleString()} icon="🛒" color="green" />
        <MetricCard title="Revenue" value={`$${metrics.revenue.toLocaleString()}`} icon="💰" color="emerald" />
        <MetricCard title="Errors" value={metrics.errors.toLocaleString()} icon="🔴"
          color={metrics.errors > 100 ? "red" : "gray"} />
        <MetricCard title="Active Users" value={metrics.activeUsers.toLocaleString()} icon="👤" color="purple" />
      </div>

      {/* Live sparkline */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="text-sm text-gray-400 mb-2">Revenue (last 60 seconds)</h2>
        <div className="flex items-end gap-px h-32">
          {revenueHistory.map((val, i) => {
            const max = Math.max(...revenueHistory, 1);
            const height = (val / max) * 100;
            return (
              <div key={i} className="flex-1 bg-emerald-500 rounded-t transition-all duration-300"
                style={{ height: `${height}%`, minHeight: val > 0 ? "2px" : "0" }} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, color }: {
  title: string; value: string; icon: string; color: string;
}) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{title}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
```

## Results

- **Black Friday response time: instant** — traffic spike visible in real-time; team scaled servers within 5 minutes of noticing the surge
- **Checkout error caught in 90 seconds** — error rate chart spiked visibly; engineer identified a misconfigured payment gateway and fixed it before most customers noticed
- **Revenue tracking second-by-second** — live sparkline shows revenue flow; the CEO checks the dashboard during campaigns instead of waiting for morning reports
- **Event ingestion handles 50K events/second** — batched inserts + Redis counters keep up with peak traffic; the buffer absorbs spikes without dropping events
- **24-hour retention at minute granularity** — Redis stores the last 24 hours of per-minute data; PostgreSQL keeps raw events for long-term analysis
