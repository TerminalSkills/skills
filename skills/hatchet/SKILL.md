---
name: hatchet
description: >-
  Orchestrate background jobs and workflows with Hatchet — open-source
  distributed task queue with DAG workflows. Use when someone asks to "run
  background jobs", "Hatchet", "workflow orchestration", "distributed task
  queue", "durable execution", "replace Celery/Bull", or "DAG workflow engine".
  Covers workflow definition, step functions, retries, concurrency control,
  and event-driven triggers.
license: Apache-2.0
compatibility: "TypeScript (Node 18+), Python 3.10+ or Go SDK. Self-hostable (Postgres) or Hatchet Cloud."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["workflows", "background-jobs", "hatchet", "queue", "orchestration"]
  repository: https://github.com/hatchet-dev/hatchet
---

# Hatchet

## Overview

Hatchet is an open-source task queue and workflow engine on top of Postgres. You declare tasks (single functions) or workflows (DAGs of tasks), run workers that pick them up, and trigger runs from code, events, schedules or the dashboard. It gives per-task retries with backoff, timeouts, CEL-based concurrency control, rate limits and durable tasks. Typical uses: payment processing, data pipelines, AI agent orchestration, replacing BullMQ or Celery.

This skill uses the v1 SDK (`@hatchet-dev/typescript-sdk` 1.x, checked against 1.34.0 and engine v0.107). The old `hatchet.workflow({ on: ... }).step(...)` / `ctx.stepOutput()` API is the legacy v0 style; do not write new code with it.

## Instructions

### Setup

```bash
npm install @hatchet-dev/typescript-sdk      # Python: pip install hatchet-sdk
# create the token in the dashboard (Settings > API Tokens), then:
export HATCHET_CLIENT_TOKEN="$(cat ~/.config/hatchet/worker-token)"
```

