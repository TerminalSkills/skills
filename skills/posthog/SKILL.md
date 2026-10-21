---
name: posthog
description: >-
  PostHog is an open-source product analytics platform: event tracking,
  funnels, retention, session replay, feature flags and experiments in one
  tool, on PostHog Cloud or self-hosted. Use when someone asks to "add product
  analytics", "track events with PostHog", "set up session replay", "roll out a
  feature flag", "build a funnel", or "send backend events to PostHog". Covers
  the JavaScript and Python SDKs, privacy masking, server-side flags, and
  querying data through the API.
license: Apache-2.0
compatibility: "posthog-js 1.x (browser/Node), posthog Python SDK 7.x (Python 3.10+). PostHog Cloud US/EU or a self-hosted instance."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["posthog", "analytics", "product-analytics", "session-replay", "feature-flags"]
  repository: https://github.com/PostHog/posthog
---

# PostHog

## Overview

PostHog combines product analytics (events, funnels, retention, cohorts), session replay, feature flags, A/B experiments and surveys. Events are captured by SDKs (browser autocapture plus custom events) and stored per project. Use PostHog Cloud (US `https://us.i.posthog.com`, EU `https://eu.i.posthog.com`) unless you must self-host.

Two kinds of keys, often confused:

- **Project token** (`phc_...`): public, goes into browser code and servers, can only send events and read flags.
- **Personal API key** (`phx_...`, created with scopes in account settings): secret, used for the REST API and for server-side local flag evaluation. Never ship it to a browser or commit it.

The old host `app.posthog.com` is the legacy US address; new setups use `https://us.i.posthog.com` as `api_host` (and `ui_host: "https://us.posthog.com"` if you proxy events through your own domain).

## Instructions

### 1. Browser: posthog-js

```bash
npm install posthog-js
```

```typescript
// lib/posthog.ts
import posthog from "posthog-js";

export function initPostHog() {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    defaults: "2025-05-24",            // dated defaults set (pageviews on route change); newer dates exist
    person_profiles: "identified_only", // no profile (and no cost) for anonymous visitors
    capture_pageleave: true,
  });
}
```

`defaults` pins behavior to a date; with `2025-05-24` or later `capture_pageview` becomes `'history_change'`, which is what single-page apps need. Without it, pageviews are captured only on full loads. In Next.js call `initPostHog()` once in a client component (`"use client"` + `useEffect`), not on the server.

```typescript
// Custom events, identification, and reset
posthog.capture("user_signed_up", { method: "github" });
posthog.capture("checkout_completed", { plan: "growth", amount_usd: 49 });

posthog.identify("user_8f31c2", { email: "maria@brightlane.io", plan: "growth" }); // after login
posthog.reset();                                                               // on logout
```

Name events `object_action` in snake_case, keep the list small and documented, and put variations in properties, not new event names.

### 2. Python server events

```bash
pip install posthog
```

```python
import os
from posthog import Posthog

posthog = Posthog(
    os.environ["POSTHOG_PROJECT_TOKEN"],
    host="https://us.i.posthog.com",
)

posthog.capture(
    "subscription_created",
    distinct_id="user_8f31c2",
    properties={"plan": "growth", "amount_cents": 4900, "currency": "usd"},
)

posthog.set(distinct_id="user_8f31c2", properties={"plan": "growth"})  # person properties

posthog.shutdown()   # flush the queue before the process exits
```

The signature is `capture(event, distinct_id=..., properties=...)`; the old `identify()` method is gone, use `set()`. The client batches in a background thread, so short scripts and serverless handlers must call `posthog.flush()` or `shutdown()`. For web frameworks, v6+ has a context API (`new_context`, `identify_context`) and Django/Flask middleware that attach the distinct ID automatically; see the Python library docs. Use the same `distinct_id` as `posthog.identify()` in the browser so both sides join one person.

### 3. Feature flags

```typescript
posthog.onFeatureFlags(() => {
  if (posthog.isFeatureEnabled("new-checkout")) showNewCheckout();
});
const variant = posthog.getFeatureFlag("pricing-test");      // true | "control" | "test" | undefined
const payload = posthog.getFeatureFlagPayload("pricing-test");
```

React: `import { useFeatureFlagEnabled } from "posthog-js/react"` (inside `PostHogProvider`). Flags load asynchronously, so render a safe default until they arrive.

