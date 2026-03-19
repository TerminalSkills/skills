---
title: "Build a Self-Hosted Zapier Alternative"
description: "Create a powerful workflow automation platform with visual workflow builder, 20+ integrations, and robust error handling — without the $500/month Zapier bill."
skills: [n8n, inngest, prisma]
difficulty: intermediate
time_estimate: "12 hours"
tags: [automation, workflows, integrations, webhooks, self-hosted]
---

# Build a Self-Hosted Zapier Alternative

## The Problem

Your team is paying $500+/month for Zapier to run 50 workflows. Half of them are simple HTTP requests and data transforms. You want full control, custom integrations, and zero per-task pricing.

## Who This Is For

**Persona:** A developer at a 20-person startup. You've hit Zapier's task limits twice this month. The finance team is asking questions. You know you could build this yourself — and actually make it better.

## What You'll Build

A self-hosted workflow automation platform with:
- Visual workflow builder (trigger → steps → actions)
- 20+ pre-built integrations (Slack, Gmail, Stripe, GitHub, Notion, etc.)
- Three trigger types: webhook, schedule (cron), polling
- Five step types: HTTP request, transform data, filter, delay, conditional
- Retry logic with exponential backoff
- Dead letter queue for failed workflows
- Execution history and logs

---

## Architecture Overview

```
Triggers (webhook/cron/poll)
    ↓
Inngest Queue (durable execution)
    ↓
Step Runner (HTTP | Transform | Filter | Delay)
    ↓
Prisma (workflow definitions + execution logs)
    ↓
Notification (Slack/email on failure)
```

---

## Step 1: Data Models

Define workflows and execution history with Prisma:

```prisma
// schema.prisma
model Workflow {
  id          String   @id @default(cuid())
  name        String
  description String?
  enabled     Boolean  @default(true)
  trigger     Json     // { type: "webhook"|"schedule"|"poll", config: {...} }
  steps       Json     // Array of step definitions
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  executions  WorkflowExecution[]
}

model WorkflowExecution {
  id         String   @id @default(cuid())
  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id])
  status     String   // running | success | failed | dead
  triggerData Json
  stepResults Json     @default("[]")
  error      String?
  startedAt  DateTime @default(now())
  finishedAt DateTime?
}
```

---

## Step 2: Webhook Trigger

```typescript
// app/api/webhooks/[workflowId]/route.ts
import { inngest } from '@/lib/inngest'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: Request,
  { params }: { params: { workflowId: string } }
) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: params.workflowId, enabled: true }
  })
  if (!workflow) return new Response('Not found', { status: 404 })

  const body = await req.json()

  await inngest.send({
    name: 'workflow/execute',
    data: { workflowId: workflow.id, triggerData: body }
  })

  return Response.json({ queued: true })
}
```

---

## Step 3: Inngest Workflow Executor

```typescript
// inngest/functions/executeWorkflow.ts
import { inngest } from '@/lib/inngest'
import { prisma } from '@/lib/prisma'
import { runStep } from '@/lib/stepRunner'

export const executeWorkflow = inngest.createFunction(
  {
    id: 'workflow-execute',
    retries: 3,
    onFailure: async ({ event, error }) => {
      await prisma.workflowExecution.update({
        where: { id: event.data.executionId },
        data: { status: 'dead', error: error.message, finishedAt: new Date() }
      })
    }
  },
  { event: 'workflow/execute' },
  async ({ event, step }) => {
    const { workflowId, triggerData } = event.data

    const workflow = await prisma.workflow.findUniqueOrThrow({
      where: { id: workflowId }
    })

    const execution = await prisma.workflowExecution.create({
      data: { workflowId, status: 'running', triggerData }
    })

    let context = { trigger: triggerData, steps: {} as Record<string, unknown> }

    for (const stepDef of workflow.steps as any[]) {
      const result = await step.run(`step-${stepDef.id}`, async () => {
        return runStep(stepDef, context)
      })
      context.steps[stepDef.id] = result

      if (stepDef.type === 'delay') {
        await step.sleep(`delay-${stepDef.id}`, stepDef.config.duration)
      }
    }

    await prisma.workflowExecution.update({
      where: { id: execution.id },
      data: { status: 'success', stepResults: context.steps, finishedAt: new Date() }
    })

    return context
  }
)
```

---

## Step 4: Step Runner

```typescript
// lib/stepRunner.ts
export async function runStep(stepDef: any, context: any): Promise<any> {
  switch (stepDef.type) {
    case 'http': {
      const { url, method, headers, body } = resolveTemplates(stepDef.config, context)
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined
      })
      return { status: res.status, body: await res.json() }
    }

    case 'transform': {
      // Simple JSONata-style transform
      const { mapping } = stepDef.config
      return Object.fromEntries(
        Object.entries(mapping).map(([key, template]) => [
          key,
          resolveTemplate(template as string, context)
        ])
      )
    }

    case 'filter': {
      const { condition } = stepDef.config
      const passes = evaluateCondition(condition, context)
      if (!passes) throw new Error('FILTER_BLOCKED')
      return { passed: true }
    }

    default:
      throw new Error(`Unknown step type: ${stepDef.type}`)
  }
}

function resolveTemplate(template: string, context: any): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, path) => {
    return path.split('.').reduce((obj: any, key: string) => obj?.[key], context) ?? ''
  })
}
```

---

## Step 5: Schedule & Poll Triggers

```typescript
// inngest/functions/triggerScheduled.ts
export const triggerScheduled = inngest.createFunction(
  { id: 'trigger-scheduled' },
  { cron: '*/5 * * * *' }, // Every 5 minutes
  async ({ step }) => {
    const workflows = await prisma.workflow.findMany({
      where: {
        enabled: true,
        trigger: { path: ['type'], equals: 'schedule' }
      }
    })

    for (const wf of workflows) {
      const trigger = wf.trigger as any
      if (shouldRunNow(trigger.config.cron)) {
        await inngest.send({
          name: 'workflow/execute',
          data: { workflowId: wf.id, triggerData: { scheduledAt: new Date() } }
        })
      }
    }
  }
)
```

---

## Pre-built Integrations

Each integration is a step template with pre-filled config:

| Integration | Trigger | Action |
|------------|---------|--------|
| Slack | New message in channel | Post message, create channel |
| Gmail | New email matching filter | Send email, add label |
| Stripe | Payment event webhook | Refund, create invoice |
| GitHub | Push, PR, issue webhook | Create issue, comment |
| Notion | Database item created | Create page, update property |
| Airtable | Record created/updated | Create/update record |

---

## Cost Comparison

| Plan | Zapier | Your Platform |
|------|--------|---------------|
| 10k tasks/mo | $49/mo | ~$5/mo (VPS) |
| 100k tasks/mo | $299/mo | ~$10/mo |
| 1M tasks/mo | $999/mo | ~$20/mo |

---

## Next Steps

1. Add a React Flow-based visual workflow editor
2. Build an integration marketplace (npm packages per integration)
3. Add team permissions and workflow sharing
4. Implement workflow versioning and rollback
