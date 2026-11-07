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

Your team maintains a 65,000-line Express.js 4 API from 2018 -- callback-based, CommonJS, an unmaintained ORM, Node 14 (end of life since April 2023). Three key dependencies have no maintainers and CVEs pile up quarterly. The last npm audit showed 47 vulnerabilities, 12 of them high severity, and the fixes require upgrading to packages that dropped callback support entirely.

The obvious answer is "just rewrite it," but this API processes $2.3M in monthly transactions. A rewrite takes 6 months, and in 6 months the team ships zero features while competitors iterate weekly. Incremental migration is the only realistic path -- but without tests, you won't know what breaks until customers report it. And migrating without a security review just moves old vulnerabilities into new code, or worse, introduces new ones that the old code didn't have.

## The Solution

The **code-migration** skill converts legacy patterns -- callbacks to async/await, CommonJS to ESM, outdated ORMs to Prisma -- one module and one kind of change at a time, with behavior preserved. The **test-generator** skill writes baseline tests before migration to catch regressions. The **security-audit** skill reviews migrated code for vulnerabilities introduced during conversion and scans the dependencies. Together, they make it safe to modernize one module at a time, targeting a current Node LTS (24).

## Step-by-Step Walkthrough

### Step 1: Generate Baseline Tests Before Touching Anything

```text
Generate characterization tests for the payment, auth, and order modules.
Assert on the observable behavior (HTTP responses, database rows written,
calls to Stripe) of the current code, not on its internals and not with
snapshot files. Run them against the unmodified code.
```

Before changing a single line of code, baseline tests lock down the existing behavior. The test-generator skill avoids snapshot files because they are brittle, so these are explicit assertions. They verify what the code does, not how it does it -- so they'll still pass after callbacks become async/await and Waterline becomes Prisma:

| Test Suite | Tests | Coverage |
|-----------|-------|----------|
| `tests/baseline/payment.test.js` | 28 | Charge creation, refunds, webhooks, expired cards, duplicate charges |
| `tests/baseline/auth.test.js` | 22 | Login, registration, token refresh, brute force lockout |
| `tests/baseline/orders.test.js` | 19 | Order creation, status transitions, inventory reservation |

69 baseline tests total, all passing against the current code. These are the safety net for everything that follows.

### Step 2: Migrate the First Module

```text
Migrate src/services/payment.js in three passes, running the baseline tests
after each: first callbacks to async/await, then require() to ESM, then
Waterline queries to Prisma. Keep the same API contracts.
```

The payment module goes first because it has the best test coverage and the most callback nesting -- 8 levels deep in some charge-creation flows. Doing one kind of change per pass means a failing baseline test points at exactly one cause.

The migration touches every line but preserves every behavior:

- **34 callback chains** become async/await (8 nesting levels flatten to 3)
- **12 `require()` calls** become ESM imports
- **18 Waterline queries** become Prisma client calls
- **Callback `err` patterns** become try/catch with typed errors

Before: 342 lines, cyclomatic complexity 34. After: 241 lines, cyclomatic complexity 18. The code is 30% shorter because async/await eliminates the deep nesting, and Prisma's type-safe queries replace verbose Waterline chainables. More importantly, the migrated code has TypeScript types flowing through every function -- a Prisma query returns a typed result, so downstream code gets autocomplete and compile-time error checking that the old callback code never had.

Here's what the transformation looks like in practice -- a charge creation flow that was 8 levels of callbacks deep:

```typescript
// Before: callback hell with error-first pattern
db.Payment.create(chargeData, function(err, payment) {
  if (err) return callback(err);
  stripe.paymentIntents.create({ amount: payment.amount, currency: 'usd' }, function(err, charge) {
    if (err) return callback(err);
    db.Payment.update(payment.id, { stripeId: charge.id }, function(err) {
      if (err) return callback(err);
      callback(null, charge);
    });
  });
});

// After: linear async/await with typed errors
const payment = await prisma.payment.create({ data: chargeData });
const charge = await stripe.paymentIntents.create(
  { amount: payment.amount, currency: 'usd' },
  { idempotencyKey: `payment-${payment.id}` }, // a retried request cannot charge twice
);
await prisma.payment.update({ where: { id: payment.id }, data: { stripeId: charge.id } });
return charge;
```

Running the baseline tests: 28/28 passing. The behavior is identical; only the implementation changed.

### Step 3: Migrate the Remaining Modules

```text
Migrate auth.js and orders.js using the same patterns. Run baseline tests
after each module.
```

Each module follows the same pattern: convert, then verify.

**auth.js** -- 21 callbacks become async/await. JWT handling moves from `jsonwebtoken` to `jose` (ESM-native, built on Web Crypto, works on every runtime). Waterline User, Session, and Token models become Prisma calls. Baseline: 22/22 passing.

