---
title: Add Product Analytics to a SaaS App
slug: add-product-analytics-to-saas-app
description: Set up PostHog for a Next.js SaaS app (Cloud or a self-hosted hobby instance), instrument event tracking, build onboarding funnels, add session replay, and send billing events from the server.
skills:
  - posthog
  - nextjs
category: data-ai
tags:
  - product-analytics
  - posthog
  - event-tracking
  - funnels
  - session-replay
  - saas
---

# Add Product Analytics to a SaaS App

Mateo's team shipped a project management tool three months ago. They have 2,000 users, but they're flying blind: no idea which features people use, where users drop off during onboarding, or why the free-to-paid conversion rate sits at 3%. They decide to use PostHog for event tracking, funnels and session replay in their Next.js app.

## Step 1: Choose where PostHog runs

The simplest route is PostHog Cloud. Mateo's team handles sensitive project data, so they pick the EU region (`https://eu.i.posthog.com` for ingestion, `https://eu.posthog.com` for the app and API), which keeps events in the EU. In the project settings they copy the **project token** (`phc_...`). It is public and may appear in browser code. A **personal API key** (`phx_...`) is secret and is never shipped to the browser.

If policy requires running it themselves, PostHog supports a "hobby" deployment on one Linux VM with Docker (PostHog's docs ask for roughly 4 vCPU, 16 GB RAM and 30 GB of storage on Ubuntu, plus a DNS A record pointing at the VM). It is meant for small installs, and PostHog states that self-hosted deployments are officially unsupported. PostHog ships the installer as a script in its repository; it supports Ubuntu only and uses `sudo` and `apt`, so Mateo downloads it, reads it, and only then runs it. The script is not piped into a shell. It clones the PostHog repository, writes the configuration, asks for a domain and starts the whole stack (web, worker, Postgres, ClickHouse, Redis, a Redpanda broker and a Caddy proxy that obtains the TLS certificate) with Docker Compose. It also sends one anonymous install-start event to PostHog, which he accepts or removes after reading the script.

```bash
curl -fsSL -o deploy-hobby https://raw.githubusercontent.com/PostHog/posthog/HEAD/bin/deploy-hobby
less deploy-hobby                      # read it first
bash deploy-hobby latest-release analytics.projectflow.io
```

Hand-written compose files for the whole stack, as older guides show, do not match the current architecture. Use PostHog's current self-hosting page for upgrades and sizing.

## Step 2: Add the SDK to Next.js

```bash
npm install posthog-js
```

```bash
# .env.local (the project token is public; the personal API key never goes here)
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_your_project_token
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

Next.js loads `instrumentation-client.ts` from the project root before the app hydrates, so no provider component is needed:

```typescript
// instrumentation-client.ts
import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
  defaults: "2026-08-30",
  person_profiles: "identified_only",
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: "[data-ph-mask]",
    blockSelector: "[data-ph-block]",
  },
});
```

`defaults` pins SDK behavior to a date; with a date from 2025-05-24 on, single-page route changes produce pageviews automatically. `person_profiles: "identified_only"` creates profiles only for logged-in users. If the site sets a Content-Security-Policy, allow `https://*.posthog.com` in `script-src` and `connect-src`, and `blob:` in `worker-src`, or events silently never arrive. (On a self-hosted instance, allow your own PostHog domain instead.)

## Step 3: Instrument the key events

Mateo keeps a short, documented list of events named `object_action` in snake_case, and puts variations in properties:

```typescript
// lib/analytics.ts
import posthog from "posthog-js";

export function identifyUser(user: { id: string; email: string; plan: string }) {
  posthog.identify(user.id, { email: user.email, plan: user.plan });
}

export function logout() {
  posthog.reset();
}

export const track = {
  signedUp: (method: "email" | "github") => posthog.capture("user_signed_up", { method }),
  onboardingStep: (step: string) => posthog.capture("onboarding_step_completed", { step_name: step }),
  projectCreated: (template: string) => posthog.capture("project_created", { template }),
};
```

`identifyUser` runs once after login with the ID from the app's own auth system (not the email), which joins anonymous browsing, replays and later server events into one person. `logout` resets the identity so the next user of the browser does not inherit it. The wizard calls `track.onboardingStep("create_workspace")`, `track.onboardingStep("invite_team")` and so on, and `track.projectCreated(template)` after the first project is saved.

## Step 4: Build the onboarding funnel

