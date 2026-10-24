---
title: Build a Server-Sent Events Real-Time Dashboard
slug: build-server-sent-events-dashboard
description: Build a real-time monitoring dashboard using Server-Sent Events (SSE) for one-way streaming — lighter than WebSockets, with automatic reconnection and native browser support.
skills:
  - typescript
  - redis
  - hono
  - nextjs
  - tailwindcss
category: development
tags:
  - sse
  - real-time
  - dashboard
  - monitoring
  - streaming
---

# Build a Server-Sent Events Real-Time Dashboard

## The Problem

Noor runs operations at a 35-person e-commerce platform. The team watches a dashboard that refreshes every 30 seconds to show orders, revenue, and inventory. During flash sales, they miss critical moments: by the time the dashboard refreshes, hundreds of orders have piled up and a popular item is oversold. The data only flows one way, server to browser, so a full WebSocket stack is more than the job needs. Server-Sent Events (SSE) are plain HTTP, the browser's built-in `EventSource` reconnects on its own, and the server pushes each event the moment it happens.

## The Solution

A Hono route streams events with `streamSSE`. Redis pub/sub carries metric updates from whichever service creates an order to every connected dashboard. A Next.js client component listens with `EventSource` and is styled with Tailwind CSS. The code below was type-checked against hono 4, ioredis 6 and React types, and the streaming loop was run against a local server.

## Step-by-Step Walkthrough

### Step 1: Install and mount the stream

```bash
npm install hono ioredis pg
npm install -D typescript @types/pg
```

Set `REDIS_URL` (for example `redis://127.0.0.1:6379`) and `DATABASE_URL` in the environment, and keep Redis bound to 127.0.0.1 or a private network. Expose the Hono app from a Next.js route handler:

```typescript
// app/api/stream/metrics/route.ts
import app from "@/sse/stream";

export const runtime = "nodejs"; // ioredis needs Node APIs, not the edge runtime
export const dynamic = "force-dynamic"; // never cache the stream

export const GET = (req: Request) => app.fetch(req);
```

