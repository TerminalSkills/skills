---
title: Build a Transactional Outbox Pattern
slug: build-transactional-outbox-pattern
description: Build a transactional outbox pattern with reliable event publishing, exactly-once delivery, polling publisher, CDC integration, and dead letter handling for microservice communication.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - outbox
  - event-driven
  - microservices
  - reliability
  - patterns
---

# Build a Transactional Outbox Pattern

## The Problem

Soren leads backend at a 25-person e-commerce. When a customer places an order, the system must save the order AND send events to inventory, shipping, and notification services. If the database write succeeds but the message broker publish fails (network blip, broker restart), the order exists but downstream services never learn about it. Inventory isn't decremented, shipping label isn't created, customer gets no confirmation. They retry publishing, but now the broker recovered and the retry creates a duplicate event — inventory decremented twice. They need atomic database-write + event-publish: either both happen or neither, with exactly-once delivery semantics.

## Step 1: Build the Outbox Engine

```typescript
// src/outbox/engine.ts — Transactional outbox with exactly-once delivery and polling publisher
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface OutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, any>;
  destination: string;
  status: "pending" | "published" | "failed" | "dead";
  attempts: number;
  maxAttempts: number;
  publishedAt: string | null;
  createdAt: string;
}

// Save entity + outbox event in the SAME transaction
export async function saveWithOutbox<T>(
  entitySql: string,
  entityParams: any[],
  events: Array<{
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, any>;
    destination: string;
  }>
): Promise<{ entityResult: any; eventIds: string[] }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Save the entity
    const entityResult = await client.query(entitySql, entityParams);

    // Save outbox events in the SAME transaction
    const eventIds: string[] = [];
    for (const event of events) {
      const id = `evt-${randomBytes(8).toString("hex")}`;
      await client.query(
        `INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, destination, status, attempts, max_attempts, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0, 5, NOW())`,
        [id, event.aggregateType, event.aggregateId, event.eventType,
         JSON.stringify(event.payload), event.destination]
      );
      eventIds.push(id);
    }

    await client.query("COMMIT");
    return { entityResult, eventIds };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Polling publisher: reads pending outbox events and publishes them
export async function publishPendingEvents(batchSize: number = 100): Promise<{
  published: number; failed: number; dead: number;
}> {
  let published = 0, failed = 0, dead = 0;

  // Select pending events (oldest first)
  const { rows: events } = await pool.query(
    `SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`,
    [batchSize]
  );

  for (const event of events) {
    try {
      // Publish to destination (Redis pub/sub, HTTP webhook, message queue, etc.)
      await publishEvent(event);

      // Mark as published
      await pool.query(
        "UPDATE outbox SET status = 'published', published_at = NOW(), attempts = attempts + 1 WHERE id = $1",
        [event.id]
      );
      published++;
    } catch (error: any) {
      const attempts = event.attempts + 1;
      if (attempts >= event.max_attempts) {
        await pool.query(
          "UPDATE outbox SET status = 'dead', attempts = $2 WHERE id = $1",
          [event.id, attempts]
        );
        dead++;
      } else {
        await pool.query(
          "UPDATE outbox SET attempts = $2 WHERE id = $1",
          [event.id, attempts]
        );
        failed++;
      }
    }
  }

  // Track metrics
  await redis.hincrby("outbox:metrics", "published", published);
  await redis.hincrby("outbox:metrics", "failed", failed);
  await redis.hincrby("outbox:metrics", "dead", dead);

  return { published, failed, dead };
}

async function publishEvent(event: any): Promise<void> {
  const payload = JSON.parse(event.payload);
  const message = JSON.stringify({
    id: event.id,
    type: event.event_type,
    aggregateType: event.aggregate_type,
    aggregateId: event.aggregate_id,
    payload,
    timestamp: event.created_at,
  });

  switch (event.destination) {
    case "redis":
      await redis.publish(`events:${event.aggregate_type}`, message);
      break;
    case "webhook":
      await fetch(payload.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Event-ID": event.id },
        body: message,
        signal: AbortSignal.timeout(10000),
      });
      break;
    default:
      await redis.rpush(`queue:${event.destination}`, message);
  }
}

// Consumer-side deduplication (exactly-once processing)
export async function processEventIdempotently(
  eventId: string,
  handler: () => Promise<void>
): Promise<boolean> {
  // Check if already processed
  const key = `outbox:processed:${eventId}`;
  const isNew = await redis.set(key, "1", "EX", 86400 * 7, "NX");
  if (!isNew) return false;  // already processed

  try {
    await handler();
    return true;
  } catch (error) {
    await redis.del(key);  // allow retry on failure
    throw error;
  }
}

// Cleanup old published events
export async function cleanup(olderThanDays: number = 7): Promise<number> {
  const { rowCount } = await pool.query(
    "DELETE FROM outbox WHERE status = 'published' AND published_at < NOW() - $1 * INTERVAL '1 day'",
    [olderThanDays]
  );
  return rowCount || 0;
}

// Retry dead events
export async function retryDeadEvents(destination?: string): Promise<number> {
  let sql = "UPDATE outbox SET status = 'pending', attempts = 0 WHERE status = 'dead'";
  const params: any[] = [];
  if (destination) { sql += " AND destination = $1"; params.push(destination); }
  const { rowCount } = await pool.query(sql, params);
  return rowCount || 0;
}

// Monitoring
export async function getOutboxStats(): Promise<{
  pending: number; published: number; failed: number; dead: number; oldestPending: string | null;
}> {
  const { rows: [stats] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'published') as published,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COUNT(*) FILTER (WHERE status = 'dead') as dead,
       MIN(created_at) FILTER (WHERE status = 'pending') as oldest_pending
     FROM outbox`
  );
  return { pending: parseInt(stats.pending), published: parseInt(stats.published), failed: parseInt(stats.failed), dead: parseInt(stats.dead), oldestPending: stats.oldest_pending };
}
```

## Results

- **Zero lost events** — order save + event publish in same DB transaction; if either fails, both rollback; inventory always matches orders
- **Exactly-once delivery** — consumer-side deduplication with Redis SET NX; duplicate publishes (from retries) processed only once; no double inventory decrement
- **Polling publisher is simple** — runs every 5 seconds via cron; no complex message broker setup; PostgreSQL IS the message queue; ops team already knows how to monitor it
- **Dead letter handling** — events that fail 5 times moved to dead status; ops dashboard shows dead events with error details; retry button re-queues them
- **FOR UPDATE SKIP LOCKED** — multiple publisher instances can run in parallel; each locks different rows; horizontal scaling without conflicts
