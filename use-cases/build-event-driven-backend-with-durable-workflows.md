---
title: Build an Event-Driven Backend with Durable Workflows
slug: build-event-driven-backend-with-durable-workflows
description: Create a reliable order processing system using Restate for durable execution, Hatchet for workflow orchestration, and Tinybird for real-time analytics.
skills:
  - restate
  - hatchet
  - tinybird
  - d1-database
category: backend
tags:
  - event-driven
  - durable-execution
  - workflows
  - analytics
  - backend
---

## The Problem

Priya's e-commerce platform processes 5,000 orders per day. The current system uses a single Express endpoint that charges the card, updates inventory, sends emails, and logs analytics — all in one request handler. When Stripe is slow, requests time out. When the email service is down, orders fail entirely even though the payment succeeded. Last week, a server crash between charging a card and updating inventory resulted in 12 "ghost charges" — customers charged but no order created. The team needs a system where each step is independent, retried on failure, and guaranteed to complete.

## The Solution

Use Restate for durable execution of the core order flow (payment → inventory → fulfillment — each step executes exactly once even across crashes). Hatchet for orchestrating post-order workflows (notifications, loyalty points, analytics ingestion). Tinybird for real-time order analytics that the operations team can query without hitting the main database.

## Step-by-Step Walkthrough

### Step 1: Durable Order Processing with Restate

The order flow must be bulletproof — a crash at any point should resume where it left off, not restart from the beginning.

```typescript
// services/orders/handler.ts — Durable order processing
import * as restate from "@restatedev/restate-sdk";

interface OrderRequest {
  orderId: string;
  userId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  paymentMethodId: string;
}

const orderService = restate.service({
  name: "orders",
  handlers: {
    async processOrder(ctx: restate.Context, order: OrderRequest) {
      const total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

      // Step 1: Reserve inventory (durable — won't re-run on retry)
      const reservation = await ctx.run("reserve-inventory", async () => {
        const res = await fetch("http://inventory:3001/reserve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.orderId, items: order.items }),
        });
        if (!res.ok) throw new Error("Inventory reservation failed");
        return res.json();
      });

      // Step 2: Charge payment (exactly-once — safe to retry)
      const charge = await ctx.run("charge-payment", async () => {
        const res = await fetch("http://payments:3002/charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.orderId,
            userId: order.userId,
            amount: total,
            paymentMethodId: order.paymentMethodId,
            idempotencyKey: order.orderId,  // Stripe won't double-charge
          }),
        });
        if (!res.ok) {
          // Payment failed — release inventory (compensating action)
          await fetch("http://inventory:3001/release", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reservationId: reservation.id }),
          });
          throw new Error("Payment failed");
        }
        return res.json();
      });

      // Step 3: Confirm order in database
      await ctx.run("confirm-order", async () => {
        await fetch("http://orders-db:3003/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.orderId,
            chargeId: charge.chargeId,
            reservationId: reservation.id,
            total,
          }),
        });
      });

      // Step 4: Trigger post-order workflows (async — don't block the order)
      await ctx.run("trigger-post-order", async () => {
        await fetch("http://hatchet:7077/api/v1/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: "order:completed",
            data: { orderId: order.orderId, userId: order.userId, total, items: order.items },
          }),
        });
      });

      return {
        orderId: order.orderId,
        chargeId: charge.chargeId,
        status: "completed",
      };
    },
  },
});

restate.endpoint().bind(orderService).listen(9080);
```

### Step 2: Post-Order Workflows with Hatchet

Non-critical workflows (email, analytics, loyalty) run asynchronously. If the email service is down, it retries without affecting the order.

```typescript
// workflows/post-order.ts — Async post-order processing
import Hatchet from "@hatchet-dev/typescript-sdk";

const hatchet = Hatchet.init();

const postOrderWorkflow = hatchet.workflow({
  name: "post-order",
  on: { event: "order:completed" },
});

// Send confirmation email (retries 3x)
postOrderWorkflow.step("send-confirmation", async (ctx) => {
  const { userId, orderId, total } = ctx.input();
  await emailService.send(userId, {
    template: "order-confirmation",
    data: { orderId, total: `$${(total / 100).toFixed(2)}` },
  });
  return { emailSent: true };
}, { retries: 3, timeout: "30s" });

// Add loyalty points
postOrderWorkflow.step("add-loyalty-points", async (ctx) => {
  const { userId, total } = ctx.input();
  const points = Math.floor(total / 100);  // 1 point per dollar
  await loyaltyService.addPoints(userId, points);
  return { pointsAdded: points };
}, { retries: 2, timeout: "15s" });

// Ingest into analytics (runs in parallel with email and loyalty)
postOrderWorkflow.step("track-analytics", async (ctx) => {
  const { orderId, userId, total, items } = ctx.input();

  await fetch("https://api.tinybird.co/v0/events?name=orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TINYBIRD_TOKEN}` },
    body: JSON.stringify({
      order_id: orderId,
      user_id: userId,
      total_cents: total,
      item_count: items.length,
      timestamp: new Date().toISOString(),
    }),
  });

  return { tracked: true };
}, { retries: 3, timeout: "10s" });
```

### Step 3: Real-Time Analytics with Tinybird

```sql
-- tinybird/datasources/orders.datasource
SCHEMA >
  `order_id` String,
  `user_id` String,
  `total_cents` Int64,
  `item_count` Int32,
  `timestamp` DateTime
ENGINE MergeTree
ENGINE_SORTING_KEY timestamp

-- tinybird/pipes/revenue_dashboard.pipe
NODE hourly_revenue
SQL >
  SELECT
    toStartOfHour(timestamp) AS hour,
    count() AS order_count,
    sum(total_cents) / 100 AS revenue_usd,
    avg(total_cents) / 100 AS avg_order_usd
  FROM orders
  WHERE timestamp >= now() - INTERVAL 24 HOUR
  GROUP BY hour
  ORDER BY hour DESC
```

The operations team queries `GET /v0/pipes/revenue_dashboard.json` for a live revenue dashboard — no load on the main database.

## The Outcome

Priya's platform processes 5,000 orders daily with zero ghost charges. When the email service went down for 2 hours last Tuesday, no orders were affected — Hatchet queued the emails and delivered them all when the service recovered. Restate's durable execution means a server crash during order processing resumes at the exact step that was interrupted. The operations team has real-time revenue dashboards via Tinybird that refresh every second without touching the production database. Failed step rate dropped from 2.3% to 0.01% (only genuine payment declines). The team sleeps better.
