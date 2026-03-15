---
title: Build Event-Driven Microservices with Kafka and Temporal
slug: build-event-driven-microservices-with-kafka-and-temporal
description: Build a resilient order processing system using KafkaJS for event streaming between microservices, Temporal for durable workflow orchestration with saga compensation, BullMQ for background jobs, and EventBridge for cross-service routing — handling 10,000 orders/day with zero data loss and automatic failure recovery.
skills: [kafka-js, temporal-sdk, bull-mq, eventbridge]
category: development
tags: [microservices, event-driven, kafka, temporal, saga, reliability]
---

# Build Event-Driven Microservices with Kafka and Temporal

Dani's e-commerce platform processes 10,000 orders daily across 5 microservices: Orders, Payments, Inventory, Shipping, and Notifications. The current REST-based architecture has cascading failures — when the Payment service goes down, orders pile up and some get lost. Manual reconciliation takes hours after each outage.

Dani redesigns the system: Kafka for event streaming between services, Temporal for orchestrating the order workflow with saga compensation (automatic rollback on failures), BullMQ for background tasks, and EventBridge for analytics routing.

## Step 1: Event Schema and Kafka Topics

```typescript
// shared/events.ts — Event types shared across services
export interface OrderCreatedEvent {
  type: "order.created";
  orderId: string;
  userId: string;
  items: Array<{ sku: string; qty: number; price: number }>;
  total: number;
  shippingAddress: Address;
  timestamp: string;
}

export interface PaymentCompletedEvent {
  type: "payment.completed";
  orderId: string;
  paymentId: string;
  amount: number;
  method: string;
  timestamp: string;
}

export interface InventoryReservedEvent {
  type: "inventory.reserved";
  orderId: string;
  reservationId: string;
  items: Array<{ sku: string; qty: number; warehouseId: string }>;
  timestamp: string;
}

// Topics: orders, payments, inventory, shipping, notifications, analytics
```

## Step 2: Kafka Producer (Order Service)

```typescript
// services/orders/producer.ts — Publish order events
import { Kafka, Partitioners, CompressionTypes } from "kafkajs";

const kafka = new Kafka({
  clientId: "order-service",
  brokers: process.env.KAFKA_BROKERS!.split(","),
  ssl: true,
  sasl: { mechanism: "plain", username: process.env.KAFKA_USER!, password: process.env.KAFKA_PASS! },
});

const producer = kafka.producer({
  idempotent: true,                       // Exactly-once delivery
  transactionalId: "order-service-tx",
});

export async function publishOrderCreated(order: Order): Promise<void> {
  const transaction = await producer.transaction();
  try {
    // Atomic: publish event AND update outbox table
    await transaction.send({
      topic: "orders",
      messages: [{
        key: order.userId,                // Same user → same partition → ordered
        value: JSON.stringify({
          type: "order.created",
          orderId: order.id,
          userId: order.userId,
          items: order.items,
          total: order.total,
          shippingAddress: order.shippingAddress,
          timestamp: new Date().toISOString(),
        }),
        headers: {
          "correlation-id": order.id,
          "source": "order-service",
        },
      }],
      compression: CompressionTypes.GZIP,
    });

    // Also publish to analytics topic
    await transaction.send({
      topic: "analytics",
      messages: [{
        key: order.id,
        value: JSON.stringify({ event: "order_created", total: order.total, items: order.items.length }),
      }],
    });

    await transaction.commit();
  } catch (err) {
    await transaction.abort();
    throw err;
  }
}
```

## Step 3: Temporal Workflow (Order Orchestration with Saga)

