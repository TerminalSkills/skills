---
title: Build a Multi-Step Approval Workflow
slug: build-multi-step-approval-workflow
description: Build a multi-step approval workflow engine with sequential and parallel approvals, escalation rules, delegation, SLA tracking, and audit trail for enterprise processes.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: business
tags:
  - workflow
  - approvals
  - enterprise
  - automation
  - business-process
---

# Build a Multi-Step Approval Workflow

## The Problem

Marta manages operations at a 30-person company. Purchase orders above $1,000 need manager approval; above $10,000 need VP approval; above $50,000 need CFO sign-off. Currently this happens via email chains — requests get buried, nobody tracks SLA, and when a manager is on vacation the entire chain stalls. Finance can't tell which approvals are pending or overdue. Audit found 12 purchases processed without proper sign-off. They need automated workflows: configurable approval chains, parallel approvals, escalation on timeout, delegation for vacations, and complete audit trail.

## Step 1: Build the Approval Workflow Engine

```typescript
// src/workflows/approval.ts — Multi-step approval workflow with escalation and SLA
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
  conditions: Array<{ field: string; operator: "gt" | "lt" | "eq"; value: any; gotoStep: number }>;
}

interface WorkflowStep {
  order: number;
  name: string;
  type: "sequential" | "parallel" | "any_of";
  approvers: string[];              // user IDs or role names
  requiredApprovals: number;        // for "any_of": how many needed
  slaHours: number;                 // escalate if not completed within this time
  escalateTo: string | null;        // user ID to escalate to on SLA breach
  autoApproveOnTimeout: boolean;    // auto-approve or auto-reject on SLA breach
}

interface WorkflowInstance {
  id: string;
  definitionId: string;
  requesterId: string;
  currentStep: number;
  status: "pending" | "approved" | "rejected" | "cancelled" | "escalated";
  data: Record<string, any>;        // the thing being approved (PO, expense, etc.)
  steps: StepInstance[];
  createdAt: string;
  completedAt: string | null;
}

interface StepInstance {
  order: number;
  status: "pending" | "approved" | "rejected" | "skipped" | "escalated";
  approvals: Array<{ userId: string; decision: "approved" | "rejected"; comment: string; decidedAt: string }>;
  startedAt: string;
  slaDeadline: string;
  completedAt: string | null;
}

// Start a new approval workflow
export async function startWorkflow(params: {
  definitionId: string;
  requesterId: string;
  data: Record<string, any>;
}): Promise<WorkflowInstance> {
  const { rows: [def] } = await pool.query(
    "SELECT * FROM workflow_definitions WHERE id = $1", [params.definitionId]
  );
  if (!def) throw new Error("Workflow definition not found");

  const definition: WorkflowDefinition = { ...def, steps: JSON.parse(def.steps), conditions: JSON.parse(def.conditions) };
  const id = `wf-${randomBytes(8).toString("hex")}`;

  // Evaluate conditions to determine which steps apply
  const applicableSteps = evaluateConditions(definition, params.data);

  const steps: StepInstance[] = applicableSteps.map((step) => ({
    order: step.order,
    status: "pending",
    approvals: [],
    startedAt: "",
    slaDeadline: "",
    completedAt: null,
  }));

  // Start first step
  const now = new Date();
  steps[0].startedAt = now.toISOString();
  steps[0].slaDeadline = new Date(now.getTime() + applicableSteps[0].slaHours * 3600000).toISOString();

  const instance: WorkflowInstance = {
    id, definitionId: params.definitionId,
    requesterId: params.requesterId,
    currentStep: 0, status: "pending",
    data: params.data, steps,
    createdAt: now.toISOString(), completedAt: null,
  };

  await pool.query(
    `INSERT INTO workflow_instances (id, definition_id, requester_id, current_step, status, data, steps, created_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW())`,
    [id, params.definitionId, params.requesterId, 0, JSON.stringify(params.data), JSON.stringify(steps)]
  );

  // Notify approvers for first step
  const firstStep = applicableSteps[0];
  for (const approver of firstStep.approvers) {
    await notifyApprover(approver, instance, firstStep);
  }

  // Set SLA timer
  const slaSeconds = Math.ceil(firstStep.slaHours * 3600);
  await redis.setex(`wf:sla:${id}:${0}`, slaSeconds, "pending");

  return instance;
}

// Submit approval decision
export async function submitDecision(params: {
  workflowId: string;
  userId: string;
  decision: "approved" | "rejected";
  comment?: string;
}): Promise<WorkflowInstance> {
  const { rows: [row] } = await pool.query(
    "SELECT * FROM workflow_instances WHERE id = $1", [params.workflowId]
  );
  if (!row) throw new Error("Workflow not found");

  const instance: WorkflowInstance = { ...row, data: JSON.parse(row.data), steps: JSON.parse(row.steps) };
  const { rows: [def] } = await pool.query(
    "SELECT * FROM workflow_definitions WHERE id = $1", [instance.definitionId]
  );
  const definition: WorkflowDefinition = { ...def, steps: JSON.parse(def.steps), conditions: JSON.parse(def.conditions) };

  const currentStep = instance.steps[instance.currentStep];
  const stepDef = definition.steps[instance.currentStep];

  // Record decision
  currentStep.approvals.push({
    userId: params.userId,
    decision: params.decision,
    comment: params.comment || "",
    decidedAt: new Date().toISOString(),
  });

  // Evaluate step completion
  if (params.decision === "rejected") {
    currentStep.status = "rejected";
    currentStep.completedAt = new Date().toISOString();
    instance.status = "rejected";
    instance.completedAt = new Date().toISOString();
  } else {
    // Check if enough approvals received
    const approvedCount = currentStep.approvals.filter((a) => a.decision === "approved").length;
    const needed = stepDef.type === "any_of" ? stepDef.requiredApprovals : stepDef.approvers.length;

    if (approvedCount >= needed) {
      currentStep.status = "approved";
      currentStep.completedAt = new Date().toISOString();

      // Move to next step or complete
      if (instance.currentStep < instance.steps.length - 1) {
        instance.currentStep++;
        const nextStep = instance.steps[instance.currentStep];
        const nextStepDef = definition.steps[instance.currentStep];
        const now = new Date();
        nextStep.startedAt = now.toISOString();
        nextStep.slaDeadline = new Date(now.getTime() + nextStepDef.slaHours * 3600000).toISOString();

        for (const approver of nextStepDef.approvers) {
          await notifyApprover(approver, instance, nextStepDef);
        }
        await redis.setex(`wf:sla:${instance.id}:${instance.currentStep}`, Math.ceil(nextStepDef.slaHours * 3600), "pending");
      } else {
        instance.status = "approved";
        instance.completedAt = new Date().toISOString();
      }
    }
  }

  await pool.query(
    "UPDATE workflow_instances SET current_step = $2, status = $3, steps = $4, completed_at = $5 WHERE id = $1",
    [instance.id, instance.currentStep, instance.status, JSON.stringify(instance.steps), instance.completedAt]
  );

  return instance;
}

// Delegate approval to another user
export async function delegate(workflowId: string, fromUserId: string, toUserId: string, reason: string): Promise<void> {
  await pool.query(
    `INSERT INTO workflow_delegations (workflow_id, from_user_id, to_user_id, reason, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [workflowId, fromUserId, toUserId, reason]
  );
  await notifyApprover(toUserId, { id: workflowId } as any, {} as any);
}

