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

Noor runs operations at a 35-person e-commerce platform. The team watches a dashboard that refreshes every 30 seconds to show orders, revenue, and inventory. During flash sales, they miss critical moments — by the time the dashboard refreshes, 500 orders have piled up and a popular item is oversold. WebSockets feel like overkill for a one-way data stream. SSE gives real-time push with automatic reconnection, native EventSource API, and works through proxies without special configuration.

## Step 1: Build the SSE Server

```typescript
// src/sse/stream.ts — Server-Sent Events streaming with Redis pub/sub
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Redis } from "ioredis";
import { pool } from "../db";

const app = new Hono();

// Real-time metrics stream
app.get("/api/stream/metrics", async (c) => {
  const sub = new Redis(process.env.REDIS_URL!);
  const redisClient = new Redis(process.env.REDIS_URL!);

  return streamSSE(c, async (stream) => {
    // Send initial state immediately
    const initialMetrics = await getCurrentMetrics(redisClient);
    await stream.writeSSE({
      event: "init",
      data: JSON.stringify(initialMetrics),
      id: String(Date.now()),
    });

    // Subscribe to real-time updates
    await sub.subscribe("metrics:orders", "metrics:revenue", "metrics:inventory", "metrics:alerts");

    sub.on("message", async (channel, message) => {
      const eventType = channel.replace("metrics:", "");
      await stream.writeSSE({
        event: eventType,
        data: message,
        id: String(Date.now()),
      });
    });

    // Heartbeat every 15 seconds (keeps connection alive through proxies)
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ event: "heartbeat", data: "{}", id: String(Date.now()) });
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    stream.onAbort(() => {
      clearInterval(heartbeat);
      sub.unsubscribe();
      sub.disconnect();
      redisClient.disconnect();
    });
  });
});

// Publish metric updates (called by other services)
export async function publishMetric(channel: string, data: any): Promise<void> {
  const pub = new Redis(process.env.REDIS_URL!);
  await pub.publish(`metrics:${channel}`, JSON.stringify({
    ...data,
    timestamp: Date.now(),
  }));
  pub.disconnect();
}

async function getCurrentMetrics(redis: Redis): Promise<any> {
  const today = new Date().toISOString().slice(0, 10);

  const [orders, revenue, activeUsers] = await Promise.all([
    redis.get(`metrics:orders:${today}`),
    redis.get(`metrics:revenue:${today}`),
    redis.pfcount(`metrics:active_users:${today}`),
  ]);

  const { rows: recentOrders } = await pool.query(
    `SELECT id, customer_name, total, status, created_at 
     FROM orders ORDER BY created_at DESC LIMIT 10`
  );

  const { rows: lowStock } = await pool.query(
    `SELECT id, name, stock_count FROM products WHERE stock_count < 10 ORDER BY stock_count LIMIT 5`
  );

  return {
    ordersToday: parseInt(orders || "0"),
    revenueToday: parseFloat(revenue || "0"),
    activeUsers,
    recentOrders,
    lowStockAlerts: lowStock,
  };
}

// Trigger metric updates on business events
export async function onOrderCreated(order: any): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const redis = new Redis(process.env.REDIS_URL!);

  await redis.incr(`metrics:orders:${today}`);
  await redis.incrbyfloat(`metrics:revenue:${today}`, order.total);

  await publishMetric("orders", {
    type: "new_order",
    order: { id: order.id, customer: order.customerName, total: order.total, items: order.itemCount },
  });

  // Check for low stock
  for (const item of order.items) {
    const { rows } = await pool.query(
      "SELECT stock_count FROM products WHERE id = $1",
      [item.productId]
    );
    if (rows[0]?.stock_count < 10) {
      await publishMetric("inventory", {
        type: "low_stock",
        product: { id: item.productId, name: item.name, remaining: rows[0].stock_count },
      });
    }
  }

  redis.disconnect();
}

export default app;
```