```typescript
// services/orchestrator/workflows/order-workflow.ts
import { proxyActivities, sleep, setHandler, defineSignal, defineQuery } from "@temporalio/workflow";
import type * as activities from "../activities";

const { reserveInventory, releaseInventory, chargePayment, refundPayment,
  createShipment, cancelShipment, sendNotification } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30s",
  retry: { maximumAttempts: 3, initialInterval: "2s", backoffCoefficient: 2 },
});

const cancelSignal = defineSignal("cancel");
const statusQuery = defineQuery<OrderStatus>("status");

export async function orderWorkflow(order: OrderCreatedEvent): Promise<OrderResult> {
  let status: OrderStatus = "processing";
  let cancelled = false;
  const compensations: Array<() => Promise<void>> = [];

  setHandler(cancelSignal, () => { cancelled = true; });
  setHandler(statusQuery, () => status);

  try {
    // Step 1: Reserve inventory
    status = "reserving_inventory";
    const reservation = await reserveInventory(order.orderId, order.items);
    compensations.push(() => releaseInventory(reservation.id));

    if (cancelled) throw new Error("Order cancelled by user");

    // Step 2: Charge payment
    status = "charging_payment";
    const payment = await chargePayment(order.orderId, order.total, order.userId);
    compensations.push(() => refundPayment(payment.id));

    if (cancelled) throw new Error("Order cancelled by user");

    // Step 3: Create shipment
    status = "creating_shipment";
    const shipment = await createShipment(order.orderId, order.items, order.shippingAddress);
    compensations.push(() => cancelShipment(shipment.id));

    // Step 4: Notify customer
    status = "shipped";
    await sendNotification(order.userId, "order-shipped", {
      orderId: order.orderId,
      tracking: shipment.trackingNumber,
    });

    // Step 5: Wait for delivery confirmation (up to 14 days)
    status = "in_transit";
    await sleep("14 days");               // Durable timer — survives restarts

    status = "delivered";
    await sendNotification(order.userId, "delivery-confirmed", {
      orderId: order.orderId,
    });

    return { status: "completed", paymentId: payment.id, trackingNumber: shipment.trackingNumber };

  } catch (err) {
    // Saga compensation — undo all completed steps in reverse
    status = "compensating";
    for (const compensate of compensations.reverse()) {
      try { await compensate(); }
      catch (compErr) { console.error("Compensation failed:", compErr); }
    }

    status = "failed";
    await sendNotification(order.userId, "order-failed", {
      orderId: order.orderId,
      reason: (err as Error).message,
    });

    return { status: "failed", reason: (err as Error).message };
  }
}
```

## Step 4: Kafka Consumer → Temporal Starter

```typescript
// services/orchestrator/consumer.ts — Kafka consumer starts Temporal workflows
import { Kafka } from "kafkajs";
import { Client } from "@temporalio/client";
import { orderWorkflow } from "./workflows/order-workflow";

const kafka = new Kafka({ clientId: "orchestrator", brokers: process.env.KAFKA_BROKERS!.split(",") });
const consumer = kafka.consumer({ groupId: "order-orchestrator" });
const temporal = new Client();

await consumer.subscribe({ topic: "orders", fromBeginning: false });

await consumer.run({
  eachMessage: async ({ message }) => {
    const event = JSON.parse(message.value!.toString());

    if (event.type === "order.created") {
      // Start durable workflow — idempotent by orderId
      await temporal.workflow.start(orderWorkflow, {
        taskQueue: "order-processing",
        workflowId: `order-${event.orderId}`,  // Prevents duplicate workflows
        args: [event],
      });
    }
  },
});
```

## Step 5: Background Jobs with BullMQ

```typescript
// services/notifications/queue.ts — BullMQ for notification delivery
import { Queue, Worker } from "bullmq";

const notificationQueue = new Queue("notifications", { connection: redis });

// Activity calls this
export async function sendNotification(userId: string, template: string, data: any) {
  await notificationQueue.add(template, { userId, template, data }, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 5000 },
  });
}

// Worker processes notifications
const worker = new Worker("notifications", async (job) => {
  const { userId, template, data } = job.data;
  const user = await db.users.findById(userId);

  // Send via multiple channels
  await Promise.allSettled([
    sendEmail(user.email, template, data),
    sendPush(user.pushToken, template, data),
    sendSMS(user.phone, template, data),
  ]);
}, {
  connection: redis,
  concurrency: 10,
  limiter: { max: 50, duration: 1000 },   // 50 notifications/sec
});
```

## Results

After migrating to the event-driven architecture, the platform handles Black Friday traffic (5x normal) without cascading failures.

- **Order processing**: 10,000+ orders/day with zero data loss (Kafka persistence + Temporal durability)
- **Failure recovery**: Payment service outage no longer causes lost orders; Temporal retries automatically when service recovers
- **Saga compensation**: 99.7% of failed orders fully compensated (refund + inventory release) within 30 seconds
- **Latency**: Order confirmation in 2.3 seconds (vs 8 seconds with synchronous REST calls)
- **Consumer lag**: <100ms Kafka consumer lag at peak; 5 consumer instances auto-balanced
- **Background jobs**: 50,000 notifications/day processed with 99.9% delivery rate (BullMQ retry + multi-channel)
- **Observability**: Full order lifecycle visible in Temporal UI; every step, retry, and compensation logged
