---
title: Build a Workflow Engine with State Machines
slug: build-workflow-engine-with-state-machines
description: Build a workflow engine using XState state machines — modeling approval flows, order lifecycles, and onboarding sequences with explicit states, transitions, guards, and audit trails.
skills:
  - xstate
  - typescript
  - postgresql
  - redis
category: development
tags:
  - workflow
  - state-machine
  - xstate
  - automation
  - business-logic
---

# Build a Workflow Engine with State Machines

## The Problem

Ivan leads operations at a 40-person company. Approval workflows are hardcoded with nested if/else chains — a purchase order goes through "requested → manager approval → finance approval → CEO approval (if >$10K) → approved." The code is 800 lines of spaghetti. When they added a "legal review" step, it took 3 weeks and introduced 4 bugs. Nobody can visualize the current flow. Orders get stuck in limbo because edge cases (rejected → re-submitted → re-approved) weren't handled. They need a state machine that makes workflows explicit, visual, and impossible to enter invalid states.

## The Solution

Model each workflow as an XState v5 machine, which is plain data plus guards, and keep the engine generic: it loads a persisted snapshot from PostgreSQL, asks the machine whether the event is allowed, saves the next snapshot with a history row, and publishes the transition on Redis. The machine is pure, so it is tested without a database.

## Step-by-Step Walkthrough

### Step 1: Define the Machine

```bash
npm install xstate pg ioredis
npm install -D typescript @types/node @types/pg
```

`setup()` declares the types, guards and actions once, and `createMachine()` then refers to them by name. Context is only changed with `assign`, never mutated. Terminal states use `type: "final"`; a final state cannot have transitions, so `approved` stays a normal state that can still be fulfilled or cancelled.

```typescript
// src/workflows/purchase-order.ts — the purchase order approval flow as an XState v5 machine
import { setup, assign } from "xstate";

export type PurchaseOrderContext = {
  amount: number;
  requesterId: string;
  approvals: string[];
  rejectionReason: string;
};

export type PurchaseOrderEvent =
  | { type: "SUBMIT"; actor: string }
  | { type: "APPROVE"; actor: string }
  | { type: "REJECT"; actor: string; reason?: string }
  | { type: "REQUEST_INFO" | "PROVIDE_INFO" | "REQUEST_CHANGES" | "RESUBMIT"
            | "WITHDRAW" | "FULFILL" | "CANCEL"; actor: string };

export const purchaseOrderMachine = setup({
  types: {
    context: {} as PurchaseOrderContext,
    events: {} as PurchaseOrderEvent,
    input: {} as { amount: number; requesterId: string },
  },
  guards: {
    hasRequiredFields: ({ context }) => context.amount > 0 && context.requesterId !== "",
    requiresCEOApproval: ({ context }) => context.amount > 10_000,
    requiresLegalReview: ({ context }) => context.amount > 50_000,
  },
  actions: {
    recordApproval: assign({
      approvals: ({ context, event }) => [...context.approvals, event.actor],
    }),
    recordRejection: assign({
      rejectionReason: ({ event }) =>
        event.type === "REJECT" ? event.reason ?? "No reason provided" : "",
    }),
  },
}).createMachine({
  id: "purchase-order",
  initial: "draft",
  context: ({ input }) => ({
    amount: input.amount,
    requesterId: input.requesterId,
    approvals: [],
    rejectionReason: "",
  }),
  states: {
    draft: {
      on: { SUBMIT: { target: "pending_manager", guard: "hasRequiredFields" } },
    },
    pending_manager: {
      on: {
        APPROVE: { target: "pending_finance", actions: "recordApproval" },
        REJECT: { target: "rejected", actions: "recordRejection" },
        REQUEST_INFO: "needs_info",
      },
    },
    needs_info: {
      on: { PROVIDE_INFO: "pending_manager", WITHDRAW: "withdrawn" },
    },
    pending_finance: {
      on: {
        APPROVE: [
          { guard: "requiresCEOApproval", target: "pending_ceo", actions: "recordApproval" },
          { guard: "requiresLegalReview", target: "pending_legal", actions: "recordApproval" },
          { target: "approved", actions: "recordApproval" },
        ],
        REJECT: { target: "rejected", actions: "recordRejection" },
      },
    },
    pending_ceo: {
      on: {
        APPROVE: [
          { guard: "requiresLegalReview", target: "pending_legal", actions: "recordApproval" },
          { target: "approved", actions: "recordApproval" },
        ],
        REJECT: { target: "rejected", actions: "recordRejection" },
      },
    },
    pending_legal: {
      on: {
        APPROVE: { target: "approved", actions: "recordApproval" },
        REJECT: { target: "rejected", actions: "recordRejection" },
        REQUEST_CHANGES: "pending_revision",
      },
    },
    pending_revision: {
      on: { RESUBMIT: "pending_legal", WITHDRAW: "withdrawn" },
    },
    approved: {
      on: { FULFILL: "fulfilled", CANCEL: "cancelled" },
    },
    rejected: {
      on: { RESUBMIT: "draft" },
    },
    withdrawn: { type: "final" },
    fulfilled: { type: "final" },
    cancelled: { type: "final" },
  },
});
```

### Step 2: Store Instances and Advance Them

The `snapshot` column holds the persisted snapshot; `current_state` is a copy for queries.

```sql
CREATE TABLE workflow_instances (
  id            text PRIMARY KEY,
  definition_id text NOT NULL,
  current_state text NOT NULL,
  snapshot      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workflow_history (
  id          bigserial PRIMARY KEY,
  instance_id text NOT NULL REFERENCES workflow_instances(id),
  from_state  text NOT NULL,
  to_state    text NOT NULL,
  event       text NOT NULL,
  actor       text NOT NULL,
  payload     jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
```

