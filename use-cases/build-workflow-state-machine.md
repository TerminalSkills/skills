---
title: Build a Workflow State Machine
slug: build-workflow-state-machine
description: Build a workflow state machine with configurable states, transition guards, side effects, history tracking, and visualization for modeling complex business processes.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Architecture
tags:
  - state-machine
  - workflow
  - business-logic
  - transitions
  - patterns
---

# Build a Workflow State Machine

## The Problem

Eva leads engineering at a 25-person company. Order processing has 8 states (draft→submitted→approved→processing→shipped→delivered→returned→cancelled) with complex rules: only managers can approve orders over $10K, cancelled orders can't be re-submitted, returned orders trigger refunds. This logic is scattered across 15 `if/else` blocks in 6 files. A bug allowed cancelled orders to be shipped. State transitions aren't logged — "how did this order end up in 'returned' state?" is unanswerable. They need a state machine: define states and transitions in one place, guard conditions, side effects on transition, and full history.

## Step 1: Build the State Machine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

type GuardFn = (entity: any, context: any) => boolean | Promise<boolean>;
type EffectFn = (entity: any, transition: TransitionEvent) => void | Promise<void>;

interface State { name: string; onEnter?: EffectFn; onExit?: EffectFn; metadata?: Record<string, any>; }
interface Transition { from: string; to: string; event: string; guard?: GuardFn; effect?: EffectFn; }
interface TransitionEvent { from: string; to: string; event: string; entityId: string; userId: string; metadata?: Record<string, any>; timestamp: string; }

interface StateMachineDefinition { name: string; states: State[]; transitions: Transition[]; initialState: string; }

// Define order workflow
const ORDER_WORKFLOW: StateMachineDefinition = {
  name: "order",
  initialState: "draft",
  states: [
    { name: "draft" }, { name: "submitted" }, { name: "approved" },
    { name: "processing" }, { name: "shipped" }, { name: "delivered" },
    { name: "returned" }, { name: "cancelled" },
  ],
  transitions: [
    { from: "draft", to: "submitted", event: "submit" },
    { from: "submitted", to: "approved", event: "approve", guard: async (entity, ctx) => {
      if (entity.total > 10000) return ctx.userRole === "manager" || ctx.userRole === "admin";
      return true;
    }},
    { from: "submitted", to: "cancelled", event: "cancel" },
    { from: "approved", to: "processing", event: "start_processing" },
    { from: "approved", to: "cancelled", event: "cancel" },
    { from: "processing", to: "shipped", event: "ship", effect: async (entity) => {
      await redis.rpush("notification:queue", JSON.stringify({ type: "order_shipped", orderId: entity.id, customerId: entity.customerId }));
    }},
    { from: "shipped", to: "delivered", event: "deliver" },
    { from: "delivered", to: "returned", event: "return", effect: async (entity) => {
      await redis.rpush("refund:queue", JSON.stringify({ orderId: entity.id, amount: entity.total }));
    }},
  ],
};

const workflows = new Map<string, StateMachineDefinition>();
workflows.set("order", ORDER_WORKFLOW);

// Transition entity to new state
export async function transition(workflowName: string, entityId: string, event: string, context: { userId: string; userRole: string; metadata?: Record<string, any> }): Promise<TransitionEvent> {
  const workflow = workflows.get(workflowName);
  if (!workflow) throw new Error(`Workflow '${workflowName}' not found`);

  // Get current state
  const { rows: [entity] } = await pool.query(`SELECT * FROM ${workflowName}s WHERE id = $1`, [entityId]);
  if (!entity) throw new Error(`Entity '${entityId}' not found`);
  const currentState = entity.status || entity.state;

  // Find matching transition
  const trans = workflow.transitions.find((t) => t.from === currentState && t.event === event);
  if (!trans) throw new Error(`Invalid transition: '${event}' from state '${currentState}'. Allowed events: ${workflow.transitions.filter((t) => t.from === currentState).map((t) => t.event).join(", ")}`);

  // Check guard
  if (trans.guard) {
    const allowed = await trans.guard(entity, context);
    if (!allowed) throw new Error(`Transition '${event}' denied by guard condition`);
  }

  // Execute onExit of current state
  const currentStateDef = workflow.states.find((s) => s.name === currentState);
  if (currentStateDef?.onExit) await currentStateDef.onExit(entity, {} as any);

  // Update state
  await pool.query(`UPDATE ${workflowName}s SET status = $2 WHERE id = $1`, [entityId, trans.to]);

  const transitionEvent: TransitionEvent = { from: currentState, to: trans.to, event, entityId, userId: context.userId, metadata: context.metadata, timestamp: new Date().toISOString() };

  // Execute transition effect
  if (trans.effect) await trans.effect(entity, transitionEvent);

  // Execute onEnter of new state
  const newStateDef = workflow.states.find((s) => s.name === trans.to);
  if (newStateDef?.onEnter) await newStateDef.onEnter(entity, transitionEvent);

  // Log transition
  await pool.query(
    `INSERT INTO state_transitions (entity_type, entity_id, from_state, to_state, event, user_id, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [workflowName, entityId, currentState, trans.to, event, context.userId, JSON.stringify(context.metadata || {})]
  );

  return transitionEvent;
}

// Get available events for current state
export function getAvailableEvents(workflowName: string, currentState: string): string[] {
  const workflow = workflows.get(workflowName);
  if (!workflow) return [];
  return workflow.transitions.filter((t) => t.from === currentState).map((t) => t.event);
}

// Get state history for an entity
export async function getHistory(entityType: string, entityId: string): Promise<TransitionEvent[]> {
  const { rows } = await pool.query(
    "SELECT * FROM state_transitions WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at ASC",
    [entityType, entityId]
  );
  return rows.map((r: any) => ({ from: r.from_state, to: r.to_state, event: r.event, entityId: r.entity_id, userId: r.user_id, metadata: JSON.parse(r.metadata || "{}"), timestamp: r.created_at }));
}

// Visualize workflow as Mermaid diagram
export function visualize(workflowName: string): string {
  const workflow = workflows.get(workflowName);
  if (!workflow) return "";
  let mermaid = "stateDiagram-v2\n";
  mermaid += `  [*] --> ${workflow.initialState}\n`;
  for (const t of workflow.transitions) {
    mermaid += `  ${t.from} --> ${t.to}: ${t.event}${t.guard ? " [guarded]" : ""}\n`;
  }
  return mermaid;
}
```

## Results

- **Cancelled orders can't ship** — no transition from "cancelled" to "shipped" defined; state machine throws clear error; bug impossible by design
- **$10K approval guard** — orders over $10K require manager role; regular users get "denied by guard condition"; business rule enforced in one place
- **Side effects automated** — shipping triggers customer notification; return triggers refund queue; no forgotten side effects across 6 files
- **Full history** — "how did order #123 end up returned?" → history shows: draft→submitted(by Alice)→approved(by Bob)→processing→shipped→delivered→returned(by customer); every step traced
- **Available actions clear** — UI shows only valid buttons for current state; no "Ship" button on cancelled orders; UX matches business logic
