---
title: Build an Event-Driven Order Processing Pipeline
slug: build-event-driven-order-pipeline
description: "Design a microservice order pipeline using Kafka for event streaming and RabbitMQ for task queues, with dead-letter handling, retries, and exactly-once payment processing."
skills: [kafka, rabbitmq]
category: devops
tags: [kafka, rabbitmq, microservices, event-driven, orders, messaging]
---

# Build an Event-Driven Order Processing Pipeline

## The Problem

A growing e-commerce platform processes 5,000 orders per day through a monolithic Node.js application. The entire flow -- payment capture, inventory reservation, shipping label generation, email confirmation, and analytics -- runs synchronously in a single API request handler. When the shipping provider's API is slow (which happens several times a week), the checkout endpoint takes 8-12 seconds to respond. When the email service is down, the entire checkout fails -- even though the payment already went through.

The team has seen three incidents in the past month: a shipping API timeout caused duplicate charges (the retry hit the payment API twice), an email outage caused 200 orders to fail after payment was captured (customers charged but no confirmation sent), and a traffic spike during a flash sale saturated the database connection pool because every checkout held a connection for the full 6-second request lifecycle.

The core issue is coupling. Every step in the order pipeline is synchronous and blocking, which means any downstream failure cascades to the customer-facing checkout endpoint. The team needs to decouple these steps so that a slow shipping API doesn't affect checkout speed, an email outage doesn't lose orders, and traffic spikes don't take down the entire system.

## The Solution

Split the order pipeline into two layers using the **kafka** and **rabbitmq** skills. Kafka serves as the event backbone -- every state change (order created, payment captured, inventory reserved) is published as an immutable event that multiple services can consume independently. RabbitMQ handles task distribution -- background jobs like email sending, shipping label generation, and webhook delivery use work queues with retries and dead-letter handling.

This separation matters because events and tasks have different requirements. Events are facts about what happened (replay-safe, multi-consumer, ordered). Tasks are commands to do something (single consumer, retriable, priority-able). Kafka excels at the first; RabbitMQ at the second.

## Step-by-Step Walkthrough

### Step 1: Design the Event Flow

```text
I'm splitting a monolithic order flow into event-driven microservices. Design the 
event schema and topic structure for an e-commerce pipeline with these stages:

1. Order placed (from checkout API)
2. Payment captured (from payment service)  
3. Inventory reserved (from inventory service)
4. Shipping label created (from shipping service)
5. Customer notified (from notification service)

Each stage should be independent — failure in one doesn't block others. Payment 
must be exactly-once. Everything else can be at-least-once with idempotent handlers.
```

The event flow uses Kafka topics for stage transitions. Each service consumes events from the stages it cares about and produces events for the next stage:

```
checkout API
    → order.events (Kafka)
        → payment-service consumes "order.placed"
            → order.events: "payment.captured"
        → inventory-service consumes "payment.captured"
            → order.events: "inventory.reserved"
        → shipping-service consumes "inventory.reserved"
            → order.events: "shipping.created"
        
    → task queues (RabbitMQ)
        → email-queue: confirmation, shipping notification
        → webhook-queue: partner notifications
        → analytics-queue: event tracking
```

### Step 2: Set Up the Event Backbone

The Kafka producer wraps event publishing with a consistent schema. Every event includes the order ID as the partition key (guaranteeing ordering per order), an event type, a timestamp, and the payload:

```typescript
// src/events/producer.ts — Central event publisher for all services

import { Kafka, Partitioners } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'order-platform',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  idempotent: true,         // Prevents duplicates from network retries
  maxInFlightRequests: 1,   // Required for idempotent producer
});

await producer.connect();

interface OrderEvent {
  type: string;
  orderId: string;
  timestamp: string;
  data: Record<string, unknown>;
  source: string;           // Which service produced this event
  correlationId: string;    // Traces the event chain back to the original request
}

/** Publish an order event to the event backbone.
 *
 * @param event - Structured event with type, orderId, and payload.
 *
 * Using orderId as the Kafka key guarantees all events for the same order
 * land on the same partition, preserving ordering. A payment event for
 * order-123 always arrives after the corresponding order.placed event.
 */
async function publishEvent(event: OrderEvent) {
  await producer.send({
    topic: 'order.events',
    messages: [{
      key: event.orderId,
      value: JSON.stringify(event),
      headers: {
        'event-type': event.type,
        'source': event.source,
        'correlation-id': event.correlationId,
      },
    }],
  });
}

export { publishEvent, OrderEvent };
```

### Step 3: Build the Checkout Endpoint

The checkout endpoint does two things: validate the order and publish an event. No payment, no inventory check, no email -- those happen asynchronously. The endpoint responds in under 50ms:

```typescript
// src/api/checkout.ts — Fast checkout that publishes an event and returns

import { publishEvent } from '../events/producer';
import { randomUUID } from 'crypto';

app.post('/api/checkout', async (req, res) => {
  const { items, customerId, shippingAddress, paymentMethodId } = req.body;

  // Validate input (fast, no external calls)
  if (!items?.length || !customerId || !paymentMethodId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const orderId = `ord-${randomUUID().slice(0, 8)}`;
  const correlationId = randomUUID();
  const total = items.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);

  // Save order to database with status "pending"
  await db.orders.create({
    id: orderId,
    customerId,
    items,
    total,
    shippingAddress,
    paymentMethodId,
    status: 'pending',
    correlationId,
  });

  // Publish event — everything else happens asynchronously
  await publishEvent({
    type: 'order.placed',
    orderId,
    timestamp: new Date().toISOString(),
    source: 'checkout-api',
    correlationId,
    data: { customerId, items, total, shippingAddress, paymentMethodId },
  });

  // Return immediately — customer sees "order received"
  res.status(201).json({ orderId, status: 'pending' });
});
```

### Step 4: Payment Service with Exactly-Once Processing

Payment is the one stage where duplicates are unacceptable. The service uses Kafka transactions and an idempotency key with the payment provider to guarantee exactly-once:

```typescript
// src/services/payment.ts — Payment consumer with exactly-once guarantees

import { Kafka } from 'kafkajs';

const kafka = new Kafka({ clientId: 'payment-service', brokers: ['localhost:9092'] });

const consumer = kafka.consumer({ groupId: 'payment-service-group' });
const producer = kafka.producer({
  idempotent: true,
  transactionalId: 'payment-tx-producer',
  maxInFlightRequests: 1,
});

await consumer.connect();
await producer.connect();
await consumer.subscribe({ topics: ['order.events'] });

// Track processed orders to prevent duplicate payment attempts
// In production, use a database table with a unique constraint on orderId
const processedOrders = new Set<string>();

await consumer.run({
  eachMessage: async ({ message }) => {
    const event = JSON.parse(message.value!.toString());

    // Only process order.placed events
    if (event.type !== 'order.placed') return;

    const { orderId, data, correlationId } = event;

    // Idempotency check — skip if already processed
    if (processedOrders.has(orderId)) {
      console.log(`Skipping duplicate: ${orderId}`);
      return;
    }

    try {
      // Capture payment with idempotency key (Stripe, etc.)
      // The payment provider deduplicates on their side too
      const charge = await paymentProvider.capture({
        amount: data.total,
        currency: 'usd',
        paymentMethodId: data.paymentMethodId,
        idempotencyKey: `payment-${orderId}`,  // Same key = same result, no duplicate charge
        metadata: { orderId, correlationId },
      });

      // Atomic: commit offset + publish payment.captured event in one transaction
      const transaction = await producer.transaction();
      try {
        await transaction.send({
          topic: 'order.events',
          messages: [{
            key: orderId,
            value: JSON.stringify({
              type: 'payment.captured',
              orderId,
              timestamp: new Date().toISOString(),
              source: 'payment-service',
              correlationId,
              data: { chargeId: charge.id, amount: charge.amount },
            }),
          }],
        });
        await transaction.sendOffsets({
          consumerGroupId: 'payment-service-group',
          topics: [{ topic: 'order.events', partitions: [{ partition: 0, offset: message.offset }] }],
        });
        await transaction.commit();
      } catch (err) {
        await transaction.abort();
        throw err;
      }

      processedOrders.add(orderId);
      await db.orders.update(orderId, { status: 'paid', chargeId: charge.id });

    } catch (err) {
      console.error(`Payment failed for ${orderId}:`, err);
      await publishEvent({
        type: 'payment.failed',
        orderId,
        timestamp: new Date().toISOString(),
        source: 'payment-service',
        correlationId,
        data: { error: err.message },
      });
    }
  },
});
```

### Step 5: Task Queues for Background Work

Non-critical work (emails, webhooks, analytics) goes through RabbitMQ work queues. Each task type gets its own queue with appropriate retry logic and dead-letter handling:

```typescript
// src/tasks/setup.ts — RabbitMQ queue topology for background tasks

import amqp from 'amqplib';

async function setupQueues() {
  const conn = await amqp.connect('amqp://admin:secret@localhost:5672');
  const ch = await conn.createChannel();

  // Dead-letter exchange for failed tasks
  await ch.assertExchange('dlx', 'direct', { durable: true });
  await ch.assertQueue('dead-letters', { durable: true });
  await ch.bindQueue('dead-letters', 'dlx', '');

  // Email queue — high priority for transactional emails (order confirmations)
  await ch.assertQueue('email-queue', {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'dlx',
      'x-max-priority': 10,
      'x-message-ttl': 86400000,  // 24h — stale emails are worse than no email
    },
  });

  // Webhook queue — retry-friendly for partner notifications
  await ch.assertQueue('webhook-queue', {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'dlx',
      'x-message-ttl': 3600000,  // 1h TTL — webhooks should be timely
    },
  });

  // Analytics queue — best-effort, high throughput
  await ch.assertQueue('analytics-queue', {
    durable: true,
    arguments: { 'x-message-ttl': 7200000 },  // 2h TTL
  });

  return ch;
}
```