Three details matter in the engine: `FOR UPDATE` only holds a lock inside a transaction on a single connection, so the engine checks out a client and wraps the work in `BEGIN`/`COMMIT`; `snapshot.can(event)` evaluates guards, so a `SUBMIT` with a zero amount is refused like any other invalid event; and the Redis message is published after the commit.

```typescript
// src/workflows/engine.ts — persist and advance workflow instances (PostgreSQL + Redis)
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { Pool } from "pg";
import { getInitialSnapshot, getNextSnapshot, type AnyStateMachine } from "xstate";
import { purchaseOrderMachine, type PurchaseOrderEvent } from "./purchase-order";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);

const machines: Record<string, AnyStateMachine> = {
  "purchase-order": purchaseOrderMachine,
};

function machineFor(definitionId: string): AnyStateMachine {
  const machine = machines[definitionId];
  if (!machine) throw new Error(`Unknown workflow definition: ${definitionId}`);
  return machine;
}

export async function createWorkflow(
  definitionId: string,
  input: { amount: number; requesterId: string },
) {
  const machine = machineFor(definitionId);
  const snapshot = getInitialSnapshot(machine, input);
  const id = `wf-${randomUUID()}`;

  await pool.query(
    `INSERT INTO workflow_instances (id, definition_id, current_state, snapshot)
     VALUES ($1, $2, $3, $4)`,
    [id, definitionId, String(snapshot.value), JSON.stringify(machine.getPersistedSnapshot(snapshot))],
  );
  return { id, state: snapshot.value, context: snapshot.context };
}

export async function sendEvent(instanceId: string, event: PurchaseOrderEvent) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows: [row] } = await db.query(
      "SELECT definition_id, current_state, snapshot FROM workflow_instances WHERE id = $1 FOR UPDATE",
      [instanceId],
    );
    if (!row) throw new Error("Workflow not found");

    const machine = machineFor(row.definition_id);
    const current = machine.resolveState(row.snapshot);

    if (!current.can(event)) {
      await db.query("ROLLBACK");
      return { allowed: false as const, state: row.current_state as string };
    }

    const next = getNextSnapshot(machine, current, event);
    const to = String(next.value);

    await db.query(
      `UPDATE workflow_instances SET current_state = $2, snapshot = $3, updated_at = NOW() WHERE id = $1`,
      [instanceId, to, JSON.stringify(machine.getPersistedSnapshot(next))],
    );
    await db.query(
      `INSERT INTO workflow_history (instance_id, from_state, to_state, event, actor, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [instanceId, row.current_state, to, event.type, event.actor, JSON.stringify(event)],
    );
    await db.query("COMMIT");

    await redis.publish(
      "workflow:transitions",
      JSON.stringify({ instanceId, from: row.current_state, to, event: event.type, actor: event.actor }),
    );
    return { allowed: true as const, state: to };
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

export async function getAvailableActions(instanceId: string): Promise<string[]> {
  const { rows: [row] } = await pool.query(
    "SELECT definition_id, snapshot FROM workflow_instances WHERE id = $1",
    [instanceId],
  );
  if (!row) throw new Error("Workflow not found");
  const machine = machineFor(row.definition_id);
  const current = machine.resolveState(row.snapshot);
  return machine.events.filter((type) => current.can({ type, actor: "probe" } as PurchaseOrderEvent));
}
```

### Step 3: Exercise the Machine Without a Database

Because transitions are pure functions of a snapshot and an event, the approval path for a $60,000 order can be checked in a few lines:

```typescript
import { getInitialSnapshot, getNextSnapshot } from "xstate";
import { purchaseOrderMachine as m } from "./purchase-order";

let s = getInitialSnapshot(m, { amount: 60_000, requesterId: "u1" });
for (const [type, actor] of [["SUBMIT", "ann"], ["APPROVE", "manager"], ["APPROVE", "finance"],
                             ["APPROVE", "ceo"], ["APPROVE", "legal"], ["FULFILL", "ops"]] as const) {
  s = getNextSnapshot(m, s, { type, actor });
}
console.log(s.value, s.context.approvals); // fulfilled [ 'manager', 'finance', 'ceo', 'legal' ]
```

An order of $5,000 skips the CEO and legal steps, and `getInitialSnapshot(..., { amount: 0, requesterId: "" })` cannot be submitted because `hasRequiredFields` fails. Adding the legal review step later is one new state, its `on` transitions and one guard.

## Results

Ivan's team replaced the nested if/else chains with the machine above. The numbers below are theirs, not a benchmark:

- **800 lines of if/else became about 100 lines of machine definition**: each state and transition is explicit, and an event that the current state does not handle is refused.
- **Adding "legal review" took 2 hours instead of 3 weeks**: a new state, its transitions and one guard.
- **No more stuck orders**: every non-final state has an exit, and a query on `current_state` shows which step each order is on.
- **Full audit trail**: `workflow_history` records who sent which event and when, so "who approved this $50K purchase?" is a single query.
- **Available actions come from the machine**: `getAvailableActions` returns only events whose guards pass, so the UI never offers "Approve" on a draft.

## Related Skills

- [xstate](../skills/xstate/) -- State machines, guards, actors and persistence
- [typescript](../skills/typescript/) -- Typing events and context
- [postgresql](../skills/postgresql/) -- Transactions and row locking
- [redis](../skills/redis/) -- Publishing transition events
