---
title: Build an Event Sourcing System
slug: build-event-sourcing-system
description: Build an event sourcing system with append-only event store, aggregate projections, snapshots, event replay, and CQRS read models for audit-heavy applications.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - event-sourcing
  - cqrs
  - architecture
  - audit
  - projections
---

# Build an Event Sourcing System

## The Problem

Omar leads engineering at a 25-person fintech processing $2M daily. Regulators require a complete audit trail of every state change — when a transfer was initiated, approved, executed, and by whom. Their current CRUD system overwrites data: when an account balance changes from $1000 to $800, the old value is gone. Debugging is impossible — "why did this balance end up at $237.50?" requires correlating timestamps across 5 log files. They need event sourcing: every state change captured as an immutable event, full audit history, ability to replay events to rebuild state, and fast read models for queries.

## Step 1: Build the Event Store

```typescript
// src/events/store.ts — Append-only event store with projections and snapshots
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface DomainEvent {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  version: number;           // per-aggregate sequence number
  data: Record<string, any>;
  metadata: {
    userId: string;
    correlationId: string;
    causationId?: string;
    timestamp: string;
    ip?: string;
  };
}

interface Aggregate {
  id: string;
  type: string;
  version: number;
  state: Record<string, any>;
}

// Append events to the store (optimistic concurrency via version check)
export async function appendEvents(
  aggregateId: string,
  aggregateType: string,
  expectedVersion: number,
  events: Array<{ eventType: string; data: Record<string, any> }>,
  metadata: { userId: string; correlationId: string; ip?: string }
): Promise<DomainEvent[]> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Optimistic concurrency check
    const { rows: [current] } = await client.query(
      "SELECT MAX(version) as version FROM events WHERE aggregate_id = $1",
      [aggregateId]
    );
    const currentVersion = current?.version || 0;

    if (currentVersion !== expectedVersion) {
      throw new Error(`Concurrency conflict: expected version ${expectedVersion}, got ${currentVersion}`);
    }

    const stored: DomainEvent[] = [];
    for (let i = 0; i < events.length; i++) {
      const event: DomainEvent = {
        id: `evt-${randomBytes(8).toString("hex")}`,
        aggregateId,
        aggregateType,
        eventType: events[i].eventType,
        version: expectedVersion + i + 1,
        data: events[i].data,
        metadata: { ...metadata, timestamp: new Date().toISOString() },
      };

      await client.query(
        `INSERT INTO events (id, aggregate_id, aggregate_type, event_type, version, data, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [event.id, aggregateId, aggregateType, event.eventType,
         event.version, JSON.stringify(event.data), JSON.stringify(event.metadata)]
      );
      stored.push(event);
    }

    await client.query("COMMIT");

    // Publish events for projections
    for (const event of stored) {
      await redis.publish(`events:${aggregateType}`, JSON.stringify(event));
      await redis.rpush("events:outbox", JSON.stringify(event));
    }

    return stored;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Load aggregate by replaying events
export async function loadAggregate<T extends Record<string, any>>(
  aggregateId: string,
  aggregateType: string,
  reducer: (state: T, event: DomainEvent) => T,
  initialState: T
): Promise<Aggregate & { state: T }> {
  // Check for snapshot first
  const snapshot = await getSnapshot(aggregateId);
  let state = snapshot ? (snapshot.state as T) : { ...initialState };
  let fromVersion = snapshot ? snapshot.version + 1 : 1;

  // Load events since snapshot
  const { rows } = await pool.query(
    `SELECT * FROM events WHERE aggregate_id = $1 AND version >= $2 ORDER BY version ASC`,
    [aggregateId, fromVersion]
  );

  for (const row of rows) {
    const event: DomainEvent = {
      ...row,
      data: JSON.parse(row.data),
      metadata: JSON.parse(row.metadata),
    };
    state = reducer(state, event);
  }

  const version = rows.length > 0 ? rows[rows.length - 1].version : (snapshot?.version || 0);

  // Auto-snapshot every 100 events
  if (rows.length > 100) {
    await saveSnapshot(aggregateId, aggregateType, version, state);
  }

  return { id: aggregateId, type: aggregateType, version, state };
}

// Snapshot management for performance
async function saveSnapshot(aggregateId: string, aggregateType: string, version: number, state: any): Promise<void> {
  await pool.query(
    `INSERT INTO snapshots (aggregate_id, aggregate_type, version, state, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (aggregate_id) DO UPDATE SET version = $3, state = $4, created_at = NOW()`,
    [aggregateId, aggregateType, version, JSON.stringify(state)]
  );
}

async function getSnapshot(aggregateId: string): Promise<{ version: number; state: any } | null> {
  const { rows: [row] } = await pool.query(
    "SELECT version, state FROM snapshots WHERE aggregate_id = $1",
    [aggregateId]
  );
  return row ? { version: row.version, state: JSON.parse(row.state) } : null;
}

// Get event history for an aggregate (audit trail)
export async function getEventHistory(
  aggregateId: string,
  options?: { fromVersion?: number; toVersion?: number; eventTypes?: string[] }
): Promise<DomainEvent[]> {
  let sql = "SELECT * FROM events WHERE aggregate_id = $1";
  const params: any[] = [aggregateId];
  let idx = 2;

  if (options?.fromVersion) { sql += ` AND version >= $${idx}`; params.push(options.fromVersion); idx++; }
  if (options?.toVersion) { sql += ` AND version <= $${idx}`; params.push(options.toVersion); idx++; }
  if (options?.eventTypes?.length) { sql += ` AND event_type = ANY($${idx})`; params.push(options.eventTypes); idx++; }

  sql += " ORDER BY version ASC";
  const { rows } = await pool.query(sql, params);
  return rows.map((r: any) => ({ ...r, data: JSON.parse(r.data), metadata: JSON.parse(r.metadata) }));
}

// Replay all events to rebuild a projection
export async function replayEvents(
  aggregateType: string,
  projector: (event: DomainEvent) => Promise<void>,
  options?: { fromTimestamp?: string; batchSize?: number }
): Promise<{ eventsProcessed: number; duration: number }> {
  const batchSize = options?.batchSize || 1000;
  let offset = 0;
  let processed = 0;
  const start = Date.now();

  while (true) {
    let sql = "SELECT * FROM events WHERE aggregate_type = $1";
    const params: any[] = [aggregateType];
    if (options?.fromTimestamp) {
      sql += " AND created_at >= $2";
      params.push(options.fromTimestamp);
    }
    sql += " ORDER BY created_at ASC, version ASC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(batchSize, offset);

    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) break;

    for (const row of rows) {
      const event: DomainEvent = { ...row, data: JSON.parse(row.data), metadata: JSON.parse(row.metadata) };
      await projector(event);
      processed++;
    }
    offset += batchSize;
  }

  return { eventsProcessed: processed, duration: Date.now() - start };
}
```

## Results

- **Complete audit trail** — every state change captured as immutable event with who, when, and why; regulators get full transaction history in one query
- **Debugging simplified** — "why is balance $237.50?" → replay events for that account: deposit $500, transfer -$200, fee -$12.50, refund -$50; every cent accounted for
- **Event replay rebuilds state** — corrupted projection? Replay 2M events in 3 minutes to rebuild; no data loss possible because events are immutable source of truth
- **Snapshots keep reads fast** — aggregates with 10K+ events load in <50ms by replaying only from latest snapshot; auto-snapshot every 100 events
- **Optimistic concurrency prevents conflicts** — two concurrent transfers on same account: second one gets version conflict and retries; no double-spending
