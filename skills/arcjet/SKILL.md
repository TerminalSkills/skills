---
name: arcjet
description: Expert guidance for Arcjet, the developer-first security platform that provides rate limiting, bot protection, email validation, and attack detection as a code-first SDK. Helps developers add security layers to Next.js, Node.js, and other JavaScript/TypeScript applications without managing infrastructure.
license: Apache-2.0
compatibility: '@arcjet/next or @arcjet/node 1.x (checked against 1.14.1); Node.js 22.21+ or 24.5+; an Arcjet account and ARCJET_KEY'
metadata:
  author: terminal-skills
  repository: https://github.com/arcjet/arcjet-js
  version: 1.1.0
  category: development
  tags: "rate-limiting, bot-protection, security, waf, email-validation"
---

# Arcjet — Application Security Layer

## Overview

Arcjet, the developer-first security platform that provides rate limiting, bot protection, email validation, and attack detection as a code-first SDK. Helps developers add security layers to Next.js, Node.js, and other JavaScript/TypeScript applications without managing infrastructure.

## Instructions

### Rate Limiting

Protect endpoints from abuse with flexible rate limiting:

```typescript
// src/lib/arcjet.ts — Configure Arcjet security rules
import arcjet, { tokenBucket, slidingWindow, fixedWindow } from "@arcjet/next";

// Token bucket — allows bursts, then limits sustained rate
// Good for APIs where occasional spikes are normal
export const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  characteristics: ["ip.src"],      // Rate limit per IP address
  rules: [
    tokenBucket({
      mode: "LIVE",                  // "LIVE" enforces; "DRY_RUN" logs only
      refillRate: 10,                // Add 10 tokens per interval
      interval: 60,                  // Every 60 seconds
      capacity: 20,                  // Max burst of 20 requests
    }),
  ],
});

// Sliding window — smooth rate limiting without burst allowance
// Good for login endpoints where you want strict limits
export const loginLimiter = arcjet({
  key: process.env.ARCJET_KEY!,
  characteristics: ["ip.src"],
  rules: [
    slidingWindow({
      mode: "LIVE",
      max: 5,                        // 5 attempts
      interval: "15m",               // Per 15-minute window
    }),
  ],
});

// Fixed window with multiple tiers (slidingWindow and tokenBucket use `interval`)
export const apiLimiter = arcjet({
  key: process.env.ARCJET_KEY!,
  characteristics: ["http.request.headers[\"x-api-key\"]"],  // Per API key
  rules: [
    fixedWindow({
      mode: "LIVE",
      max: 100,                      // 100 requests
      window: "1h",                  // Per hour (fixedWindow uses `window`, not `interval`)
    }),
    fixedWindow({
      mode: "LIVE",
      max: 1000,                     // 1000 requests
      window: "1d",                  // Per day
    }),
  ],
});
```

### Bot Protection

Detect and block automated traffic:

```typescript
// app/api/signup/route.ts — Protect signup from bots
import arcjet, { detectBot, shield } from "@arcjet/next";
import { NextRequest, NextResponse } from "next/server";

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [
    // Shield — detects common attack patterns (SQLi, XSS, path traversal)
    shield({ mode: "LIVE" }),

    // Bot detection — blocks automated clients
    detectBot({
      mode: "LIVE",
      allow: [
        "CATEGORY:SEARCH_ENGINE",     // Allow Google, Bing, etc.
        "CATEGORY:MONITOR",           // Allow uptime monitors
      ],
      // Everything else (scrapers, headless browsers, AI crawlers) is blocked
    }),
  ],
});

export async function POST(request: NextRequest) {
  const decision = await aj.protect(request);

  if (decision.isErrored()) {
    // Fail open: Arcjet itself had a problem; log it and let the request through.
    console.error("Arcjet error", decision.reason.message);
  } else if (decision.isDenied()) {
    if (decision.reason.isBot()) {
      return NextResponse.json(
        { error: "Bot traffic is not allowed" }, { status: 403 }
      );
    }
    if (decision.reason.isRateLimit()) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    if (decision.reason.isShield()) {
      return NextResponse.json(
        { error: "Suspicious request blocked" }, { status: 403 }
      );
    }
  }

  // Request passed all security checks — process normally
  const body = await request.json();
  const user = await createUser(body);
  return NextResponse.json({ user }, { status: 201 });
}
```

### Email Validation

Validate email addresses before accepting them:

