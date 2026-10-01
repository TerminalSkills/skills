---
name: rabbitmq
description: >-
  RabbitMQ is an open-source message broker: publishers send messages to
  exchanges, which route them into queues that consumers read and acknowledge.
  Use when tasks involve task queues, background job processing, inter-service
  communication, pub/sub fan-out, topic routing, dead-letter queues, retries
  with backoff, delayed messages, priority queues, request-reply (RPC), or
  reliable delivery with acknowledgments and publisher confirms.
license: Apache-2.0
compatibility: "RabbitMQ 4.x (Docker image or OS package). Code examples use Node.js 18+ with amqplib 2.2+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["rabbitmq", "messaging", "queues", "amqp", "microservices"]
  repository: https://github.com/rabbitmq/rabbitmq-server
---

# RabbitMQ

## Overview

Build reliable messaging and task queue systems for microservice architectures and background processing. RabbitMQ routes messages through **exchanges** to **queues**. Producers send to exchanges, consumers read from queues. The exchange type determines routing logic:

- **Direct** — routes by exact routing key match
- **Fanout** — broadcasts to all bound queues (pub/sub)
- **Topic** — routes by pattern matching on routing key (`order.*`, `#.error`)
- **Headers** — routes by message header values

This skill targets RabbitMQ 4.3 (September 2026: 4.3.6). The 4.x series changed defaults that older tutorials rely on: quorum queues are the queue type for anything that matters, they enforce a delivery limit of 20, transient non-exclusive queues are refused, and the delayed-message plugin is no longer maintained.

## Instructions

### Setup

```yaml
# docker-compose.yml — RabbitMQ with management UI
services:
  rabbitmq:
    image: rabbitmq:4.3-management
    hostname: orders-rabbit            # the node name is derived from it; keep it stable for the data volume
    ports:
      - "5672:5672"    # AMQP
      - "15672:15672"  # Management UI and HTTP API
    environment:
      RABBITMQ_DEFAULT_USER: orders_app
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:?set RABBITMQ_PASSWORD}
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq

volumes:
  rabbitmq-data:
```

Management UI at http://localhost:15672. The built-in `guest` user can log in only from localhost and is not created when `RABBITMQ_DEFAULT_USER` is set. Install the client with `npm install amqplib` (2.x bundles its TypeScript types; `@types/amqplib` is no longer needed).

### Producer and Consumer

```typescript
// connection.ts — one shared connection; amqplib reconnects when `recovery` is set (initialMaxRetries: 2.2+)
import amqp, { type Channel, type RecoveringChannelModel } from 'amqplib';

let connection: RecoveringChannelModel | undefined;

export async function getConnection(): Promise<RecoveringChannelModel> {
  if (connection) return connection;
  connection = await amqp.connect(process.env.RABBITMQ_URL ?? 'amqp://localhost:5672', {
    recovery: { initialDelay: 200, maxDelay: 5000, initialMaxRetries: 5 },
  });
  connection.on('disconnect', (err) => console.error('RabbitMQ disconnected:', err.message));
  return connection;
}

/** Declare the work queue the same way everywhere: redeclaring with different arguments is a channel error. */
export async function assertWorkQueue(ch: Channel, queue: string) {
  await ch.assertExchange('dlx', 'direct', { durable: true });
  await ch.assertQueue('dead-letters', { durable: true, arguments: { 'x-queue-type': 'quorum' } });
  await ch.bindQueue('dead-letters', 'dlx', queue);
  await ch.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',            // replicated, survives node loss
      'x-dead-letter-exchange': 'dlx',
      'x-dead-letter-routing-key': queue,
      'x-delivery-limit': 3,               // after 3 failed redeliveries the message is dead-lettered
      'x-message-ttl': 86_400_000,         // 24h
    },
  });
}
```

```typescript
// task-producer.ts — publish with confirms so a lost message is an error, not silence
import { randomUUID } from 'node:crypto';
import { assertWorkQueue, getConnection } from './connection';

export async function sendTask(queue: string, task: object, priority = 4) {
  const conn = await getConnection();
  const ch = await conn.createConfirmChannel();
  await assertWorkQueue(ch, queue);
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(task)), {
    persistent: true,
    priority,                         // quorum queues: 0-31, higher first (RabbitMQ 4.3+)
    contentType: 'application/json',
    messageId: randomUUID(),
    timestamp: Math.floor(Date.now() / 1000),
  });
  await ch.waitForConfirms();         // rejects if the broker nacked the publish
  await ch.close();
}
```

