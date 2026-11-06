---
title: Build an Event-Driven Backend with Durable Workflows
slug: build-event-driven-backend-with-durable-workflows
description: Create a reliable order processing system using Restate for durable execution, Hatchet for post-order workflows, Cloudflare D1 for the order record, and Tinybird for real-time analytics.
skills:
  - restate
  - hatchet
  - tinybird
  - d1-database
category: development
tags:
  - event-driven
  - durable-execution
  - workflows
  - analytics
  - backend
---

## The Problem

Priya's e-commerce platform processes 5,000 orders per day. The current system uses a single Express endpoint that charges the card, updates inventory, sends emails, and logs analytics, all in one request handler. When Stripe is slow, requests time out. When the email service is down, orders fail entirely even though the payment succeeded. Last week, a server crash between charging a card and updating inventory resulted in 12 "ghost charges": customers charged but no order created. The team needs a system where each step is independent, retried on failure, and guaranteed to complete.

## The Solution

Use Restate for durable execution of the core order flow (inventory, payment, confirmation: a completed step is journaled and never re-run after a crash). Use Hatchet for the post-order work (email, loyalty points, analytics ingestion), which can retry for as long as it needs without touching the order. Cloudflare D1 stores the confirmed order, and Tinybird gives the operations team live order analytics without querying the main database.

```bash
npx terminal-skills install restate hatchet tinybird d1-database
npm install @restatedev/restate-sdk @hatchet-dev/typescript-sdk
npm install --global @restatedev/restate-server@latest @restatedev/restate@latest
```

Restate's TypeScript SDK needs Node.js 22+. The Restate server stores its journal in a local directory (`restate-data`) and listens on 8080 (ingress) and 9070 (admin); keep both private.

## Step-by-Step Walkthrough

### Step 1: Durable Order Processing with Restate

A crash at any point resumes where it left off instead of restarting. Two rules make that safe. Wrap every side effect in `ctx.run` with a name. And decide per failure whether it is transient (throw an ordinary `Error`, Restate retries with backoff) or final (throw `restate.TerminalError`, retrying stops and the caller gets the error). Compensate only on a terminal error, otherwise a transient blip would release inventory that Restate is about to use again.

```typescript
// services/orders.ts: durable order processing
import * as restate from "@restatedev/restate-sdk";
import { createServer } from "node:http2";
import { hatchet } from "../workflows/post-order";

interface OrderRequest {
  orderId: string;
  userId: string;
  items: Array<{ productId: string; quantity: number; priceCents: number }>;
  paymentMethodId: string;
}

// The team's own internal services, on private URLs
const INVENTORY = process.env.INVENTORY_URL!;
const PAYMENTS = process.env.PAYMENTS_URL!;
const ORDERS_DB = process.env.ORDERS_DB_URL!;   // the Cloudflare Worker from Step 3

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

export const orderService = restate.service({
  name: "orders",
  handlers: {
    processOrder: async (ctx: restate.Context, order: OrderRequest) => {
      const totalCents = order.items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

      // 1. Reserve inventory. A 409 means out of stock: stop retrying and tell the caller
      const reservation = await ctx.run("reserve-inventory", async () => {
        const res = await post(`${INVENTORY}/reserve`, { orderId: order.orderId, items: order.items });
        if (res.status === 409) throw new restate.TerminalError("Out of stock", { errorCode: 409 });
        if (!res.ok) throw new Error(`Inventory returned ${res.status}`);   // transient: Restate retries
        return (await res.json()) as { id: string };
      });

      // 2. Charge. A card decline is terminal; a timeout or 5xx is retried with the same idempotency key
      let charge: { chargeId: string };
      try {
        charge = await ctx.run("charge-payment", async () => {
          const res = await post(`${PAYMENTS}/charge`, {
            orderId: order.orderId, userId: order.userId, amountCents: totalCents,
            paymentMethodId: order.paymentMethodId,
            idempotencyKey: order.orderId,   // a retried call cannot charge twice
          });
          if (res.status === 402) throw new restate.TerminalError("Card declined", { errorCode: 402 });
          if (!res.ok) throw new Error(`Payments returned ${res.status}`);
          return (await res.json()) as { chargeId: string };
        });
      } catch (e) {
        // Compensate only when we are giving up for good
        if (e instanceof restate.TerminalError) {
          await ctx.run("release-inventory", async () => {
            if (!(await post(`${INVENTORY}/release`, { reservationId: reservation.id })).ok) throw new Error("Release failed");
          });
        }
        throw e;
      }

      // 3. Confirm the order in D1 (idempotent: the order id is the primary key)
      await ctx.run("confirm-order", async () => {
        const body = { orderId: order.orderId, userId: order.userId, chargeId: charge.chargeId, totalCents };
        const res = await post(`${ORDERS_DB}/confirm`, body, { Authorization: `Bearer ${process.env.ORDERS_DB_TOKEN}` });
        if (!res.ok) throw new Error(`Orders DB returned ${res.status}`);
      });

      // 4. Hand the slow, non-critical work to Hatchet
      await ctx.run("trigger-post-order", () =>
        hatchet.events.push("order:completed", { orderId: order.orderId, userId: order.userId, totalCents, itemCount: order.items.length }),
      );

      return { orderId: order.orderId, chargeId: charge.chargeId, status: "completed" };
    },
  },
});

// Loopback only. restate.serve({ services: [orderService], port: 9080 }) is the shortcut,
// but it listens on every interface; the SDK endpoint should only be reachable by the Restate server.
createServer(restate.createEndpointHandler({ services: [orderService] })).listen(9080, "127.0.0.1");
```

