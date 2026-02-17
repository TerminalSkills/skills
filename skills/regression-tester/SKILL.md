---
name: regression-tester
description: >-
  Generate and run regression tests after code refactoring to verify behavior
  is preserved. Use when someone has refactored code and needs to confirm nothing
  broke — especially when existing test coverage is insufficient. Trigger words:
  regression test, refactor validation, behavior preservation, before/after test,
  did I break anything, refactoring safety net, snapshot test.
license: Apache-2.0
compatibility: "Works with any test framework (Jest, Vitest, pytest, Go test). Requires git for diff analysis."
metadata:
  author: carlos
  version: "1.0.0"
  category: development
  tags: ["regression-testing", "refactoring", "testing", "code-quality"]
---

# Regression Tester

## Overview

This skill creates a safety net around refactoring work. It analyzes what changed, identifies the public API surface and behavior contracts of the refactored code, generates targeted regression tests that verify behavior is preserved, and runs them against both the old and new implementations to confirm equivalence.

## Instructions

### Step 1: Analyze the Refactoring Scope

1. Get the diff: `git diff main...HEAD` or compare specific commits
2. Categorize changes:
   - **Signature changes** — function/method names, parameters, return types
   - **Internal restructuring** — same API, different implementation
   - **Extracted modules** — code moved to new files/functions
   - **Behavioral changes** — intentional behavior modifications (flag these!)

3. Identify the **behavior contract** for each changed unit:
   - What inputs does it accept?
   - What outputs does it produce?
   - What side effects does it have? (DB writes, API calls, file I/O)
   - What errors does it throw and under what conditions?

### Step 2: Check Existing Coverage

1. Run existing tests: `npm test` / `pytest` / `go test ./...`
2. If tests pass, check coverage of the refactored code:
   ```bash
   npx jest --coverage --collectCoverageFrom='src/refactored-module/**'
   ```
3. Identify untested code paths in the refactored area:
   - Uncovered branches (if/else, switch cases, error handling)
   - Edge cases (empty input, null, boundary values, concurrent access)
   - Integration points (function calls to other modules)

### Step 3: Generate Regression Tests

Create tests that verify behavior, not implementation:

1. **Input/output tests** — For pure functions, test that same inputs produce same outputs
2. **Contract tests** — For APIs, verify request/response shape and status codes
3. **Side-effect tests** — For stateful code, verify correct DB operations, events emitted
4. **Error path tests** — Verify error handling behavior is preserved
5. **Boundary tests** — Empty arrays, zero values, maximum lengths, unicode strings

**Test structure:**
```
describe('[ModuleName] regression', () => {
  describe('preserved behavior', () => {
    // Tests that MUST pass identically before and after refactor
  });
  describe('edge cases', () => {
    // Tests for boundary conditions
  });
  describe('error handling', () => {
    // Tests for error paths
  });
});
```

### Step 4: Verify Against Old Implementation

1. Stash or commit current changes
2. Checkout the pre-refactor code: `git stash && git checkout main`
3. Run the new regression tests against the OLD code — they should all pass
4. Return to refactored code: `git checkout - && git stash pop`
5. Run the regression tests again — they should still all pass
6. If any test fails on the refactored code but passed on the old code → regression found

### Step 5: Report

```
Regression Test Report
═══════════════════════
Refactored: src/services/billing.ts (4 functions, 187 lines changed)

Tests generated: 24
  Passed (old code): 24/24  ✓
  Passed (new code): 23/24  ✗

❌ REGRESSION FOUND:
  test: "calculates prorated amount for mid-cycle upgrade"
  Expected: 14.52
  Received: 14.50
  Location: src/services/billing.ts:89 (rounding changed from Math.ceil to Math.round)

✓ All other behavior preserved.
```

## Examples

### Example 1: Refactored Utility Functions

**User prompt:**
```
I refactored our date utility module from moment.js to dayjs. Can you make sure nothing broke?
```

**Agent actions:**
```bash
git diff main -- src/utils/dates.ts
```

**Agent analysis:**
```
Refactoring scope: src/utils/dates.ts
  - Import changed: moment → dayjs
  - 8 exported functions, all signatures preserved
  - Internal parsing logic changed

Existing test coverage: 3 tests covering 2 of 8 functions (25%)

Generated 18 regression tests covering:
  ✓ formatDate() — 4 formats × 3 edge cases (null, invalid, timezone)
  ✓ diffInDays() — positive, negative, same day, DST boundary
  ✓ startOfWeek() — Sunday vs Monday locale, year boundary
  ✓ parseISO() — valid, invalid, with/without timezone offset
  ✓ isBusinessDay() — weekday, Saturday, Sunday, holiday handling
  ✓ addBusinessDays() — skip weekends, cross month boundary

Results against old code (moment.js): 18/18 passed
Results against new code (dayjs):     17/18 passed

❌ Regression: startOfWeek('2024-01-01') returns Sunday with dayjs
   but returned Monday with moment (locale-dependent).
   Fix: Add dayjs.extend(weekOfYear) and set locale explicitly.
```

### Example 2: Extracted Service Layer

**User prompt:**
```
I split our monolithic UserController into UserService + UserController. Did I break anything?
```

**Agent output:**
```
Analyzed refactoring: 1 file → 2 files
  Old: src/controllers/UserController.ts (342 lines)
  New: src/controllers/UserController.ts (98 lines) + src/services/UserService.ts (267 lines)

Public API surface: 6 endpoints unchanged (routes, params, response shapes)
Internal: Business logic extracted to UserService, controller delegates

Generated 22 regression tests:
  POST /users — creation with valid data, duplicate email, missing fields
  GET /users/:id — existing user, non-existent (404), invalid ID format
  PUT /users/:id — partial update, full update, unauthorized (403)
  DELETE /users/:id — soft delete, already deleted, cascade check
  GET /users — pagination, filtering, sorting, empty result

Results: 22/22 passed on both old and new code ✓
No regressions detected. Refactoring is safe.
```

## Guidelines

- Test behavior, not implementation — don't assert on internal method calls
- Run tests against BOTH old and new code to confirm equivalence
- Flag intentional behavior changes separately from regressions
- Focus test generation on the changed code, not the entire codebase
- Include edge cases that the original code may not have tested
- For database-touching code, use transactions that roll back after each test
- If the refactoring changes performance characteristics, add benchmark comparisons
- Keep regression tests permanent — they protect against future changes too
