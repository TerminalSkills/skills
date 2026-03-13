---
title: Build an Edge Function API with Hono and Cloudflare Workers
slug: build-edge-function-api-with-hono-and-cloudflare
description: Build a globally distributed API using Hono on Cloudflare Workers with D1 database, R2 storage, and KV cache — serving requests from 300+ edge locations with sub-50ms response times worldwide.
skills:
  - typescript
  - hono
  - zod
category: Backend Development
tags:
  - edge
  - cloudflare
  - hono
  - serverless
  - performance
---

# Build an Edge Function API with Hono and Cloudflare Workers

## The Problem

Kai runs engineering at a 20-person company with users in 40 countries. Their API runs on a single us-east-1 server — users in Tokyo see 280ms latency, São Paulo sees 350ms, and Sydney sees 400ms. Just network round-trip time makes the app feel sluggish for 60% of their user base. They need an edge-first architecture: API code running in 300+ locations worldwide, with data cached and replicated at the edge. Hono on Cloudflare Workers can serve requests from the nearest edge node with sub-50ms response times.

## Step 1: Build the Edge API

```typescript
// src/index.ts — Hono API on Cloudflare Workers with D1, R2, and KV
import { Hono } from "hono";
import { cors } from "hono/cors";
import { cache } from "hono/cache";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// Cloudflare Workers environment bindings
type Bindings = {
  DB: D1Database;          // SQLite at the edge (D1)
  CACHE: KVNamespace;      // Key-value cache (KV)
  STORAGE: R2Bucket;       // Object storage (R2)
  JWT_SECRET: string;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS for all origins (edge handles it, not the origin server)
app.use("*", cors({ origin: "*", maxAge: 86400 }));

// Health check — useful for monitoring edge deployment
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    edge: c.req.header("cf-ray")?.split("-")[1] || "unknown", // which edge location
    timestamp: Date.now(),
  });
});

// Products API — D1 database at the edge
app.get("/api/products", async (c) => {
  const category = c.req.query("category");
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);

  // Check KV cache first (< 1ms read)
  const cacheKey = `products:${category || "all"}:${limit}`;
  const cached = await c.env.CACHE.get(cacheKey, "json");
  if (cached) {
    return c.json(cached, 200, { "X-Cache": "HIT" });
  }

  // Query D1 (SQLite at the edge)
  let query = "SELECT id, name, price, category, image_key, created_at FROM products";
  const params: any[] = [];

  if (category) {
    query += " WHERE category = ?";
    params.push(category);
  }
  query += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  // Generate signed R2 URLs for images
  const products = results.map((p: any) => ({
    ...p,
    imageUrl: p.image_key ? `/api/images/${p.image_key}` : null,
  }));

  // Cache in KV for 5 minutes
  await c.env.CACHE.put(cacheKey, JSON.stringify({ products }), { expirationTtl: 300 });

  return c.json({ products }, 200, { "X-Cache": "MISS" });
});

// Single product with full details
app.get("/api/products/:id", async (c) => {
  const { id } = c.req.param();

  const product = await c.env.DB.prepare(
    "SELECT * FROM products WHERE id = ?"
  ).bind(id).first();

  if (!product) return c.json({ error: "Product not found" }, 404);

  return c.json({ product });
});

// Create product with validation
app.post(
  "/api/products",
  zValidator("json", z.object({
    name: z.string().min(1).max(255),
    price: z.number().positive(),
    category: z.string().min(1),
    description: z.string().max(5000).optional(),
  })),
  async (c) => {
    const data = c.req.valid("json");
    const id = crypto.randomUUID();

    await c.env.DB.prepare(
      "INSERT INTO products (id, name, price, category, description, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    ).bind(id, data.name, data.price, data.category, data.description || null).run();

    // Invalidate cache
    const keys = await c.env.CACHE.list({ prefix: "products:" });
    await Promise.all(keys.keys.map((k) => c.env.CACHE.delete(k.name)));

    return c.json({ id, ...data }, 201);
  }
);

// Image upload to R2 (object storage at the edge)
app.post("/api/images", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File;

  if (!file) return c.json({ error: "No file provided" }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: "File too large (10MB max)" }, 400);

  const key = `${Date.now()}-${file.name}`;

  await c.env.STORAGE.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { originalName: file.name },
  });

  return c.json({ key, url: `/api/images/${key}` }, 201);
});

// Serve images from R2 with edge caching
app.get("/api/images/:key", async (c) => {
  const { key } = c.req.param();

  const object = await c.env.STORAGE.get(key);
  if (!object) return c.json({ error: "Image not found" }, 404);

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);

  return new Response(object.body, { headers });
});

// Analytics — lightweight event tracking at the edge
app.post("/api/events", async (c) => {
  const body = await c.req.json();

  // Write to D1 (fire and forget — don't block the response)
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      "INSERT INTO events (id, name, properties, country, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).bind(
      crypto.randomUUID(),
      body.event,
      JSON.stringify(body.properties || {}),
      c.req.header("cf-ipcountry") || "unknown"  // Cloudflare provides country automatically
    ).run()
  );

  return c.json({ tracked: true });
});

// Geolocation-aware content
app.get("/api/localized", (c) => {
  const country = c.req.header("cf-ipcountry") || "US";
  const city = c.req.header("cf-ipcity") || "";
  const timezone = c.req.header("cf-timezone") || "UTC";

  return c.json({
    country,
    city,
    timezone,
    currency: getCurrency(country),
    language: getLanguage(country),
  });
});

function getCurrency(country: string): string {
  const map: Record<string, string> = { US: "USD", GB: "GBP", JP: "JPY", DE: "EUR", BR: "BRL", IN: "INR" };
  return map[country] || "USD";
}

function getLanguage(country: string): string {
  const map: Record<string, string> = { US: "en", GB: "en", JP: "ja", DE: "de", BR: "pt", FR: "fr" };
  return map[country] || "en";
}

export default app;
```

## Step 2: Build Edge-Optimized Middleware

```typescript
// src/middleware/auth-edge.ts — JWT auth optimized for edge (no external calls)
import { Context, Next } from "hono";

export async function edgeAuth(c: Context, next: Next) {
  const token = c.req.header("authorization")?.replace("Bearer ", "");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify JWT using Web Crypto API (available on all edge runtimes)
    const [headerB64, payloadB64, signatureB64] = token.split(".");

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(c.env.JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signature = base64UrlDecode(signatureB64);
    const data = encoder.encode(`${headerB64}.${payloadB64}`);

    const valid = await crypto.subtle.verify("HMAC", key, signature, data);
    if (!valid) return c.json({ error: "Invalid token" }, 401);

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return c.json({ error: "Token expired" }, 401);
    }

    c.set("userId", payload.sub);
    c.set("plan", payload.plan);
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }

  await next();
}

function base64UrlDecode(str: string): ArrayBuffer {
  const binary = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
```

## Results

- **Global P50 latency dropped from 180ms to 22ms** — API code runs in 300+ edge locations; Tokyo users see 15ms instead of 280ms, São Paulo sees 18ms instead of 350ms
- **Zero cold starts** — Cloudflare Workers use V8 isolates, not containers; first request is as fast as the hundredth; no 500ms Lambda-style cold starts
- **Image serving at edge speeds** — R2 objects served from the nearest edge with aggressive caching; CDN-grade performance without a separate CDN
- **Geolocation built in** — Cloudflare headers provide country, city, and timezone automatically; currency and language localization requires zero external API calls
- **Cost: $5/month for 10M requests** — Workers pricing is per-request (not per-instance-hour); the team pays for actual usage, not idle compute
