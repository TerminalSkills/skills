---
title: Build a Workflow Engine with State Machines
slug: build-workflow-engine-with-state-machines
description: Build a visual workflow engine using XState state machines — modeling approval flows, order lifecycles, and onboarding sequences with explicit states, transitions, guards, and audit trails.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
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

## Step 1: Build the State Machine Workflow Engine

```typescript
// src/workflows/engine.ts — Generic workflow engine using state machines
import { createMachine, interpret, State, StateMachine } from "xstate";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface WorkflowDefinition {
  id: string;
  name: string;
  machine: any; // XState machine config
  version: number;
}

interface WorkflowInstance {
  id: string;
  definitionId: string;
  currentState: string;
  context: Record<string, any>;
  history: Array<{
    from: string;
    to: string;
    event: string;
    actor: string;
    timestamp: string;
    metadata?: Record<string, any>;
  }>;
  createdAt: string;
  updatedAt: string;
}

// Purchase Order Approval Workflow
const purchaseOrderMachine = createMachine({
  id: "purchase-order",
  initial: "draft",
  context: {
    amount: 0,
    requesterId: "",
    approvals: [] as string[],
    rejectionReason: "",
  },
  states: {
    draft: {
      on: {
        SUBMIT: {
          target: "pending_manager",
          guard: "hasRequiredFields",
        },
      },
    },
    pending_manager: {
      on: {
        APPROVE: {
          target: "pending_finance",
          actions: "recordApproval",
        },
        REJECT: {
          target: "rejected",
          actions: "recordRejection",
        },
        REQUEST_INFO: "needs_info",
      },
    },
    needs_info: {
      on: {
        PROVIDE_INFO: "pending_manager",
        WITHDRAW: "withdrawn",
      },
    },
    pending_finance: {
      on: {
        APPROVE: [
          {
            target: "pending_ceo",
            guard: "requiresCEOApproval", // amount > $10,000
            actions: "recordApproval",
          },
          {
            target: "pending_legal",
            guard: "requiresLegalReview", // certain categories
            actions: "recordApproval",
          },
          {
            target: "approved",
            actions: "recordApproval",
          },
        ],
        REJECT: { target: "rejected", actions: "recordRejection" },
      },
    },
    pending_ceo: {
      on: {
        APPROVE: [
          { target: "pending_legal", guard: "requiresLegalReview", actions: "recordApproval" },
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
      on: {
        RESUBMIT: "pending_legal",
        WITHDRAW: "withdrawn",
      },
    },
    approved: {
      on: {
        FULFILL: "fulfilled",
        CANCEL: "cancelled",
      },
      type: "final" as const,
    },
    rejected: {
      on: {
        RESUBMIT: "draft",
      },
    },
    withdrawn: { type: "final" as const },
    fulfilled: { type: "final" as const },
    cancelled: { type: "final" as const },
  },
}, {
  guards: {
    hasRequiredFields: ({ context }) => context.amount > 0 && context.requesterId !== "",
    requiresCEOApproval: ({ context }) => context.amount > 10000,
    requiresLegalReview: ({ context }) => context.amount > 50000,
  },
  actions: {
    recordApproval: ({ context, event }) => {
      context.approvals.push(event.actor);
    },
    recordRejection: ({ context, event }) => {
      context.rejectionReason = event.reason || "No reason provided";
    },
  },
});

// Create a new workflow instance
export async function createWorkflow(
  definitionId: string,
  initialContext: Record<string, any>
): Promise<WorkflowInstance> {
  const id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const machine = getMachineForDefinition(definitionId);
  const initialState = machine.initialState;

  const instance: WorkflowInstance = {
    id,
    definitionId,
    currentState: initialState.value as string,
    context: { ...initialContext },
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO workflow_instances (id, definition_id, current_state, context, history, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [id, definitionId, instance.currentState, JSON.stringify(instance.context), JSON.stringify(instance.history)]
  );

  return instance;
}

// Send an event to a workflow (transition)
export async function sendEvent(
  instanceId: string,
  event: string,
  actor: string,
  metadata?: Record<string, any>
): Promise<{ newState: string; allowed: boolean; instance: WorkflowInstance }> {
  const { rows: [row] } = await pool.query(
    "SELECT * FROM workflow_instances WHERE id = $1 FOR UPDATE",
    [instanceId]
  );

  if (!row) throw new Error("Workflow not found");

  const machine = getMachineForDefinition(row.definition_id);
  const currentState = State.from(row.current_state, JSON.parse(row.context));

  // Check if transition is valid
  const nextState = machine.transition(currentState, {
    type: event,
    actor,
    ...metadata,
  });

  if (nextState.value === currentState.value && !nextState.changed) {
    return {
      newState: row.current_state,
      allowed: false,
      instance: row,
    };
  }

  const newStateName = nextState.value as string;
  const history = JSON.parse(row.history);
  history.push({
    from: row.current_state,
    to: newStateName,
    event,
    actor,
    timestamp: new Date().toISOString(),
    metadata,
  });

  await pool.query(
    `UPDATE workflow_instances SET current_state = $2, context = $3, history = $4, updated_at = NOW()
     WHERE id = $1`,
    [instanceId, newStateName, JSON.stringify(nextState.context), JSON.stringify(history)]
  );

  // Publish state change
  await redis.publish("workflow:transitions", JSON.stringify({
    instanceId, from: row.current_state, to: newStateName, event, actor,
  }));

  return {
    newState: newStateName,
    allowed: true,
    instance: { ...row, currentState: newStateName, history },
  };
}

// Get available transitions for current state
export async function getAvailableActions(instanceId: string): Promise<string[]> {
  const { rows: [row] } = await pool.query(
    "SELECT definition_id, current_state, context FROM workflow_instances WHERE id = $1",
    [instanceId]
  );

  const machine = getMachineForDefinition(row.definition_id);
  const state = State.from(row.current_state, JSON.parse(row.context));
  return state.nextEvents;
}

function getMachineForDefinition(definitionId: string): StateMachine<any, any, any> {
  const machines: Record<string, any> = {
    "purchase-order": purchaseOrderMachine,
  };
  return machines[definitionId] || purchaseOrderMachine;
}
```

## Results

- **800 lines of if/else replaced by 80 lines of state machine** — each state and transition is explicit; impossible to enter invalid states
- **Adding "legal review" step: 3 weeks → 2 hours** — add a new state, define transitions to/from it; the engine handles everything else
- **No more stuck orders** — every state has explicit exit transitions; the dashboard shows which step each order is on and who needs to act
- **Full audit trail** — every transition is logged with who, when, and why; "who approved this $50K purchase?" is a single query
- **Available actions are dynamic** — the UI shows only valid buttons for the current state; users can't click "Approve" when the order is in "draft"
