---
name: nats-messaging
description: >-
  Build distributed messaging systems with NATS — pub/sub, request/reply,
  JetStream persistent messaging, and key-value store. Use when someone asks
  to "set up message queue", "pub/sub system", "event-driven architecture",
  "NATS messaging", "distributed messaging", "microservice communication",
  "message broker", or "replace Kafka/RabbitMQ with something simpler".
  Covers core NATS, JetStream, KV store, and object store.
license: Apache-2.0
compatibility: "Node.js 18+ (also Deno, Bun, browsers via WebSocket). NATS server 2.10+ with JetStream, or Synadia Cloud."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/nats-io/nats.js
  category: development
  tags: ["messaging", "pub-sub", "nats", "queue", "distributed"]
---

# NATS Messaging

## Overview

NATS is a lightweight, high-performance messaging system for distributed applications. Simpler to operate than Kafka, with built-in persistence (JetStream), key-value store, and object store. Single binary, zero dependencies, runs anywhere. The JavaScript client moved to scoped packages in v3 (`@nats-io/transport-node`, `@nats-io/jetstream`, `@nats-io/kv`, `@nats-io/obj`); the old `nats` package (2.x) is deprecated, and its `StringCodec`/`jetstream()` method style is gone. Code below was run against nats-server 2.15.1 and client packages 3.4.0.

## When to Use

- Microservice-to-microservice communication (events, commands, queries)
- Real-time data streaming with persistence and replay
- Distributed key-value store without running Redis
- Request/reply patterns (synchronous messaging over async transport)
- Replacing Kafka/RabbitMQ in small-to-medium deployments

## Instructions

### Setup

```bash
# Server with JetStream enabled; bound to localhost only (monitoring on 8222)
docker run -d --name nats -p 127.0.0.1:4222:4222 -p 127.0.0.1:8222:8222 nats:2.15 -js -m 8222

# Clients (v3 packages; install only what you use)
npm install @nats-io/transport-node @nats-io/jetstream @nats-io/kv @nats-io/obj
```

`connect` comes from `@nats-io/transport-node`. Payloads are strings or `Uint8Array`; read them with `msg.string()` or `msg.json()`, so no codec is needed.

### Core Pub/Sub

```typescript
// pub-sub.ts — fire-and-forget messaging, no persistence
import { connect } from "@nats-io/transport-node";

const nc = await connect({ servers: "127.0.0.1:4222" });

const sub = nc.subscribe("orders.created");
(async () => {
  for await (const msg of sub) {
    const order = msg.json<{ id: string; total: number }>();
    console.log(`New order: ${order.id} — $${order.total}`);
  }
})();

nc.publish("orders.created", JSON.stringify({ id: "ord_123", total: 99.99 }));
```

Load-balance across instances with a queue group: every subscriber that uses the same `queue` name shares the messages (each message goes to one of them).

```typescript
nc.subscribe("jobs.resize", { queue: "workers", callback: (err, msg) => { /* handle */ } });
```

### JetStream (Persistent Messaging)

```typescript
// jetstream.ts — durable stream, publish with ack, durable consumer
import { connect, nanos } from "@nats-io/transport-node";
import { jetstream, jetstreamManager, AckPolicy, DeliverPolicy, RetentionPolicy } from "@nats-io/jetstream";

const nc = await connect({ servers: "127.0.0.1:4222" });
const jsm = await jetstreamManager(nc);
const js = jetstream(nc);

await jsm.streams.add({
  name: "ORDERS",
  subjects: ["orders.>"],
  retention: RetentionPolicy.Limits,
  max_msgs: 1_000_000,
  max_age: nanos(7 * 24 * 3600 * 1000), // 7 days; the server field is in nanoseconds
});

const ack = await js.publish("orders.shipped", JSON.stringify({ id: "ord_456" }));
console.log(ack.stream, ack.seq); // ORDERS 1

await jsm.consumers.add("ORDERS", {
  durable_name: "order-processor",
  ack_policy: AckPolicy.Explicit,
  deliver_policy: DeliverPolicy.All, // replay from the first message
});

const consumer = await js.consumers.get("ORDERS", "order-processor");
const messages = await consumer.consume({ max_messages: 100 });
for await (const msg of messages) {
  console.log(`Processing: ${msg.json<{ id: string }>().id}`);
  msg.ack(); // acknowledge after the work is done
}
```

