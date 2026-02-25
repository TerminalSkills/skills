---
title: Secure an API with OAuth 2.0, Rate Limiting, and Security Scanning
slug: secure-api-with-oauth-and-rate-limiting
description: Harden a production API with OAuth 2.0 + PKCE authentication, tiered rate limiting, secrets management with Vault, and automated security scanning in CI — a complete security posture for a SaaS API.
skills:
  - oauth2-oidc
  - rate-limiting
  - hashicorp-vault
  - owasp-zap
category: development
tags:
  - api-security
  - oauth
  - rate-limiting
  - secrets
  - owasp
---

# Secure an API with OAuth 2.0, Rate Limiting, and Security Scanning

Diego runs a fintech API that processes 2 million requests per day. A security audit flagged four issues: API keys in environment variables (no rotation), no rate limiting (one customer's automation script caused a 10-minute outage), basic auth on some endpoints (passwords in headers), and no automated security testing. He needs production-grade security before the company's SOC 2 audit in 8 weeks.

## Step 1 — Replace API Keys with OAuth 2.0 + PKCE

Static API keys are the biggest risk: they don't expire, can't be scoped, and are often leaked in logs, Git history, or Slack messages. OAuth 2.0 with short-lived access tokens limits the blast radius of any leak.

```typescript
// src/auth/oauth-config.ts — OAuth 2.0 provider configuration.
// Uses the provider's OIDC discovery endpoint to auto-configure URLs.
// Supports both user-facing (Authorization Code) and machine (Client Credentials) flows.

import { Issuer, Strategy } from "openid-client";

// Auto-discover endpoints from the OIDC discovery URL
const issuer = await Issuer.discover(process.env.OIDC_ISSUER_URL!);
// issuer.metadata contains: authorization_endpoint, token_endpoint, jwks_uri, etc.

export const oauthClient = new issuer.Client({
  client_id: process.env.OAUTH_CLIENT_ID!,
  client_secret: process.env.OAUTH_CLIENT_SECRET!,
  redirect_uris: [process.env.OAUTH_REDIRECT_URI!],
  response_types: ["code"],
  token_endpoint_auth_method: "client_secret_post",
});

// JWKS for token verification — cached and auto-rotated
export const JWKS = issuer.metadata.jwks_uri;
```

```typescript
// src/middleware/auth.ts — JWT validation middleware.
// Validates the access token on every API request.
// Checks signature, expiration, issuer, audience, and scopes.

import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { Request, Response, NextFunction } from "express";

const JWKS = createRemoteJWKSet(
  new URL(process.env.JWKS_URI!)
);

interface AuthenticatedRequest extends Request {
  user: JWTPayload & {
    sub: string;
    scope: string;
    org_id?: string;
    tier: "free" | "pro" | "enterprise";
  };
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid Authorization header",
    });
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.OIDC_ISSUER_URL,
      audience: process.env.OAUTH_AUDIENCE,         // Ensures token was issued for this API
      clockTolerance: 5,                             // 5-second clock skew tolerance
    });

    (req as AuthenticatedRequest).user = payload as any;
    next();
  } catch (err: any) {
    if (err.code === "ERR_JWT_EXPIRED") {
      return res.status(401).json({
        error: "token_expired",
        message: "Access token has expired. Use your refresh token to get a new one.",
      });
    }

    return res.status(401).json({
      error: "invalid_token",
      message: "Token validation failed",
    });
  }
}

// Scope-based authorization: check that token has required permissions
export function requireScope(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;
    const tokenScopes = user.scope?.split(" ") || [];

    const hasAllScopes = requiredScopes.every((s) => tokenScopes.includes(s));

    if (!hasAllScopes) {
      return res.status(403).json({
        error: "insufficient_scope",
        message: `Required scopes: ${requiredScopes.join(", ")}`,
        required: requiredScopes,
        granted: tokenScopes,
      });
    }

    next();
  };
}
```

## Step 2 — Implement Tiered Rate Limiting

Different customer tiers get different limits. The implementation uses Redis for distributed counting across multiple API server instances, and a sliding window algorithm for accurate rate enforcement.

```typescript
// src/middleware/rate-limiter.ts — Tiered rate limiting with Redis.
// Sliding window counter: accurate, distributed, memory-efficient.
// Returns standard rate limit headers so clients can implement backoff.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Request, Response, NextFunction } from "express";

// Initialize Redis-backed rate limiter
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

// Tier-based rate limits
const limiters = {
  free: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "1 m"),     // 100 requests/minute
    prefix: "rl:free",
    analytics: true,
  }),
  pro: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1000, "1 m"),    // 1,000 requests/minute
    prefix: "rl:pro",
    analytics: true,
  }),
  enterprise: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10000, "1 m"),   // 10,000 requests/minute
    prefix: "rl:enterprise",
    analytics: true,
  }),
};

// Endpoint-specific cost multipliers.
// Expensive operations consume more of the quota.
const endpointCosts: Record<string, number> = {
  "POST /api/transactions/export": 10,    // Heavy DB query + file generation
  "POST /api/reports/generate": 20,       // Report compilation is expensive
  "GET /api/transactions": 1,             // Standard read
  "POST /api/transactions": 2,            // Write operation
};

export async function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = (req as any).user;
  if (!user) return next();  // Skip if not authenticated (auth middleware handles it)

  const tier = user.tier || "free";
  const limiter = limiters[tier as keyof typeof limiters] || limiters.free;

  // Compute cost for this request
  const endpointKey = `${req.method} ${req.path}`;
  const cost = endpointCosts[endpointKey] || 1;

  // Rate limit by organization (not individual user) for fairness
  const identifier = user.org_id || user.sub;

  const result = await limiter.limit(identifier, { rate: cost });

  // Set standard rate limit headers
  res.set({
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
  });

  if (!result.success) {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);

    res.set("Retry-After", String(retryAfter));

    return res.status(429).json({
      error: "rate_limit_exceeded",
      message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
      limit: result.limit,
      remaining: 0,
      retryAfter,
      tier,
      upgradeUrl: tier === "free" ? "https://api.diego.dev/pricing" : undefined,
    });
  }

  next();
}
```

## Step 3 — Manage Secrets with Vault

```typescript
// src/config/vault.ts — Dynamic secret loading from HashiCorp Vault.
// Application fetches secrets at startup and refreshes before TTL expiry.
// No secrets in environment variables, .env files, or code.

import VaultClient from "node-vault";

const vault = VaultClient({
  apiVersion: "v1",
  endpoint: process.env.VAULT_ADDR || "https://vault.internal:8200",
});

// Authenticate with AppRole (machine-to-machine auth)
async function authenticate() {
  const result = await vault.approleLogin({
    role_id: process.env.VAULT_ROLE_ID!,
    secret_id: process.env.VAULT_SECRET_ID!,  // Only 2 env vars needed
  });

  vault.token = result.auth.client_token;

  // Schedule token renewal before expiry
  const ttl = result.auth.lease_duration;
  setTimeout(() => authenticate(), (ttl - 60) * 1000);  // Renew 60s before expiry
}

// Fetch application secrets
export async function getSecrets() {
  await authenticate();

  // Static secrets from KV engine
  const appSecrets = await vault.read("secret/data/fintech-api/config");

  // Dynamic database credentials (auto-expire after 1 hour)
  const dbCreds = await vault.read("database/creds/fintech-api-role");

  // Dynamic Redis credentials
  const redisCreds = await vault.read("database/creds/redis-role");

  return {
    oauthClientSecret: appSecrets.data.data.oauth_client_secret,
    jwtSigningKey: appSecrets.data.data.jwt_signing_key,
    encryptionKey: appSecrets.data.data.encryption_key,
    database: {
      host: appSecrets.data.data.db_host,
      port: 5432,
      username: dbCreds.data.username,     // Dynamic: "v-approle-fintech-a-xyz123"
      password: dbCreds.data.password,     // Dynamic: auto-generated, 1-hour TTL
      database: "fintech",
    },
    redis: {
      username: redisCreds.data.username,
      password: redisCreds.data.password,
    },
  };
}

// Refresh database credentials before they expire
export function scheduleCredentialRefresh(
  onRefresh: (creds: Awaited<ReturnType<typeof getSecrets>>) => void
) {
  // Database creds have 1-hour TTL; refresh every 50 minutes
  setInterval(async () => {
    const newSecrets = await getSecrets();
    onRefresh(newSecrets);
  }, 50 * 60 * 1000);
}
```

## Step 4 — Automate Security Scanning in CI

```yaml
# .github/workflows/security.yml — Automated security scanning.
# Runs OWASP ZAP against the staging deployment after every merge to main.
# Baseline scan (passive only) on PRs, full scan weekly.

name: Security Scan
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  schedule:
    - cron: "0 3 * * 1"  # Full scan every Monday at 3 AM

jobs:
  # Quick passive scan on every PR — catches common issues in ~2 minutes
  baseline-scan:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start application
        run: |
          docker compose -f compose.test.yml up -d
          sleep 10  # Wait for app to be ready

      - name: OWASP ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.12.0
        with:
          target: "http://localhost:3000"
          rules_file_name: ".zap/baseline-rules.tsv"
          cmd_options: "-a -j"  # Ajax spider + JSON report
          fail_action: "warn"   # Don't block PRs, but flag issues

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: zap-baseline-report
          path: report_html.html

  # Full active scan on staging after merge to main
  full-scan:
    if: github.event_name == 'push' || github.event_name == 'schedule'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: OWASP ZAP Full Scan
        uses: zaproxy/action-full-scan@v0.10.0
        with:
          target: ${{ vars.STAGING_URL }}
          rules_file_name: ".zap/full-scan-rules.tsv"
          cmd_options: >-
            -a
            -j
            -z "-config api.addrs.addr.name=.* -config api.addrs.addr.regex=true"
          fail_action: "fail"   # Block deployment on high-severity findings

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: zap-full-report
          path: report_html.html

      # Notify on critical findings
      - name: Alert on critical vulnerabilities
        if: failure()
        run: |
          curl -X POST "${{ secrets.SLACK_WEBHOOK }}" \
            -H "Content-Type: application/json" \
            -d '{"text": "🚨 OWASP ZAP found critical vulnerabilities in staging. Check the security scan report."}'
```

## Results

Diego completed the security hardening in 5 weeks, well ahead of the SOC 2 audit:

- **Zero static secrets in env vars** — Vault manages all credentials with dynamic generation. Database passwords rotate every hour automatically. If a credential leaks, it's valid for at most 60 minutes.
- **API key → OAuth migration**: 100% of clients migrated in 3 weeks. Access tokens expire in 15 minutes (vs API keys that never expired). Token theft impact reduced from "indefinite access" to "15-minute window."
- **Rate limiting prevented 3 incidents** in the first month — one customer's runaway script hit the 1,000/min pro tier limit instead of overwhelming the database. The 429 response with `Retry-After` header let the script's backoff logic handle it gracefully.
- **OWASP ZAP caught 12 issues** in the first full scan: 2 high (reflected XSS in search, missing CSRF token on settings), 4 medium (security headers, cookie flags), 6 low. All high/medium fixed within a week.
- **SOC 2 audit passed** — the auditor specifically noted the dynamic secret rotation, automated security scanning, and rate limit logging as strong controls. Vault's audit log provided the access trail required for compliance.
- **Rate limit headers improved client experience** — third-party developers integrating with the API reported that `X-RateLimit-Remaining` let them build efficient polling without guessing. Support tickets about "random 500 errors" (actually overload) dropped to zero.