(`hono/vercel`'s `handle` still works but is deprecated and slated for removal in Hono v5, so call `app.fetch` directly.)

### Step 2: Build the SSE server

```typescript
// src/sse/db.ts
import { Pool } from "pg";
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

```typescript
// src/sse/stream.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Redis } from "ioredis";
import { pool } from "./db";

const CHANNELS = ["orders", "revenue", "inventory", "alerts"] as const;

// One shared connection for commands and publishing
export const redis = new Redis(process.env.REDIS_URL!);

const app = new Hono();

app.get("/api/stream/metrics", (c) =>
  streamSSE(c, async (stream) => {
    // A connection in subscriber mode can only subscribe, so each client gets its own
    const sub = new Redis(process.env.REDIS_URL!);
    let open = true;
    stream.onAbort(() => {
      open = false;
      sub.disconnect();
    });

    await stream.writeSSE({ event: "init", data: JSON.stringify(await getCurrentMetrics()) });

    sub.on("message", (channel, message) => {
      stream
        .writeSSE({ event: channel.replace("metrics:", ""), data: message, id: String(Date.now()) })
        .catch(() => {});
    });
    await sub.subscribe(...CHANNELS.map((n) => `metrics:${n}`));

    // The stream closes when this callback returns, so keep it alive.
    // The loop doubles as the heartbeat that keeps proxies from timing out.
    while (open) {
      await stream.sleep(15_000);
      if (open) await stream.writeSSE({ event: "heartbeat", data: "{}" });
    }
  }),
);

export async function publishMetric(channel: (typeof CHANNELS)[number], data: object) {
  await redis.publish(`metrics:${channel}`, JSON.stringify({ ...data, timestamp: Date.now() }));
}

async function getCurrentMetrics() {
  const today = new Date().toISOString().slice(0, 10);
  const [orders, revenue, activeUsers] = await Promise.all([
    redis.get(`metrics:orders:${today}`),
    redis.get(`metrics:revenue:${today}`),
    redis.pfcount(`metrics:active_users:${today}`),
  ]);
  const { rows: recentOrders } = await pool.query(
    `SELECT id, customer_name, total::float8 AS total, status, created_at
     FROM orders ORDER BY created_at DESC LIMIT 10`,
  );
  const { rows: lowStock } = await pool.query(
    `SELECT id, name, stock_count FROM products WHERE stock_count < 10 ORDER BY stock_count LIMIT 5`,
  );
  return {
    ordersToday: Number(orders ?? 0),
    revenueToday: Number(revenue ?? 0),
    activeUsers,
    recentOrders,
    lowStockAlerts: lowStock,
  };
}

interface Order { id: string; customerName: string; total: number; items: { productId: string; name: string }[] }

// Call this from the code path that creates an order
export async function onOrderCreated(order: Order) {
  const today = new Date().toISOString().slice(0, 10);
  await redis.incr(`metrics:orders:${today}`);
  await redis.incrbyfloat(`metrics:revenue:${today}`, order.total);
  await publishMetric("orders", {
    type: "new_order",
    order: { id: order.id, customer_name: order.customerName, total: order.total },
  });

  for (const item of order.items) {
    const { rows } = await pool.query("SELECT stock_count FROM products WHERE id = $1", [item.productId]);
    if (rows[0] && rows[0].stock_count < 10) {
      await publishMetric("inventory", {
        type: "low_stock",
        product: { id: item.productId, name: item.name, stock_count: rows[0].stock_count },
      });
    }
  }
}

export default app;
```

Two details matter here. `streamSSE` closes the response as soon as its callback returns, so the `while (open)` loop is what keeps the connection alive; it also sends a heartbeat every 15 seconds so idle proxies do not cut the connection. And a Redis connection that has called `subscribe` can only run subscriber commands, which is why each client gets its own `sub` connection while publishing and reads share one.

### Step 3: Build the React dashboard

```typescript
// src/components/LiveDashboard.tsx
"use client";
import { useEffect, useState } from "react";

interface Order { id: string; customer_name: string; total: number }
interface Product { id: string; name: string; stock_count: number }
interface Metrics {
  ordersToday: number;
  revenueToday: number;
  activeUsers: number;
  recentOrders: Order[];
  lowStockAlerts: Product[];
}

export function LiveDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/stream/metrics");

    es.onopen = () => setConnected(true);
    // EventSource reconnects on its own and resends Last-Event-ID; just show the state
    es.onerror = () => setConnected(false);

    // "init" is sent on every (re)connect, so it also repairs anything missed while offline
    es.addEventListener("init", (e) => setMetrics(JSON.parse(e.data)));

    es.addEventListener("orders", (e) => {
      const { order } = JSON.parse(e.data) as { order: Order };
      setMetrics((prev) =>
        prev && {
          ...prev,
          ordersToday: prev.ordersToday + 1,
          revenueToday: prev.revenueToday + order.total,
          recentOrders: [order, ...prev.recentOrders].slice(0, 10),
        },
      );
    });

    es.addEventListener("inventory", (e) => {
      const { type, product } = JSON.parse(e.data) as { type: string; product: Product };
      if (type !== "low_stock") return;
      setMetrics((prev) =>
        prev && { ...prev, lowStockAlerts: [...prev.lowStockAlerts.filter((a) => a.id !== product.id), product] },
      );
    });

    return () => es.close();
  }, []);

  if (!metrics) return <div className="animate-pulse p-8">Loading dashboard...</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Live Dashboard</h1>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm text-gray-500">{connected ? "Live" : "Reconnecting..."}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard title="Orders Today" value={metrics.ordersToday} />
        <MetricCard title="Revenue" value={`$${metrics.revenueToday.toLocaleString()}`} />
        <MetricCard title="Active Users" value={metrics.activeUsers} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">Recent Orders</h2>
          {metrics.recentOrders.map((o) => (
            <div key={o.id} className="flex justify-between border-b py-2 last:border-0">
              <span>{o.customer_name} <span className="text-xs text-gray-400">#{o.id.slice(0, 8)}</span></span>
              <span className="font-semibold text-green-600">${o.total}</span>
            </div>
          ))}
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">Low Stock</h2>
          {metrics.lowStockAlerts.length === 0 && <p className="text-sm text-gray-400">All products well stocked</p>}
          {metrics.lowStockAlerts.map((p) => (
            <div key={p.id} className="flex justify-between border-b py-2 last:border-0">
              <span>{p.name}</span>
              <span className={`font-bold ${p.stock_count < 3 ? "text-red-600" : "text-orange-500"}`}>{p.stock_count} left</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
```

Render `<LiveDashboard />` from a page such as `app/dashboard/page.tsx`. Because the server sends a full `init` snapshot on every connect, a dashboard that was offline catches up without any replay logic.

### Step 4: Run it behind a reverse proxy

SSE is ordinary HTTP, but a proxy that buffers responses will hold the events back. For nginx set `proxy_buffering off;` and a long `proxy_read_timeout` on the `/api/stream/` location. Over HTTP/1.1 browsers allow only about six connections per host, shared across tabs; HTTP/2 lifts that limit.

## Real-World Example

Noor's team calls `onOrderCreated(order)` from the order service. During the next flash sale the dashboard shows each order as it arrives, and the low-stock panel flips to "3 left" while the promotion is still running, so the team pauses it before the item oversells. A dashboard that drops its Wi-Fi shows "Reconnecting..." and refills itself from the `init` snapshot when the browser reconnects. Polling every 30 seconds costs 120 requests per hour per open dashboard; the SSE version holds one connection open instead.

## Related Skills

- `hono` -- routing and the `streamSSE` helper
- `redis` -- pub/sub fan-out and the counters behind the snapshot
- `nextjs` -- route handler and client component
- `typescript` -- typed event payloads on both sides
- `tailwindcss` -- dashboard layout and status colors
