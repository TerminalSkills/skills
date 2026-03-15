---
title: Build an Event Bus System
slug: build-event-bus-system
description: Build an event bus system with pub/sub messaging, event schema registry, dead letter handling, consumer groups, replay capability, and monitoring for decoupled microservice communication.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - event-bus
  - pub-sub
  - messaging
  - microservices
  - decoupling
---

# Build an Event Bus System

## The Problem

Oliver leads backend at a 25-person company with 10 microservices. Services communicate via direct HTTP calls — the order service calls the inventory service, which calls the notification service. When inventory is down, orders fail. Adding a new consumer (analytics) requires changing the order service code. Event format changes break downstream services silently. There's no replay capability — if a consumer was down during an event, the event is lost. They need an event bus: publish once, multiple consumers subscribe, schema validation, dead letter for failures, replay for recovery, and consumer group management.

## Step 1: Build the Event Bus

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";
import { z, ZodSchema } from "zod";
const redis = new Redis(process.env.REDIS_URL!);

interface Event { id: string; type: string; version: number; source: string; data: any; metadata: { correlationId: string; timestamp: string; }; }
interface Subscription { id: string; eventType: string; consumerGroup: string; handler: (event: Event) => Promise<void>; maxRetries: number; }
interface EventSchema { type: string; version: number; schema: ZodSchema; }

const subscriptions = new Map<string, Subscription[]>();
const schemas = new Map<string, EventSchema>();

// Register event schema
export function registerSchema(type: string, version: number, schema: ZodSchema): void {
  schemas.set(`${type}:${version}`, { type, version, schema });
}

// Publish event
export async function publish(type: string, data: any, source: string, correlationId?: string): Promise<string> {
  const schemaKey = `${type}:1`;
  const schema = schemas.get(schemaKey);
  if (schema) {
    const result = schema.schema.safeParse(data);
    if (!result.success) throw new Error(`Event validation failed: ${result.error.message}`);
  }

  const event: Event = {
    id: `evt-${randomBytes(8).toString("hex")}`, type, version: 1, source,
    data, metadata: { correlationId: correlationId || randomBytes(8).toString("hex"), timestamp: new Date().toISOString() },
  };

  // Store event for replay
  await pool.query(
    `INSERT INTO event_log (id, type, version, source, data, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [event.id, type, 1, source, JSON.stringify(data), JSON.stringify(event.metadata)]
  );

  // Publish to Redis for real-time delivery
  await redis.publish(`events:${type}`, JSON.stringify(event));

  // Also push to per-consumer-group queues for reliable delivery
  const subs = subscriptions.get(type) || [];
  const groups = new Set(subs.map((s) => s.consumerGroup));
  for (const group of groups) {
    await redis.rpush(`eventbus:${type}:${group}`, JSON.stringify(event));
  }

  await redis.hincrby("eventbus:stats", "published", 1);
  await redis.hincrby(`eventbus:stats:${type}`, "count", 1);

  return event.id;
}

// Subscribe to events
export function subscribe(eventType: string, consumerGroup: string, handler: (event: Event) => Promise<void>, maxRetries: number = 3): string {
  const id = `sub-${randomBytes(4).toString("hex")}`;
  const sub: Subscription = { id, eventType, consumerGroup, handler, maxRetries };
  if (!subscriptions.has(eventType)) subscriptions.set(eventType, []);
  subscriptions.get(eventType)!.push(sub);
  // Start consumer loop
  consumeLoop(eventType, consumerGroup, sub).catch(() => {});
  return id;
}

async function consumeLoop(eventType: string, group: string, sub: Subscription): Promise<void> {
  while (true) {
    const raw = await redis.blpop(`eventbus:${eventType}:${group}`, 5);
    if (!raw) continue;
    const event: Event = JSON.parse(raw[1]);

    let attempt = 0;
    let success = false;
    while (attempt <= sub.maxRetries && !success) {
      try {
        await sub.handler(event);
        success = true;
        await redis.hincrby("eventbus:stats", "consumed", 1);
      } catch (e: any) {
        attempt++;
        if (attempt > sub.maxRetries) {
          // Dead letter
          await redis.rpush(`eventbus:dlq:${eventType}:${group}`, JSON.stringify({ event, error: e.message, failedAt: new Date().toISOString(), attempts: attempt }));
          await redis.hincrby("eventbus:stats", "dead", 1);
        } else {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }
  }
}

// Replay events (e.g., after consumer recovery)
export async function replay(eventType: string, consumerGroup: string, since: string): Promise<number> {
  const { rows } = await pool.query(
    "SELECT * FROM event_log WHERE type = $1 AND created_at >= $2 ORDER BY created_at ASC",
    [eventType, since]
  );
  for (const row of rows) {
    await redis.rpush(`eventbus:${eventType}:${consumerGroup}`, JSON.stringify({
      ...row, data: JSON.parse(row.data), metadata: JSON.parse(row.metadata),
    }));
  }
  return rows.length;
}

// Retry dead letter events
export async function retryDLQ(eventType: string, consumerGroup: string): Promise<number> {
  let retried = 0;
  while (true) {
    const raw = await redis.lpop(`eventbus:dlq:${eventType}:${consumerGroup}`);
    if (!raw) break;
    const { event } = JSON.parse(raw);
    await redis.rpush(`eventbus:${eventType}:${consumerGroup}`, JSON.stringify(event));
    retried++;
  }
  return retried;
}

// Monitoring
export async function getStats(): Promise<{ published: number; consumed: number; dead: number; queueDepths: Record<string, number> }> {
  const stats = await redis.hgetall("eventbus:stats");
  const queueKeys = await redis.keys("eventbus:*:*");
  const depths: Record<string, number> = {};
  for (const key of queueKeys) {
    if (!key.includes("dlq") && !key.includes("stats")) {
      depths[key] = await redis.llen(key);
    }
  }
  return { published: parseInt(stats.published || "0"), consumed: parseInt(stats.consumed || "0"), dead: parseInt(stats.dead || "0"), queueDepths: depths };
}
```

## Results

- **Inventory down ≠ orders fail** — order service publishes `order.created` event; inventory consumes when it's back up; decoupled; no cascading failures
- **New consumer in 5 minutes** — analytics team subscribes to `order.created`; no changes to order service; zero coordination needed
- **Schema validation** — `order.created` must have `orderId`, `amount`, `currency`; publisher with missing field gets immediate error; no silent downstream failures
- **Event replay** — analytics consumer was down for 2 hours; `replay('order.created', 'analytics', '2h ago')` re-queues 500 missed events; zero data loss
- **Dead letter queue** — notification service fails on malformed email; event moves to DLQ after 3 retries; ops fixes handler, retries DLQ; no lost notifications
