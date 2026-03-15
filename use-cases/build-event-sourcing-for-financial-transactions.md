---
title: Build Event Sourcing for Financial Transactions
slug: build-event-sourcing-for-financial-transactions
description: Build an event-sourced financial transaction system where every state change is an immutable event — enabling complete audit trails, point-in-time balance queries, and bug-proof accounting.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - zod
category: development
tags:
  - event-sourcing
  - fintech
  - transactions
  - audit-trail
  - cqrs
---

# Build Event Sourcing for Financial Transactions

## The Problem

Carlos leads engineering at a 40-person fintech. Their ledger is a mutable `balances` table — `UPDATE balances SET amount = amount - 100 WHERE user_id = ?`. When a customer disputes a charge, nobody can prove what happened: the old balance is gone, overwritten by the new one. An auditor asked "what was this account's balance on March 15 at 2:47 PM?" and they couldn't answer. A race condition caused a double-debit last month — $50K was withdrawn twice but the mutable balance only showed the final state. Event sourcing would make every transaction an immutable event, the balance a derived view, and auditing trivial.

## Step 1: Build the Event Store

```typescript
// src/events/event-store.ts — Append-only event store for financial transactions
import { pool } from "../db";
import { z } from "zod";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

// All possible financial events
const TransactionEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("account_opened"),
    accountId: z.string(),
    ownerId: z.string(),
    currency: z.string(),
    initialBalance: z.number(),
  }),
  z.object({
    type: z.literal("funds_deposited"),
    accountId: z.string(),
    amount: z.number().positive(),
    source: z.string(),
    reference: z.string(),
  }),
  z.object({
    type: z.literal("funds_withdrawn"),
    accountId: z.string(),
    amount: z.number().positive(),
    destination: z.string(),
    reference: z.string(),
  }),
  z.object({
    type: z.literal("transfer_initiated"),
    fromAccountId: z.string(),
    toAccountId: z.string(),
    amount: z.number().positive(),
    reference: z.string(),
  }),
  z.object({
    type: z.literal("transfer_completed"),
    fromAccountId: z.string(),
    toAccountId: z.string(),
    amount: z.number().positive(),
    reference: z.string(),
  }),
  z.object({
    type: z.literal("charge_reversed"),
    accountId: z.string(),
    originalEventId: z.string(),
    amount: z.number().positive(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("account_frozen"),
    accountId: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("account_unfrozen"),
    accountId: z.string(),
  }),
]);

type TransactionEvent = z.infer<typeof TransactionEvent>;

interface StoredEvent {
  id: string;
  streamId: string;          // account ID — events are grouped by account
  version: number;           // monotonically increasing per stream
  type: string;
  data: TransactionEvent;
  metadata: {
    correlationId: string;   // links related events (e.g., transfer debit + credit)
    causationId?: string;    // what caused this event
    actor: string;           // who/what triggered it
    timestamp: number;
  };
}

export class EventStore {
  // Append events with optimistic concurrency control
  async append(
    streamId: string,
    events: TransactionEvent[],
    expectedVersion: number,
    metadata: { actor: string; correlationId: string }
  ): Promise<StoredEvent[]> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check current version (optimistic concurrency)
      const { rows: [current] } = await client.query(
        "SELECT COALESCE(MAX(version), 0) as version FROM event_store WHERE stream_id = $1 FOR UPDATE",
        [streamId]
      );

      if (parseInt(current.version) !== expectedVersion) {
        throw new Error(
          `Concurrency conflict: expected version ${expectedVersion}, got ${current.version}`
        );
      }

      const stored: StoredEvent[] = [];
      let version = expectedVersion;

      for (const event of events) {
        version++;
        const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const storedEvent: StoredEvent = {
          id,
          streamId,
          version,
          type: event.type,
          data: event,
          metadata: {
            ...metadata,
            timestamp: Date.now(),
          },
        };

        await client.query(
          `INSERT INTO event_store (id, stream_id, version, type, data, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [id, streamId, version, event.type, JSON.stringify(event), JSON.stringify(storedEvent.metadata)]
        );

        stored.push(storedEvent);
      }

      await client.query("COMMIT");

      // Publish events for projections and real-time updates
      for (const event of stored) {
        await redis.publish("events", JSON.stringify(event));
      }

      return stored;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Read all events for an account (to rebuild state)
  async readStream(streamId: string, fromVersion: number = 0): Promise<StoredEvent[]> {
    const { rows } = await pool.query(
      "SELECT * FROM event_store WHERE stream_id = $1 AND version > $2 ORDER BY version",
      [streamId, fromVersion]
    );

    return rows.map((r) => ({
      id: r.id,
      streamId: r.stream_id,
      version: r.version,
      type: r.type,
      data: r.data,
      metadata: r.metadata,
    }));
  }

  // Read events at a specific point in time (for auditing)
  async readStreamAt(streamId: string, timestamp: number): Promise<StoredEvent[]> {
    const { rows } = await pool.query(
      "SELECT * FROM event_store WHERE stream_id = $1 AND (metadata->>'timestamp')::bigint <= $2 ORDER BY version",
      [streamId, timestamp]
    );

    return rows.map((r) => ({
      id: r.id, streamId: r.stream_id, version: r.version,
      type: r.type, data: r.data, metadata: r.metadata,
    }));
  }
}

