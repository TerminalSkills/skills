---
name: deno-deploy
description: >-
   You are an expert in Deno Deploy, the globally distributed serverless
  platform by Deno. You help developers deploy TypeScript/JavaScript
  applications to 35+ edge locations with zero cold starts, built-in KV
  storage, BroadcastChannel for real-time, cron scheduling, and npm
  compatibility — running code within milliseconds of users worldwide without
  managing infrastructure.
category: Cloud & Serverless
tags: [deno, edge, serverless, typescript, v8, deploy, global]
version: 1.0.0
author: terminal-skills
---

# Deno Deploy — Global Edge Serverless Platform

You are an expert in Deno Deploy, the globally distributed serverless platform by Deno. You help developers deploy TypeScript/JavaScript applications to 35+ edge locations with zero cold starts, built-in KV storage, BroadcastChannel for real-time, cron scheduling, and npm compatibility — running code within milliseconds of users worldwide without managing infrastructure.

## Core Capabilities

### Edge Functions

```typescript
// main.ts — runs on Deno Deploy edge
import { Hono } from "jsr:@hono/hono";

const app = new Hono();

// KV storage (built-in, globally replicated)
const kv = await Deno.openKv();

app.get("/api/visits", async (c) => {
  const result = await kv.get(["visits", "total"]);
  return c.json({ visits: result.value ?? 0 });
});

app.post("/api/visits", async (c) => {
  // Atomic increment
  const result = await kv.get(["visits", "total"]);
  const current = (result.value as number) ?? 0;
  await kv.atomic()
    .check(result)                        // Optimistic concurrency
    .set(["visits", "total"], current + 1)
    .commit();
  return c.json({ visits: current + 1 });
});

// URL shortener
app.post("/api/shorten", async (c) => {
  const { url } = await c.req.json();
  const id = crypto.randomUUID().slice(0, 8);
  await kv.set(["urls", id], url, { expireIn: 30 * 24 * 60 * 60 * 1000 });
  return c.json({ short: `https://myapp.deno.dev/${id}` });
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await kv.get(["urls", id]);
  if (!result.value) return c.text("Not found", 404);
  return c.redirect(result.value as string);
});

// Cron (built-in scheduler)
Deno.cron("cleanup expired", "0 * * * *", async () => {
  const iter = kv.list({ prefix: ["urls"] });
  let cleaned = 0;
  for await (const entry of iter) {
    if (entry.value === null) {
      await kv.delete(entry.key);
      cleaned++;
    }
  }
  console.log(`Cleaned ${cleaned} expired URLs`);
});

// BroadcastChannel for real-time (cross-isolate communication)
const channel = new BroadcastChannel("chat");
app.get("/api/chat/stream", (c) => {
  const body = new ReadableStream({
    start(controller) {
      channel.onmessage = (e) => {
        controller.enqueue(`data: ${JSON.stringify(e.data)}\n\n`);
      };
    },
    cancel() { channel.close(); },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
});

Deno.serve(app.fetch);
```

## Installation

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Deploy
deno install -Agf jsr:@deno/deployctl
deployctl deploy --project=my-app main.ts

# Or connect GitHub repo for auto-deploy on push
```

## Best Practices

1. **Deno KV** — Use built-in KV for state; globally replicated, strongly consistent per-region, eventually consistent globally
2. **Zero cold starts** — V8 isolates boot in <5ms; no container startup like Lambda/Cloud Functions
3. **Edge-first** — Code runs in 35+ regions; users hit the nearest edge; ideal for low-latency APIs
4. **Hono for routing** — Use Hono framework for Express-like routing; lightweight, works perfectly on Deno Deploy
5. **Cron built-in** — Use `Deno.cron()` for scheduled tasks; no external cron service needed
6. **BroadcastChannel** — Use for real-time features across isolates; simpler than WebSocket servers
7. **NPM compatibility** — Import npm packages with `npm:` specifier; most Node.js libraries work
8. **Environment variables** — Set via dashboard or `deployctl`; access with `Deno.env.get("KEY")`
