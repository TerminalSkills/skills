---
name: val-town-sdk
description: >-
   You are an expert in Val Town, the social platform for writing and
  deploying serverless TypeScript functions. You help developers create HTTP
  endpoints, cron jobs, email handlers, and reactive scripts that run in the
  cloud with zero infrastructure — each function (val) gets an instant URL,
  can be forked/remixed, and uses built-in SQLite, blob storage, and email
  sending.
category: Cloud & Serverless
tags: [serverless, functions, api, hosting, typescript, social-coding]
version: 1.0.0
author: terminal-skills
---

# Val Town — Social Serverless Functions

You are an expert in Val Town, the social platform for writing and deploying serverless TypeScript functions. You help developers create HTTP endpoints, cron jobs, email handlers, and reactive scripts that run in the cloud with zero infrastructure — each function (val) gets an instant URL, can be forked/remixed, and uses built-in SQLite, blob storage, and email sending.

## Core Capabilities

### HTTP Endpoints

```typescript
// @user/api — Instantly gets https://user-api.web.val.run
export default async function(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/api/hello" && req.method === "GET") {
    return Response.json({ message: "Hello from Val Town!" });
  }

  if (url.pathname === "/api/submit" && req.method === "POST") {
    const body = await req.json();

    // Built-in SQLite
    const { sqlite } = await import("https://esm.town/v/std/sqlite");
    await sqlite.execute(
      `INSERT INTO submissions (name, email, message) VALUES (?, ?, ?)`,
      [body.name, body.email, body.message],
    );

    // Built-in email
    const { email } = await import("https://esm.town/v/std/email");
    await email({ subject: `New submission from ${body.name}`, text: body.message });

    return Response.json({ success: true });
  }

  // Serve HTML
  return new Response(`
    <html><body>
      <h1>My API</h1>
      <form action="/api/submit" method="POST">
        <input name="name" placeholder="Name" />
        <input name="email" placeholder="Email" />
        <textarea name="message"></textarea>
        <button>Submit</button>
      </form>
    </body></html>
  `, { headers: { "Content-Type": "text/html" } });
}
```

### Cron Jobs

```typescript
// @user/dailyDigest — Runs on schedule
export default async function() {
  const { sqlite } = await import("https://esm.town/v/std/sqlite");
  const { email } = await import("https://esm.town/v/std/email");

  // Fetch data
  const stats = await sqlite.execute(`
    SELECT COUNT(*) as total, DATE(created_at) as day
    FROM submissions WHERE created_at > datetime('now', '-1 day')
    GROUP BY day
  `);

  // Fetch external data
  const hnTop = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5");
  const hn = await hnTop.json();

  await email({
    subject: `Daily Digest — ${new Date().toLocaleDateString()}`,
    html: `<h2>Stats</h2><p>${stats.rows[0]?.total || 0} submissions today</p>
           <h2>HN Top Stories</h2>
           <ul>${hn.hits.map(h => `<li><a href="${h.url}">${h.title}</a></li>`).join("")}</ul>`,
  });
}
// Set schedule in Val Town UI: "0 9 * * *" (9 AM daily)
```

### Blob Storage

```typescript
import { blob } from "https://esm.town/v/std/blob";

// Store
await blob.setJSON("config", { theme: "dark", apiVersion: 2 });

// Retrieve
const config = await blob.getJSON("config");

// Binary files
await blob.set("avatar.png", imageBuffer);
const avatar = await blob.get("avatar.png");
```

## Installation

```
No installation needed — write code directly at val.town
Each val gets a URL: https://username-valname.web.val.run
Import other vals: import { myFunc } from "https://esm.town/v/username/valname"
```

## Best Practices

1. **Instant deployment** — Every save deploys; no build step, no CI, no infrastructure
2. **Built-in SQLite** — Use `std/sqlite` for persistent data; no database setup needed
3. **Built-in email** — Use `std/email` to send emails; no SMTP config, just call the function
4. **Fork and remix** — Any public val can be forked; build on others' work
5. **Secrets** — Store API keys in Val Town environment variables; accessed via `Deno.env.get("KEY")`
6. **Import from URLs** — Import npm packages, other vals, or any ESM URL; Deno-compatible imports
7. **Cron scheduling** — Set cron expressions in the UI; reliable scheduled execution
8. **Free tier** — Generous free tier for hobby projects; great for prototyping, webhooks, bots, and monitoring scripts
