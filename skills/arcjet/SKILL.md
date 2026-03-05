---
name: arcjet
description: Expert guidance for Arcjet, the developer-first security platform that provides rate limiting, bot protection, email validation, and attack detection as a code-first SDK. Helps developers add security layers to Next.js, Node.js, and other JavaScript/TypeScript applications without managing infrastructure.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - rate-limiting
  - bot-protection
  - security
  - waf
  - email-validation
---

# Arcjet — Application Security Layer


## Overview

You are an expert in Arcjet, the developer-first security platform that provides rate limiting, bot protection, email validation, and attack detection as a code-first SDK. You help developers add security layers to Next.js, Node.js, and other JavaScript/TypeScript applications without managing infrastructure.

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

// Fixed window with multiple tiers
export const apiLimiter = arcjet({
  key: process.env.ARCJET_KEY!,
  characteristics: ["http.request.headers[\"x-api-key\"]"],  // Per API key
  rules: [
    fixedWindow({
      mode: "LIVE",
      max: 100,                      // 100 requests
      interval: "1h",                // Per hour
    }),
    fixedWindow({
      mode: "LIVE",
      max: 1000,                     // 1000 requests
      interval: "1d",                // Per day
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

  if (decision.isDenied()) {
    if (decision.reason.isBot()) {
      return NextResponse.json(
        { error: "Bot traffic is not allowed" },
        { status: 403 }
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
        { error: "Suspicious request blocked" },
        { status: 403 }
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
      block: [
        "DISPOSABLE",                // Block temporary email services
        "INVALID",                    // Block malformed addresses
        "NO_MX_RECORDS",             // Block domains without mail servers
      ],
      // Allow free email providers (Gmail, Yahoo) — block only throwaway
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

Apply security rules globally via middleware:

```typescript
// middleware.ts — Global security middleware for Next.js
import arcjet, { detectBot, shield, tokenBucket } from "@arcjet/next";
import { NextRequest, NextResponse } from "next/server";

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  characteristics: ["ip.src"],
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:MONITOR", "CATEGORY:PREVIEW"],
    }),
    tokenBucket({
      mode: "LIVE",
      refillRate: 60,
      interval: 60,
      capacity: 120,
    }),
  ],
});

export async function middleware(request: NextRequest) {
  const decision = await aj.protect(request);

  // Log all decisions for monitoring
  console.log(`[Arcjet] ${request.url} | ${decision.conclusion} | IP: ${decision.ip.ip}`);

  if (decision.isDenied()) {
    // Return appropriate error based on reason
    if (decision.reason.isRateLimit()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Add security headers
  const response = NextResponse.next();
  response.headers.set("X-Arcjet-Decision", decision.conclusion);
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",              // Protect all API routes
    "/((?!_next|favicon).*)",   // Protect pages (exclude static assets)
  ],
};
```

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
  const decision = await aj.protect(req);

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

# Get API key at https://app.arcjet.com
```


## Examples

### Example 1

**User request:** "Help me set up Arcjet"

The agent follows the instructions above to configure Arcjet with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Arcjet configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Start with DRY_RUN** — Use `mode: "DRY_RUN"` first to monitor traffic patterns before enforcing rules
2. **Layer multiple rules** — Combine shield + bot detection + rate limiting; each catches different attack types
3. **Rate limit by the right characteristic** — Use IP for public endpoints, API key for authenticated ones, user ID for per-user limits
4. **Allow legitimate bots** — Search engines, uptime monitors, and link previews are not attacks; whitelist them
5. **Validate emails early** — Check email validity at signup, not after sending a verification email (saves deliverability)
6. **Middleware for global protection** — Apply shield and bot detection in middleware; add specific rate limits per route
7. **Monitor before enforcing** — Review Arcjet dashboard logs to understand traffic patterns and tune thresholds
8. **Graceful degradation** — If Arcjet is unavailable, your app should still work; wrap in try/catch with a permissive fallback