Hatchet Cloud or a self-hosted engine both issue that token. The CLI is available with `brew install hatchet-dev/hatchet/hatchet --cask`; `hatchet profile add` stores the token, `hatchet worker dev` runs a worker with hot reload, `hatchet trigger simple` fires a run of the quickstart workflow. For self-hosting follow docs.hatchet.run/self-hosting (Docker Compose runs the engine, dashboard on http://localhost:8080 and Postgres; the compose file's default login is for local use only, change it).

```typescript
// src/hatchet-client.ts
import { HatchetClient } from '@hatchet-dev/typescript-sdk';

export const hatchet = HatchetClient.init(); // reads HATCHET_CLIENT_TOKEN
```

### A single task

```typescript
// src/tasks/send-invoice.ts
import { hatchet } from '../hatchet-client';

export const sendInvoice = hatchet.task({
  name: 'send-invoice',
  retries: 3,
  backoff: { factor: 2, maxSeconds: 30 }, // waits 2s, 4s, 8s...
  executionTimeout: '1m',
  fn: async (input: { orderId: string; email: string }, ctx) => {
    ctx.logger.info(`retry ${ctx.retryCount()} for ${input.orderId}`);
    return { sent: true };
  },
});
```

### A DAG workflow

Parents are task objects, not strings, and a child reads parent output with `await ctx.parentOutput(task)`.

```typescript
// src/workflows/onboarding.ts
import { hatchet } from '../hatchet-client';

type OnboardingInput = { userId: string; email: string };

export const onboarding = hatchet.workflow<OnboardingInput>({
  name: 'user-onboarding',
  onEvents: ['user:created'], // event trigger
});

const welcome = onboarding.task({
  name: 'send-welcome-email',
  retries: 3,
  executionTimeout: '30s',
  fn: async (input) => ({ emailSent: true, to: input.email }),
});

const workspace = onboarding.task({
  name: 'create-workspace',
  parents: [welcome],
  fn: async (input) => ({ workspaceId: `ws_${input.userId}` }),
});

onboarding.task({
  name: 'send-guide',
  parents: [welcome, workspace],
  fn: async (input, ctx) => {
    const ws = await ctx.parentOutput(workspace);
    return { guideFor: ws.workspaceId };
  },
});
```

### Worker

```typescript
// src/worker.ts
import { hatchet } from './hatchet-client';
import { onboarding } from './workflows/onboarding';
import { sendInvoice } from './tasks/send-invoice';

async function main() {
  const worker = await hatchet.worker('billing-worker', {
    workflows: [onboarding, sendInvoice],
    slots: 50, // concurrent task runs this worker accepts
  });
  await worker.start();
}
main();
```

### Trigger runs

```typescript
import { onboarding } from './workflows/onboarding';
import { hatchet } from './hatchet-client';

// wait for the result
const result = await onboarding.run({ userId: 'u_8412', email: 'kai@acmelabs.io' });

// fire and forget, returns a run reference
await onboarding.runNoWait({ userId: 'u_8413', email: 'mira@acmelabs.io' });

// event trigger: every workflow with onEvents: ['user:created'] starts
await hatchet.events.push('user:created', { userId: 'u_8414', email: 'ravi@acmelabs.io' });
```

### Concurrency (CEL expression)

Limits are grouped by a CEL expression over the input. Strategies: `GROUP_ROUND_ROBIN` (queue and share fairly), `CANCEL_IN_PROGRESS`, `CANCEL_NEWEST`, `CANCEL_QUEUED_EXCEPT_NEWEST`, `CANCEL_QUEUED_EXCEPT_OLDEST`. An array lets you stack limits.

```typescript
import { ConcurrencyLimitStrategy } from '@hatchet-dev/typescript-sdk';

export const apiSync = hatchet.workflow<{ provider: string; endpoint: string }>({
  name: 'api-sync',
  concurrency: {
    expression: 'input.provider', // at most 5 runs per provider
    maxRuns: 5,
    limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
  },
});
```

### Cron

```typescript
export const dailyReport = hatchet.workflow({
  name: 'daily-report',
  on: { cron: '0 9 * * *' }, // UTC; 5 or 6 fields (optional leading seconds)
});
```

## Examples

### Example 1: Order processing pipeline

**User prompt:** "Build a reliable order workflow in TypeScript: validate the cart, charge the card, then notify the customer and the warehouse."

The agent creates `hatchet.workflow<OrderInput>({ name: 'process-order' })` with a `validate` task, a `charge` task (`parents: [validate]`, `retries: 3`, `executionTimeout: '45s'`, the payment provider idempotency key set to the order id) and `notify-customer` and `notify-warehouse` tasks that both list `charge` as parent so they run in parallel. It registers the workflow on a worker, adds `await processOrder.run(...)` to the checkout handler, and the dashboard shows each task with its retry history.

### Example 2: Per-tenant rate limit for an AI pipeline

**User prompt:** "Our scraper-then-summarize job hammers the OpenAI API. Allow only 3 runs at a time per customer."

The agent adds `concurrency: { expression: 'input.customerId', maxRuns: 3, limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN }` to the workflow, so extra runs wait in the queue instead of failing. Starting 10 runs for one customer shows 3 running and 7 queued, while another customer's runs still start immediately.

## Guidelines

- Use the v1 API (`hatchet.task`, `hatchet.workflow` + `.task`, `parents: [taskObject]`, `ctx.parentOutput`). Docs and blog posts showing `.step()` and `ctx.stepOutput()` are the old SDK.
- Always set `executionTimeout` and `retries` per task; make tasks idempotent because retries re-run them.
- The cron expression is when Hatchet enqueues the run, in UTC; missed ticks are not replayed, and concurrency limits can delay the actual start.
- Task and workflow names are the registration key: renaming one while runs are queued orphans them.
- Keep payloads small (IDs, not documents); outputs must be JSON-serializable.
- A worker only runs what is listed in `workflows`; a run that never starts usually means the worker lacks it, or has no free `slots`.
- Keep `HATCHET_CLIENT_TOKEN` in the environment or a secret store, never in the repository.
- Not worth it for a handful of fire-and-forget jobs where a Postgres-backed library already in your stack is enough.