```typescript
// src/tasks/dispatcher.ts — Kafka consumer that dispatches to RabbitMQ task queues

/** Listen to order events and dispatch background tasks. */
await eventConsumer.run({
  eachMessage: async ({ message }) => {
    const event = JSON.parse(message.value!.toString());
    const ch = await getRabbitChannel();

    switch (event.type) {
      case 'payment.captured':
        // Send order confirmation email (high priority)
        ch.sendToQueue('email-queue', Buffer.from(JSON.stringify({
          template: 'order-confirmation',
          to: event.data.customerEmail,
          data: { orderId: event.orderId, total: event.data.amount },
        })), { persistent: true, priority: 9 });

        // Notify partner via webhook
        ch.sendToQueue('webhook-queue', Buffer.from(JSON.stringify({
          url: 'https://partner.example.com/orders',
          payload: { orderId: event.orderId, status: 'paid' },
          retryCount: 0,
        })), { persistent: true });
        break;

      case 'shipping.created':
        // Send shipping notification email
        ch.sendToQueue('email-queue', Buffer.from(JSON.stringify({
          template: 'shipping-notification',
          to: event.data.customerEmail,
          data: { orderId: event.orderId, trackingNumber: event.data.trackingNumber },
        })), { persistent: true, priority: 5 });
        break;
    }

    // Every event goes to analytics (best-effort)
    ch.sendToQueue('analytics-queue', Buffer.from(JSON.stringify(event)), {
      persistent: false,  // Analytics can tolerate loss
    });
  },
});
```

### Step 6: Webhook Worker with Exponential Backoff

The webhook worker retries failed deliveries with exponential backoff. After three failures, the message goes to the dead-letter queue for manual investigation:

```typescript
// src/workers/webhook-worker.ts — Reliable webhook delivery with retries

import { getChannel } from '../tasks/setup';

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 5000;  // 5s, 25s, 125s

async function startWebhookWorker() {
  const ch = await getChannel();
  await ch.prefetch(5);  // Process 5 webhooks concurrently

  ch.consume('webhook-queue', async (msg) => {
    if (!msg) return;

    const task = JSON.parse(msg.content.toString());
    const retryCount = task.retryCount || 0;

    try {
      const resp = await fetch(task.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task.payload),
        signal: AbortSignal.timeout(10000),  // 10s timeout
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      ch.ack(msg);
    } catch (err) {
      if (retryCount >= MAX_RETRIES) {
        console.error(`Webhook permanently failed after ${MAX_RETRIES} retries: ${task.url}`);
        ch.nack(msg, false, false);  // → dead-letter queue
        return;
      }

      // Exponential backoff via delayed re-enqueue
      const delayMs = BACKOFF_BASE_MS * Math.pow(5, retryCount);
      console.warn(`Webhook failed (attempt ${retryCount + 1}), retrying in ${delayMs}ms`);

      ch.ack(msg);  // Ack original
      // Re-enqueue with incremented retry count (delay handled by consumer sleep or delayed exchange)
      setTimeout(() => {
        ch.sendToQueue('webhook-queue', Buffer.from(JSON.stringify({
          ...task,
          retryCount: retryCount + 1,
        })), { persistent: true });
      }, delayMs);
    }
  });
}
```

## Real-World Example

The platform deploys the event-driven pipeline on a Monday. The first thing the team notices is checkout speed: average response time drops from 3.2 seconds to 47 milliseconds. The endpoint now does exactly two things -- save the order and publish an event -- then returns. Customers see "Order received" almost instantly.

On Wednesday, the shipping provider has a 30-minute outage. In the old system, this would have meant 30 minutes of checkout failures. Now, order events queue up in Kafka, the shipping service resumes processing when the API comes back, and customers don't notice anything except slightly delayed shipping notifications. Zero lost orders, zero failed checkouts.

The first dead-letter queue alert fires on Thursday -- a partner webhook endpoint changed their URL without telling anyone. The webhook worker retried three times with exponential backoff, then moved the failed deliveries to the dead-letter queue. Ops drains the DLQ with the corrected URL, and the partner gets all their notifications within an hour.

During a Friday flash sale, the platform handles 3x normal traffic. Kafka absorbs the burst -- 15,000 order events in an hour instead of the usual 5,000. The email workers fall behind briefly (queue depth hits 800), but catch up within 20 minutes as the burst subsides. The analytics queue tolerates the delay. No customers experienced any degradation because the checkout endpoint never blocked on downstream processing.

## Related Skills

- [redis](../skills/redis/) -- Add caching between services to reduce database load
- [kafka](../skills/kafka/) -- Deep dive into Kafka configuration and stream processing
- [rabbitmq](../skills/rabbitmq/) -- Advanced RabbitMQ patterns: RPC, delayed messages, priority queues