```python
if posthog.feature_enabled("new-checkout", "user_8f31c2", person_properties={"plan": "growth"}):
    ...
variant = posthog.get_feature_flag("pricing-test", "user_8f31c2")
```

Server-side flag calls hit the network unless local evaluation is on: construct the client with `secret_key=os.environ["POSTHOG_PERSONAL_API_KEY"]` (the older `personal_api_key` name is a deprecated alias) and pass `person_properties` the flag depends on. Each evaluation also sends a `$feature_flag_called` event, which experiments rely on.

### 4. Session replay and privacy

Replay is enabled per project in settings; once on, the SDK records unless `disable_session_recording: true`. Inputs are masked by default (`maskAllInputs`), and password fields always are.

```typescript
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "https://us.i.posthog.com",
  defaults: "2025-05-24",
  session_recording: {
    maskTextSelector: "[data-ph-mask]",  // blur text in matching elements
    blockSelector: "[data-ph-block]",    // replace matching elements entirely
    maskAllInputs: true,
  },
});
```

Add the class `ph-no-capture` to anything that must never be recorded (card forms, health data). Check GDPR needs before recording EU users; `posthog.opt_out_capturing()` / `opt_out_capturing_by_default: true` support consent banners.

### 5. Query data through the API

```bash
export POSTHOG_PERSONAL_API_KEY=phx_...   # scopes: query:read, insight:write as needed
curl -s https://us.posthog.com/api/projects/12345/query/ \
  -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" -H "Content-Type: application/json" \
  -d '{"query": {"kind": "HogQLQuery", "query": "SELECT event, count() FROM events WHERE timestamp > now() - INTERVAL 7 DAY GROUP BY event ORDER BY 2 DESC LIMIT 10"}}'
```

The API host is `us.posthog.com` / `eu.posthog.com` (not the `i.` ingestion host). Project IDs are in the URL of the app. The legacy `filters`-based insight payloads are deprecated in favor of query objects and HogQL; build the insight in the UI, then copy its query.

### Self-hosting

PostHog supports a "hobby" deployment on a single Linux VM with Docker (small scale, community support only; production-scale self-hosting is not recommended by PostHog). PostHog provides a deploy script (`bin/deploy-hobby` in its repository); download and read it before running it, and never pipe it into a shell. The stack has many services (ClickHouse, Postgres, Redis and more); hand-writing a docker-compose file for it (as older guides do) will not work. Use PostHog's current self-host page for the exact steps.

## Examples

### Example 1: Funnel from signup to first project

**User prompt:** "Track our signup funnel in PostHog and tell me where people drop off."

Add `posthog.capture("user_signed_up", {method})` after the signup API call, `posthog.capture("project_created")` when the first project is saved, and `posthog.identify(user.id, {email})` after login. After some traffic, create an insight in the PostHog UI: Funnel, steps `user_signed_up` then `project_created`, 14-day window. The result lists conversion per step and the drop-off, with a link to replays of the people who dropped.

### Example 2: Gradual rollout with a server-side flag

**User prompt:** "Roll out the new billing page to 20% of users, checked on the backend."

Create the flag `new-billing-page` with a 20% rollout in PostHog, then in the Python backend create the client with `secret_key` from `POSTHOG_PERSONAL_API_KEY` and call `posthog.feature_enabled("new-billing-page", str(user.id))`. The same user always gets the same answer. Raise the percentage in the UI to roll out further, no deploy needed; remove the flag check from code once it reaches 100%.

## Guidelines

- Pick the right host per purpose: `i.` ingestion host in SDKs, `us.posthog.com`/`eu.posthog.com` for the REST API and web app.
- Keep personal API keys server-side only and scoped to what is needed; the project token is the only key in front-end bundles.
- Use `person_profiles: "identified_only"` to avoid paying for anonymous profiles; call `identify` only after login.
- Ad blockers drop requests to PostHog domains. A reverse proxy on your own domain (`api_host: "/ingest"`, `ui_host` set to the PostHog app) recovers most events.
- Do not put personal data (emails, free text) in event names or autocaptured text; mask with `data-ph-mask`.
- Flush the Python client in short-lived processes, or events are lost.
- Self-hosting is a real operations burden; prefer Cloud unless data residency forces it.
