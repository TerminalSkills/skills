---
title: "Generate Tests for Existing Code with AI"
slug: generate-tests-for-existing-code
description: "Retroactively add comprehensive test suites to untested codebases using AI-powered test generation."
skills: [test-generator]
category: development
tags: [testing, test-generation, coverage, quality, automation]
---

# Generate Tests for Existing Code with AI

## The Problem

You inherited a 40,000-line Node.js codebase with exactly zero tests. The previous team shipped fast and left testing as a "future task." Now every deployment is a coin flip. Last month, a one-line change in the payment module broke checkout for 2,300 users during peak hours — 4 hours to detect, 2 to roll back.

Writing tests retroactively is brutal. Each module takes 2-3 hours to understand, mock dependencies, and cover edge cases. With 85 modules, that's 170-255 hours — over a month of full-time effort for one engineer. Meanwhile, features keep shipping untested because the backlog never shrinks.

The real cost isn't just engineering time. It's the 3 AM pages, the customer churn from broken features, and the slow erosion of team confidence. SOC 2 auditors are coming in 60 days and they want evidence of automated testing. You need coverage fast.

## The Solution

The **test-generator** skill analyzes your codebase structure, identifies untested modules ranked by risk and usage frequency, then generates comprehensive test suites with realistic edge cases. It reads your existing patterns — error handling, libraries, module interactions — and produces tests that match your codebase style, with proper mocking and async handling.

```bash
npx terminal-skills install test-generator
```

## Step-by-Step Walkthrough

### 1. Scan for untested modules

```
Analyze this project for test coverage gaps. Prioritize modules by risk — focus on payment, auth, and data processing first.
```

```
Coverage Analysis — 0% overall

HIGH RISK (no tests, high usage):
  1. src/services/payment.js  — 342 lines, 14 imports, Stripe webhooks
  2. src/services/auth.js     — 218 lines, JWT + session management
  3. src/middleware/validation.js — 156 lines, used in 23 routes

Recommended order: payment → auth → validation → notifications → transforms
Estimated generation time: ~15 minutes for all 6 priority modules
```

### 2. Generate tests for the highest-risk module

```
Generate a complete test suite for src/services/payment.js with edge cases for webhook validation, partial refunds, and currency conversion.
```

```
Created: tests/services/payment.test.js (287 lines)

  ✓ processPayment — 8 tests (success, insufficient funds, timeout, duplicate detection)
  ✓ handleWebhook — 6 tests (valid signature, expired, replay attack, malformed payload)
  ✓ processRefund — 5 tests (full, partial, exceeds charge, already refunded)
  ✓ convertCurrency — 4 tests (standard, same currency no-op, unsupported, stale rate)

Mocked: stripe SDK, redis cache, logger
All 23 tests passing ✓
```

### 3. Batch-generate for remaining modules

```
Generate test suites for auth.js, validation.js, notifications.js, transforms.js, and inventory.js. Run each suite after generation.
```

```
tests/services/auth.test.js         — 19 tests, all passing ✓
tests/middleware/validation.test.js  — 15 tests, all passing ✓
tests/services/notifications.test.js — 12 tests, all passing ✓
tests/utils/transforms.test.js      — 9 tests, all passing ✓
tests/services/inventory.test.js     — 16 tests, all passing ✓

Total: 94 tests across 6 modules
Coverage: 0% → 47% (statements), 52% (branches)
Time elapsed: 11 minutes
```

### 4. Fix failures and reach 70% coverage

```
Run the full suite, fix any failures, then add targeted tests to reach 70% coverage.
```

```
94 tests — 91 passing, 3 failing

Fixes applied:
  ✗ auth.test.js:45 — token expiry mock wrong timezone → fixed
  ✗ inventory.test.js:78 — race condition in stock reservation → added mutex mock
  ✗ notifications.test.js:33 — SMS provider error format changed → updated assertion

Adding targeted tests for uncovered branches...
  + 18 error handling paths, + 7 config edge cases, + 4 rate limiting tests

Final: 123 tests, all passing. Coverage: 72% statements, 68% branches ✓
```

### 5. Set up CI coverage gates

```
Add a GitHub Actions workflow that runs tests on every PR and blocks merges below 70% coverage.
```

```
Created: .github/workflows/test.yml
  - Runs on: push to main, all PRs
  - Services: PostgreSQL 15, Redis 7
  - Coverage threshold: 70% (fails PR if below)
  - Report: uploads coverage diff as PR comment
```

## Real-World Example

Marcus, a senior backend engineer at fintech startup LedgerFlow, joined three months before their SOC 2 Type II audit. The 60,000-line Node.js API had zero automated tests — built by contractors over 18 months. Auditors needed evidence of systematic testing practices.

He started with the test-generator skill on Monday, targeting the transaction processing pipeline. By lunch, the agent had generated 156 tests across 8 modules. Three tests failed due to timezone-dependent comparisons — fixed in under a minute. By Wednesday, he had 340 tests covering 22 core modules at 74% statement coverage. Thursday, he reviewed generated tests and added 15 business-logic-specific assertions. Friday, the CI pipeline with coverage gates was live.

The SOC 2 auditors reviewed the testing infrastructure two weeks later. The automated suite, CI pipeline, and coverage reports satisfied change management and QA controls. LedgerFlow passed without findings in the testing category — saving an estimated $45,000 in remediation costs and avoiding a 3-month delay on their enterprise sales pipeline.

## Related Skills

- [code-reviewer](../skills/code-reviewer/) — Review generated tests for logical correctness and business rule coverage
- [security-audit](../skills/security-audit/) — Identify security-sensitive code paths that need extra test coverage
- [cicd-pipeline](../skills/cicd-pipeline/) — Set up CI to run tests automatically on every commit
