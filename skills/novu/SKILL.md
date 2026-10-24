---
name: novu
description: >-
  Novu is open-source notification infrastructure: one workflow sends email,
  SMS, push, in-app and chat messages, with digests, delays, subscriber
  preferences and a drop-in React Inbox. Use when someone asks to "add
  notifications", "send email and SMS from one workflow", "in-app notification
  bell", "digest or batch notifications", "Novu workflow", "Novu Inbox", or
  "replace my notification code with Novu".
license: Apache-2.0
compatibility: "Node.js 18+ for @novu/api and @novu/framework; React 18+ for @novu/react. Novu Cloud account (or self-hosted Novu) and a secret key."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["notifications", "novu", "email", "in-app", "workflows"]
  repository: "https://github.com/novuhq/novu"
---

# Novu

## Overview

Novu receives a trigger event from your backend and runs a **workflow** that delivers to each **subscriber** over one or more channels (email, SMS, push, in-app, chat), with delay and digest steps and per-subscriber preferences. Providers (SendGrid, Twilio, FCM, Slack and many more) are configured once in the Novu dashboard.

Workflows can be built in the dashboard, or in code with **Novu Framework**: your app exposes a *bridge endpoint* and Novu Cloud calls it to run your step functions. Packages today:

| Need | Package |
|---|---|
| Trigger workflows, manage subscribers (server) | `@novu/api` |
| Define workflows in code | `@novu/framework` |
| React Inbox bell and preferences | `@novu/react` (`@novu/nextjs` for Next.js) |
| CLI (`dev`, `sync`, `step publish`) | `novu` via `npx` |

The old `@novu/node` server SDK (deprecated, support ended 2025-03) and `@novu/notification-center` (deprecated 2025-04) should be replaced by `@novu/api` and `@novu/react`.

## Instructions

### Step 1: Define workflows in code

```bash
npm install @novu/framework zod@3 zod-to-json-schema
```

Zod is optional, but if you use it install `zod-to-json-schema` too, or the server crashes at start with "Cannot find package 'zod-to-json-schema'". Novu Framework documents Zod v3.

```typescript
// novu/workflows.ts
import { workflow } from "@novu/framework";
import { z } from "zod";

export const orderStatus = workflow(
  "order-status-update",
  async ({ step, payload }) => {
    await step.inApp("in-app-notification", async () => ({
      subject: `Order ${payload.orderId}: ${payload.status}`,
      body: `Your order is now ${payload.status}.`,
      redirect: { url: `/orders/${payload.orderId}` },
    }));

    await step.email("email-notification", async () => ({
      subject: `Order update: ${payload.status}`,
      body: `<p>Order <b>${payload.orderId}</b> is now <b>${payload.status}</b>.</p>`,
    }));

    // Conditional step: use `skip`, not an `if` around the step
    await step.sms(
      "sms-shipped",
      async () => ({ body: `Order ${payload.orderId} has shipped. Track it: ${payload.trackingUrl}` }),
      { skip: () => payload.status !== "shipped" },
    );

    await step.delay("wait-for-delivery", async () => ({ amount: 3, unit: "days" }));

    await step.email("feedback-request", async () => ({
      subject: "How was your order?",
      body: `<p>Tell us how order ${payload.orderId} went.</p>`,
    }));
  },
  {
    payloadSchema: z.object({
      orderId: z.string(),
      status: z.enum(["confirmed", "shipped", "delivered"]),
      trackingUrl: z.string().url().default("https://track.acme-shop.dev"),
    }),
    tags: ["orders"],
  },
);

// Digest: collect events for 30 minutes per subscriber, then send one email
export const activityDigest = workflow(
  "activity-digest",
  async ({ step }) => {
    const { events } = await step.digest("batch-activity", async () => ({ amount: 30, unit: "minutes" }));
    await step.email("digest-email", async () => ({
      subject: `${events.length} new comments on your project`,
      body: `<ul>${events.map((e) => `<li>${String(e.payload.text)}</li>`).join("")}</ul>`,
    }));
  },
  { payloadSchema: z.object({ text: z.string() }) },
);
```

Step rules: `step.inApp` needs `subject` and `body`; `step.email` needs `subject` and an HTML `body`; `step.sms` needs `body`; `step.push` needs `subject` and `body`; `step.chat` needs `body` or a card. A digest takes `amount` and `unit`, or a `cron` (not both), plus an optional `digestKey` to group by something other than the subscriber. Delay units are `seconds` to `months`. Steps are found by running the function with mock data, so a step wrapped in an `if` on payload values can be missing from the workflow Novu sees; `skip` always keeps it visible. Novu sanitizes HTML in email and in-app output.

### Step 2: Expose the bridge endpoint

```typescript
// server.ts (Express; there are also Next.js, Remix, Hono, NestJS, Lambda and more adapters)
import express from "express";
import { serve } from "@novu/framework/express";
import { orderStatus, activityDigest } from "./novu/workflows.ts";

const app = express();
app.use(express.json()); // required for Novu POST requests
app.use("/api/novu", serve({ workflows: [orderStatus, activityDigest] }));
app.listen(4000, "127.0.0.1");
```

Set `NOVU_SECRET_KEY` (from the dashboard API Keys page) in the environment; without it the app throws "Missing secret key" at start. Check the bridge: `GET /api/novu?action=health-check` returns `{"status":"ok","discovered":{"workflows":2,"steps":7}}`, and `?action=discover` lists workflows, steps and the payload JSON schema.

### Step 3: Develop locally and sync