Run several processes against the same durable consumer to share the work; no consumer-group concept is needed.

### Request/Reply

```typescript
// request-reply.ts — synchronous call over the async transport
import { connect } from "@nats-io/transport-node";

const nc = await connect({ servers: "127.0.0.1:4222" });

// Responder
nc.subscribe("users.get", {
  callback: (err, msg) => {
    const { id } = msg.json<{ id: string }>();
    msg.respond(JSON.stringify({ id, name: "Ada Lovelace" }));
  },
});

// Requester; rejects after the timeout (or at once if nobody is listening)
const reply = await nc.request("users.get", JSON.stringify({ id: "user_123" }), { timeout: 5000 });
console.log(reply.json()); // { id: 'user_123', name: 'Ada Lovelace' }
```

### Key-Value Store

```typescript
// kv.ts — bucket backed by a JetStream stream
import { connect } from "@nats-io/transport-node";
import { Kvm } from "@nats-io/kv";

const nc = await connect({ servers: "127.0.0.1:4222" });
const kvm = new Kvm(nc);
const kv = await kvm.create("sessions", { ttl: 3600 * 1000 }); // entries expire after 1 hour (ms)

await kv.put("user.123", JSON.stringify({ token: "abc" }));
const entry = await kv.get("user.123");
console.log(entry?.string(), entry?.revision); // {"token":"abc"} 1

const watch = await kv.watch();
for await (const e of watch) {
  console.log(`${e.key} ${e.operation}`); // PUT, DEL, PURGE
}

await kv.delete("user.123");
```

`kvm.create` creates the bucket or opens it if it exists with the same config; `kvm.open("sessions")` only binds to the name without checking that the bucket exists, so a missing bucket shows up as an error on the first `get`/`put`. Keys may use letters, digits, `-`, `/`, `_`, `=`, `.`; a colon is rejected (`user:123` throws "invalid key"). Object Store works the same way: `new Objm(nc).create("reports")` from `@nats-io/obj`, then `putBlob`/`getBlob` or streaming `put`/`get`.

## Examples

### Example 1: Event-driven microservice architecture

**User prompt:** "Set up event-driven communication between orders, payments, and notifications services."

Create one stream per domain (`ORDERS` with `orders.>`, `PAYMENTS` with `payments.>`), publish `orders.created` and `payments.completed` with `js.publish`, and give each service its own durable consumer (`payments-svc` on `ORDERS`, `notify-svc` on `PAYMENTS`). The service acks after its work succeeds. Result: restarting a service replays what it missed, and `ack.seq` confirms each publish was stored.

### Example 2: Replace Redis with NATS KV for sessions

**User prompt:** "I need a key-value store for session data but don't want to run Redis."

Run `nats:2.15 -js`, create the `sessions` bucket with `ttl: 3600 * 1000`, and use `put`/`get`/`delete` with dotted keys such as `user.123`. Result: sessions expire after an hour and `kv.watch()` streams every change to other services.

## Guidelines

- **Core NATS is at-most-once**: a subscriber that is offline misses the message. Use JetStream when messages must not be lost.
- **Ack after processing**, not before. Unacked messages are redelivered after `ack_wait` (30 s by default).
- **Subjects use `.`**: `orders.created`; `*` matches one token and `>` matches the rest (`orders.>`).
- **KV is not a Redis clone**: no data structures or transactions beyond revision checks (`create`, `update` with a revision). Good for sessions, config, feature flags.
- **Default max message size is 1 MB** (server `max_payload`, read it from `nc.info.max_payload`); put larger payloads in the Object Store.
- **Production**: run a 3-node cluster, enable authentication (user/password, NKeys or JWT) and TLS, and do not publish port 4222 to the internet.
- **Use the v3 packages**; do not install the deprecated `nats` package in new code.
