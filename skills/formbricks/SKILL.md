---
name: formbricks
description: >-
  Formbricks is an open-source survey and experience management platform that
  shows in-app and website surveys to targeted users and collects their
  feedback. Use when someone asks to "add surveys to my app", "Formbricks",
  "in-app feedback", "NPS survey", "user research", "product feedback tool",
  or "open-source Typeform alternative". Covers the JavaScript SDK, action
  triggers, user identification, the management API, webhooks and self-hosting.
license: Apache-2.0
compatibility: "JavaScript SDK for any web framework (React, Next.js, Vue); React Native, iOS, Android and Flutter SDKs. REST API. Formbricks Cloud or self-hosted with Docker."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["surveys", "feedback", "formbricks", "nps", "user-research"]
  repository: https://github.com/formbricks/formbricks
---

# Formbricks

## Overview

Formbricks is an open-source survey and feedback platform — embed surveys directly in your app, trigger them based on user actions, and collect targeted feedback. Unlike Typeform (generic forms) or Hotjar (page-level), Formbricks targets specific users at the right moment: after checkout, on feature use, at churn risk. NPS, CSAT, feature requests, bug reports — all in-context.

Surveys are built in the Formbricks app (Cloud at `app.formbricks.com`, or your own instance). Your code does three things: loads the SDK with a **Workspace ID**, tells Formbricks who the user is, and fires **actions** that surveys listen for. This skill follows Formbricks 6.0 and `@formbricks/js` 5.1 (September 2026), where the SDK entry point is `setup({ workspaceId, appUrl })`; the older `init({ environmentId, apiHost })` call and the `@formbricks/js/app` import no longer exist.

## When to Use

- Collecting in-app feedback (NPS, CSAT, feature requests)
- Understanding why users churn or don't convert
- Running product research surveys targeted at specific segments
- Need an open-source alternative to Typeform/SurveyMonkey

## Instructions

### Setup

```bash
npm install @formbricks/js
```

Find the two values the SDK needs under **Settings → Workspace → Web & Mobile SDK** (the docs still call this page "Connect Your App"): the Workspace ID and the SDK Connection URL (`https://app.formbricks.com` on Cloud). Mobile apps use `@formbricks/react-native`, the `FormbricksSDK` Swift package, `com.formbricks:android`, or the `formbricks` Flutter package with the same two values.

Self-hosting is no longer a single container: the v6 Compose stack runs the web app, PostgreSQL, Valkey, Formbricks Hub, Cube and SpiceDB. Follow https://formbricks.com/docs/self-hosting/setup/docker to fetch `docker-compose.yml` with its helper files from the repository's `stable` branch and to generate the secrets in `.env` (`WEBAPP_URL`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD` and others), then:

```bash
docker compose config >/dev/null      # validates .env and the compose file
docker compose up -d
docker compose ps -a                  # the *-migrate and bootstrap services must have exited 0
curl -fsS http://localhost:3000/health   # {"status":"ok"}
```

### In-App Survey Integration

```tsx
// app/formbricks.tsx — client component, rendered once in app/layout.tsx inside <Suspense>
"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import formbricks from "@formbricks/js";

export default function FormbricksProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    formbricks.setup({
      workspaceId: process.env.NEXT_PUBLIC_FORMBRICKS_WORKSPACE_ID!,
      appUrl: process.env.NEXT_PUBLIC_FORMBRICKS_APP_URL!, // https://app.formbricks.com or your own host
    });
  }, []);

  useEffect(() => {
    formbricks.registerRouteChange(); // lets page-view and URL-filtered actions fire on client navigation
  }, [pathname, searchParams]);

  return null;
}
```

In a plain React or Vue app, call `formbricks.setup(...)` once at startup behind `if (typeof window !== "undefined")` and call `registerRouteChange()` from the router's navigation hook. Without a bundler, paste the script tag from the Web & Mobile SDK page; it loads `/js/formbricks.umd.cjs` from your instance and exposes `window.formbricks`.

```typescript
// After login — setUserId must come first, attributes are dropped for anonymous visitors
await formbricks.setUserId("usr_8f2k1");
await formbricks.setEmail("dana.whitfield@lumenlabs.io");
await formbricks.setAttributes({ plan: "pro", signup_date: "2026-01-15", company: "Lumen Labs" });
await formbricks.setLanguage("de"); // ISO code or the alias from Settings → Workspace → Survey Languages

// On sign-out, so the next person on this browser is not linked to the previous user
await formbricks.logout();
```

Anonymous visitors still get surveys from triggers; identification is what enables attribute targeting and shows who answered. Identification and attribute-based targeting are Enterprise Edition features, so a self-hosted instance needs a license for them.