```bash
npx novu@latest dev --port 4000          # opens the dashboard in Local mode via a tunnel
npx novu@latest sync --bridge-url https://api.acme-shop.dev/api/novu \
  --secret-key "$NOVU_SECRET_KEY" --api-url https://api.novu.co    # EU: https://eu.api.novu.co
```

`sync` pushes the discovered workflows to the environment of that secret key, so run it per environment (development, production), usually from CI. The bridge URL must be public HTTPS; private IPs are rejected.

### Step 4: Trigger from your backend

```typescript
import { Novu } from "@novu/api";

const novu = new Novu({ secretKey: process.env.NOVU_SECRET_KEY }); // EU: add serverURL: "https://eu.api.novu.co"

await novu.trigger({
  workflowId: "order-status-update",
  to: { subscriberId: "usr_8f3a21", email: "dana@acme-shop.dev", phone: "+14155550123" },
  payload: { orderId: "ORD-10492", status: "shipped" },
});

// Several subscribers in one call
await novu.trigger({
  workflowId: "activity-digest",
  to: [{ subscriberId: "usr_1" }, { subscriberId: "usr_2" }],
  payload: { text: "Priya commented on the launch plan" },
});

// Many different events in one request
await novu.triggerBulk({
  events: [
    { workflowId: "order-status-update", to: { subscriberId: "usr_1" }, payload: { orderId: "1", status: "shipped" } },
    { workflowId: "order-status-update", to: { subscriberId: "usr_2" }, payload: { orderId: "2", status: "delivered" } },
  ],
});
```

The first argument is `workflowId`. The payload must satisfy the workflow's `payloadSchema`. Pass `to` as a subscriber id string if the subscriber already exists. For large audiences create a **topic**, add subscribers, and trigger to the topic.

### Step 5: Show the Inbox in your app

```bash
npm install @novu/react          # Next.js: npm install @novu/nextjs
```

```tsx
import { Inbox } from "@novu/react";

export function NotificationBell({ userId, subscriberHash }: { userId: string; subscriberHash: string }) {
  return (
    <Inbox
      applicationIdentifier={process.env.NEXT_PUBLIC_NOVU_APP_ID!}
      subscriberId={userId}
      subscriberHash={subscriberHash}
      routerPush={(path: string) => window.location.assign(path)}
    />
  );
}
```

Before production, turn on HMAC in the dashboard (Integrations Store, Novu In-App, Security HMAC encryption) and compute the hash on the server, never in the browser:

```typescript
import { createHmac } from "node:crypto";

export const subscriberHash = (subscriberId: string) =>
  createHmac("sha256", process.env.NOVU_SECRET_KEY!).update(subscriberId).digest("hex");
```

Without HMAC, anyone who guesses a `subscriberId` can read that user's notifications using the public application identifier. EU region needs `apiUrl="https://eu.api.novu.co"` and `socketUrl="wss://eu.socket.novu.co"` props. `@novu/react` needs React 18 or 19. Headless hooks exist for a fully custom UI.

### Step 6: Dashboard-managed workflows and code steps

Workflows made in the dashboard editor need no bridge. A single step can still run your TypeScript: toggle **Custom Code** in the step editor, then run the `npx novu step publish --workflow <id> --step <id>` command the dashboard prefilled (the secret key comes from `NOVU_SECRET_KEY`). Handlers live in `novu/<workflowId>/<stepId>.step.tsx`.

## Examples

### Example 1: Order updates over in-app, email and SMS

**User prompt:** "When an order ships, notify the customer in the app and by email, text them the tracking link, and ask for feedback 3 days later."

The agent installs `@novu/framework`, `zod@3`, `zod-to-json-schema`, adds `novu/workflows.ts` with the `order-status-update` workflow above, mounts `serve()` at `/api/novu`, checks `GET /api/novu?action=health-check` shows `"workflows":1,"steps":5`, syncs it with `npx novu@latest sync`, and replaces the old notification code with `novu.trigger({ workflowId: "order-status-update", ... })`. Result: one trigger produces an in-app item and an email immediately, an SMS when `status` is `shipped`, and a feedback email after three days.

### Example 2: Batch noisy comment notifications

**User prompt:** "People get 40 emails an hour when a thread is busy. Group them into one email every 30 minutes."

The agent adds the `activity-digest` workflow (digest step with `amount: 30, unit: "minutes"`, adding `threadId` to the payload schema and `digestKey: payload.threadId` if the grouping should be per thread), triggers it on every comment, and renders `events` into one email. A thread with 12 comments in half an hour yields one email with 12 list items.

## Guidelines

- Keep the secret key on the server (`NOVU_SECRET_KEY`); only the `applicationIdentifier` goes to the browser. Rotate it if it leaks.
- Workflows made with Framework are controlled by your code, not the dashboard; sync after every deploy so production sees the same version.
- Subscribers are created on the fly from the `to` object at first trigger (and updated by later triggers), or ahead of time through the API; keep `subscriberId` equal to your user id, not an email address that can change.
- Users can opt out per channel and per workflow in the Inbox preferences. Use `Mark as critical` in the workflow's channel preferences for security-critical messages (such as password resets); critical workflows ignore subscriber preferences.
- The digest result is available only to later steps in the same workflow, and edits to workflow content do not change events already digested.
- A provider send is attempted once and never retried: a transient SendGrid or Twilio error means that message is lost. Subscribe to the `messages.failed` webhook to detect it. Calls from Novu to your bridge are retried up to 3 times, so keep step functions idempotent.
- Self-hosting (Docker, MongoDB, Redis) is possible; compare features with Novu Cloud before choosing it. Do not use Novu as a general message queue or for bulk marketing campaigns that need list management.