```typescript
// app/api/subscribe/route.ts — Validate emails at signup
import arcjet, { validateEmail } from "@arcjet/next";
import { NextRequest, NextResponse } from "next/server";

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [
    validateEmail({
      mode: "LIVE",
      deny: [
        "DISPOSABLE",                // Block temporary email services
        "INVALID",                    // Block malformed addresses
        "NO_MX_RECORDS",             // Block domains without mail servers
      ],
      // Use either `deny` or `allow`, not both. Free providers (Gmail, Yahoo)
      // stay allowed because "FREE" is not listed.
    }),
  ],
});

export async function POST(request: NextRequest) {
  const { email } = await request.json();

  const decision = await aj.protect(request, { email });

  if (decision.isDenied()) {
    const reason = decision.reason;
    if (reason.isEmail()) {
      // Specific error messages based on email issue
      if (reason.emailTypes.includes("DISPOSABLE")) {
        return NextResponse.json(
          { error: "Please use a permanent email address" },
          { status: 422 }
        );
      }
      if (reason.emailTypes.includes("INVALID")) {
        return NextResponse.json(
          { error: "Please check your email address" },
          { status: 422 }
        );
      }
    }
  }

  // Email is valid — proceed with subscription
  await addToMailingList(email);
  return NextResponse.json({ success: true });
}
```

### Next.js Middleware Integration

Apply security rules globally. `createMiddleware` wraps the Arcjet client and returns a 403 for denied requests. Next.js 16 renamed the `middleware.ts` file to `proxy.ts` (export `proxy` or a default); the Arcjet code is the same.

```typescript
// middleware.ts — Global security middleware for Next.js
import arcjet, { createMiddleware, detectBot, shield } from "@arcjet/next";

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:MONITOR", "CATEGORY:PREVIEW"],
    }),
  ],
});

export default createMiddleware(aj);

export const config = {
  // Skip static assets; run on pages and API routes
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

Per-route rate limits belong in the route handler.

### Node.js / Express Integration

Use Arcjet with Express or any Node.js framework:

```typescript
// src/middleware/security.ts — Arcjet with Express
import arcjet, { tokenBucket, detectBot, shield } from "@arcjet/node";
import { Request, Response, NextFunction } from "express";

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  characteristics: ["ip.src"],
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({ mode: "LIVE", allow: ["CATEGORY:SEARCH_ENGINE"] }),
    tokenBucket({ mode: "LIVE", refillRate: 30, interval: 60, capacity: 60 }),
  ],
});

export async function arcjetMiddleware(req: Request, res: Response, next: NextFunction) {
  const decision = await aj.protect(req, { requested: 1 });

  if (decision.isDenied()) {
    const status = decision.reason.isRateLimit() ? 429 : 403;
    return res.status(status).json({
      error: decision.reason.isRateLimit() ? "Rate limited" : "Forbidden",
    });
  }

  next();
}

// Usage in Express app
app.use("/api", arcjetMiddleware);
```

## Installation

```bash
# Next.js
npm install @arcjet/next

# Node.js / Express
npm install @arcjet/node

# Get a key at https://app.arcjet.com and export it as ARCJET_KEY
```

`protect()` for a token bucket takes the cost of the request: `await aj.protect(request, { requested: 1 })`. Rules default to `DRY_RUN` when `mode` is omitted.

## Examples

### Example 1: Protect a signup endpoint in Next.js

**User request:** "Stop bots and throwaway emails from hitting /api/signup, and limit each IP to 5 attempts per 15 minutes."

Install `@arcjet/next`, put `ARCJET_KEY` in `.env.local`, and in `app/api/signup/route.ts` combine `shield`, `detectBot`, `validateEmail({ deny: ["DISPOSABLE", "INVALID", "NO_MX_RECORDS"] })` and `slidingWindow({ max: 5, interval: "15m" })` with `characteristics: ["ip.src"]`. Call `aj.protect(request, { email })`. Start every rule in `DRY_RUN`, read the decisions in the Arcjet dashboard, then switch to `LIVE`. A blocked request gets 403 (bot, shield), 422 (email) or 429 (rate limit).

### Example 2: Rate limit an Express API by API key

**User request:** "Give each API key 1000 requests a day on our Express server."

Install `@arcjet/node`, build `arcjet({ key, characteristics: ['http.request.headers["x-api-key"]'], rules: [fixedWindow({ mode: "LIVE", window: "1d", max: 1000 })] })`, and call `aj.protect(req)` in a middleware that answers 429 when `decision.reason.isRateLimit()`. Mount it with `app.use("/api", arcjetMiddleware)`.

## Guidelines

1. **Start with DRY_RUN** — Use `mode: "DRY_RUN"` first to monitor traffic patterns before enforcing rules
2. **Layer multiple rules** — Combine shield + bot detection + rate limiting; each catches different attack types
3. **Rate limit by the right characteristic** — Use IP for public endpoints, API key for authenticated ones, user ID for per-user limits
4. **Allow legitimate bots** — Search engines, uptime monitors, and link previews are not attacks; whitelist them
5. **Middleware for global protection** — Apply shield and bot detection in middleware; add specific rate limits per route
6. **Graceful degradation** — A failed Arcjet call returns an errored decision (`decision.isErrored()`) rather than denying; decide deliberately whether to fail open (usual) or closed (login, payments)
7. **Client IP** — Arcjet reads the IP from the request; behind your own proxy, configure `proxies` so spoofed `X-Forwarded-For` values are ignored