(`restate.endpoint().bind(...).listen()` from older tutorials is deprecated.) Start the service, register it with the server (repeat after adding or renaming handlers), and call it through the ingress. Callers talk to the Restate server, never to port 9080:

```bash
restate deployments register http://localhost:9080 --yes

curl localhost:8080/restate/call/orders/processOrder \
  -H 'idempotency-key: order-1001' \
  --json '{"orderId":"order-1001","userId":"user-381","paymentMethodId":"pm_card_visa","items":[{"productId":"KB-87","quantity":2,"priceCents":4900}]}'
```

The answer is `{"orderId":"order-1001","chargeId":"ch_02a61802","status":"completed"}`. The `idempotency-key` header makes a client retry return the recorded result instead of running the order again. A declined card comes back as HTTP 402 `{"code":402,"message":"Card declined","source":"invocation"}` after the reservation has been released. The `/restate/call/...` path is for Restate Server 1.7 and later.

### Step 2: Post-Order Workflows with Hatchet

Non-critical work runs asynchronously. If the email service is down, Hatchet retries the task without affecting the order. These tasks use the v1 SDK (`hatchet.workflow`, `.task`, `fn`); the `.step()` style in older posts is the removed v0 API. The event is delivered at least once, so make each task idempotent.

```typescript
// workflows/post-order.ts: post-order work, run by a Hatchet worker
import { HatchetClient } from "@hatchet-dev/typescript-sdk";

export const hatchet = HatchetClient.init();   // reads HATCHET_CLIENT_TOKEN

type OrderCompleted = { orderId: string; userId: string; totalCents: number; itemCount: number };

export const postOrder = hatchet.workflow<OrderCompleted>({
  name: "post-order",
  onEvents: ["order:completed"],
});

// Tasks without parents run in parallel (a loyalty-points task would be a third sibling)
postOrder.task({
  name: "send-confirmation",
  retries: 3,
  backoff: { factor: 2, maxSeconds: 30 },
  executionTimeout: "30s",
  fn: async (input) => {
    await emailService.send(input.userId, "order-confirmation", { orderId: input.orderId, totalCents: input.totalCents });
    return { emailSent: true };
  },
});

postOrder.task({
  name: "track-analytics",
  retries: 3,
  executionTimeout: "10s",
  fn: async (input) => {
    const row = {
      order_id: input.orderId, user_id: input.userId, total_cents: input.totalCents, item_count: input.itemCount,
      timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),   // 2026-11-07 09:15:02
    };
    const host = process.env.TINYBIRD_HOST ?? "https://api.tinybird.co";
    const res = await fetch(`${host}/v0/events?name=orders&wait=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.TINYBIRD_INGEST_TOKEN}` },
      body: JSON.stringify(row),   // NDJSON: one object per line
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Tinybird ingest failed: ${res.status}`);
    return { tracked: true };
  },
});
```

Run it with a worker that lists the workflow (only listed workflows run): `const worker = await hatchet.worker("post-order-worker", { workflows: [postOrder] }); await worker.start();`.

`emailService` and `loyaltyService` stand for the team's own clients. Create `HATCHET_CLIENT_TOKEN` in the Hatchet dashboard (Settings, API Tokens) and keep it in the environment.

### Step 3: Confirm the order in Cloudflare D1

D1 is reached through a Worker binding, so a tiny Worker sits in front of it and exposes one authenticated endpoint. `INSERT OR IGNORE` on the primary key makes a replayed Restate step harmless.

```sql
-- migrations/0001_orders.sql
CREATE TABLE orders (
  order_id    TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  charge_id   TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  status      TEXT NOT NULL
  );
