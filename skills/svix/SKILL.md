---
name: svix
description: >-
  Svix is a webhook sending service (open source and hosted) that signs, delivers and retries
  webhooks to your customers' endpoints and gives them a portal with delivery logs. Use when adding
  outgoing webhooks to a product, verifying incoming Svix or Standard Webhooks signatures, managing
  customer endpoints and event types, or embedding the Svix app portal. Covers the Node SDK (svix).
license: Apache-2.0
compatibility: "Node.js with the svix npm package (2.x); a Svix Cloud API token or a self-hosted server"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["webhooks", "svix", "delivery", "retries", "signature-verification"]
  repository: "https://github.com/svix/svix-webhooks"
---

# Svix

## Overview

Svix handles the sending side of webhooks: you post a message for an application (one per customer), and Svix signs it, delivers it to each subscribed endpoint, retries failures, and records every attempt. The signature scheme is Standard Webhooks (HMAC-SHA256 with `whsec_` secrets), so receivers can verify with any Svix or Standard Webhooks library. Svix is open source and can be self-hosted. This skill uses the `svix` npm package, version 2.8.0 checked (2026-10-08); libraries also exist for Python, Go, Java, Ruby, Rust, C# and others.

## Instructions

1. Install: `npm install svix`. Create the client with a server-side API token: `new Svix(process.env.SVIX_AUTH_TOKEN!)`. Cloud tokens end in a region suffix (for example `.us`, `.eu`) that selects the API host automatically; for a self-hosted server pass `{ serverUrl: "https://svix.internal.example" }` as the second argument. Never ship the token to a browser.
2. Declare event types once: `svix.eventType.create({ name: "order.created", description: "An order was placed" })`. Endpoints subscribe by name.
3. Create one application per customer: `svix.application.create({ name: "Northwind Traders", uid: "customer-42" })`; the `uid` lets you address it by your own ID afterwards.
4. Customers (or you) add endpoints: `svix.endpoint.create("customer-42", { url, eventTypes: [...], channels: [...], throttleRate: 50 })`. The fields are `eventTypes` (not `filterTypes`) and `throttleRate` in messages per second (not `rateLimit`). Omit `eventTypes` to receive everything. The signing secret comes back from `svix.endpoint.getSecret(appId, endpointId)`.
5. Send: `svix.message.create("customer-42", { eventType: "order.created", payload: {...}, eventId: "ord-123" })`. `eventId` is your own idempotency key. The payload should be small and carry IDs; consumers fetch details through your API.
6. Receiving side: verify with the raw body. In svix 2.x `wh.verify(rawBody, headers)` returns nothing (it throws on a bad signature), so parse the JSON yourself afterwards. Headers are `svix-id`, `svix-timestamp`, `svix-signature`, and the `webhook-*` equivalents are accepted too. Timestamps outside the tolerance window are rejected, which blocks replays.
7. Customer self-service: `const { url } = await svix.authentication.appPortalAccess("customer-42", {})` returns a single-use magic link to the app portal (endpoint management, logs, replays). Options include `featureFlags`, `readOnly` / `capabilities`, `sessionId` and `expiry` (seconds, 1 hour to 7 days, default 7 days). Embed it in an iframe with `allow="clipboard-write"` or with `svix-react`'s `<AppPortal url={...} />`.
8. Retries: 8 attempts per endpoint at roughly 0, 5s, 5m, 30m, 2h, 5h, 10h and 10h after the previous failure (about 27 hours in total). Then the message is marked failed and an operational webhook `message.attempt.exhausted` is available. Endpoints failing continuously for 5 days are disabled automatically (configurable in the dashboard). Replay failed messages from the portal or the API.

## Examples

### Example 1: Send an order event to one customer

**User request:** "When an order is placed, send a webhook to that customer's endpoints."

```typescript
import { Svix } from "svix";

const svix = new Svix(process.env.SVIX_AUTH_TOKEN!);

await svix.endpoint.create("customer-42", {
  url: "https://hooks.northwind.example/svix",
  eventTypes: ["order.created", "order.shipped"],
  throttleRate: 50,
});

await svix.message.create("customer-42", {
  eventType: "order.created",
  eventId: "ord-123",
  payload: { id: "ord-123", total: 99.99, currency: "USD", createdAt: new Date().toISOString() },
});
```

**Result:** Svix signs and POSTs the payload to the endpoint, retries on non-2xx responses, and the attempt shows up in the customer's portal.

### Example 2: Verify incoming webhooks in Express

**User request:** "Verify Svix signatures on my /webhooks route."

```typescript
import express from "express";
import { Webhook } from "svix";

const app = express();

app.post("/webhooks", express.raw({ type: "application/json" }), (req, res) => {
  const wh = new Webhook(process.env.SVIX_SIGNING_SECRET!); // whsec_...
  try {
    wh.verify(req.body, req.headers as Record<string, string>);
  } catch {
    return res.status(400).json({ error: "Invalid signature" });
  }
  const event = JSON.parse(req.body.toString());
  handleEvent(event); // dedupe on the svix-id header
  res.status(200).json({ received: true });
});
```

**Result:** a tampered body or wrong secret returns 400 (the SDK throws "No matching signature found"); a valid delivery returns 200 and stops the retries. Do not mount `express.json()` before this route.

### Example 3: Give a customer the portal

```typescript
const { url } = await svix.authentication.appPortalAccess("customer-42", {
  featureFlags: ["orders"],
});
res.json({ url }); // the frontend opens it in an iframe or a new tab
```

## Guidelines

- Always verify against the unparsed body; a re-serialized JSON body will fail the signature check.
- Consumers must be idempotent: retries and replays deliver the same `svix-id` more than once. Return 2xx quickly and do heavy work asynchronously.
- Keep payloads small and free of secrets; endpoints are customer-controlled URLs.
- Store the signing secret in an environment variable per endpoint.
- The portal URL is single-use, and the session it opens lasts up to 7 days by default (`expiry`): generate it on demand, never cache or log it, and shorten `expiry` for sensitive apps.
- If you only need to receive webhooks from a vendor that already uses Svix, you need only `Webhook.verify`, not the full client.
