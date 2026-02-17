---
title: "Migrate Legacy Codebase with AI"
slug: migrate-legacy-codebase
description: "Migrate legacy codebases to modern frameworks with AI-generated tests to prevent regressions and security audits to harden the new code."
skills: [code-migration, test-generator, security-audit]
category: development
tags: [migration, legacy-code, testing, security, modernization]
---

# Migrate Legacy Codebase with AI

## The Problem

Your team maintains a 65,000-line Express.js 4 API from 2018 — callback-based, CommonJS, an unmaintained ORM, Node 14 with no security support. Three key dependencies have no maintainers and CVEs pile up quarterly. Rewriting takes 6 months; incremental migration without tests means you won't know what breaks until customers report it. And migrating without a security review just moves old vulnerabilities into new code.

## The Solution

The **code-migration** skill converts legacy patterns — callbacks to async/await, CommonJS to ESM, outdated ORMs to Prisma. The **test-generator** skill creates baseline tests before migration to catch regressions. The **security-audit** skill reviews migrated code for vulnerabilities introduced during conversion.

```bash
npx terminal-skills install code-migration test-generator security-audit
```

## Step-by-Step Walkthrough

### 1. Generate baseline tests before migration

```
Generate snapshot tests for the payment, auth, and order modules. Capture current input/output behavior for regression detection during migration.
```

```
Baseline Tests Created:

  tests/baseline/payment.test.js — 28 tests
    Charge creation, refunds, webhooks, expired cards, duplicate charges
  tests/baseline/auth.test.js — 22 tests
    Login, registration, token refresh, brute force lockout
  tests/baseline/orders.test.js — 19 tests
    Order creation, status transitions, inventory reservation

Total: 69 baseline tests, all passing against current code ✓
Tests verify behavior, not implementation — they'll validate the migration.
```

### 2. Migrate the first module

```
Migrate src/services/payment.js from callbacks to async/await. Convert require() to ESM. Replace Waterline queries with Prisma. Keep the same API contracts.
```

```
Migration: src/services/payment.js

  ✓ 34 callback chains → async/await (8 nesting levels → 3)
  ✓ 12 require() → ESM imports
  ✓ 18 Waterline queries → Prisma client calls
  ✓ Callback err patterns → try/catch with typed errors

Before: 342 lines, complexity 34 | After: 241 lines, complexity 18
Running baseline tests... 28/28 passing ✓
```

### 3. Migrate remaining modules

```
Migrate auth.js and orders.js using the same patterns. Run baseline tests after each module.
```

```
  src/services/auth.js
    ✓ 21 callbacks → async/await, JWT modernized (jose library)
    ✓ Waterline → Prisma (User, Session, Token models)
    Baseline: 22/22 passing ✓

  src/services/orders.js
    ✓ 26 callbacks → async/await, inventory locking → Prisma transactions
    Baseline: 19/19 passing ✓

All 69 baseline tests passing. Zero regressions.
```

### 4. Audit migrated code for security issues

```
Run a security audit on the migrated modules. Focus on issues introduced during migration — new ORM queries, async error handling, updated JWT library.
```

```
Security Audit — Migrated Code — 7 findings

CRITICAL (1):
  ✗ auth.js:67 — JWT audience claim not validated after jose migration
    Waterline version checked aud manually; migration dropped the check. Fixed ✓

HIGH (3):
  ⚠ orders.js:112 — Prisma transaction missing isolation level, enables double-reserve
    Added Serializable isolation. Fixed ✓
  ⚠ payment.js:89 — Webhook signature uses timing-unsafe comparison after migration
    Restored crypto.timingSafeEqual. Fixed ✓
  ⚠ auth.js:145 — Password reset token stored plaintext in new schema (old code hashed)
    Added bcrypt hash. Fixed ✓

MEDIUM (3): 2 error handlers expose stack traces, 1 query returns full user with hash

All fixes applied. Baseline tests: 69/69 passing ✓
```

### 5. Generate tests for new patterns

```
Generate tests covering the new async patterns, Prisma transactions, and jose JWT handling.
```

```
Migration-Specific Tests:

  async-errors.test.js — 11 tests (rejection propagation, pool exhaustion, timeouts)
  prisma-transactions.test.js — 8 tests (isolation, rollback, pool recovery)
  jose-jwt.test.js — 6 tests (audience validation, algorithm confusion, key rotation)

Total: 94 tests (69 baseline + 25 new), all passing
Coverage on migrated modules: 81% statements ✓
```

## Real-World Example

A lead engineer at a 20-person logistics startup needed to migrate a 50,000-line Express 4 API off Node 14 before AWS Lambda dropped runtime support in 8 weeks. The API processed 400,000 shipment events daily — downtime meant lost package visibility for enterprise clients.

Monday, test-generator captured 82 baseline tests across 6 modules. That afternoon, code-migration converted the shipment tracking module from callbacks to async/await. By Wednesday, 4 modules were migrated with zero regressions. Thursday, security-audit caught a critical issue — migration accidentally removed rate limiting on webhook ingestion, enabling event flooding. Two-minute fix.

The migrated API deployed Friday with 112 tests providing confidence. Post-deployment: 23% reduction in p99 latency from async/await. Migration completed 5 weeks early. The test suite caught 4 regressions in subsequent PRs that would have reached production.

## Related Skills

- [cicd-pipeline](../skills/cicd-pipeline/) — Run baseline tests on every commit during migration
- [docker-helper](../skills/docker-helper/) — Update containers for the new Node.js runtime
