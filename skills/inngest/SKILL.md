---
name: inngest
description: >-
  Inngest is a durable workflow engine for TypeScript: functions are split into
  retryable steps whose results are saved, so a failure resumes where it
  stopped. Use it when a user asks for background jobs, scheduled (cron) jobs,
  multi-step workflows, delayed or drip emails, fan-out/fan-in processing,
  debouncing or rate limiting, or event-driven functions on serverless
  platforms such as Vercel, Netlify, AWS Lambda or Cloudflare. Covers the
  current v4 SDK (triggers inside the options object).
license: Apache-2.0
compatibility: Node.js 20+ and TypeScript; inngest npm package v4 (4.26 checked on 2026-10-24)
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/inngest/inngest-js
  tags:
    - workflow
    - event-driven
    - durable
    - serverless
    - typescript
---

# Inngest — Durable Workflow Engine for TypeScript

## Overview

Inngest runs your TypeScript functions as a series of steps. Each `step.run()` result is saved, so when a later step fails or the function waits for days, the run resumes without repeating finished steps. Functions are served from an HTTP endpoint in your own app (usually `/api/inngest`); Inngest Cloud or the local Dev Server calls that endpoint to run them. This skill targets SDK v4 (`inngest` 4.x). If the project is on v3, the biggest difference is that the trigger moved from the second argument of `createFunction` into `triggers` in the first.

## Instructions

### 1. Install and create the client

```bash
npm install inngest
```

```typescript
// src/inngest/client.ts
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "shop-backend" });
```

In v4 the client defaults to cloud mode and needs `INNGEST_SIGNING_KEY` (from the Inngest dashboard) in production. For local development run the Dev Server and tell the SDK to use it with `INNGEST_DEV=1` (or `isDev: true` on the client). Put the event key in `INNGEST_EVENT_KEY` when sending events to Cloud. Never hard-code either key.

```bash
npx inngest-cli@latest dev          # Dev Server and UI on http://localhost:8288
INNGEST_DEV=1 npm run dev           # your app, in another terminal
```

### 2. Serve the functions

```typescript
// src/app/api/inngest/route.ts  (Next.js App Router)
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { onboardUser, processBatch, dailyCleanup, syncCRM } from "@/inngest/functions";

export const maxDuration = 300;       // serverless limit for this route (Vercel)
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [onboardUser, processBatch, dailyCleanup, syncCRM],
});
```

Other adapters are imported the same way: `inngest/express`, `inngest/lambda` and so on. Options such as `signingKey` and `baseUrl` belong on the client, not on `serve()`. Use `serveOrigin` (not `serveHost`) when the app sits behind a proxy.

On serverless platforms set `checkpointing: { maxRuntime: "50s" }` on the client, a little under the platform's maximum duration, because v4 runs several steps per request by default.

### 3. Write functions

In v4 the trigger goes in `triggers` inside the first argument. It can be one object or an array (for example an event plus a cron schedule).

```typescript
// src/inngest/functions.ts
import { inngest } from "./client";

export const onboardUser = inngest.createFunction(
  {
    id: "onboard-user",
    retries: 3,
    concurrency: [{ limit: 10 }],
    triggers: { event: "user/signed-up" },
  },
  async ({ event, step }) => {
    const user = await step.run("create-account", async () => {
      return db.users.create({ email: event.data.email, name: event.data.name });
    });

    await step.run("send-welcome", async () => {
      await resend.emails.send({
        from: "Shop <hello@shop.dev>",
        to: user.email,
        subject: "Welcome to Shop",
        react: WelcomeEmail({ name: user.name }),
      });
    });

    await step.sleep("wait-for-activation", "24 hours");

    const activated = await step.run("check-activation", async () => {
      const current = await db.users.findById(user.id);
      return current.activatedAt !== null;
    });

    if (!activated) {
      await step.run("send-reminder", async () => {
        await resend.emails.send({
          from: "Shop <hello@shop.dev>",
          to: user.email,
          subject: "Finish setting up your shop",
          react: ReminderEmail({ name: user.name }),
        });
      });
    }
    return { userId: user.id, activated };
  },
);
```

