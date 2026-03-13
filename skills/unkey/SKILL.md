---
name: unkey
description: >-
   You are an expert in Unkey, the open-source API key management platform.
  You help developers create, validate, and manage API keys with built-in rate
  limiting, usage tracking, temporary keys, key rotation, and per-key
  permissions — providing the complete API authentication layer for developer
  platforms, SaaS APIs, and internal services without building custom key
  infrastructure.
category: Backend Development
tags: [api-keys, authentication, rate-limiting, usage, developer-platform]
version: 1.0.0
author: terminal-skills
---

# Unkey — API Key Management

You are an expert in Unkey, the open-source API key management platform. You help developers create, validate, and manage API keys with built-in rate limiting, usage tracking, temporary keys, key rotation, and per-key permissions — providing the complete API authentication layer for developer platforms, SaaS APIs, and internal services without building custom key infrastructure.

## Core Capabilities

### Key Management

```typescript
import { Unkey } from "@unkey/api";

const unkey = new Unkey({ rootKey: process.env.UNKEY_ROOT_KEY! });

// Create API key for a customer
const { result } = await unkey.keys.create({
  apiId: process.env.UNKEY_API_ID!,
  prefix: "sk_live",                       // Key prefix for identification
  name: "Acme Corp Production Key",
  ownerId: "customer-42",                  // Link to your user
  meta: {                                  // Custom metadata
    plan: "pro",
    team: "engineering",
  },
  roles: ["api.read", "api.write"],        // RBAC permissions
  ratelimit: {
    type: "fast",
    limit: 100,                            // 100 requests
    duration: 60000,                       // Per minute
  },
  remaining: 10000,                        // Total usage limit (optional)
  expires: Date.now() + 30 * 24 * 60 * 60 * 1000,  // 30 days (optional)
});

console.log(result.key);                   // sk_live_abc123... (show once!)
console.log(result.keyId);                 // key_xxx (for management)
```

### Key Verification (in your API)

```typescript
import { verifyKey } from "@unkey/api";

// Middleware — verify API key on every request
async function authMiddleware(req: Request) {
  const key = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!key) return new Response("Missing API key", { status: 401 });

  const { result, error } = await verifyKey({
    key,
    apiId: process.env.UNKEY_API_ID!,
  });

  if (error || !result.valid) {
    return new Response(JSON.stringify({
      error: "Invalid API key",
      code: result?.code,                  // "NOT_FOUND" | "RATE_LIMITED" | "USAGE_EXCEEDED" | "EXPIRED"
    }), { status: result?.code === "RATE_LIMITED" ? 429 : 403 });
  }

  // Key is valid — access metadata
  const { ownerId, meta, roles, remaining, ratelimit } = result;
  console.log(`Customer: ${ownerId}, Plan: ${meta.plan}, Remaining: ${remaining}`);

  // Check permissions
  if (!roles.includes("api.write") && req.method !== "GET") {
    return new Response("Insufficient permissions", { status: 403 });
  }

  // Rate limit info in response headers
  return {
    ownerId,
    meta,
    headers: {
      "X-RateLimit-Limit": String(ratelimit?.limit),
      "X-RateLimit-Remaining": String(ratelimit?.remaining),
      "X-RateLimit-Reset": String(ratelimit?.reset),
    },
  };
}
```

### Key Lifecycle

```typescript
// Update key (change limits, roles)
await unkey.keys.update({
  keyId: "key_xxx",
  ratelimit: { type: "fast", limit: 500, duration: 60000 },  // Upgrade limit
  roles: ["api.read", "api.write", "api.admin"],
  meta: { plan: "enterprise" },
});

// Revoke key
await unkey.keys.delete({ keyId: "key_xxx" });

// List keys for a customer
const { result: keys } = await unkey.apis.listKeys({
  apiId: process.env.UNKEY_API_ID!,
  ownerId: "customer-42",
});

// Usage analytics
const { result: verifications } = await unkey.keys.getVerifications({
  keyId: "key_xxx",
  start: Date.now() - 7 * 24 * 60 * 60 * 1000,  // Last 7 days
  end: Date.now(),
  granularity: "day",
});
```

## Installation

```bash
npm install @unkey/api
```

## Best Practices

1. **Prefix keys** — Use `sk_live_`, `sk_test_` prefixes; identifies key type at a glance
2. **Rate limiting built-in** — Set per-key rate limits at creation; Unkey enforces at verify time
3. **Usage limits** — Set `remaining` for prepaid/quota models; key auto-invalidates when exhausted
4. **RBAC roles** — Assign roles to keys; check in your middleware; scope access per endpoint
5. **Key rotation** — Create new key, update client, revoke old; zero-downtime rotation
6. **Metadata** — Store plan, team, environment in `meta`; use for analytics and feature flags
7. **Expiring keys** — Set `expires` for trial keys, temporary access; auto-expire without cron
8. **Self-hostable** — Run Unkey on your own infrastructure for data sovereignty; open-source