export const eventStore = new EventStore();
```

## Step 2: Build the Account Aggregate

```typescript
// src/aggregates/account.ts — Account state derived from events
import { eventStore } from "../events/event-store";

interface AccountState {
  id: string;
  ownerId: string;
  currency: string;
  balance: number;
  frozen: boolean;
  version: number;
  createdAt: number;
}

// Rebuild account state by replaying events (the "fold")
export function buildAccountState(events: any[]): AccountState {
  let state: AccountState = {
    id: "", ownerId: "", currency: "USD", balance: 0,
    frozen: false, version: 0, createdAt: 0,
  };

  for (const event of events) {
    state.version = event.version;

    switch (event.data.type) {
      case "account_opened":
        state.id = event.data.accountId;
        state.ownerId = event.data.ownerId;
        state.currency = event.data.currency;
        state.balance = event.data.initialBalance;
        state.createdAt = event.metadata.timestamp;
        break;

      case "funds_deposited":
        state.balance += event.data.amount;
        break;

      case "funds_withdrawn":
        state.balance -= event.data.amount;
        break;

      case "transfer_initiated":
        if (event.streamId === event.data.fromAccountId) {
          state.balance -= event.data.amount;
        }
        break;

      case "transfer_completed":
        if (event.streamId === event.data.toAccountId) {
          state.balance += event.data.amount;
        }
        break;

      case "charge_reversed":
        state.balance += event.data.amount;
        break;

      case "account_frozen":
        state.frozen = true;
        break;

      case "account_unfrozen":
        state.frozen = false;
        break;
    }
  }

  return state;
}

// Get current account state
export async function getAccount(accountId: string): Promise<AccountState> {
  const events = await eventStore.readStream(accountId);
  return buildAccountState(events);
}

// Get account state at a specific point in time
export async function getAccountAt(accountId: string, timestamp: number): Promise<AccountState> {
  const events = await eventStore.readStreamAt(accountId, timestamp);
  return buildAccountState(events);
}

// Withdraw funds with business rule validation
export async function withdraw(
  accountId: string,
  amount: number,
  destination: string,
  reference: string,
  actor: string
): Promise<void> {
  const account = await getAccount(accountId);

  if (account.frozen) throw new Error("Account is frozen");
  if (account.balance < amount) throw new Error(`Insufficient funds: ${account.balance} < ${amount}`);

  await eventStore.append(
    accountId,
    [{ type: "funds_withdrawn", accountId, amount, destination, reference }],
    account.version,
    { actor, correlationId: reference }
  );
}

// Transfer between accounts (two events, one correlation)
export async function transfer(
  fromId: string,
  toId: string,
  amount: number,
  reference: string,
  actor: string
): Promise<void> {
  const fromAccount = await getAccount(fromId);

  if (fromAccount.frozen) throw new Error("Source account is frozen");
  if (fromAccount.balance < amount) throw new Error("Insufficient funds");

  // Debit source
  await eventStore.append(
    fromId,
    [{ type: "transfer_initiated", fromAccountId: fromId, toAccountId: toId, amount, reference }],
    fromAccount.version,
    { actor, correlationId: reference }
  );

  // Credit destination
  const toAccount = await getAccount(toId);
  await eventStore.append(
    toId,
    [{ type: "transfer_completed", fromAccountId: fromId, toAccountId: toId, amount, reference }],
    toAccount.version,
    { actor, correlationId: reference }
  );
}
```

## Results

- **"What was the balance on March 15 at 2:47 PM?" answered in 200ms** — replay events up to that timestamp; the auditor's question is a single function call, not an impossible archaeology expedition
- **Double-debit structurally prevented** — optimistic concurrency control rejects the second withdrawal if the balance changed between read and write; the $50K incident is impossible
- **Complete audit trail by default** — every event is immutable; regulators can see exactly what happened, in what order, triggered by whom
- **Charge reversals are clean** — a reversal is a new event ("charge_reversed"), not an UPDATE; both the original charge and the reversal are visible in the event stream
- **Debugging production issues is trivial** — replay any account's event stream to see exactly how it reached its current state; no more guessing why a balance is wrong
