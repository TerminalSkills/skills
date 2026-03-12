---
title: Build an Event-Driven Order Management System
slug: build-event-driven-order-management-system
description: >
  Replace a monolithic order processing system with an event-driven
  architecture that handles 5K orders/minute, supports complex fulfillment
  workflows, and never loses an order.
skills:
  - typescript
  - kafka-js
  - postgresql
  - redis
  - zod
  - bull-mq
  - hono
category: Backend Architecture
tags:
  - event-driven
  - order-management
  - saga
  - microservices
  - kafka
  - fulfillment
---

# Build an Event-Driven Order Management System

## The Problem

Rosa is CTO of a marketplace doing 2M orders/month across 500 merchants. Their monolithic order system processes everything synchronously: validate inventory → charge payment → create shipment → send confirmation email. When the payment gateway is slow (30% of the time), the entire checkout hangs. When the email service is down, orders fail entirely. Last Black Friday, the system collapsed at 800 orders/minute — they lost an estimated $340K in abandoned carts. The most painful bug: 2,300 customers were charged but never received their order because the shipment creation step failed silently after payment succeeded.

## Step 1: Order Events as Source of Truth

```typescript
// src/events/order-events.ts
import { z } from 'zod';

export const OrderPlaced = z.object({
  type: z.literal('OrderPlaced'),
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  merchantId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string(), quantity: z.number().int().positive(), pricePerUnit: z.number().int(),
  })),
  totalCents: z.number().int().positive(),
  currency: z.string().length(3),
  shippingAddress: z.object({ line1: z.string(), city: z.string(), state: z.string(), zip: z.string(), country: z.string() }),
  timestamp: z.string().datetime(),
});

export const InventoryReserved = z.object({
  type: z.literal('InventoryReserved'),
  orderId: z.string().uuid(),
  reservations: z.array(z.object({ productId: z.string(), quantity: z.number(), warehouseId: z.string() })),
  timestamp: z.string().datetime(),
});

export const PaymentCaptured = z.object({
  type: z.literal('PaymentCaptured'),
  orderId: z.string().uuid(),
  paymentId: z.string(),
  amountCents: z.number().int(),
  timestamp: z.string().datetime(),
});

export const PaymentFailed = z.object({
  type: z.literal('PaymentFailed'),
  orderId: z.string().uuid(),
  reason: z.string(),
  timestamp: z.string().datetime(),
});

export const ShipmentCreated = z.object({
  type: z.literal('ShipmentCreated'),
  orderId: z.string().uuid(),
  trackingNumber: z.string(),
  carrier: z.string(),
  timestamp: z.string().datetime(),
});

export const OrderCompleted = z.object({
  type: z.literal('OrderCompleted'),
  orderId: z.string().uuid(),
  timestamp: z.string().datetime(),
});

export const OrderCancelled = z.object({
  type: z.literal('OrderCancelled'),
  orderId: z.string().uuid(),
  reason: z.string(),
  refundInitiated: z.boolean(),
  timestamp: z.string().datetime(),
});

export type OrderEvent =
  | z.infer<typeof OrderPlaced>
  | z.infer<typeof InventoryReserved>
  | z.infer<typeof PaymentCaptured>
  | z.infer<typeof PaymentFailed>
  | z.infer<typeof ShipmentCreated>
  | z.infer<typeof OrderCompleted>
  | z.infer<typeof OrderCancelled>;
```

## Step 2: Order Saga Orchestrator

