---
name: pipedream
category: Automation & Integration
tags: [workflow, automation, integration, serverless, api, webhooks]
version: 1.0.0
author: terminal-skills
---

# Pipedream — Developer-First Workflow Automation

You are an expert in Pipedream, the workflow automation platform built for developers. You help teams build event-driven integrations connecting 2,000+ apps using Node.js/Python code steps, pre-built triggers, and managed auth — with built-in key-value store, queues, and HTTP endpoints for complex automation that goes beyond simple no-code tools.

## Core Capabilities

### Workflow Structure

```javascript
// Pipedream workflows are sequences of steps
// Each step is a Node.js or Python module

// Step 1: Trigger (webhook, schedule, app event)
// Built-in triggers for Stripe, GitHub, Slack, etc.

// Step 2: Transform data
export default defineComponent({
  async run({ steps }) {
    const event = steps.trigger.event;
    return {
      email: event.customer.email,
      amount: event.amount / 100,
      currency: event.currency.toUpperCase(),
    };
  },
});

// Step 3: Use a pre-built app action
// Pipedream handles OAuth, API calls, retries
export default defineComponent({
  props: {
    slack: { type: "app", app: "slack" },
  },
  async run({ steps }) {
    await this.slack.chat.postMessage({
      channel: "#payments",
      text: `💰 New payment: $${steps.transform.$return_value.amount}`,
    });
  },
});

// Step 4: Custom code with npm packages
export default defineComponent({
  async run({ steps }) {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // Full access to any npm package
  },
});
```

### Data Store (Key-Value)

```javascript
// Built-in KV store for stateful workflows
export default defineComponent({
  props: {
    db: { type: "data_store" },
  },
  async run({ steps }) {
    // Track processed items to prevent duplicates
    const processed = await this.db.get(steps.trigger.event.id);
    if (processed) return $.flow.exit("Already processed");

    // Process and mark as done
    await doWork(steps.trigger.event);
    await this.db.set(steps.trigger.event.id, { processedAt: new Date().toISOString() });
  },
});
```

### HTTP Endpoints

```javascript
// Create custom API endpoints
export default defineComponent({
  async run({ steps }) {
    // This workflow has an HTTP trigger
    // POST https://your-id.m.pipedream.net
    const { body, headers } = steps.trigger.event;

    // Validate webhook signature
    const signature = headers["x-webhook-signature"];
    if (!verifySignature(body, signature)) {
      await $.respond({ status: 401, body: "Invalid signature" });
      return $.flow.exit("Unauthorized");
    }

    // Process and respond
    const result = await processWebhook(body);
    await $.respond({ status: 200, body: JSON.stringify(result) });
  },
});
```

## Installation

```bash
# No installation — browser-based workflow builder
# https://pipedream.com

# CLI for local development
npm install -g @pipedream/cli
pd login
pd deploy workflow.yaml
```

## Best Practices

1. **Code steps for logic** — Use code steps for data transformation, conditional logic, and custom API calls; app steps for standard operations
2. **Data stores for state** — Use built-in KV stores for deduplication, counters, and workflow state; no external database needed
3. **HTTP triggers for webhooks** — Create webhook endpoints that transform and route events to other services
4. **Error handling** — Use try/catch in code steps; configure automatic retries for transient failures
5. **Managed auth** — Let Pipedream handle OAuth tokens; connect accounts once, use across all workflows
6. **npm packages** — Import any npm package with `await import("package")`; runs on Node.js 18+
7. **Workflow concurrency** — Configure max concurrent executions to prevent overwhelming downstream services
8. **Version control** — Export workflows as YAML; store in Git for version control and team collaboration
