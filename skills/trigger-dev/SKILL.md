---
name: trigger-dev
description: >-
   You are an expert in Trigger.dev, the open-source background jobs platform
  for TypeScript. You help developers build reliable long-running tasks,
  scheduled jobs, webhook handlers, and event-driven workflows with automatic
  retries, concurrency control, real-time logs, and deployment to serverless
  infrastructure — replacing BullMQ/Redis setups with a fully managed or
  self-hosted solution purpose-built for modern TypeScript apps.
category: Backend Development
tags: [background-jobs, serverless, durable, typescript, cron, event-driven]
version: 1.0.0
author: terminal-skills
---

# Trigger.dev — Background Jobs for TypeScript

You are an expert in Trigger.dev, the open-source background jobs platform for TypeScript. You help developers build reliable long-running tasks, scheduled jobs, webhook handlers, and event-driven workflows with automatic retries, concurrency control, real-time logs, and deployment to serverless infrastructure — replacing BullMQ/Redis setups with a fully managed or self-hosted solution purpose-built for modern TypeScript apps.

## Core Capabilities

### Task Definition

```typescript
// trigger/tasks/process-order.ts
import { task, wait, logger, retry } from "@trigger.dev/sdk/v3";

export const processOrder = task({
  id: "process-order",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: { orderId: string; userId: string }) => {
    logger.info("Processing order", { orderId: payload.orderId });

    // Step 1: Validate
    const order = await db.orders.findById(payload.orderId);
    if (!order) throw new Error(`Order ${payload.orderId} not found`);

    // Step 2: Charge payment (auto-retries on failure)
    const payment = await retry.onThrow(
      async () => stripe.paymentIntents.create({
        amount: order.total * 100,
        currency: "usd",
        customer: order.stripeCustomerId,
      }),
      { maxAttempts: 3, randomize: true },
    );

    logger.info("Payment charged", { paymentId: payment.id });

    // Step 3: Wait for webhook confirmation (durable wait)
    const confirmation = await wait.for({ seconds: 300 });

    // Step 4: Send notification
    await sendEmail(order.userEmail, "order-confirmed", { orderId: order.id });

    return { orderId: order.id, paymentId: payment.id, status: "completed" };
  },
});

// Scheduled task (cron)
export const dailyReport = task({
  id: "daily-report",
  run: async () => {
    const stats = await db.orders.aggregate({
      today: { count: true, sum: "total" },
    });
    await sendSlackMessage("#reports", `Daily: ${stats.count} orders, $${stats.sum}`);
  },
});
```

### Triggering Tasks

```typescript
// From your API route
import { tasks } from "@trigger.dev/sdk/v3";

// Trigger and forget
await tasks.trigger("process-order", {
  orderId: "ord-123",
  userId: "usr-456",
});

// Trigger and wait for result
const result = await tasks.triggerAndWait("process-order", {
  orderId: "ord-123",
  userId: "usr-456",
});

// Batch trigger
await tasks.batchTrigger("process-order", [
  { payload: { orderId: "ord-1", userId: "usr-1" } },
  { payload: { orderId: "ord-2", userId: "usr-2" } },
  { payload: { orderId: "ord-3", userId: "usr-3" } },
]);

// Schedule
await tasks.schedule("daily-report", {
  cron: "0 9 * * *",                     // Daily at 9 AM
  timezone: "America/New_York",
});

// Delayed
await tasks.trigger("send-reminder", {
  userId: "usr-456",
}, {
  delay: "24h",                           // Run in 24 hours
});
```

### Webhook Handler

```typescript
import { task } from "@trigger.dev/sdk/v3";

export const handleStripeWebhook = task({
  id: "stripe-webhook",
  run: async (payload: { type: string; data: any }) => {
    switch (payload.type) {
      case "payment_intent.succeeded":
        await db.orders.update(payload.data.metadata.orderId, { status: "paid" });
        await tasks.trigger("ship-order", { orderId: payload.data.metadata.orderId });
        break;
      case "customer.subscription.deleted":
        await handleChurn(payload.data.customer);
        break;
    }
  },
});
```

## Installation

```bash
npx trigger.dev@latest init               # Initialize in existing project
npx trigger.dev@latest dev                 # Local development
npx trigger.dev@latest deploy              # Deploy to Trigger.dev cloud
```

## Best Practices

1. **Idempotent tasks** — Design tasks to be safely retried; use unique IDs for payment/email operations
2. **Structured logging** — Use `logger.info/warn/error` with objects; visible in Trigger.dev dashboard
3. **Retry configuration** — Set appropriate retry strategies per task; payment tasks need different retries than emails
4. **Concurrency limits** — Set `concurrencyLimit` to prevent overwhelming downstream services
5. **Wait for events** — Use `wait.for` for durable waits; task resumes even after server restarts
6. **Batch for throughput** — Use `batchTrigger` for bulk operations; processed in parallel with concurrency control
7. **Environment separation** — Use dev/staging/prod environments; preview deployments for testing
8. **Self-hosted option** — Deploy Trigger.dev on your own infra with Docker; full control over data and execution