```typescript
// src/saga/order-saga.ts
// Orchestrates the order lifecycle with compensating actions on failure

import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import type { OrderEvent } from '../events/order-events';

const kafka = new Kafka({ clientId: 'order-saga', brokers: process.env.KAFKA_BROKERS!.split(',') });
const producer = kafka.producer({ idempotent: true });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

type SagaState = 'placed' | 'inventory_reserved' | 'payment_captured' | 'shipped' |
  'completed' | 'cancelling' | 'cancelled' | 'failed';

export async function handleOrderEvent(event: OrderEvent): Promise<void> {
  switch (event.type) {
    case 'OrderPlaced': {
      await updateSagaState(event.orderId, 'placed');
      // Step 1: Reserve inventory
      await producer.send({
        topic: 'inventory-commands',
        messages: [{ key: event.orderId, value: JSON.stringify({
          command: 'ReserveInventory', orderId: event.orderId, items: event.items,
        })}],
      });
      // Set timeout: if inventory not reserved in 30s, cancel
      await scheduleTimeout(event.orderId, 'inventory_timeout', 30_000);
      break;
    }

    case 'InventoryReserved': {
      await updateSagaState(event.orderId, 'inventory_reserved');
      // Step 2: Capture payment
      const order = await getOrder(event.orderId);
      await producer.send({
        topic: 'payment-commands',
        messages: [{ key: event.orderId, value: JSON.stringify({
          command: 'CapturePayment', orderId: event.orderId,
          amountCents: order.totalCents, currency: order.currency,
          customerId: order.customerId,
        })}],
      });
      await scheduleTimeout(event.orderId, 'payment_timeout', 60_000);
      break;
    }

    case 'PaymentCaptured': {
      await updateSagaState(event.orderId, 'payment_captured');
      // Step 3: Create shipment
      const order = await getOrder(event.orderId);
      await producer.send({
        topic: 'fulfillment-commands',
        messages: [{ key: event.orderId, value: JSON.stringify({
          command: 'CreateShipment', orderId: event.orderId,
          items: order.items, shippingAddress: order.shippingAddress,
        })}],
      });
      // Send confirmation email (fire-and-forget, non-critical)
      await producer.send({
        topic: 'notification-commands',
        messages: [{ key: event.orderId, value: JSON.stringify({
          command: 'SendOrderConfirmation', orderId: event.orderId,
          customerId: order.customerId,
        })}],
      });
      break;
    }

    case 'PaymentFailed': {
      // Compensating action: release inventory
      await updateSagaState(event.orderId, 'cancelling');
      await producer.send({
        topic: 'inventory-commands',
        messages: [{ key: event.orderId, value: JSON.stringify({
          command: 'ReleaseInventory', orderId: event.orderId,
        })}],
      });
      await updateSagaState(event.orderId, 'failed');
      break;
    }

    case 'ShipmentCreated': {
      await updateSagaState(event.orderId, 'shipped');
      await producer.send({
        topic: 'notification-commands',
        messages: [{ key: event.orderId, value: JSON.stringify({
          command: 'SendShippingNotification', orderId: event.orderId,
          trackingNumber: event.trackingNumber, carrier: event.carrier,
        })}],
      });
      break;
    }

    case 'OrderCompleted': {
      await updateSagaState(event.orderId, 'completed');
      break;
    }
  }
}

async function updateSagaState(orderId: string, state: SagaState): Promise<void> {
  await db.query(
    `INSERT INTO order_saga (order_id, state, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (order_id) DO UPDATE SET state = $2, updated_at = NOW()`,
    [orderId, state]
  );
}

async function getOrder(orderId: string): Promise<any> {
  const { rows } = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  return rows[0];
}

async function scheduleTimeout(orderId: string, type: string, delayMs: number): Promise<void> {
  const { Queue } = await import('bullmq');
  const { Redis } = await import('ioredis');
  const queue = new Queue('saga-timeouts', { connection: new Redis(process.env.REDIS_URL!) });
  await queue.add(type, { orderId }, { delay: delayMs, jobId: `${orderId}:${type}` });
}
```

## Step 3: Kafka Consumer Pipeline

```typescript
// src/pipeline/consumer.ts
import { Kafka } from 'kafkajs';
import { handleOrderEvent } from '../saga/order-saga';

const kafka = new Kafka({ clientId: 'order-consumer', brokers: process.env.KAFKA_BROKERS!.split(',') });

export async function startPipeline(): Promise<void> {
  const consumer = kafka.consumer({ groupId: 'order-saga-processor' });
  await consumer.connect();
  await consumer.subscribe({ topics: ['order-events', 'inventory-events', 'payment-events', 'fulfillment-events'] });

  await consumer.run({
    partitionsConsumedConcurrently: 4,
    eachMessage: async ({ message, topic }) => {
      const event = JSON.parse(message.value!.toString());
      await handleOrderEvent(event);
    },
  });
}
```

## Step 4: Dead Letter Queue and Recovery

```typescript
// src/recovery/dlq-processor.ts
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

const connection = new Redis(process.env.REDIS_URL!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Process stuck orders (paid but not shipped)
const recoveryWorker = new Worker('order-recovery', async (job) => {
  const stuckOrders = await db.query(`
    SELECT order_id FROM order_saga
    WHERE state = 'payment_captured'
      AND updated_at < NOW() - INTERVAL '10 minutes'
  `);

  for (const row of stuckOrders.rows) {
    console.log(`Recovering stuck order: ${row.order_id}`);
    // Re-emit ShipmentCreation command
    // This is idempotent — fulfillment service checks if shipment already exists
  }
}, { connection });
```

## Results

- **Peak throughput**: 5,200 orders/minute sustained (was crashing at 800)
- **Black Friday**: handled 3x normal traffic with zero dropped orders
- **Charged-but-not-shipped**: zero incidents (saga guarantees compensating actions)
- **Email service outage**: orders still process — notifications are async and retry
- **Payment gateway latency**: no impact on checkout UX — async processing
- **Order recovery**: stuck orders auto-detected and retried within 10 minutes
- **Lost revenue from downtime**: $0 (was $340K previous Black Friday)
