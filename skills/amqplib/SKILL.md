---
name: amqplib
description: >-
  amqplib is the Node.js client library for RabbitMQ and other AMQP 0-9-1
  brokers. Use it to publish and consume messages from JavaScript or
  TypeScript: work queues, topic exchanges, dead-letter queues, publisher
  confirms, manual acknowledgments, prefetch limits and automatic reconnection.
  Use when someone asks to "connect Node.js to RabbitMQ", "send messages to a
  queue from Node", "consume RabbitMQ messages in TypeScript", "retry failed
  jobs with a dead-letter queue" or "reconnect amqplib after the broker
  restarts". Covers amqplib 2.x.
license: Apache-2.0
compatibility: "Node.js 18+, amqplib 2.2 (TypeScript types are bundled), a RabbitMQ 4.x broker or any AMQP 0-9-1 server."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["rabbitmq", "amqp", "messaging", "nodejs", "queues"]
  repository: https://github.com/amqp-node/amqplib
---

# amqplib

## Overview

amqplib speaks AMQP 0-9-1 from Node.js. It is only the client: the broker, exchange types, policies, clustering and operations are covered by the `rabbitmq` skill. This skill is about the Node API and its pitfalls.

Version 2.x (2.2.0 in September 2026) keeps the 0.x/1.x API. What changed since the old tutorials:

- **Types are bundled** (since 1.2.0). Do not install `@types/amqplib`; the DefinitelyTyped package stopped at 0.10.x.
- **Node.js 18 or newer** (since 1.0.0), and 0.10.6 or later is required for RabbitMQ 4.1+ (frame size).
- **Connection recovery is built in** (since 1.1.0): pass `recovery` to `connect` and the connection reconnects with backoff.
- **`heartbeat: 0` now disables heartbeats** (2.0.0). Before, it meant "use the server's value". Omit the option for the server default.
- The promise API is the default import (`amqplib`); the callback API lives in `amqplib/callback_api`.

## Instructions

### Install

```bash
npm install amqplib
docker run -d --name rabbit -p 127.0.0.1:5672:5672 -p 127.0.0.1:15672:15672 rabbitmq:4-management
```

Management UI: http://localhost:15672. Keep the broker URL in an environment variable such as `RABBITMQ_URL` (`amqp://orders_app:<password>@localhost:5672/shop`, TLS: `amqps://`). Do not use the default `guest` account outside the machine running the broker.

### Connect once, open channels

A connection is one TCP socket; keep one per process. A channel is a lightweight session on it. Use one channel for publishing and a separate one for consuming, because a consumer that is blocked by `prefetch` should not stall publishes.

```typescript
import amqp, { type ChannelModel, type ConsumeMessage } from "amqplib";

const connection = await amqp.connect(process.env.RABBITMQ_URL!);
connection.on("error", (err) => console.error("connection error", err.message));
connection.on("close", () => console.error("connection closed"));
```

A channel closes on any channel-level error (publishing to a missing exchange, acking twice, redeclaring a queue with different arguments). Attach `channel.on("error", ...)` and `channel.on("close", ...)` and open a new channel when it happens.

### Declare topology with a dead-letter queue

```typescript
const ch = await connection.createChannel();
await ch.assertExchange("orders.dlx", "fanout", { durable: true });
await ch.assertQueue("orders.failed", { durable: true });
await ch.bindQueue("orders.failed", "orders.dlx", "");
await ch.assertQueue("orders", {
  durable: true,
  arguments: { "x-dead-letter-exchange": "orders.dlx", "x-message-ttl": 86_400_000 },
});
```

`assertQueue` fails (and closes the channel) if the queue exists with different arguments. Change arguments by creating a new queue name or by using a RabbitMQ policy.

### Publish with confirms

A plain channel's `sendToQueue` returns before the broker has the message. Use a confirm channel when losing a message matters:

```typescript
const pub = await connection.createConfirmChannel();

async function publishOrder(order: { orderId: string; totalCents: number }) {
  const ok = pub.sendToQueue("orders", Buffer.from(JSON.stringify(order)), {
    persistent: true,                 // written to disk; the queue must be durable too
    contentType: "application/json",
    messageId: order.orderId,
  });
  if (!ok) await new Promise((resolve) => pub.once("drain", resolve)); // write buffer is full
  await pub.waitForConfirms();        // rejects if the broker nacks any outstanding publish
}
```

`publish(exchange, routingKey, content, options)` is the exchange variant. A message published to an exchange with no matching queue is dropped silently unless you set `mandatory: true` and listen to the channel's `return` event.

### Consume with manual acknowledgment

