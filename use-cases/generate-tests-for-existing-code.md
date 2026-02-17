---
title: "Generate Tests for Existing Code with AI"
slug: generate-tests-for-existing-code
description: "Add comprehensive test suites to untested codebases, review test quality, and set up CI to run them automatically."
skills: [test-generator, code-reviewer, cicd-pipeline]
category: development
tags: [testing, test-generation, coverage, code-review, ci-cd]
---

# Generate Tests for Existing Code with AI

## The Problem

You inherited a 40,000-line Node.js codebase with zero tests. Every deployment is a coin flip — last month a one-line change broke checkout for 2,300 users. Writing tests retroactively takes 2-3 hours per module across 85 modules. SOC 2 auditors arrive in 60 days wanting evidence of automated testing.

But generating tests alone isn't enough. AI-generated tests can test implementation details instead of behavior, use brittle mocks, or miss critical assertions. You need tests generated, reviewed for quality, then wired into CI so they run on every PR.

## The Solution

The **test-generator** skill creates comprehensive test suites. The **code-reviewer** skill audits generated tests for quality issues — weak assertions, missing edge cases, mock anti-patterns. The **cicd-pipeline** skill sets up GitHub Actions with coverage gates to enforce testing on every PR.

```bash
npx terminal-skills install test-generator code-reviewer cicd-pipeline
```

## Step-by-Step Walkthrough

### 1. Generate tests for high-risk modules

```
Analyze this project for coverage gaps. Generate tests for the top 5 highest-risk modules — prioritize payment, auth, and data processing.
```

```
Generating tests for highest-risk modules...

Created: tests/services/payment.test.js    — 23 tests (charge, webhook, refund flows)
Created: tests/services/auth.test.js       — 19 tests (login, JWT, session management)
Created: tests/middleware/validation.test.js — 15 tests (input sanitization, error codes)
Created: tests/services/notifications.test.js — 12 tests (email, SMS, rate limiting)
Created: tests/services/inventory.test.js   — 16 tests (stock, reservations, sync)

Total: 85 tests across 5 modules, all passing ✓
Coverage: 0% → 43% statements
```

### 2. Review generated tests for quality

```
Review the generated test files for quality. Check for weak assertions, implementation coupling, and missing business logic tests.
```

```
Test Quality Review — 14 issues found

CRITICAL (3):
  ✗ payment.test.js:89 — Tests Stripe SDK call order instead of payment outcome
  ✗ auth.test.js:134 — JWT expiry test uses hardcoded timestamp, will become stale
  ✗ inventory.test.js:67 — No test for concurrent stock reservation race condition

WARNINGS (6):
  ⚠ validation.test.js — 4 tests only check truthy/falsy, not specific error codes
  ⚠ payment.test.js — Missing currency conversion with stale rate cache
  ⚠ notifications.test.js — No test for SMS provider timeout fallback

Applying critical and warning fixes... 9 issues resolved.
Re-running suite... 85 tests passing ✓
```

### 3. Add tests from review suggestions

```
Generate the additional test cases from review suggestions — race condition, idempotency, and session invalidation scenarios.
```

```
Added 19 tests:
  + inventory — concurrent reservation lock (3 parallel requests)
  + payment — idempotency key collision returns original result
  + auth — session invalidation cascades after password change
  + validation — unicode normalization and injection prevention
  + notifications — rate limiter blocks after 100 msgs/minute

Total: 104 tests, all passing. Coverage: 43% → 58% ✓
```

### 4. Set up CI with coverage gates

```
Create a GitHub Actions workflow that runs tests on every PR, posts coverage diff as a comment, and blocks merges below 65%.
```

```
Created: .github/workflows/test.yml

  Trigger: push to main, all PRs
  Services: PostgreSQL 15, Redis 7
  Steps: checkout → Node 20 → install (cached) → test with coverage
  Gate: fails if statement coverage < 65%
  Report: coverage diff posted as PR comment
  Estimated run time: ~90 seconds
```

### 5. Expand coverage to hit the threshold

```
Generate tests for remaining untested modules to push coverage above 65%. Focus on business logic, skip trivial utilities.
```

```
Generated tests for 8 modules:
  billing (11), reporting (9), rateLimit (7), checkout (14),
  subscription (12), encryption (8), audit-log (6), permissions (10)

Total: 181 tests, all passing
Coverage: 58% → 71% statements, 64% branches ✓
CI pipeline green — all PRs now gated at 65% minimum
```

## Real-World Example

A backend lead at a 25-person fintech startup faced a SOC 2 audit in 8 weeks with zero tests across a 55,000-line API. Monday, the test-generator skill produced 120 tests for 8 critical modules. That afternoon, code-reviewer flagged 11 quality issues — including three tests that would silently pass on broken payment logic. After fixes, cicd-pipeline deployed GitHub Actions with 65% coverage gates. By Thursday: 230 tests, 73% coverage, every PR automatically checked.

The SOC 2 auditors reviewed the setup two weeks later. Comprehensive tests, documented quality review, and automated CI gates satisfied all change management controls. The startup passed without testing-related findings — avoiding an estimated $40,000 in remediation and a 3-month enterprise pipeline delay.

## Related Skills

- [security-audit](../skills/security-audit/) — Find security-sensitive paths needing extra test coverage
- [docker-helper](../skills/docker-helper/) — Containerize test environments for consistent CI runs
