---
title: "Build Product Analytics with PostHog"
description: "Set up product analytics with PostHog: identified users, key events, funnels, session replay, retention and feature flags for gradual rollouts, on PostHog Cloud or self-hosted."
skills: [posthog]
difficulty: beginner
time_estimate: "3 hours"
tags: [analytics, posthog, funnels, retention, feature-flags, session-recording, product-management]
---

# Build Product Analytics with PostHog

Your product is live. You have users. You have no idea what they actually do inside the app, so you are guessing what to build next. PostHog covers event analytics, funnels, retention, session replay and feature flags in one open-source product, on PostHog Cloud or on your own infrastructure.

## What You'll Build

- Browser and server setup for a Next.js app
- User identification, so anonymous and logged-in events join one person
- A small event taxonomy and funnels from signup to activation to paid
- Session replay with inputs masked
- Server-side feature flags for gradual rollouts and A/B tests
- A retention chart

## Step 1: Install and Initialize

Use the project token (`phc_...`) from your project settings. It is public and can only send events and read flags; never put a personal API key (`phx_...`) in a browser bundle. PostHog Cloud has a US and an EU region: for an EU project use the host `eu.i.posthog.com` instead of `us.i.posthog.com`.

```bash
npm install posthog-js @posthog/react posthog-node
```

```text
# .env.local
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=<your project token>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Next.js loads `instrumentation-client.ts` on the client before the app runs, which is where PostHog's Next.js guide initializes the SDK:

```typescript
// instrumentation-client.ts
import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
  defaults: "2026-08-30",             // dated defaults: pageviews on SPA route changes
  person_profiles: "identified_only", // no person profile for anonymous visitors
  session_recording: { maskAllInputs: true },
});
```

`defaults` pins SDK behavior to a date; recent dates capture pageviews on client-side route changes, which a single-page app needs. `person_profiles: "identified_only"` avoids creating profiles for anonymous visitors. Inputs are masked in replays by default; the explicit `maskAllInputs` keeps it that way if defaults change. Other text is not masked, so add `data-ph-mask` or the `ph-no-capture` class to anything sensitive, and check consent requirements before recording EU users.

On the server, create the client per request in short-lived handlers: `flushAt: 1` and `flushInterval: 0` send events immediately, and `await shutdown()` flushes before the function exits.

```typescript
// lib/posthog-server.ts
import { PostHog } from "posthog-node";

// Short-lived serverless handlers: send immediately, then shutdown().
export function posthogServer() {
  return new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
}
```

## Step 2: Identify Users

Call `identify` after login with a stable ID from your auth system, and `reset` on logout. Email goes in as a property, not as the ID. Groups are keyed by the organization, not the user.

```typescript
// lib/identify.ts
"use client";
import posthog from "posthog-js";

export function onLogin(user: { id: string; email: string; plan: string; orgId: string; orgName: string }) {
  posthog.identify(user.id, { email: user.email, plan: user.plan });
  posthog.group("company", user.orgId, { name: user.orgName }); // group key is the org, not the user
}

export const onLogout = () => posthog.reset(); // next person on this browser starts anonymous
```

To link backend events to the same person, use the same `distinctId` on the server (the user ID), or set `tracing_headers: ["api.example.com"]` (a list of your API hostnames) on `posthog.init`, which adds `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID` to requests to your own API.

## Step 3: Track Key Events

Design the event list before you start; renaming events later splits your history. Use `object_action` in snake_case and put variations in properties, not new event names.

```typescript
posthog.capture("project_created", { template: "blank" });
posthog.capture("onboarding_completed", { steps_completed: 4 });
posthog.capture("upgrade_clicked", { from_plan: "free", location: "editor_banner" });
```

Events that must not be lost or faked by the client (signup, payments, cancellations) belong on the server:

```typescript
// lib/events.ts
import { posthogServer } from "./posthog-server";