```typescript
const sub = await connection.createChannel();
await sub.prefetch(10);               // at most 10 unacknowledged messages per consumer

await sub.consume("orders", async (msg) => {
  if (msg === null) return;           // the broker cancelled the consumer (queue deleted, node down)
  try {
    await handleOrder(JSON.parse(msg.content.toString()));
    sub.ack(msg);
  } catch (err) {
    // requeue once, then dead-letter; msg.fields.redelivered tells which attempt this is
    sub.nack(msg, false, !msg.fields.redelivered);
  }
});
```

Never pass `noAck: true` for work that must not be lost. Ack and nack each message exactly once, on the channel that delivered it. An unhandled exception inside the callback leaves the message unacknowledged until the channel closes.

### Reconnect automatically

```typescript
const conn = await amqp.connect(process.env.RABBITMQ_URL!, {
  recovery: {
    initialDelay: 200,                // ms
    maxDelay: 30_000,
    maxRetries: Infinity,
    initialMaxRetries: 5,             // fail fast if the broker is down at startup
    async setup(model: ChannelModel) {   // runs after every (re)connect; the annotation is needed for TypeScript
      const ch = await model.createChannel();
      await ch.prefetch(10);
      await ch.assertQueue("orders", {   // same arguments as the first declaration, or the broker answers 406
        durable: true,
        arguments: { "x-dead-letter-exchange": "orders.dlx", "x-message-ttl": 86_400_000 },
      });
      await ch.consume("orders", (msg: ConsumeMessage | null) => { if (msg) ch.ack(msg); });
    },
  },
});
conn.on("disconnect", (err) => console.warn("lost broker:", err.message));
conn.on("reconnect-scheduled", ({ attempt, delay }) => console.log(`retry ${attempt} in ${delay} ms`));
conn.on("reconnect-failed", (err) => { console.error(err); process.exit(1); });
```

Recovery re-establishes the connection only. Channels, queues, bindings and consumers created before the drop are gone, so put every declaration and `consume` call in `setup`. Options: `waitForConnect: false` returns the handle immediately (await `conn.waitForConnect()` later), `calculateDelay(attempt)` replaces the built-in backoff (2.2.0; your function must enforce its own cap).

## Examples

### Example 1: Send order jobs to a worker

**Request:** "Our checkout service in Node should hand off confirmation emails to a worker, and nothing may be lost if the worker restarts."

Producer in `checkout.ts`, using the confirm channel from above:

```typescript
await publishOrder({ orderId: "ORD-20481", totalCents: 12990 });
```

Worker in `mail-worker.ts`: the consumer from the previous section with `handleOrder` sending the email. Start it, then run `docker exec rabbit rabbitmqctl list_queues name messages_ready messages_unacknowledged`:

```
orders    0    0
```

Stop the worker, publish three more orders, and the same command shows `orders  3  0`. Restart the worker and it drains them; a message whose handler throws twice lands in `orders.failed`.

### Example 2: Topic events for several services

**Request:** "Billing wants every order.* event, analytics wants everything."

```typescript
const ch = await connection.createChannel();
await ch.assertExchange("events", "topic", { durable: true });

async function subscribe(queueName: string, pattern: string, onEvent: (key: string, body: unknown) => Promise<void>) {
  await ch.assertQueue(queueName, { durable: true });   // named and durable: events wait while the service is down
  await ch.bindQueue(queueName, "events", pattern);
  await ch.consume(queueName, async (msg) => {
    if (!msg) return;
    await onEvent(msg.fields.routingKey, JSON.parse(msg.content.toString()));
    ch.ack(msg);
  });
}

await subscribe("billing.orders", "order.*", async (key, body) => console.log(key, body));
await subscribe("analytics.all", "#", async (key, body) => console.log(key, body));

ch.publish("events", "order.created", Buffer.from(JSON.stringify({ orderId: "ORD-20482", items: 3 })), { persistent: true });
```

Both queues get `order.created`; a later `user.signup` reaches only `analytics.all`.

## Guidelines

- Messages are `Buffer`s. Serialize and parse yourself, and set `contentType` so other consumers know the format.
- Durable queue plus `persistent: true` are both needed to survive a broker restart. Persistence alone is not delivery: use a confirm channel.
- Delivery is at least once. Make handlers idempotent, for example by recording `messageId`.
- Exclusive, auto-delete queues (`assertQueue("", { exclusive: true })`) vanish with the connection; use them only for throwaway subscribers.
- Do not open a connection per message. Do not share one channel between publishers and long-running consumers.
- On shutdown call `await channel.close()` then `await connection.close()` so in-flight acks are sent.
- Quorum queues (`arguments: { "x-queue-type": "quorum" }`) are the recommended replicated type on RabbitMQ 4; classic mirrored queues are gone.
- Broker setup, policies, retries with delay exchanges and monitoring belong to the `rabbitmq` skill.
