---
name: env-manager
description: >-
  Manage environment variables and secrets across development, staging, and
  production environments. Use when someone needs to audit env vars, sync
  secrets between environments, detect missing or mismatched variables, rotate
  credentials, or set up a new environment from an existing one. Trigger words:
  env vars, environment variables, secrets, .env file, dotenv, config management,
  secret rotation, missing variable, environment sync.
license: Apache-2.0
compatibility: "Works with .env files, Docker, CI/CD platforms. Optional: Doppler CLI, AWS SSM, Vault"
metadata:
  author: carlos
  version: "1.0.0"
  category: devops
  tags: ["environment-variables", "secrets", "configuration", "devops", "security"]
---

# Environment Manager

## Overview

This skill helps manage environment variables and secrets across multiple environments (development, staging, production). It detects missing variables, identifies mismatches, audits for exposed secrets, and helps safely rotate credentials without downtime.

## Instructions

### Auditing Environment Variables

1. **Find all env var references in code:**
   ```bash
   grep -rn "process\.env\." src/ --include="*.ts" --include="*.js" | \
     sed 's/.*process\.env\.\([A-Z_]*\).*/\1/' | sort -u
   ```
   For Python:
   ```bash
   grep -rn "os\.environ\|os\.getenv" src/ --include="*.py" | \
     sed 's/.*os\.\(environ\["\|getenv("\)\([A-Z_]*\).*/\2/' | sort -u
   ```

2. **Compare against what's defined:**
   ```bash
   # From .env.example or .env
   grep -v '^#' .env.example | grep '=' | cut -d'=' -f1 | sort -u
   ```

3. **Report:**
   - Variables referenced in code but missing from `.env.example` → ⚠️ undocumented
   - Variables in `.env.example` but never referenced in code → ℹ️ possibly stale
   - Variables with no default and no validation → 🔴 app will crash if missing

### Comparing Environments

1. Get variable lists from each environment:
   - **Local:** Parse `.env` or `.env.local`
   - **CI/CD:** Check platform config (GitHub Actions secrets, GitLab CI variables)
   - **Hosting:** Check platform env vars (Vercel, Railway, Heroku config)
   - **Secrets manager:** Query Doppler, AWS SSM, or Vault

2. Build a comparison matrix:
   ```
   Variable              | dev | staging | prod | Notes
   DATABASE_URL          | ✓   | ✓       | ✓    | Different per env ✓
   STRIPE_SECRET_KEY     | ✓   | ✓       | ✗    | ⚠️ Missing in prod!
   REDIS_URL             | ✗   | ✓       | ✓    | ℹ️ Not needed locally
   NEXT_PUBLIC_API_URL   | ✓   | ✓       | ✓    | Verify values differ
   ```

3. Flag issues:
   - Variable present in staging but missing in production → likely deployment bug
   - Same secret value across dev and prod → security risk
   - Public-prefixed variables with secret values → will be exposed to client

### Secret Rotation

1. Identify the secret to rotate (API key, database password, JWT secret)
2. Check where it's used:
   ```bash
   grep -rn "THE_VAR_NAME" . --include="*.ts" --include="*.js" --include="*.yml" --include="*.yaml" --include="Dockerfile"
   ```
3. Generate rotation plan:
   - For API keys: Create new key → update all environments → verify → revoke old key
   - For database passwords: Update password → update connection strings → restart services
   - For JWT secrets: Implement dual-key validation → deploy → set new primary → remove old
4. Verify no hardcoded values exist (should all reference env vars)

### Setting Up a New Environment

1. Start from `.env.example` as the template
2. Categorize each variable:
   - **Shared config** (feature flags, API URLs) → copy and adjust for the new env
   - **Secrets** (API keys, passwords) → generate new ones, never copy from another env
   - **Infrastructure** (database URLs, Redis URLs) → get from the new env's infra
3. Validate the new environment:
   ```bash
   # Check app starts without missing var errors
   node -e "require('dotenv').config(); console.log('Loaded', Object.keys(process.env).length, 'vars')"
   ```

## Examples

### Example 1: Audit for Missing Variables

**User prompt:**
```
We keep getting "undefined" errors in staging. Can you audit our env vars?
```

**Agent output:**
```
Scanned src/ for environment variable references. Found 34 unique variables.

🔴 Missing from .env.example (undocumented):
  OPENAI_API_KEY        — referenced in src/lib/ai.ts:12
  WEBHOOK_SECRET        — referenced in src/api/webhooks.ts:8
  RATE_LIMIT_MAX        — referenced in src/middleware/rateLimit.ts:3

⚠️ Referenced but no validation/default:
  SMTP_HOST             — used in src/lib/email.ts:5, crashes if undefined
  CACHE_TTL             — used in src/lib/cache.ts:2, parseInt(undefined) = NaN

ℹ️ In .env.example but never referenced in code:
  LEGACY_API_URL        — possibly from a removed feature
  DEBUG_MODE            — no references found

Recommendation: Add the 3 undocumented vars to .env.example, add default
values for SMTP_HOST and CACHE_TTL, and remove the 2 stale entries.
```

### Example 2: Sync Staging with Production

**User prompt:**
```
We're about to launch. Compare staging and production env vars to make sure nothing is missing.
```

**Agent output:**
```
Compared 41 variables across staging and production:

🔴 Missing in production (3):
  STRIPE_WEBHOOK_SECRET  — payments will fail without this
  SENTRY_DSN             — no error tracking in prod
  FEATURE_FLAG_API_KEY   — feature flags will default to off

⚠️ Same value in both environments (2):
  JWT_SECRET             — using identical secret is a security risk
  DATABASE_URL           — pointing to same DB! This should differ.

✓ Correctly different (28 vars)
ℹ️ Staging-only (8 vars) — debug/test vars, expected

Action items:
1. Set STRIPE_WEBHOOK_SECRET in prod (get from Stripe Dashboard → Webhooks)
2. Set SENTRY_DSN in prod (get from Sentry → Project Settings → Client Keys)
3. Generate a new JWT_SECRET for prod: openssl rand -base64 32
4. Verify DATABASE_URL points to the production database, not staging
```

## Guidelines

- Never print or log actual secret values — show only variable names and metadata
- When comparing environments, flag identical secrets as a security concern
- Always check for `NEXT_PUBLIC_` or `VITE_` prefixed vars that contain actual secrets
- Recommend `.env.example` as the source of truth, committed to git (without values)
- For rotation, always plan for zero-downtime: new key → deploy → verify → revoke old
- Check CI/CD pipeline configs too — secrets there often go stale after renames
- Suggest validation libraries (envalid, zod) to catch missing vars at startup, not runtime