### Track Custom Actions (Triggers)

An action does nothing until it exists in Formbricks and a survey lists it as a trigger. Create it under **Settings → Workspace → User Actions → Add action**, switch the dialog to **Code**, and give it a key. No-code actions (click, page view, exit intent, 50% scroll, time on page) need no code at all, but work only on the web.

```typescript
// Fire a code action — the string is the action's key
await formbricks.track("checkout_completed");

// Attach hidden-field values to the response this trigger produces
await formbricks.track("checkout_completed", { hiddenFields: { order_value: 149, plan: "pro" } });

// Or push context once; every survey shown afterwards picks it up (until reload or logout)
await formbricks.setEmbeddedData({ page_type: "checkout", plan: "pro" });
await formbricks.setEmbeddedData({ page_type: null }); // null removes the key
```

`track()` takes only `{ hiddenFields }` as its second argument — arbitrary event properties are not stored. A hidden field must be declared on the survey first (editor → Questions tab → Hidden fields); new ids are lowercase with underscores (`order_value`, not `orderValue`).

`track()` returning does not mean a survey appeared — recontact options, the cooldown period and targeting may all say no. Subscribe to lifecycle events to learn what happened:

```typescript
const stop = formbricks.on("formbricks_survey_shown", ({ surveyId }) => {
  console.log("survey shown", surveyId);
});
formbricks.on("formbricks_response_submitted", ({ surveyId, responseId, finished }) => {
  if (finished) console.log("completed", surveyId, responseId);
});
stop(); // on() returns the unsubscribe function
```

Other events: `formbricks_survey_closed`, `formbricks_setup_successful`, `formbricks_action_tracked`. The same events are pushed to `window.dataLayer` for Google Tag Manager.

### API Usage

Create a key under the organization dropdown → **API Keys**; add each workspace it may reach with `read`, `write` or `manage` permission. The value is shown once. Send it in the `x-api-key` header.

```bash
# Check the key (single-workspace keys only; a key with several workspaces gets 400 — use /api/v2/me)
curl -s https://app.formbricks.com/api/v1/management/me -H "x-api-key: $FORMBRICKS_API_KEY"

# Create a code action that surveys can use as a trigger
curl -s -X POST https://app.formbricks.com/api/v1/management/action-classes \
  -H "x-api-key: $FORMBRICKS_API_KEY" -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"$FORMBRICKS_WORKSPACE_ID\",\"name\":\"Checkout completed\",\"type\":\"code\",\"key\":\"checkout_completed\"}"

# List surveys, then read one survey's responses (limit/skip paginate)
curl -s https://app.formbricks.com/api/v1/management/surveys -H "x-api-key: $FORMBRICKS_API_KEY"
curl -s "https://app.formbricks.com/api/v1/management/responses?surveyId=$SURVEY_ID&limit=50&skip=0" \
  -H "x-api-key: $FORMBRICKS_API_KEY"
```

`POST /api/v1/management/surveys` creates a survey, but the document is large: the API reference lists `workspaceId`, `name`, `type` (`link` or `app`) and `status` as required, the server also rejects a body without `questions` or `blocks`, and every text is a translation object (`"headline": {"default": "How likely are you to recommend us?"}`). Build surveys in the editor, or read an existing one with `GET /api/v1/management/surveys/{surveyId}` and modify that document. An API v2 (`/api/v2/management/...`, beta) covers responses, contacts and webhooks with the same header.

AI agents can skip the REST API: Formbricks exposes an MCP server at `https://app.formbricks.com/api/mcp` (or `/api/mcp` on your instance) with tools such as `list_surveys`, `get_survey` and `create_survey`, authorized through OAuth in the browser.

```bash
claude mcp add --transport http formbricks https://app.formbricks.com/api/mcp
```

### Webhooks

```bash
curl -s -X POST https://app.formbricks.com/api/v1/webhooks \
  -H "x-api-key: $FORMBRICKS_API_KEY" -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"$FORMBRICKS_WORKSPACE_ID\",\"name\":\"NPS to Slack\",\"url\":\"https://hooks.lumenlabs.io/formbricks\",\"triggers\":[\"responseFinished\"],\"surveyIds\":[\"$SURVEY_ID\"]}"
```

Triggers are `responseCreated`, `responseUpdated` and `responseFinished`. Each delivery is a POST with the body `{ "webhookId", "event", "data": { ...response, "survey": { "title", "type", "status", "createdAt", "updatedAt" } } }` and Standard Webhooks headers. The signing secret (`whsec_…`) is shown when the webhook is created; verify every request:

```typescript
// verify-formbricks.ts — Standard Webhooks signature check
import crypto from "node:crypto";

export function verifyFormbricksWebhook(rawBody: string, headers: Record<string, string>) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const received = headers["webhook-signature"]; // "v1,<base64>"
  if (!id || !timestamp || !received) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // replay window: 5 minutes

  const secret = Buffer.from(process.env.FORMBRICKS_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", secret).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  const given = received.replace(/^v1,/, "");
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
```

## Examples

### Example 1: Add NPS survey after onboarding

**User prompt:** "Add an NPS survey that appears after a user completes onboarding."

1. In Formbricks: create the survey from the NPS template, set **Survey Type** to **Website & App Survey**, add a code action with the key `onboarding_completed` as its trigger, declare a hidden field `plan`, and publish it.
2. In the app: add `FormbricksProvider` from Instructions to `app/layout.tsx`, identify the user after login, and fire the action where onboarding ends:

```tsx
// app/onboarding/done/page.tsx
"use client";
import { useEffect } from "react";
import formbricks from "@formbricks/js";

export default function OnboardingDone() {
  useEffect(() => {
    formbricks.track("onboarding_completed", { hiddenFields: { plan: "pro" } });
  }, []);
  return <h1>You're all set</h1>;
}
```

3. Open the page as `https://app.lumenlabs.io/onboarding/done?formbricksDebug=true`. The console logs the setup and the tracked action, the survey slides in, and the **Web & Mobile SDK** page shows "Formbricks SDK is connected" (click **Re-check**; it does not poll). A new survey or trigger can take up to a minute to reach the browser because the SDK's configuration request is cached.

### Example 2: Feature request collection

**User prompt:** "Let users submit feature requests from inside the app and send each one to our backend."

1. Build a survey with a single-select category question and an open-text question; trigger it with a code action `feedback_button_clicked`, and under **Visibility & Recontact** set both **Keep showing while conditions match** and **Ignore Cooldown Period** — with only the first, the button goes quiet for the cooldown period after any survey was shown.
2. Wire the button: `<button onClick={() => formbricks.track("feedback_button_clicked")}>Give feedback</button>`.
3. Register a webhook for `responseFinished` (the `curl` call under Webhooks) and verify each delivery with `verifyFormbricksWebhook`. A delivery looks like (abridged — the response also carries `createdAt`, `meta`, `contact`, `tags` and more):

```json
{
  "webhookId": "cm8x2k4tq0007l508u1d3hz9e",
  "event": "responseFinished",
  "data": {
    "id": "cm8x31w2v000dl508f0a7qk1m",
    "surveyId": "cm8wz6n3a0002l508c4r9t2yb",
    "finished": true,
    "data": { "category": "Integrations", "request": "Export responses to BigQuery" },
    "survey": { "title": "Feature requests", "type": "app", "status": "inProgress" }
  }
}
```

The keys inside `data.data` are the question ids, which you can rename in the editor before the survey is published.

## Guidelines

- **In-app surveys > email surveys** — Formbricks reports 6–10x higher conversion rates for app surveys than for email surveys
- **Trigger on actions** — show surveys at the right moment, not randomly
- **Target specific segments** — pro users, churning users, new signups
- **NPS + follow-up** — always ask "why" after the score
- **Survey not showing?** Three gates apply after a trigger fires: the survey's recontact option (default: show only once), the workspace cooldown period (default 7 days since the user saw *any* survey) and targeting. While testing, set **Ignore Cooldown Period** and **Keep showing while conditions match**, then set them back
- **Identify before attributes** — `setEmail` and `setAttributes` before `setUserId` are dropped with a console error; attribute keys are capped at 150 per workspace
- **Strict CSP** — allow your `appUrl` in `script-src` and `connect-src`, and call `formbricks.setNonce(nonce)` before `setup()` so survey styles pass `style-src`
- **Workspace ID, not Environment ID** — `environmentId` still works in `setup()` and the API but is deprecated
- **API keys are server-side secrets** — never ship one to the browser; the SDK needs only the public Workspace ID. Scopes are fixed at creation: to change them, delete the key and create a new one
- **Webhooks to private addresses are blocked** on self-hosted instances unless `DANGEROUSLY_ALLOW_WEBHOOK_INTERNAL_URLS=1` is set — leave it off on a public server
- **Self-host for privacy** — data stays on your infrastructure and the core is AGPLv3. Back up the PostgreSQL volume and `.env` together: the encryption key lives in `.env`
- **Close the loop** — respond to feedback, users notice