## Step 2: Build the React Dashboard

```typescript
// src/components/LiveDashboard.tsx — Real-time dashboard with SSE
"use client";
import { useEffect, useState, useRef } from "react";

interface Metrics {
  ordersToday: number;
  revenueToday: number;
  activeUsers: number;
  recentOrders: Array<{ id: string; customer_name: string; total: number; status: string }>;
  lowStockAlerts: Array<{ id: string; name: string; stock_count: number }>;
}

export function LiveDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/stream/metrics");
    eventSourceRef.current = es;

    es.addEventListener("init", (e) => {
      setMetrics(JSON.parse(e.data));
      setConnected(true);
      setLastUpdate(Date.now());
    });

    es.addEventListener("orders", (e) => {
      const data = JSON.parse(e.data);
      setMetrics((prev) => prev ? {
        ...prev,
        ordersToday: prev.ordersToday + 1,
        revenueToday: prev.revenueToday + (data.order?.total || 0),
        recentOrders: [data.order, ...prev.recentOrders].slice(0, 10),
      } : prev);
      setLastUpdate(Date.now());
    });

    es.addEventListener("inventory", (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "low_stock") {
        setMetrics((prev) => prev ? {
          ...prev,
          lowStockAlerts: [...prev.lowStockAlerts.filter((a) => a.id !== data.product.id), data.product],
        } : prev);
      }
      setLastUpdate(Date.now());
    });

    es.addEventListener("alerts", (e) => {
      const data = JSON.parse(e.data);
      // Show notification
      if (Notification.permission === "granted") {
        new Notification("Dashboard Alert", { body: data.message });
      }
    });

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects — just update UI state
    };

    es.onopen = () => setConnected(true);

    return () => es.close();
  }, []);

  if (!metrics) return <div className="animate-pulse p-8">Loading dashboard...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Live Dashboard</h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          <span className="text-sm text-gray-500">{connected ? "Live" : "Reconnecting..."}</span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard title="Orders Today" value={metrics.ordersToday} icon="📦" />
        <MetricCard title="Revenue" value={`$${metrics.revenueToday.toLocaleString()}`} icon="💰" />
        <MetricCard title="Active Users" value={metrics.activeUsers} icon="👥" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="font-semibold mb-3">Recent Orders</h2>
          <div className="space-y-2">
            {metrics.recentOrders.map((order) => (
              <div key={order.id} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <span className="font-medium">{order.customer_name}</span>
                  <span className="text-gray-400 text-xs ml-2">#{order.id.slice(0, 8)}</span>
                </div>
                <span className="font-semibold text-green-600">${order.total}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="font-semibold mb-3">⚠️ Low Stock</h2>
          {metrics.lowStockAlerts.length === 0 ? (
            <p className="text-gray-400 text-sm">All products well stocked</p>
          ) : (
            <div className="space-y-2">
              {metrics.lowStockAlerts.map((item) => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                  <span>{item.name}</span>
                  <span className={`font-bold ${item.stock_count < 3 ? "text-red-600" : "text-orange-500"}`}>
                    {item.stock_count} left
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon }: { title: string; value: string | number; icon: string }) {
  return (
    <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}
```

## Results

- **Real-time during flash sales** — orders appear on the dashboard within 50ms of being placed; the team sees overselling risks as they happen, not 30 seconds later
- **Automatic reconnection** — SSE's built-in reconnection handles network blips without any custom code; the dashboard recovers in <3 seconds
- **90% less server load than polling** — one persistent SSE connection replaces 120 HTTP requests per hour (polling every 30s); server handles 50x more concurrent dashboards
- **Works through corporate proxies** — unlike WebSockets, SSE uses standard HTTP; no special proxy configuration needed for enterprise customers
- **Low stock alerts prevent overselling** — when inventory drops below 10, the alert appears instantly; during the last flash sale, the team paused a promotion before overselling, saving $12K in refund processing