export async function trackSignup(user: { id: string; email: string; plan: string }) {
  const ph = posthogServer();
  ph.identify({ distinctId: user.id, properties: { email: user.email, plan: user.plan } });
  ph.capture({ distinctId: user.id, event: "user_signed_up", properties: { plan: user.plan, method: "email" } });
  await ph.shutdown(); // flushes the queue
}

export async function trackSubscriptionStarted(userId: string, plan: string, amountUsd: number) {
  const ph = posthogServer();
  ph.capture({ distinctId: userId, event: "subscription_started", properties: { plan, amount_usd: amountUsd } });
  await ph.shutdown();
}
```

## Step 4: Feature Flags

Create the flags in PostHog first (for example `new-editor-v2` at 10% of users, and a multivariate `editor-experiment`). Evaluate on the server when the backend decides what to return, and in React when the UI decides.

```typescript
// app/api/flags/route.ts
import { posthogServer } from "@/lib/posthog-server";

export async function GET(req: Request) {
  const userId = req.headers.get("x-user-id"); // replace with your real session lookup
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const ph = posthogServer();
  const [newEditor, variant] = await Promise.all([
    ph.isFeatureEnabled("new-editor-v2", userId),
    ph.getFeatureFlag("editor-experiment", userId), // string variant key, true, false or undefined
  ]);
  await ph.shutdown();
  return Response.json({ newEditor: newEditor === true, editorVariant: typeof variant === "string" ? variant : "control" });
}
```

```tsx
// app/Editor.tsx
"use client";
import { useFeatureFlagEnabled } from "@posthog/react";
import posthog from "posthog-js";

export function Editor() {
  const enabled = useFeatureFlagEnabled("new-editor-v2"); // undefined while flags load
  return enabled ? <button onClick={() => posthog.capture("project_created", { template: "blank" })}>New editor</button> : <p>Classic editor</p>;
}
```

`useFeatureFlagEnabled` returns `undefined` until flags load, so the component renders the classic editor first. A server-side call without a personal API key makes a network request to PostHog for each evaluation; local evaluation needs the personal key and belongs on the server only.

## Step 5: Funnels and Retention

Build these in the PostHog app as insights (new insight, then Funnels or Retention):

```text
Signup to paid:    user_signed_up -> project_created (1 day) -> subscription_started (30 days)
Upgrade:           upgrade_clicked -> subscription_started (1 hour)
Onboarding:        user_signed_up -> onboarding_completed (3 days)
Retention:         first-time event user_signed_up, returning event project_created, weekly
```

Each funnel step shows conversion and drop-off, and the people who dropped link to their session replays, which is the fastest way to see why. Pick the returning event for retention to be a real use of the product, since `$pageview` also counts visits that never reach the product.

## Self-Hosting

PostHog offers a free "hobby" deployment of the whole stack (ClickHouse, Postgres, Redis and more) on one Linux VM with Docker. PostHog states that self-hosted instances are unsupported, have no tagged releases and no guarantees, so prefer Cloud unless data residency forces self-hosting. It needs an Ubuntu VM (PostHog suggests about 4 vCPU, 16 GB RAM, 30 GB+ disk) and a DNS `A` record for your domain, and paid-plan features are Cloud-only. The steps live on <https://posthog.com/docs/self-host>; download the install script, read it, and run it from disk instead of piping it into a shell. A hand-written docker-compose file, as older guides show, will not work for the current stack.

## Launch Checklist

- [ ] Project token set in the environment, no personal API key in the browser
- [ ] `identify()` after every login and `reset()` on logout, tested end to end
- [ ] 5 to 10 events in the core flows, documented
- [ ] Replay reviewed for sensitive text before enabling it for everyone
- [ ] Signup-to-paid funnel and weekly retention saved to a dashboard
- [ ] One feature flag live, evaluated on the server

## Related Skills

- [posthog](/skills/posthog) - SDKs, flags, replay privacy and the query API