```typescript
// task-consumer.ts — ack on success, reject on failure and let the broker count attempts
import { assertWorkQueue, getConnection } from './connection';

export async function startWorker(queue: string, handler: (task: any) => Promise<void>) {
  const conn = await getConnection();
  const ch = await conn.createChannel();
  await assertWorkQueue(ch, queue);
  await ch.prefetch(10);              // at most 10 unacked messages per consumer

  await ch.consume(queue, async (msg) => {
    if (!msg) return;                 // consumer was cancelled by the broker
    const attempt = (msg.properties.headers?.['x-delivery-count'] ?? 0) + 1;
    try {
      await handler(JSON.parse(msg.content.toString()));
      ch.ack(msg);
    } catch (err) {
      console.error(`Task ${msg.properties.messageId} failed (attempt ${attempt}):`, (err as Error).message);
      ch.reject(msg, true);           // requeue; reject (not nack) counts toward x-delivery-limit
    }
  });
  console.log(`Worker started on queue: ${queue}`);
}
```

Do not count retries in your own header or republish failed messages: quorum queues track `x-delivery-count` and dead-letter the message once it exceeds the limit. To space the retries out, add `'x-delayed-retry-type': 'failed'`, `'x-delayed-retry-min': 1000` and `'x-delayed-retry-max': 30000` to the queue arguments (RabbitMQ 4.3+): redeliveries then wait 1 s, 2 s, 3 s … up to the maximum.

For Python, use `pika` with `BlockingConnection`, `basic_qos(prefetch_count=N)`, and `basic_consume` with `basic_ack`/`basic_reject` for message handling.

### Exchange Patterns

```typescript
// exchanges.ts — fanout broadcasts, topic routes by pattern
const ch = await (await getConnection()).createChannel();
const quorum = { durable: true, arguments: { 'x-queue-type': 'quorum' } };

// Fanout: every bound queue gets every message (notifications, cache invalidation, audit)
await ch.assertExchange('user-events', 'fanout', { durable: true });
await ch.assertQueue('user-events-email', quorum);
await ch.bindQueue('user-events-email', 'user-events', '');
await ch.assertQueue('user-events-analytics', quorum);
await ch.bindQueue('user-events-analytics', 'user-events', '');
ch.publish('user-events', '', Buffer.from(JSON.stringify({ type: 'user.registered', userId: 'usr-456' })),
  { persistent: true });

// Topic: * matches exactly one word, # matches zero or more
await ch.assertExchange('events', 'topic', { durable: true });
await ch.assertQueue('fulfillment', quorum);
await ch.bindQueue('fulfillment', 'events', 'order.created');
await ch.assertQueue('audit-log', quorum);
await ch.bindQueue('audit-log', 'events', '#');
await ch.assertQueue('payment-processing', quorum);
await ch.bindQueue('payment-processing', 'events', 'payment.*');
ch.publish('events', 'order.created', Buffer.from(JSON.stringify({ orderId: 'ord-123' })), { persistent: true });
ch.publish('events', 'payment.received', Buffer.from(JSON.stringify({ amount: 89.97 })), { persistent: true });
// fulfillment: 1 message, payment-processing: 1, audit-log: 2
```

### Dead-Letter Queue

Failed messages need a place to go for inspection and replay. `assertWorkQueue` above wires the queue to the `dlx` exchange; a message lands in `dead-letters` when it exceeds the delivery limit, is rejected without requeue, or expires.

```typescript
// dlq.ts — watch dead letters
const ch = await (await getConnection()).createChannel();
await ch.consume('dead-letters', (msg) => {
  if (!msg) return;
  const death = msg.properties.headers?.['x-death']?.[0];   // { reason, queue, count, time, ... }
  console.error(`Dead letter from ${death?.queue} (${death?.reason}):`, msg.content.toString());
  ch.ack(msg);   // after alerting or storing it for replay
});
```

`reason` is `delivery_limit`, `rejected`, `expired` or `maxlen`.

### Delayed Messages

The `rabbitmq_delayed_message_exchange` plugin is no longer maintained and depends on Mnesia, which RabbitMQ 4.3 removed. Delay with a wait queue instead: messages sit in a queue nobody consumes until their TTL expires, then dead-letter into the real queue.

```typescript
// delay.ts — deliver to "reminders" 5 seconds after publishing
await ch.assertQueue('reminders', { durable: true, arguments: { 'x-queue-type': 'quorum' } });
await ch.assertQueue('reminders.wait.5s', {
  durable: true,
  arguments: {
    'x-queue-type': 'quorum',
    'x-message-ttl': 5000,
    'x-dead-letter-exchange': '',              // default exchange routes by queue name
    'x-dead-letter-routing-key': 'reminders',
  },
});
ch.sendToQueue('reminders.wait.5s', Buffer.from(JSON.stringify({ invoice: 'INV-2041' })), { persistent: true });
```

Use one wait queue per delay length: a queue expires messages from its head, so mixed per-message TTLs in one queue block each other.

### RPC (Request-Reply)

