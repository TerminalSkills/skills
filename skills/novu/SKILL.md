---
name: novu
description: >-
   You are an expert in Novu, the open-source notification infrastructure
  platform. You help developers build multi-channel notification systems
  supporting email, SMS, push, in-app, and chat (Slack/Discord) — with
  workflow orchestration, digest/batching, user preferences, template
  management, and a pre-built notification center component for React.
category: Backend Development
tags: [notifications, multi-channel, email, sms, push, in-app, typescript]
version: 1.0.0
author: terminal-skills
---

# Novu — Open-Source Notification Infrastructure

You are an expert in Novu, the open-source notification infrastructure platform. You help developers build multi-channel notification systems supporting email, SMS, push, in-app, and chat (Slack/Discord) — with workflow orchestration, digest/batching, user preferences, template management, and a pre-built notification center component for React.

## Core Capabilities

### Workflow Definition

```typescript
// novu/workflows/order-updates.ts
import { workflow, CronExpression } from "@novu/framework";
import { z } from "zod";
import { renderOrderEmail } from "../emails/order-status";

export const orderStatusWorkflow = workflow(
  "order-status-update",
  async ({ step, payload }) => {
    // Step 1: In-app notification (always)
    await step.inApp("in-app-notification", async () => ({
      subject: `Order ${payload.orderId} — ${payload.status}`,
      body: `Your order is now ${payload.status.toLowerCase()}`,
      avatar: "https://app.example.com/icons/order.png",
      redirect: { url: `/orders/${payload.orderId}` },
    }));

    // Step 2: Email (respects user preferences)
    await step.email("email-notification", async () => ({
      subject: `Order Update: ${payload.status}`,
      body: renderOrderEmail({
        orderId: payload.orderId,
        status: payload.status,
        trackingUrl: payload.trackingUrl,
      }),
    }));

    // Step 3: SMS for shipped orders only
    if (payload.status === "shipped") {
      await step.sms("sms-shipped", async () => ({
        body: `Your order ${payload.orderId} has shipped! Track: ${payload.trackingUrl}`,
      }));
    }

    // Step 4: Delay + follow-up
    await step.delay("wait-for-delivery", () => ({
      amount: 3, unit: "days",
    }));

    await step.email("feedback-request", async () => ({
      subject: "How was your order?",
      body: renderFeedbackEmail({ orderId: payload.orderId }),
    }));
  },
  {
    payloadSchema: z.object({
      orderId: z.string(),
      status: z.enum(["confirmed", "shipped", "delivered"]),
      trackingUrl: z.string().url().optional(),
    }),
  },
);

// Digest workflow — batch notifications
export const activityDigest = workflow(
  "activity-digest",
  async ({ step }) => {
    // Collect events over 30 minutes
    const digestedEvents = await step.digest("batch-activity", () => ({
      amount: 30, unit: "minutes",
    }));

    await step.email("digest-email", async () => ({
      subject: `${digestedEvents.events.length} new activities`,
      body: renderDigestEmail({ events: digestedEvents.events }),
    }));
  },
);
```

### Triggering Notifications

```typescript
import { Novu } from "@novu/node";

const novu = new Novu(process.env.NOVU_API_KEY);

// Trigger notification
await novu.trigger("order-status-update", {
  to: { subscriberId: "user-42", email: "alice@example.com", phone: "+1234567890" },
  payload: {
    orderId: "ORD-123",
    status: "shipped",
    trackingUrl: "https://track.example.com/abc",
  },
});

// Trigger to multiple subscribers
await novu.trigger("weekly-digest", {
  to: [
    { subscriberId: "user-1" },
    { subscriberId: "user-2" },
    { subscriberId: "user-3" },
  ],
  payload: { weekNumber: 11 },
});

// Bulk trigger
await novu.bulkTrigger([
  { name: "order-status-update", to: { subscriberId: "user-1" }, payload: { orderId: "1", status: "shipped" } },
  { name: "order-status-update", to: { subscriberId: "user-2" }, payload: { orderId: "2", status: "delivered" } },
]);
```

## Installation

```bash
npm install @novu/node                    # Server SDK
npm install @novu/framework               # Workflow definitions
npx novu@latest dev                       # Local dev studio
```

## Best Practices

1. **Multi-channel workflows** — Define email + SMS + push + in-app in one workflow; Novu routes per user preference
2. **Digest for batching** — Use `step.digest()` to batch frequent events into a single notification
3. **Delay for follow-ups** — Use `step.delay()` for drip sequences, feedback requests, reminders
4. **User preferences** — Novu UI lets users control which channels they receive; respect opt-outs automatically
5. **Subscriber management** — Create subscribers with `subscriberId`; attach email, phone, push tokens
6. **React notification center** — Use `@novu/notification-center-react` for a drop-in in-app notification bell
7. **Template management** — Use Novu dashboard for non-technical team members to edit notification copy
8. **Self-hosted option** — Deploy Novu on your infra with Docker; full control over notification data