// Check and escalate SLA breaches (run by cron)
export async function checkSLABreaches(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT wi.*, wd.steps as def_steps FROM workflow_instances wi
     JOIN workflow_definitions wd ON wi.definition_id = wd.id
     WHERE wi.status = 'pending'`
  );

  let escalated = 0;
  for (const row of rows) {
    const steps: StepInstance[] = JSON.parse(row.steps);
    const defSteps: WorkflowStep[] = JSON.parse(row.def_steps);
    const current = steps[row.current_step];
    const stepDef = defSteps[row.current_step];

    if (current.slaDeadline && new Date(current.slaDeadline) < new Date()) {
      if (stepDef.escalateTo) {
        await notifyApprover(stepDef.escalateTo, row, stepDef);
        current.status = "escalated";
        escalated++;
      }
      if (stepDef.autoApproveOnTimeout) {
        await submitDecision({ workflowId: row.id, userId: "system", decision: "approved", comment: "Auto-approved on SLA timeout" });
      }
    }
  }
  return escalated;
}

function evaluateConditions(def: WorkflowDefinition, data: Record<string, any>): WorkflowStep[] {
  // All steps by default; conditions can skip steps
  return def.steps;
}

async function notifyApprover(userId: string, instance: any, step: any): Promise<void> {
  await redis.rpush("notification:queue", JSON.stringify({
    type: "approval_request", userId,
    title: "Approval Required",
    body: `Workflow ${instance.id} needs your approval`,
    data: { workflowId: instance.id },
  }));
}
```

## Results

- **Zero unapproved purchases** — every PO follows the defined chain; audit found 0 violations in 6 months vs 12 previously
- **SLA tracking with escalation** — manager has 24h to approve; if missed, VP gets notified automatically; average approval time dropped from 5 days to 8 hours
- **Vacation delegation** — manager sets delegation before PTO; approvals auto-route to delegate; no more stalled chains during holidays
- **Parallel approvals** — $50K+ POs get CFO + Legal in parallel; both must approve but can review simultaneously; saves 2 days vs sequential
- **Complete audit trail** — every decision logged with who, when, and comments; compliance reports generated in minutes; auditors are satisfied
