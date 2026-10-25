---
name: zapier
description: >-
  Zapier is a cloud automation platform that connects thousands of apps with
  no-code workflows called Zaps (trigger-then-action chains), plus optional
  JavaScript code steps, webhooks, and a developer platform for building
  custom integrations. Use when a user asks to connect apps without code,
  automate repetitive tasks, sync data between SaaS tools, trigger a workflow
  from a webhook, or publish a custom Zapier integration.
license: Apache-2.0
compatibility: '7000+ app integrations (cloud service, no self-hosting)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: automation
  repository: https://github.com/zapier/zapier-platform
  tags: "zapier, automation, integration, no-code, workflow"
---

# Zapier

## Overview

Zapier connects thousands of apps through Zaps: Trigger → Action chains, where something happening in one app runs a step (or several) in another. Most Zaps need no code; a Code step adds JavaScript or Python for transforms a built-in step can't do, and the Zapier Platform CLI lets a developer publish their own app as a Zapier integration with triggers and actions other users can connect to.

## Instructions

### Common Zap patterns

```text
Trigger → Action examples:
1. New Stripe payment → Add row to Google Sheets → Send Slack notification
2. New form submission (Typeform) → Create contact in HubSpot → Send welcome email
3. New GitHub issue → Create Trello card → Notify on Discord
4. New email (Gmail) with attachment → Save to Google Drive → Notify on Slack
5. Scheduled (every day 9 AM) → Pull data from an API → Post a summary to Slack
```

### Webhooks (custom triggers)

"Webhooks by Zapier" gives each Zap a unique catch URL. Posting JSON to it starts that Zap, so your own app can trigger a workflow without a native Zapier integration:

```typescript
await fetch("https://hooks.zapier.com/hooks/catch/21934850/3x7k2pq/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event: "order_completed",
    customer_email: "dana.reyes@northfieldoutfitters.com",
    order_total: 249.0,
    product: "Trailhead Jacket",
  }),
});
```

A Zap can also call out *from* Zapier with a webhook action step (`POST`/`PUT`/`GET` to a URL you control) instead of a native app action.

### Code steps (JavaScript or Python)

"Code by Zapier" runs a step of JavaScript (Node) or Python between trigger and action. Data from earlier steps is already in scope as `inputData`; the step's result is the array or object you assign to `output`:

```javascript
// inputData is injected by Zapier — do not redeclare it
const fullName = `${inputData.firstName} ${inputData.lastName}`;
const totalSpent = parseFloat(inputData.totalSpent || "0");

output = [{
  fullName,
  email: inputData.email.toLowerCase(),
  isVIP: totalSpent > 1000,
  segment: totalSpent > 1000 ? "vip" : "regular",
}];
```

A Code step uses 1 task per run at the standard runtime (more if you extend the runtime); the included runtime per step is 1 second on Free and 30 seconds on Professional and Team, so keep code steps small and side-effect-free.

### Build a Zapier integration (Platform CLI)

To make your own app appear as a Zapier trigger/action for other users, build an integration with the Platform CLI:

```bash
npm install -g zapier-platform-cli
zapier-platform login
zapier-platform init northfield-crm --template minimal
cd northfield-crm && npm install
```

```javascript
// triggers/newOrder.js
const newOrder = async (z, bundle) => {
  const response = await z.request({
    url: "https://api.northfieldoutfitters.com/orders",
    params: { since: bundle.meta.page },
  });
  return response.data;
};

module.exports = {
  key: "newOrder",
  noun: "Order",
  display: { label: "New Order", description: "Triggers when a new order is created." },
  operation: { perform: newOrder },
};
```

```javascript
// actions/createContact.js
const createContact = async (z, bundle) => {
  const response = await z.request({
    method: "POST",
    url: "https://api.northfieldoutfitters.com/contacts",
    body: { email: bundle.inputData.email, name: bundle.inputData.name },
  });
  return response.data;
};

module.exports = {
  key: "createContact",
  noun: "Contact",
  display: { label: "Create Contact" },
  operation: { perform: createContact, inputFields: [{ key: "email", required: true }, { key: "name" }] },
};
```

Wire both into `index.js`'s `triggers`/`creates` maps, then `zapier-platform test` and, for a new integration, `zapier-platform register` once. `zapier-platform push` uploads a version, and `zapier-platform promote <version>` makes it available to all users. `z.request` is the SDK's HTTP client (it logs each call for debugging); `bundle.inputData` carries the fields a user mapped in, `bundle.meta.page` carries pagination state during a polling trigger.

## Examples

### Build a lead-routing Zap

**User prompt:** "When someone submits our Typeform contact form, create a contact in HubSpot, and if they picked 'Enterprise' as company size, also post a notification to our #enterprise-leads Slack channel."

The agent will:
1. Set the trigger to Typeform's "New Entry" for the specific form.
2. Add a HubSpot "Create or Update Contact" action mapping the Typeform fields.
3. Add a Paths (branching) step (this makes the Zap multi-step, so it needs a paid plan, not Free) with a condition on the company-size field equal to `Enterprise`.
4. Inside that path, add a Slack "Send Channel Message" action to `#enterprise-leads`.

### Trigger a Zap from a backend job

**User prompt:** "Our checkout service should kick off a Zap that logs the order to a spreadsheet and emails ops, without us building a native Zapier integration."

The agent will:
1. Create a Zap with a "Webhooks by Zapier" → "Catch Hook" trigger and copy its catch URL.
2. Add a Google Sheets "Create Spreadsheet Row" action and a Gmail "Send Email" action, mapping the webhook's JSON fields into both.
3. In the checkout service, `POST` the order JSON to the catch URL right after payment confirmation, with retry-on-failure since the webhook call is fire-and-forget.

## Guidelines

- Plans (checked October 2026): **Free** — 100 tasks/month, Zaps limited to two steps, 15-minute trigger polling. **Professional** — from $19.99/month (billed annually) at 750 tasks, unlimited Zap length within the task allowance. **Team** — from $69/month, shared workspace, 1-minute polling. Enterprise is custom. Confirm current numbers on zapier.com/pricing before quoting a price to a user.
- A "task" is one successfully completed action step; a failed step, a trigger poll, and built-in tools (Filter, Formatter, Paths) don't consume a task. A 5-action Zap that runs once uses 5 tasks.
- For a self-hosted alternative with no task metering, consider n8n or Activepieces; neither is a drop-in replacement for Zapier's app catalog size.
- Use Paths for branching logic instead of multiple near-duplicate Zaps; use Filter steps to stop a Zap early when conditions aren't met (this doesn't consume a task).
- A webhook catch URL has no built-in auth — anyone who has it can trigger the Zap. Validate the payload inside the Zap (a Filter step) if the source isn't trustworthy, and don't log the catch URL anywhere public.
- Zapier also offers an MCP server (docs.zapier.com/mcp) that lets an AI agent call your connected apps' actions directly, separate from building a Zap; use that instead of Zaps when the goal is giving an LLM agent tool access rather than automating a fixed workflow.