`db`, `resend` and the email components are your own app code. Step return values are JSON-serialised, so a `Date` comes back as a string on later steps.

### 4. Fan-out, cron, debounce, rate limit

```typescript
export const processBatch = inngest.createFunction(
  { id: "process-batch", triggers: { event: "batch/uploaded" } },
  async ({ event, step }) => {
    const results = await Promise.all(
      event.data.items.map((item: { id: string }) =>
        step.run(`process-item-${item.id}`, () => processItem(item)),
      ),
    );
    return step.run("summarize", () => ({
      total: results.length,
      failed: results.filter((r) => r.status === "error").length,
    }));
  },
);

export const dailyCleanup = inngest.createFunction(
  { id: "daily-cleanup", triggers: { cron: "0 3 * * *" } },   // 03:00 UTC
  async ({ step }) => {
    const deleted = await step.run("cleanup-expired", () =>
      db.sessions.deleteWhere({ expiresAt: { lt: new Date() } }),
    );
    return { deletedSessions: deleted };
  },
);

export const syncCRM = inngest.createFunction(
  {
    id: "sync-crm",
    triggers: { event: "user/updated" },
    debounce: { key: "event.data.userId", period: "5m" },     // runs on the last event
  },
  async ({ event, step }) => {
    await step.run("sync", () => crm.upsertContact(event.data));
  },
);
```

`rateLimit: { key: "event.data.companyId", limit: 1, period: "4h" }` drops events over the limit (they are skipped, not queued); use `throttle` to delay them instead. `key` values are CEL expressions over `event`. Debounce cannot be combined with batching.

### 5. Send events

```typescript
await inngest.send({ name: "user/signed-up", data: { userId: "u_81", email: "mira@shop.dev", name: "Mira" } });
await inngest.send([
  { name: "order/created", data: { orderId: "ord_1001" } },
  { name: "order/created", data: { orderId: "ord_1002" } },
]);
```

Use `data` for everything the function needs; the top-level `user` field and `event.user` were removed in v4. Inside a function, send events from a step (`step.sendEvent("notify", {...})`) so a retry does not send twice.

### 6. Typed events (optional)

v4 removed `EventSchemas`. Define events with `eventType()` and use them as triggers, in `inngest.send` and in `step.waitForEvent`:

```typescript
import { eventType, staticSchema } from "inngest";

type SignedUp = { userId: string; email: string };      // a type, not an interface
export const userSignedUp = eventType("user/signed-up", { schema: staticSchema<SignedUp>() });
// triggers: [userSignedUp]   ...   await inngest.send(userSignedUp.create({ userId: "u_81", email: "mira@shop.dev" }));
```

A Zod schema in place of `staticSchema` adds runtime validation.

## Examples

### Example 1: "Email new users, then remind them a day later if they have not activated"

Create `onboardUser` above, add it to `serve()`, start the Dev Server, then send the event from the UI (Functions, Invoke) with `{"data": {"email": "mira@shop.dev", "name": "Mira"}}`. The Runs tab shows `create-account` and `send-welcome` completed and the run sleeping on `wait-for-activation` for 24 hours; a redeploy in between does not lose it.

### Example 2: "Sync a CRM contact after edits settle, never more than 100 times an hour"

Use `syncCRM` with `debounce`. Ten `user/updated` events for the same `userId` within five minutes produce one run that receives the last event. Add a `throttle: { limit: 100, period: "1h" }` option to spread bursts across users, since `rateLimit` skips excess events.

## Guidelines

- Step IDs must be unique per function and stable across deploys; renaming one re-runs it for in-flight runs.
- Put every side effect (database writes, emails, API calls) inside `step.run`. Code between steps runs again on every resume, so keep it deterministic and cheap.
- A signing key error at startup in v4 means the client is in cloud mode: set `INNGEST_DEV=1` locally or `INNGEST_SIGNING_KEY` in production.
- With optimized parallelism (the default), `Promise.race` over steps waits for all of them to settle; use `group.parallel()` if you need the first result immediately.
- Pass `checkpointing: false` on the client or a function to return to one step per request.
- Not for sub-second request/response work; Inngest is for background and long-running jobs.
