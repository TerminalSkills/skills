---
title: Build an API Idempotency Layer
slug: build-api-idempotency-layer
description: Build an API idempotency layer on Redis and Hono with Idempotency-Key handling, atomic claim of the key, response replay, safe concurrent-request handling and rejection of a reused key.
skills:
  - typescript
  - redis
  - hono
category: development
tags:
  - idempotency
  - api
  - reliability
  - retry
  - patterns
---

# Build an API Idempotency Layer

## The Problem

Noah leads backend at a 20-person fintech that processes payments. A customer's mobile app retries a $500 payment after a network timeout, and the payment goes through twice. Webhook deliveries are retried on timeouts too, creating duplicate events. The API cannot tell a retry from a new request, and manual refunds take days. They need idempotency: the client sends a unique key with each request; if the key was seen, the server returns the original response instead of running the handler again, and two copies of the same request arriving at once must not both run.

The common first attempt is "look up the key; if absent, take a lock; run the handler". It has a gap: request B checks the cache and finds nothing, request A finishes and releases its lock, then B takes the free lock and charges again. The fix is to claim the key in a single atomic step.

## The Solution

A [Hono](../skills/hono/SKILL.md) middleware backed by [Redis](../skills/redis/SKILL.md):

1. `SET key <processing> NX PX` claims the key atomically. Exactly one request wins; there is no separate check and lock.
2. A losing request reads the record. Same request and still processing: answer `409` with `Retry-After`. Finished: replay the stored status and body with an `Idempotent-Replayed: true` header. Different method, path or body under the same key: `422`, because that is a client bug and replaying the old answer would be wrong.
3. On success the record is replaced with the response, kept for 24 hours. On a `5xx` the key is deleted so the client can retry. Both steps run as one Lua script that checks the request still owns the key, so a slow request whose claim expired cannot overwrite a newer one.
4. Keys are scoped per account, and hashed, so one customer cannot replay or block another's key.

## Step-by-Step Walkthrough

### Step 1: Install

```bash
npm install hono @hono/node-server ioredis
npm install -D typescript @types/node
```

Set `REDIS_URL`. Bind Redis to loopback or a private network and require a password.

### Step 2: Write the middleware

```typescript
// src/idempotency/middleware.ts — Idempotency-Key handling for Hono on Redis
import type { Context, MiddlewareHandler } from "hono";
import { Redis } from "ioredis";
import { createHash, randomUUID } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

type Record_ =
  | { state: "processing"; fp: string; token: string }
  | { state: "done"; fp: string; token: string; status: number; contentType: string; body: string };

const LOCK_MS = 60_000;           // how long an in-flight request may hold the key
const DEFAULT_TTL = 24 * 60 * 60; // how long a finished response can be replayed

// Atomically: if the key still holds OUR token, replace it (or delete it when ARGV[2] is empty).
const FINISH = `
local v = redis.call('GET', KEYS[1])
if not v or cjson.decode(v).token ~= ARGV[1] then return 0 end
if ARGV[2] == '' then return redis.call('DEL', KEYS[1]) end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1`;

const replay = (r: Extract<Record_, { state: "done" }>) =>
  new Response(r.body, { status: r.status, headers: { "Content-Type": r.contentType, "Idempotent-Replayed": "true" } });

export function idempotency(opts: {
  scope: (c: Context) => string;   // e.g. the authenticated account id: keys are per caller, never global
  requiredOn?: string[];           // path prefixes where a missing key is a 400
  ttl?: number;
}): MiddlewareHandler {
  return async (c, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
    const header = c.req.header("Idempotency-Key");
    if (!header) {
      if (opts.requiredOn?.some((p) => c.req.path.startsWith(p))) return c.json({ error: "Idempotency-Key header required" }, 400);
      return next();
    }
    if (header.length > 255) return c.json({ error: "Idempotency-Key too long" }, 400);

    // Same key + different request is a client bug: reject it instead of replaying the wrong response.
    const fp = createHash("sha256").update(`${c.req.method}\n${c.req.path}\n${await c.req.text()}`).digest("hex");
    const key = `idem:${opts.scope(c)}:${createHash("sha256").update(header).digest("hex")}`;
    const token = randomUUID();

    // One atomic step both checks and claims the key; there is no window between "look" and "lock".
    const claimed = await redis.set(key, JSON.stringify({ state: "processing", fp, token }), "PX", LOCK_MS, "NX");
    if (!claimed) {
      const raw = await redis.get(key);
      if (!raw) return c.json({ error: "Retry the request" }, 409); // expired between SET and GET
      const rec: Record_ = JSON.parse(raw);
      if (rec.fp !== fp) return c.json({ error: "Idempotency-Key reused with a different request" }, 422);
      if (rec.state === "processing") return c.json({ error: "A request with this key is still in progress" }, 409, { "Retry-After": "1" });
      return replay(rec);
    }

    try {
      await next();
    } catch (err) {
      await redis.eval(FINISH, 1, key, token, "", 0); // let the client retry
      throw err;
    }
    // Hono turns handler exceptions into a 500 response; never replay those.
    if (c.res.status >= 500) {
      await redis.eval(FINISH, 1, key, token, "", 0);
      return;
    }
    const done: Record_ = {
      state: "done", fp, token, status: c.res.status,
      contentType: c.res.headers.get("content-type") ?? "application/json",
      body: await c.res.clone().text(),
    };
    await redis.eval(FINISH, 1, key, token, JSON.stringify(done), opts.ttl ?? DEFAULT_TTL);
  };
}
```

### Step 3: Mount it on the payment routes

```typescript
import { Hono } from "hono";
import { idempotency } from "./idempotency/middleware.ts";

// declare the variable your auth middleware sets, or c.get("accountId") does not type-check
const app = new Hono<{ Variables: { accountId: string } }>();
app.use("/payments/*", idempotency({ scope: (c) => c.get("accountId"), requiredOn: ["/payments"] }));
app.post("/payments", async (c) => { /* charge once */ });
```

Use the authenticated account id for `scope` (set by your auth middleware, which must run first). Make the key required on money-moving routes and optional elsewhere. Clients generate a random UUID per logical operation and reuse the same value on every retry of it.

### Step 4: Test the cases that matter

Run the app against a Redis on a spare local port and check: five simultaneous requests with one key run the handler once (one `201`, four `409`); a later retry returns the same body with `Idempotent-Replayed: true`; the same key with a different body gives `422`; the same key from another account runs separately; a handler that throws returns `500` and the retry runs again.

### Step 5: Idempotency for webhook consumers

For incoming webhooks, use the provider's event id as the key instead of a header: do the same `SET ... NX` on `webhook:<event id>` before processing, and acknowledge duplicates with `200`. Give the claim a short expiry (for example a few minutes) and delete it if processing fails, or a failed delivery can never be retried.

## Real-World Example

Noah's team enables the middleware on `POST /payments` and `POST /refunds`, makes the key mandatory there, and updates the mobile client to create the key once when the user taps "Pay" and persist it until the response arrives. They track the count of `Idempotent-Replayed` responses and of `422` responses: the first shows retries that were saved, the second shows client code that builds keys wrongly.

Their payment provider has its own idempotency keys, so the handler passes the same key on to the provider call. The middleware protects their API; the provider key protects the call that actually moves money if a crash happens between charging and saving the response.

## Related Skills

- [typescript](../skills/typescript/SKILL.md) -- types for the stored record and middleware options
- [redis](../skills/redis/SKILL.md) -- `SET NX PX`, Lua scripts and key expiry
- [hono](../skills/hono/SKILL.md) -- middleware and `Response` handling
