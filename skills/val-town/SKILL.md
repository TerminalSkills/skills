---
name: val-town
description: >-
  Write and deploy server-side TypeScript functions instantly with Val Town.
  Use when someone asks to "deploy a function quickly", "serverless TypeScript",
  "quick API endpoint", "webhook handler", "cron job in the cloud", "Val Town",
  "instant API without infrastructure", or "deploy a script without a server".
  Covers HTTP vals, cron vals, email vals, SQLite storage, and the Val Town API.
license: Apache-2.0
compatibility: "Browser or any HTTP client. Deno-compatible TypeScript runtime."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: backend
  tags: ["serverless", "typescript", "functions", "val-town", "instant-deploy", "cron"]
---

# Val Town

## Overview

Val Town is a platform for writing and deploying TypeScript functions instantly — no infrastructure, no build step, no deployment pipeline. Write a function in the browser, get a URL. HTTP endpoints, cron jobs, email handlers, and persistent SQLite storage. Think "GitHub Gists that run."

## When to Use

- Need a quick API endpoint or webhook handler (minutes, not hours)
- Scheduled tasks (cron) without managing servers
- Prototyping an idea before building proper infrastructure
- Webhook receivers for Stripe, GitHub, Slack integrations
- Glue code between services (fetch from API A, transform, POST to API B)
- Storing small amounts of data with built-in SQLite

## Instructions

### HTTP Val (API Endpoint)

```typescript
// @user/myApi — Deployed instantly at https://user-myapi.web.val.run
export default async function(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const name = url.searchParams.get("name") || "World";
    return Response.json({ message: `Hello, ${name}!` });
  }

  if (req.method === "POST") {
    const body = await req.json();
    // Process the data
    return Response.json({ received: body, timestamp: Date.now() });
  }

  return new Response("Method not allowed", { status: 405 });
}
```

### Cron Val (Scheduled Task)

```typescript
// @user/dailyReport — Runs on a schedule
export default async function() {
  // Fetch data from an API
  const response = await fetch("https://api.example.com/stats");
  const stats = await response.json();

  // Send to Slack
  await fetch(Deno.env.get("SLACK_WEBHOOK")!, {
    method: "POST",
    body: JSON.stringify({
      text: `📊 Daily Report: ${stats.users} users, ${stats.revenue} revenue`,
    }),
  });
}
```

### SQLite Storage

```typescript
// @user/todoApi — CRUD API with persistent SQLite storage
import { sqlite } from "https://esm.town/v/std/sqlite";

// Initialize table
await sqlite.execute(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export default async function(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const todos = await sqlite.execute("SELECT * FROM todos ORDER BY created_at DESC");
    return Response.json(todos.rows);
  }

  if (req.method === "POST") {
    const { title } = await req.json();
    await sqlite.execute("INSERT INTO todos (title) VALUES (?)", [title]);
    return Response.json({ ok: true }, { status: 201 });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    await sqlite.execute("DELETE FROM todos WHERE id = ?", [id]);
    return Response.json({ ok: true });
  }

  return new Response("Not found", { status: 404 });
}
```

### Webhook Handler

```typescript
// @user/stripeWebhook — Handle Stripe webhooks
export default async function(req: Request): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  // Verify webhook signature
  // In Val Town, use Deno.env.get() for secrets
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  const event = JSON.parse(body);

  switch (event.type) {
    case "checkout.session.completed":
      // Handle successful payment
      await fetch("https://api.myapp.com/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: event.data.object.customer }),
      });
      break;

    case "customer.subscription.deleted":
      // Handle cancellation
      break;
  }

  return Response.json({ received: true });
}
```

## Examples

### Example 1: Quick monitoring endpoint

**User prompt:** "I need a quick URL that checks if my website is up and returns the status."

The agent will create an HTTP val that fetches the target URL, measures response time, and returns a JSON status report.

### Example 2: GitHub webhook to Slack

**User prompt:** "When someone stars my GitHub repo, send a message to my Slack channel."

The agent will create an HTTP val that handles GitHub webhook events, filters for star events, and posts to a Slack webhook URL.

## Guidelines

- **HTTP vals are standard Web API** — `Request` in, `Response` out
- **Environment variables via `Deno.env.get()`** — store secrets in Val Town settings
- **SQLite is per-account** — shared across all your vals, persistent
- **Free tier: 10 vals, 100 cron runs/day** — enough for prototyping
- **Import from URLs** — `import { x } from "https://esm.town/v/user/module"`
- **Deno runtime** — use Deno APIs, npm packages via `npm:package` specifier
- **No cold starts** — vals are always warm, sub-50ms response times
- **Use for glue code** — connect APIs, transform data, automate workflows
- **Not for production traffic** — great for webhooks, cron, prototypes; use proper infra for high-traffic APIs