**orders.js** -- 26 callbacks become async/await. The trickiest conversion is inventory locking, which relied on a raw `sendNativeQuery` with `SELECT ... FOR UPDATE` against PostgreSQL. A Prisma interactive transaction (`prisma.$transaction(async (tx) => ...)`) replaces it, with an explicit isolation level (Prisma ORM 7, `@prisma/client@7`; the Prisma ORM 8 release candidate replaces `$transaction` with `db.transaction(...)` and has no `isolationLevel` option, so the fix in Step 4 is written for 7). Isolation levels need PostgreSQL, MySQL, SQL Server, CockroachDB or SQLite; Prisma does not offer them on MongoDB. Baseline: 19/19 passing.

All 69 baseline tests passing. Zero regressions across three modules.

### Step 4: Security Audit the Migrated Code

```text
Run a security audit on the migrated modules. Focus on issues introduced
during migration — new ORM queries, async error handling, updated JWT library.
```

This is where the migration would normally introduce silent vulnerabilities. Swapping one library for another changes the defaults, and defaults are where security bugs hide.

The audit also runs `npm audit --omit=dev` on the new lockfile (the dependency findings that motivated the migration should be gone) and finds 7 issues in the code, all introduced by the migration itself:

**Critical (1):**
- `auth.js:67` -- JWT audience claim not validated after jose migration. The old Waterline version checked `aud` manually; the migration dropped the check. Fixed.

**High (3):**
- `orders.js:112` -- Prisma transaction ran at the database default isolation level, enabling double-reserve on concurrent requests. Added `isolationLevel: Prisma.TransactionIsolationLevel.Serializable` and a retry on error code `P2034` (write conflict). Fixed.
- `payment.js:89` -- Webhook signature was compared with `===` on a parsed body after migration. Replaced with `stripe.webhooks.constructEvent(rawBody, signature, secret)` on the raw request body, which verifies the `Stripe-Signature` HMAC and rejects stale timestamps. Fixed.
- `auth.js:145` -- Password reset token stored plaintext in the new schema. The old code hashed it; the migration missed that detail. Now stores a SHA-256 hash of the random token and compares hashes. Fixed.

**Medium (3):** Two error handlers expose stack traces in production responses (the old callback error handlers caught everything; the new try/catch blocks let some errors propagate with full details). One Prisma query on the user profile endpoint returns the full user object including the password hash -- the old Waterline query had a `.select()` that excluded it, but the Prisma migration didn't carry that projection forward.

Every one of these issues was introduced by the migration, not by bad original code. The old code was actually secure in these areas -- it just used patterns that don't survive a library swap. This is exactly why a post-migration security audit isn't optional.

All 7 fixes applied. Baseline tests: 69/69 still passing -- the security fixes don't change the external behavior, they fix internal handling.

### Step 5: Generate Tests for the New Patterns

```text
Generate tests covering the new async patterns, Prisma transactions, and
jose JWT handling.
```

The baseline tests proved the migration didn't break existing behavior. New tests cover the patterns that didn't exist before:

| Test Suite | Tests | What It Covers |
|-----------|-------|---------------|
| `async-errors.test.js` | 11 | Promise rejection propagation, connection pool exhaustion, timeout handling |
| `prisma-transactions.test.js` | 8 | Isolation levels, rollback on failure, pool recovery after errors |
| `jose-jwt.test.js` | 6 | Audience validation, algorithm confusion attacks, key rotation |

Total: 94 tests (69 baseline + 25 new), all passing. Statement coverage on migrated modules: 81%.

## Real-World Example

A lead engineer at a 20-person logistics startup needed to migrate a 50,000-line Express 4 API off Node 14 before AWS Lambda blocked updates to functions on the deprecated Node 14 runtime in 8 weeks. The API processed 400,000 shipment events daily -- downtime meant lost package visibility for enterprise clients.

Monday, the test-generator captured 82 baseline tests across 6 modules. That afternoon, code-migration converted the shipment tracking module from callbacks to async/await. By Wednesday, 4 modules were migrated with zero regressions. Thursday, the security-audit caught a critical issue: the migration accidentally removed rate limiting on webhook ingestion, enabling event flooding. Two-minute fix.

The migrated API deployed Friday with 112 tests providing confidence, 5 weeks ahead of the Lambda deadline. More importantly, the test suite became the team's most valuable asset going forward -- it caught 4 regressions in subsequent PRs that would have reached production without it. The security audit pattern stuck too: every significant refactor now gets a post-migration security review as a matter of course.

## Related Skills

- **test-generator** -- writes the characterization tests that lock down behavior before each pass and covers the new async, transaction and JWT code afterward.
- **code-migration** -- performs the callback, ESM and ORM conversions one module and one change type at a time.
- **security-audit** -- audits dependencies and reviews the migrated modules for issues the library swap introduced.
