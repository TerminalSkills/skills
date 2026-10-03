---
name: unkey
description: >-
  Unkey is an open-source API key management service: it issues, verifies and
  revokes API keys with built-in rate limits, usage credits, expiry, roles and
  permissions. Use when the user wants to add API key authentication to an API,
  issue keys to customers, rate limit per key, meter usage, rotate keys, or
  self-host key infrastructure instead of building it.
license: Apache-2.0
compatibility: "Node.js 18+ (or any runtime with fetch); @unkey/api 2.x; an Unkey account with an API and a root key"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/unkeyed/unkey
  tags:
    - api-keys
    - authentication
    - rate-limiting
    - usage
    - developer-platform
---

# Unkey — API Key Management

## Overview

Unkey stores hashed API keys for you and answers one question fast: "is this key valid, and what is it allowed to do?" You create keys inside an **API** (called a keyspace in the v2 docs), attach limits and permissions, and call `verifyKey` from your server on each request.

This skill targets the **v2 API and `@unkey/api` 2.x** (2.5.x at the time of writing). The old v1 SDK (`verifyKey` imported as a function, `result.valid`, `ownerId`, `remaining`, `ratelimit: { type: "fast" }`, `keys.delete({keyId})` on a flat client) is gone: v2 responses are wrapped as `{ meta, data }`, the owner is `externalId`, and rate limits are an array of named limits.

Two kinds of secret exist: a **root key** (from the dashboard, used by your backend to call Unkey; never ship it to a client) and the **API keys** you hand to your customers.

## Instructions

1. Install and configure the client:

```bash
npm install @unkey/api
export UNKEY_ROOT_KEY=...   # create it in the dashboard with only the permissions you need
export UNKEY_API_ID=...     # the api_... id of the API that will own the keys
```

```typescript
import { Unkey } from "@unkey/api";

const unkey = new Unkey({ rootKey: process.env.UNKEY_ROOT_KEY! });
```

2. Create a key (`unkey.keys.createKey`). Fields: `apiId`, `prefix`, `name`, `externalId` (your customer id), `meta`, `roles`, `permissions`, `expires` (Unix ms), `credits` (`{ remaining, refill? }`), `ratelimits` (array of `{ name, limit, duration (ms), autoApply }`), `enabled`, `recoverable`, `byteLength` (default 16). The response is `{ data: { key, keyId } }`; `key` is shown once.

3. Verify on every request (`unkey.keys.verifyKey`). Send `key`, and optionally `permissions` (a query such as `"documents.read AND documents.write"`), `credits: { cost }`, `ratelimits: [{ name, cost }]`, `tags`. Read `data.valid` and `data.code` (`VALID`, `NOT_FOUND`, `FORBIDDEN`, `INSUFFICIENT_PERMISSIONS`, `USAGE_EXCEEDED`, `RATE_LIMITED`, `DISABLED`, `EXPIRED`). A rejected key is a normal 200 response with `valid: false`, not an exception; network or auth failures throw `UnkeyError`.

4. Manage the lifecycle: `keys.updateKey` (pass `null` to clear a field), `keys.updateCredits`, `keys.deleteKey` (`permanent: true` to hard delete), `keys.rerollKey` (new key plus a grace period for the old one), `apis.listKeys` (filter by `externalId`; the result is an async iterable: `for await (const page of result)`), `keys.addRoles` / `setRoles` / `addPermissions`.

5. Usage analytics: `analytics.getVerifications({ query })` takes a read-only SQL `SELECT` over the `key_verifications_*_v1` views; check the dashboard or docs for column names before writing queries.

## Examples

### "Give customer 42 a production key with 100 requests a minute and 10,000 total calls"

```typescript
const created = await unkey.keys.createKey({
  apiId: process.env.UNKEY_API_ID!,
  prefix: "sk_live",
  name: "Northwind Traders production key",
  externalId: "customer-42",
  meta: { plan: "pro", team: "engineering" },
  permissions: ["api.read", "api.write"],
  ratelimits: [{ name: "requests", limit: 100, duration: 60_000, autoApply: true }],
  credits: { remaining: 10_000 },
  expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // optional: 30-day trial
});

console.log(created.data.key);   // sk_live_... show it to the customer once
console.log(created.data.keyId); // key_... store this to manage the key later
```

Result: the customer gets one secret; you keep only `keyId`. After 10,000 verifications `verifyKey` returns `USAGE_EXCEEDED`.

### "Protect my API route and return 401/403/429 correctly"

```typescript
async function requireApiKey(req: Request): Promise<Response | { customerId?: string }> {
  const key = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!key) return new Response("Missing API key", { status: 401 });

  const { data } = await unkey.keys.verifyKey({
    key,
    permissions: req.method === "GET" ? "api.read" : "api.write",
  });

  if (!data.valid) {
    const status = data.code === "RATE_LIMITED" ? 429
      : data.code === "NOT_FOUND" ? 401 : 403;
    return Response.json({ error: data.code }, { status });
  }
  return { customerId: data.identity?.externalId };
}
```

Result: unknown keys get 401, over-limit keys 429, expired/disabled/under-privileged keys 403. Wrap the call in try/catch and decide whether to fail closed (recommended) when Unkey is unreachable.

### "Rotate a leaked key without downtime"

```typescript
const rerolled = await unkey.keys.rerollKey({
  keyId: "key_2cGKbMxRyIzhCxo1Idjz8q",
  expiration: 24 * 60 * 60 * 1000, // old key keeps working for 24 hours
});
console.log(rerolled.data.key); // new secret, returned once
```

Result: the new key carries the same settings; the old one stops working after the grace period (use `0` to cut it off at once for a real leak).

## Guidelines

- Keep the root key server-side in an environment variable; give it only the permissions it needs, and use a separate root key per environment.
- Rate limits attached to a key apply on verify only when `autoApply: true`; otherwise name them in `verifyKey({ ratelimits: [{ name }] })`.
- `meta` is returned on every verification: no secrets, keep it small (docs advise under 10 KB).
- Prefixes appear in logs and errors; use `sk_live` / `sk_test`, nothing sensitive.
- The plaintext key is returned once and only a hash is stored (unless `recoverable: true`, which stores it encrypted: use sparingly).
- Do not cache a `valid: true` result for long; revocation and credits are checked by Unkey on each verify.
- Self-hosting is possible from the open-source repository, but the hosted service is the default path; check the current self-hosting docs before committing to it.
