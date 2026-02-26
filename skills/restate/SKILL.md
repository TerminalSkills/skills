---
name: restate
description: >-
  Build resilient distributed applications with Restate — durable execution
  engine for TypeScript/Java/Go. Use when someone asks to "durable execution",
  "Restate", "resilient workflows", "distributed transactions", "saga pattern",
  "fault-tolerant services", or "replace Temporal with something lighter".
  Covers durable handlers, virtual objects, workflows, and sagas.
license: Apache-2.0
compatibility: "TypeScript/Java/Go/Rust/Python. Self-hosted or Restate Cloud."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["durable-execution", "restate", "distributed", "workflows", "resilience"]
---

# Restate

## Overview

Restate is a durable execution engine — your code runs reliably even when things crash. Write normal async functions, and Restate ensures they complete: if a service crashes mid-execution, it resumes exactly where it left off. No lost state, no duplicate side effects. Like Temporal but with a simpler programming model — just annotate your functions, no state machines or DSLs.

## When to Use

- Distributed transactions (payment → inventory → shipping)
- Long-running workflows that must complete (onboarding, provisioning)
- Saga pattern with compensating actions (rollback on failure)
- Exactly-once processing of events
- Replacing complex retry/queue logic with durable execution

## Instructions

### Setup

```bash
npm install @restatedev/restate-sdk

# Run Restate server
docker run --name restate -p 8080:8080 -p 9070:9070 docker.io/restatedev/restate:latest
```

### Durable Service

```typescript
// services/payment.ts — Durable payment service
import * as restate from "@restatedev/restate-sdk";

const paymentService = restate.service({
  name: "payments",
  handlers: {
    // This handler is durable — if it crashes between steps,
    // it resumes where it left off without re-executing completed steps
    async processPayment(ctx: restate.Context, order: {
      orderId: string;
      userId: string;
      amount: number;
    }) {
      // Step 1: Reserve inventory (durable — won't re-run if already done)
      const reserved = await ctx.run("reserve-inventory", async () => {
        return await inventoryApi.reserve(order.orderId);
      });

      // Step 2: Charge payment
      const charge = await ctx.run("charge-payment", async () => {
        return await stripeApi.charge(order.userId, order.amount);
      });

      // Step 3: Confirm order
      await ctx.run("confirm-order", async () => {
        await orderDb.confirm(order.orderId, charge.id);
      });

      // Step 4: Send notification (won't duplicate even if retried)
      await ctx.run("notify", async () => {
        await emailApi.send(order.userId, "Order confirmed!");
      });

      return { orderId: order.orderId, chargeId: charge.id, status: "completed" };
    },
  },
});

restate.endpoint().bind(paymentService).listen(9080);
```

### Virtual Objects (Stateful Entities)

```typescript
// services/cart.ts — Stateful shopping cart (single-writer per key)
const cartObject = restate.object({
  name: "cart",
  handlers: {
    // Only one handler runs per cart ID at a time — no race conditions
    async addItem(ctx: restate.ObjectContext, item: { productId: string; quantity: number }) {
      // Get current cart state (durable K/V)
      const cart = (await ctx.get<CartItem[]>("items")) || [];
      cart.push(item);
      ctx.set("items", cart);
      return { items: cart.length };
    },

    async checkout(ctx: restate.ObjectContext) {
      const items = (await ctx.get<CartItem[]>("items")) || [];
      if (items.length === 0) throw new Error("Cart is empty");

      // Process payment durably
      const result = await ctx.serviceClient(paymentService).processPayment({
        orderId: ctx.key,
        items,
      });

      // Clear cart after successful payment
      ctx.clear("items");
      return result;
    },

    async getItems(ctx: restate.ObjectSharedContext) {
      return (await ctx.get<CartItem[]>("items")) || [];
    },
  },
});
```

### Saga Pattern (Compensating Actions)

```typescript
// services/booking.ts — Saga with automatic rollback
const bookingService = restate.service({
  name: "booking",
  handlers: {
    async bookTrip(ctx: restate.Context, trip: TripRequest) {
      let flightId: string | null = null;
      let hotelId: string | null = null;

      try {
        // Book flight
        flightId = await ctx.run("book-flight", () => flightApi.book(trip.flight));

        // Book hotel
        hotelId = await ctx.run("book-hotel", () => hotelApi.book(trip.hotel));

        // Book car
        const carId = await ctx.run("book-car", () => carApi.book(trip.car));

        return { flightId, hotelId, carId, status: "confirmed" };
      } catch (error) {
        // Compensate: cancel what was already booked
        if (hotelId) await ctx.run("cancel-hotel", () => hotelApi.cancel(hotelId));
        if (flightId) await ctx.run("cancel-flight", () => flightApi.cancel(flightId));
        throw error;
      }
    },
  },
});
```

## Examples

### Example 1: Reliable payment processing

**User prompt:** "Build a payment flow that never loses a charge — even if the server crashes between charging the card and updating the database."

The agent will use Restate durable execution to ensure each step (charge, update DB, send receipt) executes exactly once.

### Example 2: Distributed saga for e-commerce

**User prompt:** "Implement an order workflow: reserve inventory → charge payment → ship. If any step fails, roll back everything."

The agent will create a Restate service with the saga pattern, compensating actions for each step, and durable state tracking.

## Guidelines

- **`ctx.run()` for side effects** — makes external calls durable and idempotent
- **Virtual objects for stateful entities** — single-writer guarantee per key
- **Sagas with try/catch** — compensate in catch block, each compensation is also durable
- **No message queues needed** — Restate handles delivery and retries
- **`ctx.sleep()` for delays** — durable timers that survive crashes
- **Service calls are durable** — `ctx.serviceClient(svc).method()` retries automatically
- **Shared handlers** — read-only handlers that can run concurrently
- **Simple programming model** — write normal async functions, not state machines
- **Self-hosted** — single binary, Postgres or RocksDB for state
- **HTTP invocation** — trigger handlers via HTTP POST
