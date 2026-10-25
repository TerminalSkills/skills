---
name: trigger-dev
description: >-
  Trigger.dev is an open-source background jobs platform for TypeScript:
  long-running tasks with no timeouts, automatic retries, cron schedules,
  durable waits, queues and concurrency limits, deployed to Trigger.dev Cloud
  or self-hosted. Use when the user wants to run background jobs, scheduled
  tasks or cron in TypeScript, move work off a request handler, retry flaky
  API calls, wait for hours or days inside a job, or replace BullMQ and Redis.
license: Apache-2.0
compatibility: "Node.js 22+ (tasks run on node-22, node-24, node-26 or bun), @trigger.dev/sdk 4.x, a Trigger.dev Cloud or self-hosted project"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/triggerdotdev/trigger.dev
  tags: "background-jobs, cron, typescript, queues, serverless"
---

# Trigger.dev

## Overview

Trigger.dev (SDK `@trigger.dev/sdk` 4.x, CLI `trigger.dev`) runs your TypeScript functions as durable background tasks on its own workers, so there is no request timeout. Tasks live in a `trigger/` folder, are bundled and deployed with the CLI, and are started from your backend, from other tasks, or on a cron schedule. v3 is retired: Cloud no longer runs v3 deploys, and new code imports from `@trigger.dev/sdk`, not `@trigger.dev/sdk/v3`.

## Instructions

### Set up

```bash
npx trigger.dev@latest init     # installs @trigger.dev/sdk, writes trigger.config.ts and an example task
npx trigger.dev@latest dev      # local dev server that runs your tasks; shows a dashboard link per run
npx trigger.dev@latest deploy --env prod
```

`trigger.config.ts` holds the project ref and the task folders:

```ts
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_abcdefghijklmnop",
  dirs: ["./trigger"],
  runtime: "node-24",
  retries: { enabledInDev: false, default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, randomize: true } },
});
```

In CI, `deploy` authenticates with the `TRIGGER_ACCESS_TOKEN` environment variable. To trigger tasks from your backend, create a Trigger-only API key for the environment and set it as `TRIGGER_SECRET_KEY`.

### Define a task

```ts
// trigger/process-order.ts
import { task, logger, retry, wait } from "@trigger.dev/sdk";

export const processOrder = task({
  id: "process-order",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30000 },
  run: async (payload: { orderId: string; total: number }) => {
    logger.info("Charging order", { orderId: payload.orderId });

    const charge = await retry.onThrow(
      async () => {
        const res = await fetch("https://api.payments.internal/charges", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${process.env.PAYMENTS_API_KEY}` },
          body: JSON.stringify({ orderId: payload.orderId, amount: payload.total }),
        });
        if (!res.ok) throw new Error(`charge failed: ${res.status}`);
        return (await res.json()) as { id: string };
      },
      { maxAttempts: 3, randomize: true },
    );

    await wait.for({ minutes: 5 }); // durable: long waits are checkpointed and do not use compute
    return { orderId: payload.orderId, chargeId: charge.id };
  },
});
```

Use `schemaTask` (with a `schema:` such as a Zod object) when the payload must be validated before a run is created. Task ids must be unique.

### Trigger tasks

From your backend, import the task type only, so task code is not bundled into your app:

```ts
import { tasks } from "@trigger.dev/sdk";
import type { processOrder } from "@/trigger/process-order";

const handle = await tasks.trigger<typeof processOrder>("process-order", { orderId: "ord_1042", total: 4900 });
await tasks.batchTrigger<typeof processOrder>("process-order", [
  { payload: { orderId: "ord_1043", total: 1500 } },
  { payload: { orderId: "ord_1044", total: 2200 } },
]);
```

Inside another task, call the task object directly: `processOrder.trigger(payload, options)` fires and forgets; `processOrder.triggerAndWait(payload)` returns a result object, so check `result.ok` and then read `result.output`; `processOrder.batchTriggerAndWait([...])` runs many children. Do not wrap `triggerAndWait` calls in `Promise.all`; use `batchTriggerAndWait` or a loop.

Trigger options (third argument of `tasks.trigger`, second of `task.trigger`): `delay: "1h"` (also `"88s"`, a Date or an ISO time), `ttl`, `idempotencyKey`, `queue`, `concurrencyKey`, `maxAttempts`, `tags`, `metadata`, `priority`, `machine`.

### Scheduled tasks

`tasks.schedule` does not exist. Use `schedules.task` with a declarative `cron`; it syncs on `dev` and `deploy`:

```ts
import { logger, schedules } from "@trigger.dev/sdk";

export const dailyReport = schedules.task({
  id: "daily-report",
  cron: { pattern: "0 9 * * *", timezone: "America/New_York", environments: ["PRODUCTION"] },
  run: async (payload) => {
    logger.info("Report for", { at: payload.timestamp, tz: payload.timezone });
  },
});
```

A plain string `cron: "0 */2 * * *"` is UTC. Per-user schedules are created at runtime with `schedules.create({ task: dailyReport.id, cron: "0 9 * * *", timezone: "Europe/Berlin", externalId: userId, deduplicationKey: `${userId}-daily` })`. New schedules get a 60-minute spreading `window` by default (run starts at a stable offset after the cron time); set `window: "0m"` for the exact time (not honored on a free plan, where schedules run at most hourly with a 60-minute minimum window). For a one-off future run use `delay`, not a schedule.

### Concurrency

Cap a task with `concurrency: { total: 5 }`, or share one limit across tasks:

```ts
import { concurrencyLimit, task } from "@trigger.dev/sdk";

export const llmLimit = concurrencyLimit({ name: "llm", total: 25 });
export const summarize = task({ id: "summarize", concurrency: [{ total: 5 }, llmLimit], run: async (p: { url: string }) => {} });
```

`queue: { concurrencyLimit: n }` still works but is deprecated.

### Webhooks

Do not make the webhook itself a task. Verify the signature in your HTTP route, respond 200, and trigger a task with the event id as `idempotencyKey` so provider re-deliveries do not run twice.

## Examples

**"Move PDF generation out of my Next.js route."** Create `trigger/make-invoice.ts` with `task({ id: "make-invoice", run })`, call `tasks.trigger<typeof makeInvoice>("make-invoice", { invoiceId })` in the route and return `handle.id` to the client. Run `npx trigger.dev@latest dev` to test; the terminal prints a dashboard link for each run. Result: the route answers in milliseconds and the run, its logs and retries appear in the dashboard.

**"Send a reminder 24 hours after signup, once."**

```ts
await tasks.trigger<typeof sendReminder>("send-reminder", { userId: "usr_88" }, { delay: "24h", idempotencyKey: "reminder-usr_88" });
```

The run shows as Delayed until it is due; a second call with the same key returns the same run.

## Guidelines

- Import from `@trigger.dev/sdk`. The `/v3` path is deprecated and v3 runs are no longer supported on Cloud. In migrated code, `handleError` is now `catchError`.
- Make tasks idempotent: a retry reruns `run` from the start, so pass idempotency keys to payment and email calls.
- Waits under about 60 seconds keep holding a concurrency slot; longer waits release it and cost no compute.
- Keep payloads small (store large data elsewhere and pass an id); secrets belong in the project's environment variables, not in payloads.
- Match the CLI and `@trigger.dev/sdk` versions; `deploy` fails in CI on a version mismatch.
- Dev runs do not retry unless `retries.enabledInDev` is true.
- Self-hosting is supported with Docker, but 4.5.0 is the last self-hosted version that still accepts v3 deploys.
