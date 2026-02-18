---
title: "Manage Environment Variables and Secrets Across Environments with AI"
slug: manage-env-vars-secrets-across-environments
description: "Audit, sync, and secure environment variables across dev, staging, and production using an AI agent."
skills: [env-manager, doppler, security-audit]
category: devops
tags: [environment-variables, secrets, devops, security, configuration]
---

# Manage Environment Variables and Secrets Across Environments with AI

## The Problem

Environment variable management is a silent source of outages. A missing `STRIPE_WEBHOOK_SECRET` in production means payments silently fail. A shared `JWT_SECRET` between staging and production means a staging token works against live data. Most teams manage env vars through a mix of `.env` files, CI/CD settings, and hosting platform dashboards — with no single view of what's set where. New developers spend their first day chasing down 15 different secrets just to run the app locally.

## The Solution

An AI agent uses `env-manager` to scan your codebase for every environment variable reference, compare them across environments, and flag missing, stale, or insecure configurations. Combined with `doppler` for secrets management and `security-audit` for detecting exposed credentials, you get a complete picture of your configuration health.

## Step-by-Step Walkthrough

### 1. Audit your current state

Start with a full scan:

> Audit all environment variables in this project. Check what's referenced in code vs what's documented in .env.example vs what's actually set in our Vercel project.

### 2. The agent maps your entire configuration surface

```text
Scanned 142 source files. Found 38 unique environment variables.

Documented in .env.example:          31 of 38 (82%)
Referenced in code but undocumented:  7 variables
In .env.example but unused:           4 variables (stale)

Breakdown by category:
  Database (3):     DATABASE_URL, REDIS_URL, MONGODB_URI
  Auth (5):         JWT_SECRET, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, ...
  Payments (4):     STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ...
  Email (3):        SMTP_HOST, SMTP_USER, SMTP_PASS
  Third-party (8):  OPENAI_API_KEY, SENTRY_DSN, SEGMENT_WRITE_KEY, ...
  Feature flags (6): FF_NEW_DASHBOARD, FF_BILLING_V2, ...
  App config (9):   NEXT_PUBLIC_API_URL, RATE_LIMIT_MAX, ...

🔴 Critical: 3 variables used in code have no validation or default:
  STRIPE_WEBHOOK_SECRET (src/api/webhooks.ts:8) — app crashes if missing
  OPENAI_API_KEY (src/lib/ai.ts:3) — API calls fail with cryptic error
  REDIS_URL (src/lib/cache.ts:5) — falls through to localhost silently
```

### 3. Compare across environments

> Now compare what's set in development, staging (Vercel preview), and production (Vercel production).

```text
Cross-environment comparison (38 variables):

🔴 Missing in production (2):
  SENTRY_DSN             — no error tracking in prod!
  FF_BILLING_V2          — feature flag defaults to off, billing v2 won't activate

⚠️ Security concerns (3):
  JWT_SECRET             — identical in staging and prod (reuse = token leak risk)
  NEXT_PUBLIC_SENTRY_DSN — contains project auth token, exposed to client
  DATABASE_URL           — staging uses prod-like connection string (verify this is intentional)

ℹ️ Environment-specific (correct):
  28 variables correctly differ across environments
  5 variables are staging/dev-only (debug flags) — expected

Generating fix commands...
```

### 4. Apply fixes safely

> Fix the critical issues. Generate new secrets where needed and set them in Vercel.

```text
Generated rotation plan:

1. JWT_SECRET for production:
   New value generated: openssl rand -base64 32
   → Set via: vercel env add JWT_SECRET production
   ⚠️ Active user sessions will invalidate. Deploy during low-traffic window.

2. SENTRY_DSN for production:
   Retrieved from Sentry project settings: https://abc123@sentry.io/456
   → Set via: vercel env add SENTRY_DSN production

3. FF_BILLING_V2 for production:
   → Set via: vercel env add FF_BILLING_V2 production (value: "true")

4. Created startup validation (src/lib/env.ts):
   Using zod to validate all required env vars at boot time.
   App now fails fast with a clear error listing every missing variable
   instead of crashing at runtime when a specific var is first accessed.

All changes ready. Review the env.ts validation file before deploying.
```

## Real-World Example

Dev, a platform engineer at a 40-person fintech startup, joins during a period of rapid growth. The team has gone from 3 to 12 developers in six months, and onboarding new engineers takes two days because nobody knows which of the 45 environment variables are actually needed or where to get them.

1. Dev asks the agent to audit the entire configuration surface — code references, `.env.example`, Vercel settings, and GitHub Actions secrets
2. The agent discovers 7 undocumented variables, 5 stale ones from removed features, and 2 secrets that are identical across staging and production
3. Using the audit report, Dev updates `.env.example` with descriptions for every variable, removes the stale ones, and adds a Zod validation schema that fails fast on missing vars
4. The agent generates a secure onboarding script that creates a local `.env` from `.env.example`, auto-populates non-secret defaults, and prompts for each secret with instructions on where to find it
5. New developer onboarding time drops from 2 days to 45 minutes. The next production incident caused by a missing env var: never — the validation catches it before the app starts
