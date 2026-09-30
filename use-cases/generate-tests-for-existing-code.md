---
title: "Generate Tests for Existing Code with AI"
slug: generate-tests-for-existing-code
description: "Add comprehensive test suites to untested codebases, review test quality, and set up CI to run them automatically."
skills: [test-generator, code-reviewer, cicd-pipeline, hypothesis]
category: development
tags: [testing, test-generation, coverage, code-review, ci-cd]
---

# Generate Tests for Existing Code with AI

## The Problem

You inherited a 40,000-line Node.js codebase with zero tests. Every deployment is a coin flip -- last month a one-line change broke checkout for 2,300 users. The team catches bugs in production because there's nothing to catch them before. Writing tests retroactively takes 2-3 hours per module across 85 modules -- that's 170-255 hours of work, or roughly 6 engineering weeks. SOC 2 auditors arrive in 60 days wanting evidence of automated testing, and "we'll get to it next quarter" is not an answer they accept.

But generating tests alone isn't enough. AI-generated tests have a reputation problem for good reason -- they often test implementation details instead of behavior, use brittle mocks that break on any refactor, or assert that a function "was called" without checking that it did the right thing. A test suite full of green checkmarks that doesn't actually catch bugs is worse than no tests at all: it gives the team false confidence to deploy faster while catching nothing.

## The Solution

The **test-generator** skill creates comprehensive test suites. The **code-reviewer** skill audits generated tests for quality issues -- weak assertions, missing edge cases, mock anti-patterns. The **cicd-pipeline** skill sets up GitHub Actions with coverage gates to enforce testing on every PR. The three skills work in sequence: generate, review, enforce.

## Step-by-Step Walkthrough

### Step 1: Generate Tests for High-Risk Modules

```text
Analyze this project for coverage gaps. Generate tests for the top 5 highest-risk modules — prioritize payment, auth, and data processing.
```

The five highest-risk modules get test suites that cover the critical paths:

| Module | Tests Created | What's Covered |
|---|---|---|
| `services/payment` | 23 tests | Charge flows, webhook handling, refund logic |
| `services/auth` | 19 tests | Login, JWT validation, session management |
| `middleware/validation` | 15 tests | Input sanitization, error code mapping |
| `services/notifications` | 12 tests | Email, SMS, rate limiting |
| `services/inventory` | 16 tests | Stock checks, reservations, sync |

**85 tests total, all passing. Coverage jumps from 0% to 43%.**

The payment tests are the most critical. They cover the happy path (charge succeeds, webhook confirms, order status updates), the sad paths (card declined, insufficient funds, Stripe outage with retry), and the dangerous edge cases that cause real-world financial bugs: duplicate webhook delivery processing the same payment twice, partial refunds that should restock inventory but don't, and currency conversion with stale exchange rates.

The auth tests go beyond login/logout. They verify that expired JWTs are rejected (not just that valid ones are accepted), that session tokens are invalidated after password changes, and that rate limiting kicks in after repeated failed login attempts -- the kind of security behavior that's easy to break accidentally and hard to notice without tests.

### Step 2: Review Generated Tests for Quality

This is the step most people skip, and it's the most important one. Generated tests that pass aren't necessarily good tests.

```text
Review the generated test files for quality. Check for weak assertions, implementation coupling, and missing business logic tests.
```

The review finds 14 issues. Three of them are critical -- tests that would silently pass on broken code, giving the team confidence to ship bugs:

**Critical issues (tests that would pass even if the code is broken):**

| File | Line | Problem |
|---|---|---|
| `payment.test.js` | 89 | Tests Stripe SDK *call order* instead of payment outcome. If someone refactors the payment flow to call Stripe differently but with the same result, this test breaks -- but if Stripe actually fails to charge, this test still passes. It's testing the mock, not the behavior. |
| `auth.test.js` | 134 | JWT expiry test uses a hardcoded timestamp (`2026-03-15T00:00:00Z`). The test passes today but silently stops testing expiry logic after that date, because the "expired" token becomes truly expired and the test passes for the wrong reason. |
| `inventory.test.js` | 67 | No test for concurrent stock reservation. Two simultaneous purchases of the last item could both succeed, creating a negative inventory count. This is the exact scenario that caused the checkout bug last month. |

**Warnings (6 issues):**
- `validation.test.js` -- 4 tests only check truthy/falsy (`expect(result).toBeTruthy()`), not specific error codes. A validation function that throws the wrong error type still passes.
- `payment.test.js` -- missing currency conversion test when the exchange rate cache is stale
- `notifications.test.js` -- no test for SMS provider timeout fallback behavior

After fixes, the critical tests assert on outcomes instead of internal implementation details, the JWT test uses relative timestamps (`Date.now() - 3600000` for "one hour ago"), and the concurrency test simulates two parallel reservation requests hitting the same inventory record.

