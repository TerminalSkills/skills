---
name: temporal-sdk
category: Backend Development
tags: [workflow, orchestration, durable, distributed, microservices, reliability]
version: 1.0.0
author: terminal-skills
---

# Temporal — Durable Workflow Orchestration

You are an expert in Temporal, the open-source durable execution platform for building reliable distributed applications. You help developers write workflows that survive process crashes, network failures, and deployments — with automatic retries, timeouts, cancellation, signals, queries, and versioning — replacing fragile state machines, manual retry logic, and error-prone queue-based orchestration with simple, testable code.

## Core Capabilities

### Workflow and Activities

```typescript
// src/workflows.ts — Durable workflow (survives crashes, restarts)
import { proxyActivities, sleep, condition, setHandler, defineSignal, defineQuery } from "@temporalio/workflow";
import type * as activities from "./activities";

const { chargePayment, shipOrder, sendEmail, refundPayment } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30s",
  retry: { maximumAttempts: 3, initialInterval: "1s", backoffCoefficient: 2 },
});

// Signals and queries
const cancelSignal = defineSignal("cancel");
const statusQuery = defineQuery<string>("status");

export async function orderWorkflow(order: Order): Promise<OrderResult> {
  let status = "processing";
  let cancelled = false;

  setHandler(cancelSignal, () => { cancelled = true; });
  setHandler(statusQuery, () => status);

  // Step 1: Charge payment
  status = "charging";
  const paymentId = await chargePayment(order.total, order.paymentMethod);

  // Check for cancellation
  if (cancelled) {
    await refundPayment(paymentId);
    return { status: "cancelled" };
  }

  // Step 2: Ship order (with saga compensation on failure)
  status = "shipping";
  try {
    const tracking = await shipOrder(order.items, order.address);
    status = "shipped";

    // Step 3: Send confirmation
    await sendEmail(order.email, "order-shipped", { tracking });

    // Step 4: Wait for delivery (up to 14 days)
    status = "in-transit";
    const delivered = await condition(() => cancelled, "14 days");

    if (!delivered) {
      status = "delivered";
      await sendEmail(order.email, "delivery-confirmed", {});
    }

    return { status: "completed", tracking, paymentId };
  } catch (err) {
    // Saga: compensate by refunding if shipping fails
    status = "refunding";
    await refundPayment(paymentId);
    await sendEmail(order.email, "order-failed", { reason: "shipping failed" });
    return { status: "failed", reason: "shipping_failed" };
  }
}

// Scheduled workflow
export async function subscriptionWorkflow(userId: string): Promise<void> {
  while (true) {
    await chargeSubscription(userId);
    await sleep("30 days");               // Durable sleep — survives server restarts
  }
}
```

### Activities

```typescript
// src/activities.ts — Non-deterministic operations (API calls, DB writes)
export async function chargePayment(amount: number, method: PaymentMethod): Promise<string> {
  const response = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: "usd",
    payment_method: method.id,
    confirm: true,
  });
  return response.id;
}

export async function shipOrder(items: Item[], address: Address): Promise<string> {
  const shipment = await shippingApi.createShipment({ items, destination: address });
  return shipment.trackingNumber;
}

export async function sendEmail(to: string, template: string, data: any): Promise<void> {
  await mailer.send({ to, template, data });
}
```

### Worker and Client

```typescript
// src/worker.ts
import { Worker } from "@temporalio/worker";
import * as activities from "./activities";

const worker = await Worker.create({
  workflowsPath: require.resolve("./workflows"),
  activities,
  taskQueue: "orders",
});
await worker.run();

// src/client.ts — Start workflows
import { Client } from "@temporalio/client";
const client = new Client();

const handle = await client.workflow.start(orderWorkflow, {
  taskQueue: "orders",
  workflowId: `order-${orderId}`,         // Idempotent by ID
  args: [order],
});

// Query status
const status = await handle.query(statusQuery);

// Signal cancellation
await handle.signal(cancelSignal);
```

## Installation

```bash
npm install @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
# Run Temporal server locally:
temporal server start-dev
```

## Best Practices

1. **Workflows are deterministic** — No I/O, randomness, or timestamps in workflows; use activities for side effects
2. **Activities for side effects** — All API calls, DB writes, file I/O go in activities; retried independently
3. **Idempotent activities** — Activities may retry; use idempotency keys for payments, API calls
4. **Workflow IDs for dedup** — Use business IDs (`order-123`) as workflow IDs; prevents duplicate processing
5. **Saga pattern** — Use try/catch for compensation; refund payment if shipping fails
6. **Signals for external input** — Use signals for user actions (cancel, approve); workflows wait for signals
7. **Queries for status** — Use queries to inspect workflow state without side effects; real-time status checks
8. **Versioning** — Use `patched()` for workflow code changes; running workflows continue with old logic