Send the request with `replyTo: 'amq.rabbitmq.reply-to'` and a `correlationId`, after starting a `noAck` consumer on the pseudo-queue `amq.rabbitmq.reply-to` on the same channel. The server publishes its answer to `msg.properties.replyTo` with the same `correlationId`. No reply queue has to be declared.

## Examples

### Example 1: Email worker with automatic retries and a dead-letter queue

**User request:** "Send welcome emails in the background. If sending fails, retry a few times and keep the failures somewhere I can look at."

```typescript
// worker.ts
import { startWorker } from './task-consumer';
import { sendTask } from './task-producer';
import { sendEmail } from './mailer';

await startWorker('email-queue', (task) => sendEmail(task.to, task.template));
await sendTask('email-queue', { to: 'dana.whitfield@lumenlabs.io', template: 'welcome' });
await sendTask('email-queue', { to: 'ops@lumenlabs.io', template: 'password-reset' }, 9);  // jumps the line
```

When `sendEmail` keeps throwing for one message, the worker logs four attempts (the first delivery plus three redeliveries) and the broker moves the message to `dead-letters`:

```
Worker started on queue: email-queue
Task ea95b0f5-d4f0-4607-9bca-76b63e7580db failed (attempt 1): SMTP 550 mailbox unavailable
Task ea95b0f5-d4f0-4607-9bca-76b63e7580db failed (attempt 2): SMTP 550 mailbox unavailable
Task ea95b0f5-d4f0-4607-9bca-76b63e7580db failed (attempt 3): SMTP 550 mailbox unavailable
Task ea95b0f5-d4f0-4607-9bca-76b63e7580db failed (attempt 4): SMTP 550 mailbox unavailable
```

The dead letter carries `"x-delivery-count": 4` and `"x-death": [{ "count": 1, "reason": "delivery_limit", "queue": "email-queue", ... }]`.

### Example 2: Check what is in the broker

**User request:** "Messages are piling up somewhere. Show me the queues and whether anyone is consuming."

```bash
docker compose exec -u rabbitmq rabbitmq rabbitmqctl -q list_queues name type messages messages_unacknowledged consumers
docker compose exec -u rabbitmq rabbitmq rabbitmq-diagnostics -q check_running
curl -s -u "orders_app:$RABBITMQ_PASSWORD" 'http://localhost:15672/api/queues/%2F/dead-letters?columns=name,type,messages,consumers'
```

```
name	type	messages	messages_unacknowledged	consumers
email-queue	quorum	0	0	1
dead-letters	quorum	1	0	0
audit-log	quorum	2	0	0
RabbitMQ on node rabbit@orders-rabbit is fully booted and running
{"consumers":0,"messages":1,"name":"dead-letters","type":"quorum"}
```

A queue with a growing `messages` count and `consumers` at 0 has no worker; a high `messages_unacknowledged` with a consumer attached means the handler is slow or never acks.

## Guidelines

- **Always acknowledge messages** — unacked messages stay assigned to the consumer and count against its prefetch until the channel closes
- **Set prefetch count** — without it RabbitMQ pushes messages to a consumer as fast as it can, so one slow worker holds a backlog that others could process
- **Use quorum queues and persistent messages** for anything that matters. Queues declared without `x-queue-type` are classic (single replica). Non-durable, non-exclusive queues are refused by RabbitMQ 4.3 and the attempt closes the whole connection
- **Declare each queue in one place.** Asserting an existing queue with different arguments fails with `406 PRECONDITION_FAILED` and closes the channel; changing arguments means declaring a new queue or using a policy (`rabbitmqctl set_policy`)
- **`reject` versus `nack`** — on RabbitMQ 4.3 only `reject` and a dropped connection increase `x-delivery-count`; `nack` with requeue redelivers without limit
- **Priorities** — quorum queues order by `priority` 0–31 out of the box (messages without one count as 4) and reject the `x-max-priority` argument; only classic queues need `x-max-priority`
- **Dead-letter queues are not optional** — a quorum queue without one drops messages that exceed the delivery limit (20 by default)
- **One queue per consumer type** — don't have email and SMS services reading from the same queue
- **Idempotent consumers** — messages can be delivered more than once (redelivery after a lost connection or a failed ack). Design handlers to be safe to re-run.
- **Monitor queue depth** — growing queue length means consumers can't keep up. Alert on it.
- **Connection pooling** — create one connection with multiple channels, not one connection per operation
- **Credentials** — never expose 5672 or 15672 to the internet with default credentials; create a user per application with `rabbitmqctl add_user` and `set_permissions`, and use `amqps://` (TLS, port 5671) across networks
- **Client versions** — RabbitMQ 4.1+ needs amqplib 0.10.7 or later (older clients fail the frame size negotiation); upgrades to 4.3 are supported only from 4.2
- **When not to use it** — for replaying an ordered event log to many readers use RabbitMQ streams or Kafka; a queue deletes a message once it is acknowledged
