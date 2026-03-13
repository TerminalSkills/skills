---
name: amqplib
description: >-
   You are an expert in amqplib, the Node.js client for RabbitMQ and AMQP
  0-9-1 protocol. You help developers implement reliable message queuing with
  work queues, pub/sub fanout, topic routing, RPC patterns, dead letter
  queues, and message acknowledgment — building decoupled microservices that
  communicate asynchronously through RabbitMQ.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - rabbitmq
    - amqp
    - messaging
    - queue
    - microservices
    - async
---

# amqplib — RabbitMQ Client for Node.js

You are an expert in amqplib, the Node.js client for RabbitMQ and AMQP 0-9-1 protocol. You help developers implement reliable message queuing with work queues, pub/sub fanout, topic routing, RPC patterns, dead letter queues, and message acknowledgment — building decoupled microservices that communicate asynchronously through RabbitMQ.

## Core Capabilities

### Producer and Consumer

```typescript
import amqp from "amqplib";

// Producer — send messages to queue
async function sendToQueue(queue: string, message: any) {
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();

  await channel.assertQueue(queue, {
    durable: true,                         // Survive broker restart
    arguments: {
      "x-dead-letter-exchange": "dlx",     // Failed messages go to DLX
      "x-message-ttl": 86400000,           // 24h TTL
    },
  });

  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
    persistent: true,                      // Survive broker restart
    contentType: "application/json",
    messageId: crypto.randomUUID(),
    timestamp: Date.now(),
  });

  await channel.close();
  await connection.close();
}

// Consumer — process messages reliably
async function startConsumer(queue: string, handler: (msg: any) => Promise<void>) {
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();

  await channel.assertQueue(queue, { durable: true });
  await channel.prefetch(10);              // Process 10 at a time

  channel.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      await handler(data);
      channel.ack(msg);                    // Success — remove from queue
    } catch (error) {
      console.error("Processing failed:", error);
      channel.nack(msg, false, false);     // Failed — send to DLX (no requeue)
    }
  });
}

// Usage
await sendToQueue("orders", { orderId: "ORD-123", total: 99.99 });
await startConsumer("orders", async (order) => {
  await processOrder(order);
  await sendEmail(order);
});
```

### Pub/Sub with Exchanges

```typescript
// Topic exchange — route messages by pattern
async function setupTopicExchange() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();

  await channel.assertExchange("events", "topic", { durable: true });

  // Publish events
  channel.publish("events", "order.created", Buffer.from(JSON.stringify({
    orderId: "ORD-456", items: 3,
  })));

  channel.publish("events", "order.shipped", Buffer.from(JSON.stringify({
    orderId: "ORD-456", trackingId: "TRACK-789",
  })));

  channel.publish("events", "user.signup", Buffer.from(JSON.stringify({
    userId: "usr-99", email: "new@user.com",
  })));
}

// Subscribe to patterns
async function subscribeToPattern(pattern: string, handler: (data: any, key: string) => void) {
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();

  await channel.assertExchange("events", "topic", { durable: true });
  const { queue } = await channel.assertQueue("", { exclusive: true });
  await channel.bindQueue(queue, "events", pattern);

  channel.consume(queue, (msg) => {
    if (!msg) return;
    handler(JSON.parse(msg.content.toString()), msg.fields.routingKey);
    channel.ack(msg);
  });
}

// Subscribe to all order events
await subscribeToPattern("order.*", (data, key) => {
  console.log(`Order event [${key}]:`, data);
});

// Subscribe to everything
await subscribeToPattern("#", (data, key) => {
  console.log(`[${key}]:`, data);
});
```

## Installation

```bash
npm install amqplib
npm install -D @types/amqplib

# RabbitMQ server
docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:management
```

## Best Practices

1. **Durable queues + persistent messages** — Both needed to survive broker restarts; set both always
2. **Manual ack** — Never use `noAck: true` in production; explicitly ack after successful processing
3. **Dead letter exchanges** — Configure DLX for failed messages; analyze and retry later
4. **Prefetch** — Set `channel.prefetch(N)` to limit concurrent processing; prevents consumer overload
5. **Connection pooling** — Reuse connections, create channels per operation; connections are expensive
6. **Topic exchanges** — Use `order.*` patterns for flexible routing; decouple publishers from consumers
7. **Message TTL** — Set `x-message-ttl` to prevent queue buildup; stale messages expire automatically
8. **Idempotent consumers** — Use `messageId` to deduplicate; messages may be delivered more than once
