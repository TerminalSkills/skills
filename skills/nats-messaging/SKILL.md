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
compatibility: "Node.js 18+. NATS server (nats-server or Synadia Cloud)."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["messaging", "pub-sub", "nats", "queue", "distributed"]
---

# NATS Messaging

## Overview

NATS is a lightweight, high-performance messaging system for distributed applications. Simpler than Kafka, faster than RabbitMQ, with built-in persistence (JetStream), key-value store, and object store. Single binary, zero dependencies, runs anywhere.

## When to Use

- Microservice-to-microservice communication (events, commands, queries)
- Real-time data streaming with persistence and replay
- Distributed key-value store without running Redis
- Request/reply patterns (synchronous messaging over async transport)
- Replacing Kafka/RabbitMQ in small-to-medium deployments

## Instructions

### Setup

```bash
# Install NATS server
docker run -d --name nats -p 4222:4222 -p 8222:8222 nats:latest -js

# Install client
npm install nats
```

### Core Pub/Sub

```typescript
// pub-sub.ts — Basic publish/subscribe messaging
import { connect, StringCodec } from "nats";

const nc = await connect({ servers: "localhost:4222" });
const sc = StringCodec();

// Subscribe
const sub = nc.subscribe("orders.created");
(async () => {
  for await (const msg of sub) {
    const order = JSON.parse(sc.decode(msg.data));
    console.log(`New order: ${order.id} — $${order.total}`);
  }
})();

// Publish
nc.publish("orders.created", sc.encode(JSON.stringify({
  id: "ord_123",
  total: 99.99,
  items: ["widget-a", "widget-b"],
})));
```

### JetStream (Persistent Messaging)

```typescript
// jetstream.ts — Durable streams with replay and acknowledgment
import { connect, StringCodec, AckPolicy, DeliverPolicy } from "nats";

const nc = await connect({ servers: "localhost:4222" });
const js = nc.jetstream();
const jsm = await nc.jetstreamManager();
const sc = StringCodec();

// Create a stream (like a Kafka topic)
await jsm.streams.add({
  name: "ORDERS",
  subjects: ["orders.>"],           // Capture all order events
  retention: "limits",              // Keep messages until limits hit
  max_msgs: 1_000_000,
  max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days in nanoseconds
});

// Publish to stream
await js.publish("orders.created", sc.encode(JSON.stringify({
  id: "ord_456", total: 149.99,
})));

// Durable consumer (survives restarts)
const consumer = await jsm.consumers.add("ORDERS", {
  durable_name: "order-processor",
  ack_policy: AckPolicy.Explicit,
  deliver_policy: DeliverPolicy.All,  // Replay from beginning
});

// Process messages
const sub = await js.consumers.get("ORDERS", "order-processor");
const messages = await sub.consume();
for await (const msg of messages) {
  const order = JSON.parse(sc.decode(msg.data));
  console.log(`Processing: ${order.id}`);
  msg.ack();  // Acknowledge — won't be redelivered
}
```

### Request/Reply

```typescript
// request-reply.ts — Synchronous messaging pattern
import { connect, StringCodec } from "nats";

const nc = await connect({ servers: "localhost:4222" });
const sc = StringCodec();

// Service (responder)
nc.subscribe("users.get", {
  callback: async (err, msg) => {
    const { id } = JSON.parse(sc.decode(msg.data));
    const user = await db.user.findUnique({ where: { id } });
    msg.respond(sc.encode(JSON.stringify(user)));
  },
});

// Client (requester) — waits for response
const response = await nc.request(
  "users.get",
  sc.encode(JSON.stringify({ id: "user_123" })),
  { timeout: 5000 }  // 5 second timeout
);
const user = JSON.parse(sc.decode(response.data));
```

### Key-Value Store

```typescript
// kv.ts — Distributed key-value store (replaces Redis for simple cases)
import { connect } from "nats";

const nc = await connect({ servers: "localhost:4222" });
const js = nc.jetstream();

// Create KV bucket
const kv = await js.views.kv("sessions");

// Set
await kv.put("user:123", JSON.stringify({ token: "abc", expiresAt: Date.now() + 3600000 }));

// Get
const entry = await kv.get("user:123");
const session = JSON.parse(entry?.string() || "null");

// Watch for changes (real-time)
const watch = await kv.watch();
for await (const entry of watch) {
  console.log(`${entry.key} changed: ${entry.string()}`);
}

// Delete
await kv.delete("user:123");
```

## Examples

### Example 1: Event-driven microservice architecture

**User prompt:** "Set up event-driven communication between 3 microservices: orders, payments, and notifications."

The agent will create a JetStream stream for each domain, publish domain events (order.created, payment.completed), and set up durable consumers in each service.

### Example 2: Replace Redis with NATS KV

**User prompt:** "I need a key-value store for session data but don't want to run Redis."

The agent will set up NATS KV bucket for sessions with TTL, get/set/delete operations, and watch for real-time session changes.

## Guidelines

- **Core NATS for fire-and-forget** — fast pub/sub, no persistence
- **JetStream for durable messaging** — when messages must not be lost
- **Explicit ack for reliability** — acknowledge after processing, not before
- **Subject hierarchy with `.`** — `orders.created`, `orders.shipped`, subscribe to `orders.>`
- **KV replaces Redis for simple cases** — session storage, config, feature flags
- **Single binary** — NATS server is 15MB, runs anywhere, no JVM
- **Cluster for HA** — 3-node cluster for production resilience
- **Consumer groups** — multiple instances of the same consumer share the workload
- **Max 1MB per message** — use Object Store for larger payloads
