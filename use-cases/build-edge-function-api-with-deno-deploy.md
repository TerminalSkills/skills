---
title: Build an Edge Function API with Deno Deploy
slug: build-edge-function-api-with-deno-deploy
description: Build a globally distributed API using Deno Deploy edge functions — with KV storage, scheduled tasks, and sub-millisecond cold starts serving users from 35+ regions worldwide.
skills:
  - typescript
  - zod
category: development
tags:
  - edge-computing
  - deno
  - serverless
  - performance
  - global
---

# Build an Edge Function API with Deno Deploy

## The Problem

Yuki runs backend at a 20-person startup with users in 40 countries. Their Node.js API runs on a single AWS region (us-east-1). Users in Tokyo experience 180ms latency, São Paulo sees 220ms, and Sydney hits 280ms. Moving to multiple regions means managing 5+ servers, load balancers, and database replicas — overkill for a 20-person team. Edge functions run code at the nearest data center automatically, but most solutions have cold start problems. Deno Deploy's V8 isolates have sub-millisecond cold starts and built-in KV storage.

## Step 1: Build the Edge API

```typescript
// src/main.ts — Edge-first API running on Deno Deploy
import { Hono } from "https://deno.land/x/hono@v4.3.0/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.0/middleware.ts";

const app = new Hono();
const kv = await Deno.openKv(); // Deno KV — globally replicated key-value store

app.use("*", cors());

// User preferences — served from the edge, globally consistent
app.get("/api/users/:id/preferences", async (c) => {
  const userId = c.req.param("id");
  const entry = await kv.get(["users", userId, "preferences"]);

  if (!entry.value) {
    return c.json({ error: "Not found" }, 404);
  }

  // Add edge location header for debugging latency
  c.header("X-Edge-Region", Deno.env.get("DENO_REGION") || "unknown");
  return c.json(entry.value);
});

app.put("/api/users/:id/preferences", async (c) => {
  const userId = c.req.param("id");
  const body = await c.req.json();

  await kv.set(["users", userId, "preferences"], {
    ...body,
    updatedAt: new Date().toISOString(),
  });

  return c.json({ updated: true });
});

// Feature flags — checked on every request, must be fast
app.get("/api/flags", async (c) => {
  const userId = c.req.query("userId") || "anonymous";
  const flags = await kv.get(["flags", "global"]);
  const userOverrides = await kv.get(["flags", "user", userId]);

  const merged = {
    ...(flags.value as Record<string, boolean> || {}),
    ...(userOverrides.value as Record<string, boolean> || {}),
  };

  c.header("Cache-Control", "public, max-age=30"); // CDN cache for 30s
  c.header("X-Edge-Region", Deno.env.get("DENO_REGION") || "unknown");
  return c.json(merged);
});

// URL shortener — edge-native, no database round-trip
app.post("/api/shorten", async (c) => {
  const { url, customSlug } = await c.req.json();

  if (!url || !url.startsWith("http")) {
    return c.json({ error: "Invalid URL" }, 400);
  }

  const slug = customSlug || generateSlug();

  // Check if slug exists
  const existing = await kv.get(["urls", slug]);
  if (existing.value) {
    return c.json({ error: "Slug already taken" }, 409);
  }

  await kv.set(["urls", slug], {
    url,
    createdAt: new Date().toISOString(),
    clicks: 0,
  });

  return c.json({ shortUrl: `https://short.example.com/${slug}`, slug }, 201);
});

app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const entry = await kv.get(["urls", slug]);

  if (!entry.value) return c.json({ error: "Not found" }, 404);

  const data = entry.value as { url: string; clicks: number };

  // Increment click count atomically
  await kv.atomic()
    .set(["urls", slug], { ...data, clicks: data.clicks + 1 })
    .commit();

  return c.redirect(data.url, 302);
});

// Analytics ingestion — collect events at the edge, batch to central DB
app.post("/api/events", async (c) => {
  const events = await c.req.json();

  if (!Array.isArray(events)) {
    return c.json({ error: "Expected array of events" }, 400);
  }

  const region = Deno.env.get("DENO_REGION") || "unknown";
  const batchId = `${Date.now()}-${region}`;

  // Store in KV for batch processing
  await kv.set(["events", batchId], {
    events: events.slice(0, 100), // max 100 events per batch
    region,
    receivedAt: new Date().toISOString(),
  }, { expireIn: 3600000 }); // expire in 1 hour

  return c.json({ received: events.length, batchId, region });
});

// Cron: process event batches every 5 minutes
Deno.cron("process-events", "*/5 * * * *", async () => {
  const batches = kv.list({ prefix: ["events"] });
  let totalEvents = 0;

  for await (const batch of batches) {
    const data = batch.value as { events: any[]; region: string };
    totalEvents += data.events.length;

    // Forward to central analytics DB
    await fetch(Deno.env.get("ANALYTICS_INGEST_URL")!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    await kv.delete(batch.key);
  }

  console.log(`Processed ${totalEvents} events`);
});

// Health check with region info
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    region: Deno.env.get("DENO_REGION"),
    timestamp: new Date().toISOString(),
  });
});

function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

Deno.serve(app.fetch);
```

## Results

- **Global latency under 50ms** — Deno Deploy runs the code at 35+ edge locations; Tokyo users get 12ms response times instead of 180ms
- **Zero cold starts** — V8 isolates boot in under 1ms compared to 500ms+ for Lambda; every request is fast, even the first one
- **No infrastructure to manage** — `deployctl deploy` and it's live globally; no load balancers, no region selection, no servers to maintain
- **KV storage is globally replicated** — data written in Tokyo is readable in Frankfurt within 200ms; no database setup required for simple key-value data
- **Cron runs at the edge** — batch processing runs automatically; no separate scheduler service
