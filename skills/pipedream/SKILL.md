---
name: pipedream
description: >-
  Pipedream is a developer-focused integration platform: event-driven workflows
  built from Node.js or Python code steps and managed OAuth for 3,000+ apps. Its
  Workflows product shuts down on 31 March 2027, so the skill covers maintaining
  or exporting existing workflows and moving to Pipedream Connect (managed auth,
  MCP servers). Use when the user asks to build or fix a Pipedream workflow, use
  a data store, answer webhooks, migrate off Pipedream, or add the Pipedream SDK.
license: Apache-2.0
compatibility: 'Node.js 18+ for @pipedream/sdk; workflow code steps run Node.js 20; account on pipedream.com'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/PipedreamHQ/pipedream
  category: automation
  tags:
    - pipedream
    - workflow
    - automation
    - webhooks
    - integration
---

# Pipedream — Developer-First Workflow Automation

## Overview

Pipedream runs event-driven workflows: a trigger (HTTP webhook, schedule, app event) followed by steps that are Node.js, Python, Go or Bash code or pre-built app actions, with managed OAuth, a key-value data store and `*.m.pipedream.net` HTTP endpoints.

**Status as of October 2026: Pipedream Workflows and String are shutting down on 31 March 2027.** Workflows are in maintenance mode (no signups, no new features); existing ones keep running until that date, and all workflow data, including connected-account credentials, is deleted by 30 April 2027. Subscriptions are cancelled with a prorated refund. Pipedream Connect (managed auth, pre-built tools, MCP servers, API proxy) is not affected and is where the company's development goes. So:

- Do not start new production systems on Workflows. Build them on Connect or elsewhere.
- For existing workflows, export them (Step 4) and plan the move before the date.

## Instructions

### Step 1: Workflow code steps (existing workflows)

Each step is a component. `run` receives `{ steps, $ }`; props are exposed on `this`. Anything returned becomes `steps.<name>.$return_value`, and `$.export("key", value)` adds a named export. Exports must be JSON-serialisable; write files to `/tmp`.

```javascript
export default defineComponent({
  async run({ steps, $ }) {
    const event = steps.trigger.event;          // HTTP trigger: event.body, event.headers, event.query
    return {
      email: event.body.customer.email,
      amount: event.body.amount / 100,
      currency: event.body.currency.toUpperCase(),
    };
  },
});
```

A connected app account is declared as an `app` prop and its credentials appear in `this.slack.$auth`:

```javascript
import { WebClient } from "@slack/web-api";

export default defineComponent({
  props: { slack: { type: "app", app: "slack" } },
  async run({ steps, $ }) {
    const client = new WebClient(this.slack.$auth.oauth_access_token);
    await client.chat.postMessage({
      channel: "#payments",
      text: `New payment: ${steps.transform.$return_value.amount} ${steps.transform.$return_value.currency}`,
    });
  },
});
```

npm packages are imported with plain `import` at the top of the step and installed automatically. Always `await` asynchronous calls, or the step ends before they finish.

### Step 2: Data store (key-value)

Declare a `data_store` prop, then `get`, `set`, `has`, `keys`, `delete` and `setTtl`. Every call is async. `set` takes `{ ttl: seconds }` as a third argument.

```javascript
export default defineComponent({
  props: { dataStore: { type: "data_store" } },
  async run({ steps, $ }) {
    const id = steps.trigger.event.body.id;
    if (await this.dataStore.has(id)) {
      return $.flow.exit("Already processed");     // ends the workflow early
    }
    await this.dataStore.set(id, { processedAt: new Date().toISOString() }, { ttl: 7 * 86400 });
  },
});
```

### Step 3: HTTP trigger and responses

An HTTP trigger gives the workflow a URL on the `*.m.pipedream.net` domain (or your own custom domain). `event.body` is the parsed body (JSON or form), `event.headers` the request headers. Respond with `await $.respond({ status, headers, body })`; by default the response is sent at the end of the workflow, so add `immediate: true` to reply first and keep working. Providers that sign payloads over the raw body (Stripe, GitHub) need the vendor's pre-built trigger, which verifies the signature for you; the generic trigger only parses the body. For a hand-rolled webhook, compare a shared secret header:

```javascript
import { timingSafeEqual } from "node:crypto";

export default defineComponent({
  async run({ steps, $ }) {
    const sent = Buffer.from(steps.trigger.event.headers["x-api-key"] ?? "");
    const expected = Buffer.from(process.env.INTAKE_API_KEY);
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
      await $.respond({ status: 401, body: "invalid key" });
      return $.flow.exit("unauthorized");
    }
    await $.respond({ status: 202, body: { accepted: true }, immediate: true });
  },
});
```

Project secrets (`process.env.*`) are set in the project's variables settings.

### Step 4: Export and migrate

- Open the project in the dashboard, go to Settings and click Export Workflows: Pipedream builds a ZIP with one JSON file per workflow (triggers, steps, code, props, control flow), one project at a time. The ZIP (`project_export-proj_abc123.zip`) is written to the project's File Store, so your plan must include File Stores; download it from there. To export again, delete the old ZIP first. Secret props are left out and must be re-entered. Reconnect accounts in the new system.
- The `pd` CLI (Homebrew: `brew tap pipedreamhq/pd-cli && brew install pipedreamhq/pd-cli/pipedream`, or the zip builds on `cli.pipedream.com`; there is no npm package) does `pd login`, `pd deploy` (deploys a component source such as `http.js` or a registry source, not a workflow YAML), `pd publish`, `pd logs`, `pd init connect`.
- Open-source component code (the actions and sources behind the 3,000+ apps) lives in `github.com/PipedreamHQ/pipedream` under `components/` and is a reference for API calls when you rebuild a step by hand.

### Step 5: Pipedream Connect (the supported product)

Server side: create the client with an OAuth client from workspace API settings, mint a short-lived token per end user, run actions on their behalf.

```bash
npm install @pipedream/sdk      # 3.3.0, Node 18+
```

```typescript
import { PipedreamClient } from "@pipedream/sdk";

const client = new PipedreamClient({
  projectEnvironment: "production",              // or "development"
  clientId: process.env.PIPEDREAM_CLIENT_ID,
  clientSecret: process.env.PIPEDREAM_CLIENT_SECRET,
  projectId: process.env.PIPEDREAM_PROJECT_ID,
});

// Hand `token` to your frontend (client.connectAccount) or send the user to connectLinkUrl
const { token, connectLinkUrl } = await client.tokens.create({ externalUserId: "user_8412" });

// Run a pre-built action with the user's connected account
const result = await client.actions.run({
  externalUserId: "user_8412",
  id: "gitlab-list-commits",
  configuredProps: { gitlab: { authProvisionId: "apn_kVh9AoD" }, projectId: 45672541, refName: "main" },
});
```

For AI agents, Pipedream hosts MCP servers at `https://remote.mcp.pipedream.net/v3`, selected with the headers `x-pd-project-id`, `x-pd-environment`, `x-pd-external-user-id` and `x-pd-app-slug`. `pd init connect` scaffolds a Next.js demo, an SDK playground or an MCP chat app.

## Examples

### Example 1: "Stop my Stripe workflow from sending duplicate Slack alerts"

Add the Step 2 data store to the step that posts to Slack, keyed on `steps.trigger.event.id`, with a 7-day TTL. A replayed Stripe event now ends at `$.flow.exit("Already processed")`, and the second run shows the exit message in the event inspector.

### Example 2: "We use Pipedream workflows, what do we do before March 2027?"

1. List every workflow in the dashboard and note triggers, schedules and connected apps.
2. Export each project with the export tool and keep the JSON in Git.
3. Rebuild the logic: HTTP and schedule triggers become routes or cron jobs in your own service, code steps are copied nearly as they are (replace `steps.*` with function arguments), and app calls use the vendor SDK or Pipedream Connect (`client.actions.run`) if you want managed OAuth.
4. Run old and new in parallel, then disable the Pipedream workflow. Disconnect accounts in the dashboard before 30 April 2027.

## Guidelines

- Treat Workflows as end-of-life: fix and migrate, do not expand.
- Put secrets in project variables or environment variables, never in step code; do not log `this.<app>.$auth`.
- Pre-built triggers verify provider signatures; a generic HTTP trigger does not. Never trust a body without checking a shared secret.
- `$.respond` and `$.flow.exit` need the `$` argument in `run({ steps, $ })`.
- Every data store call must be awaited; stored values must be JSON-serialisable.
- Connect environments are separate: `development` and `production` have different connected accounts and tokens.