### Step 3: Add Tests from Review Suggestions

```text
Generate the additional test cases from review suggestions — race condition, idempotency, and session invalidation scenarios.
```

The review suggestions become 19 additional tests covering the scenarios that the first pass missed -- the edge cases that cause production incidents:

- **Inventory** -- concurrent reservation lock test: 3 parallel `Promise.all` requests for the last item, asserting that exactly 1 succeeds and 2 receive an "out of stock" error
- **Payment** -- idempotency key collision: sending the same charge request twice with the same idempotency key returns the original result, not a duplicate charge
- **Auth** -- session invalidation cascade: changing a password invalidates all existing sessions across all devices, not just the current session
- **Validation** -- unicode normalization and SQL injection prevention through parameterized queries
- **Notifications** -- rate limiter blocks after 100 messages/minute and returns a clear "rate limited" error instead of silently dropping messages

**Total: 104 tests, all passing. Coverage: 43% to 58%.**

### Step 4: Set Up CI with Coverage Gates

```text
Create a GitHub Actions workflow that runs tests on every PR, posts coverage diff as a comment, and blocks merges below 65%.
```

The CI pipeline catches regressions before they reach main:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

services:
  postgres: { image: postgres:15 }
  redis: { image: redis:7 }

steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 20 }
  - run: npm ci --cache ~/.npm
  - run: npm test -- --coverage
  - name: Coverage gate
    run: |
      COVERAGE=$(jq '.total.statements.pct' coverage/coverage-summary.json)
      if (( $(echo "$COVERAGE < 65" | bc -l) )); then
        echo "Coverage $COVERAGE% is below 65% threshold"
        exit 1
      fi
  - name: Post coverage to PR
    uses: coverage-comment-action@v1
```

Every PR gets a coverage diff comment showing exactly which lines are newly covered and which lost coverage. The 65% gate means nobody can merge code that lowers coverage below the threshold -- even urgent hotfixes need at least a minimal test. Estimated CI run time: ~90 seconds, fast enough that developers don't context-switch while waiting.

### Step 5: Expand Coverage to Hit the Threshold

```text
Generate tests for remaining untested modules to push coverage above 65%. Focus on business logic, skip trivial utilities.
```

Eight more modules get test suites, prioritized by business impact rather than raw line count. A 200-line billing module with proration logic is more important to test than a 500-line utility module that formats dates:

| Module | Tests | What's Covered |
|---|---|---|
| `checkout` | 14 | Cart calculation, coupon stacking, tax by jurisdiction |
| `subscription` | 12 | Renewal, upgrade/downgrade proration, cancellation with refund |
| `billing` | 11 | Invoice generation, proration math, failed payment retry |
| `permissions` | 10 | Role-based access, resource ownership, cross-tenant checks |
| `reporting` | 9 | Aggregation accuracy, date range boundaries, CSV export |
| `encryption` | 8 | Key rotation, at-rest encryption, decryption with old keys |
| `rateLimit` | 7 | Sliding window accuracy, per-tenant isolation, Redis failover |
| `audit-log` | 6 | Event capture completeness, retention policy, compliance export |

**Total: 181 tests, all passing. Coverage: 58% to 71% statements, 64% branches. CI pipeline is green -- every PR is now gated at 65% minimum.**

The coverage isn't just a number for auditors. In the first week after deployment, the CI pipeline blocked 3 PRs that would have decreased coverage below the threshold. One of them was a "quick fix" that deleted a validation check (and its test) instead of fixing the underlying bug. The coverage gate caught it, the developer wrote a proper fix, and a broken validation never reached production.

## Real-World Example

A backend lead at a 25-person fintech startup faced a SOC 2 audit in 8 weeks with zero tests across a 55,000-line API. On Monday, the test-generator skill produced 120 tests for 8 critical modules. That afternoon, code-reviewer flagged 11 quality issues -- including three tests that would silently pass on broken payment logic. Those three tests looked fine at a glance: they called the right functions, asserted on return values, and showed green checkmarks. But they were testing the mocking framework, not the actual code. A test that mocks `stripe.charges.create` and then asserts it was called proves nothing about whether the payment actually works.

After fixes, the cicd-pipeline skill deployed GitHub Actions with 65% coverage gates. By Thursday: 230 tests, 73% coverage, every PR automatically checked. The team went from "deploy and pray" to "merge with confidence" in four days.

The SOC 2 auditors reviewed the setup two weeks later. Comprehensive test suites, a documented quality review process showing that generated tests were audited for correctness, and automated CI gates blocking uncovered code -- all three satisfied the change management controls. The startup passed without testing-related findings, avoiding an estimated $40,000 in remediation costs and a 3-month delay in their enterprise sales pipeline.

## Related Skills

- [hypothesis](/skills/hypothesis) — property-based tests for Python: state what must always hold and let it generate the inputs, which finds edge cases that example tests miss