After a few days of traffic, in PostHog he opens **Product analytics > New insight > Funnels** and adds the steps in order: `user_signed_up`, `onboarding_step_completed` filtered by `step_name = create_workspace`, the same event with `step_name = invite_team`, then `project_created`. He sets the conversion window to 14 days. The chart shows conversion and drop-off between steps, and clicking a drop-off bar lists the people who left, with a link to their session recordings. The free-to-paid funnel is built the same way, ending in `upgrade_completed` (Step 6). Retention is a second insight: first event `user_signed_up`, returning event `project_created`, by week.

To reuse an insight in code or a report, query it with HogQL through the API from a trusted machine, using a personal API key with the `query:read` scope:

```bash
export POSTHOG_PERSONAL_API_KEY=phx_...   # set from your secret store
curl -s https://eu.posthog.com/api/projects/$POSTHOG_PROJECT_ID/query/ \
  -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" -H "Content-Type: application/json" \
  -d '{"query": {"kind": "HogQLQuery", "query": "SELECT properties.step_name, count() FROM events WHERE event = '"'"'onboarding_step_completed'"'"' AND timestamp > now() - INTERVAL 14 DAY GROUP BY 1 ORDER BY 2 DESC"}}'
```

## Step 5: Session replay for UX debugging

Replay is switched on per project under **Settings > Replay**. The `session_recording` options in Step 2 mask all inputs (password fields are always masked), blur anything marked `data-ph-mask` and drop anything marked `data-ph-block`. Add the class `ph-no-capture` to anything that must never be recorded, such as card forms or health data. EU users need a consent decision before recording: start with `opt_out_capturing_by_default: true` and call `posthog.opt_in_capturing()` from the consent banner.

In **Replay**, Mateo filters recordings by the person's properties (`plan = free`) or by an event such as the last funnel step they reached, and watches the sessions of users who stopped at "Invite team". The pattern he finds, an invite form that fails silently on a malformed address, becomes a fix the same week.

## Step 6: Send billing events from the server

Upgrades happen in Stripe, so the server sends `upgrade_completed` from its webhook. Mateo sets `client_reference_id` to the app's own user ID when creating the Checkout Session, so the server event joins the same person as the browser events. The handler verifies the signature (`stripe.Webhook.construct_event` checks the HMAC in constant time and rejects old timestamps) before it trusts anything, and ignores replays of an event it has already seen:

```bash
pip install posthog stripe flask
```

```python
# billing_webhook.py
import os

import stripe
from flask import Flask, request
from posthog import Posthog

app = Flask(__name__)
posthog = Posthog(
    os.environ["POSTHOG_PROJECT_TOKEN"],
    host=os.environ.get("POSTHOG_HOST", "https://eu.i.posthog.com"),
)
WEBHOOK_SECRET = os.environ["STRIPE_WEBHOOK_SECRET"]
seen_events: set[str] = set()  # use a unique DB constraint or Redis SETNX in production


@app.post("/webhooks/stripe")
def stripe_webhook():
    try:
        # Verifies the Stripe-Signature HMAC (constant-time) and the timestamp tolerance
        event = stripe.Webhook.construct_event(
            request.get_data(), request.headers.get("Stripe-Signature", ""), WEBHOOK_SECRET
        )
    except (ValueError, stripe.SignatureVerificationError):
        return "", 400

    if event["id"] in seen_events:  # Stripe retries; do not count a payment twice
        return "", 200
    seen_events.add(event["id"])

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"].to_dict()  # StripeObject has no .get()
        user_id = session.get("client_reference_id")  # set to your own user ID at checkout
        if user_id:
            posthog.capture(
                "upgrade_completed",
                distinct_id=user_id,
                properties={
                    "amount_cents": session.get("amount_total"),
                    "currency": session.get("currency"),
                    "$insert_id": event["id"],
                },
            )
    return "", 200
```

The PostHog Python client batches events in a background thread. A long-running server needs nothing more, but short scripts and serverless handlers must call `posthog.flush()` or `posthog.shutdown()` before they exit. The raw request body must reach `construct_event` unparsed.

## Summary

With about 200 lines of code, the team now sees where onboarding loses people, watches the sessions behind each drop-off, and ties revenue events to the same person as their clicks. Choosing Cloud or a self-hosted hobby instance only changes the `api_host` value and who operates the servers.

## Related Skills

- `posthog`: events, funnels, replay, feature flags and the query API
- `nextjs`: the App Router app that hosts the instrumentation
