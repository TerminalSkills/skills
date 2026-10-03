---
name: val-town
description: >-
  Write and deploy server-side TypeScript functions instantly with Val Town.
  Use when someone asks to "deploy a function quickly", "serverless TypeScript",
  "quick API endpoint", "webhook handler", "cron job in the cloud", "Val Town",
  "instant API without infrastructure", or "deploy a script without a server".
  Covers HTTP, cron and email triggers, SQLite storage, environment variables, and the vt CLI.
license: Apache-2.0
compatibility: "Browser, or the vt CLI (needs Deno). Deno-based TypeScript runtime."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["serverless", "typescript", "functions", "val-town", "cron"]
---

# Val Town

## Overview

Val Town is a platform for writing and deploying TypeScript and JavaScript instantly: no infrastructure, no build step. A val is a versioned folder of files that is deployed as you edit, like a repository that can run. A file can be triggered by an HTTP request, a schedule (cron) or an incoming email, and each val has a private SQLite database, blob storage, environment variables, and npm or URL imports. The runtime is Deno. Changes deploy within about 100 ms.

## When to Use

- A quick API endpoint or webhook handler (minutes, not hours)
- Scheduled tasks without managing servers
- Prototyping before building proper infrastructure
- Glue code between services (fetch from API A, transform, POST to API B)
- Small amounts of data in the built-in SQLite database

## Instructions

Create a val in the browser (name it, then use "+ Add trigger" on a file to choose HTTP, Cron or Email) or from your machine with the `vt` CLI. HTTP vals are served at `[name].val.run`.

### HTTP trigger (API endpoint)

The default export takes a standard `Request` and returns a `Response` (frameworks such as Hono work too).

```typescript
// index.http.tsx (HTTP trigger)
export default async function (req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const name = url.searchParams.get("name") ?? "World";
    return Response.json({ message: `Hello, ${name}!` });
  }

  if (req.method === "POST") {
    const body = await req.json();
    return Response.json({ received: body, timestamp: Date.now() });
  }

  return new Response("Method not allowed", { status: 405 });
}
```

### Cron trigger (scheduled task)

The handler receives an `Interval` (`{ lastRunAt: Date | undefined }`); its return value is ignored. Schedules are either a simple interval or a cron expression, always evaluated in UTC. The Free plan allows a run every 15 minutes at most, Pro every minute.

```typescript
// daily-report (cron trigger)
export default async function (interval: Interval) {
  const response = await fetch("https://api.northwind.dev/v1/stats/daily");
  const stats = await response.json();

  await fetch(Deno.env.get("SLACK_WEBHOOK_URL")!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `Daily report since ${interval.lastRunAt ?? "first run"}: ${stats.signups} signups` }),
  });
}
```

### Email trigger

Each email val gets an address like `yourname@valtown.email`. The handler receives an `Email` object (`from`, `to`, `subject`, `text`, `html`, `attachments`, `headers`); inbound mail, attachments included, must be under 30 MB.

```typescript
// inbox (email trigger)
export default async function (email: Email) {
  console.log("Email received", email.from, email.subject);
  for (const file of email.attachments) console.log(`Attachment: ${file.name}`);
}
```

### SQLite storage

Every val has its own private SQLite database (Turso-backed; 10 MB on Free, up to 1 GB on Pro). The older per-account global database is legacy. Results have `columns`, `rows`, `rowsAffected` and `lastInsertRowid`.

```typescript
// todos.http.tsx
import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";

await sqlite.execute(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export default async function (req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const result = await sqlite.execute("SELECT * FROM todos ORDER BY created_at DESC");
    return Response.json(result.rows);
  }
  if (req.method === "POST") {
    const { title } = await req.json();
    await sqlite.execute({ sql: "INSERT INTO todos (title) VALUES (:title)", args: { title } });
    return Response.json({ ok: true }, { status: 201 });
  }
  if (req.method === "DELETE") {
    const id = Number(url.searchParams.get("id"));
    await sqlite.execute({ sql: "DELETE FROM todos WHERE id = :id", args: { id } });
    return Response.json({ ok: true });
  }
  return new Response("Not found", { status: 404 });
}
```

Use `sqlite.batch([...])` to run several statements together.

### Webhook handler with signature check

```typescript
// stripe.http.tsx
import Stripe from "npm:stripe";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);

export default async function (req: Request): Promise<Response> {
  const signature = req.headers.get("stripe-signature")!;
  const body = await req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature, Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
      undefined, Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    console.log("Paid:", event.data.object.id);
  }
  return Response.json({ received: true });
}
```

### Working locally with vt

```bash
deno install -grAf jsr:@valtown/vt   # install (requires Deno)
vt                                   # first run: sign in and create an API key
vt clone maria/invoice-webhook  # also: vt create, vt pull, vt push, vt watch, vt tail
```
Set `VAL_TOWN_API_KEY` instead of the browser sign-in in CI. `vt push` overwrites without asking; `vt pull` may prompt.

## Examples

### Example 1: Quick monitoring endpoint

**User prompt:** "I need a quick URL that checks if my website is up and returns the status."

Create an HTTP val whose handler does `const start = Date.now(); const res = await fetch("https://shop.northwind.dev/health")` and returns `Response.json({ up: res.ok, status: res.status, ms: Date.now() - start })`. Opening `https://[name].val.run` shows `{"up":true,"status":200,"ms":143}`.

### Example 2: GitHub webhook to Slack

**User prompt:** "When someone stars my GitHub repo, send a message to my Slack channel."

Create an HTTP val, add `SLACK_WEBHOOK_URL` in the val's environment variables, and point a GitHub webhook (event "Watch") at the val URL. The handler checks `req.headers.get("x-github-event") === "watch"`, then POSTs `{ text: "New star from <login>" }` to Slack. A star shows up in the channel within seconds.

## Guidelines

- Handlers are standard Web API: `Request` in, `Response` out.
- Read secrets with `Deno.env.get("NAME")` or `process.env.NAME`; set them in the val's settings. Changes apply on the next request without redeploying, and code cannot change them at runtime. Never hard-code keys: public vals expose their source (values stay hidden).
- Free plan: unlimited public vals, 100,000 runs a day, 1 minute wall-clock time per run, 15-minute cron minimum, 3 days of logs, no private vals or custom domains. Pro raises these (private vals, 1-minute cron, 10-minute runs). Check val.town/pricing for current numbers.
- npm packages use the `npm:` specifier; other vals import by URL from `esm.town`.
- Always verify webhook signatures (Stripe, GitHub) before acting on the payload.
- Cron expressions are UTC; the Free plan cannot run more often than every 15 minutes.
- Best for webhooks, cron and prototypes; use dedicated infrastructure for high-traffic or latency-critical production APIs.