```

Bind the database as `DB` in `wrangler.jsonc` (`d1_databases`, as in the d1-database skill) and point `main` at `orders-db/worker.ts`.

```typescript
// orders-db/worker.ts
interface Env {
  DB: D1Database;
  ORDERS_DB_TOKEN: string;   // npx wrangler secret put ORDERS_DB_TOKEN
}

async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/confirm" || request.method !== "POST") return new Response("Not found", { status: 404 });

    // Hash both sides (equal length), then compare without an early exit
    const [given, expected] = await Promise.all([sha256(request.headers.get("Authorization") ?? ""), sha256(`Bearer ${env.ORDERS_DB_TOKEN}`)]);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= given[i] ^ expected[i];
    if (diff !== 0) return new Response("Unauthorized", { status: 401 });

    const o = await request.json<{ orderId: string; userId: string; chargeId: string; totalCents: number }>();
    // INSERT OR IGNORE: if Restate replays this step, the second insert is a no-op
    await env.DB.prepare(
      "INSERT OR IGNORE INTO orders (order_id, user_id, charge_id, total_cents, status) VALUES (?, ?, ?, ?, 'confirmed')",
    ).bind(o.orderId, o.userId, o.chargeId, o.totalCents).run();
    return Response.json({ ok: true });
  },
};
```

```bash
npx wrangler d1 create orders-db && npx wrangler d1 migrations apply orders-db --remote
npx wrangler secret put ORDERS_DB_TOKEN && npx wrangler deploy
```

### Step 4: Real-Time Analytics with Tinybird

Hatchet may retry an ingest, and the Events API is not idempotent, so the endpoint de-duplicates by `order_id` in its first node. Tinybird Forward projects are files; check them locally with `tb build` and ship with `tb --cloud deploy`.

```text
# tinybird/datasources/orders.datasource
SCHEMA >
    `order_id` String `json:$.order_id`,
    `user_id` String `json:$.user_id`,
    `total_cents` Int64 `json:$.total_cents`,
    `item_count` Int32 `json:$.item_count`,
    `timestamp` DateTime `json:$.timestamp`

ENGINE "MergeTree"
ENGINE_PARTITION_KEY "toYYYYMM(timestamp)"
ENGINE_SORTING_KEY "timestamp, order_id"

TOKEN orders_append APPEND
```

```text
# tinybird/endpoints/revenue_dashboard.pipe
TOKEN dashboard_read READ

NODE unique_orders
SQL >
    %
    SELECT order_id, min(timestamp) AS ts, any(total_cents) AS total_cents
    FROM orders
    WHERE timestamp >= now() - INTERVAL {{ Int32(hours, 24) }} HOUR
    GROUP BY order_id

NODE hourly_revenue
SQL >
    SELECT
      toStartOfHour(ts) AS hour,
      count() AS order_count,
      sum(total_cents) / 100 AS revenue_usd
    FROM unique_orders
    GROUP BY hour
    ORDER BY hour DESC

TYPE endpoint
```

The operations team reads it with a `READ` token, `GET https://api.tinybird.co/v0/pipes/revenue_dashboard.json?hours=24`, so a live revenue dashboard puts no load on the order database. Use the host of your workspace region.

## Real-World Example

Priya's team moves the order flow onto the Restate service first and keeps the old endpoint behind a flag for a week. A test run kills the service process between `charge-payment` and `confirm-order`; on restart the invocation continues at `confirm-order` and the card is not charged again, which is the failure that produced the 12 ghost charges. When the email provider has an outage, `send-confirmation` retries in Hatchet while orders keep completing. The operations team gets its hourly revenue view from the Tinybird endpoint, and the order ID is the idempotency key in Restate, the payment provider and D1 alike.

## Related Skills

- [restate](../skills/restate/) -- durable execution for the order flow: journaled steps, `TerminalError`, compensation
- [hatchet](../skills/hatchet/) -- v1 workflow and task API for the retried post-order work and event trigger
- [tinybird](../skills/tinybird/) -- datasource, endpoint pipe and ingest for the revenue dashboard
- [d1-database](../skills/d1-database/) -- Worker binding and migrations for the confirmed-order table
