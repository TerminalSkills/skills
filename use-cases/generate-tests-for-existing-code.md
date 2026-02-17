---
title: "Generate Tests for Existing Code with AI"
slug: generate-tests-for-existing-code
description: "Use an AI agent to analyze untested code and generate comprehensive unit and integration tests automatically."
skills: [test-generator]
category: development
tags: [testing, unit-tests, code-quality, automation, tdd]
---

# Generate Tests for Existing Code with AI

## The Problem

Most teams inherit codebases with little or no test coverage. A typical Node.js backend with 40+ modules and zero tests becomes a liability — every deployment is a gamble. Writing tests retroactively is tedious: you need to understand each function's intent, identify edge cases, and set up mocks. Engineers estimate 2-3 hours per module to write meaningful tests manually, which means 80-120 hours for a medium codebase. The work keeps getting deprioritized because there's always a feature to ship.

## The Solution

The `test-generator` skill analyzes your source files, infers behavior from function signatures, JSDoc comments, and usage patterns, then produces ready-to-run test suites with realistic assertions and edge case coverage.

```bash
npx terminal-skills install test-generator
```

## Step-by-Step Walkthrough

### 1. Scan the codebase for untested modules

```
Analyze the src/ directory and list all modules that have no corresponding test files. Show coverage gaps ranked by import frequency — I want to test the most-used code first.
```

The agent maps source files against `__tests__/` and `*.test.ts` patterns, then ranks by how often each module is imported across the project.

### 2. Generate tests for the highest-priority module

```
Generate a full test suite for src/services/paymentProcessor.ts. Cover the happy path for processCharge, refundTransaction, and validateCard, plus edge cases: expired cards, insufficient funds, network timeouts, and duplicate charge attempts. Use Jest with ts-jest.
```

The agent reads the source, identifies four exported functions, and produces a test file with 14 test cases including mocked Stripe API responses.

### 3. Run the generated tests and fix failures

```
Run the new test suite. If any tests fail because of incorrect assumptions about return types or async behavior, fix them based on the actual source code.
```

The agent executes `npx jest paymentProcessor.test.ts`, identifies two tests that expected synchronous returns instead of Promises, and corrects the assertions.

### 4. Generate tests for the next five modules in priority order

```
Now generate test suites for the next 5 highest-priority modules from the scan. Use the same patterns and mocking conventions from the paymentProcessor tests for consistency.
```

The agent produces five additional test files totaling 62 test cases, reusing the established mock factory pattern.

### 5. Generate a coverage report

```
Run the full test suite with coverage reporting. Show me which lines in the tested modules are still uncovered so I can decide if we need additional edge case tests.
```

```
PASS  __tests__/paymentProcessor.test.ts (14 tests)
PASS  __tests__/userAuth.test.ts (11 tests)
PASS  __tests__/orderManager.test.ts (13 tests)
PASS  __tests__/inventoryService.test.ts (9 tests)
PASS  __tests__/notificationHub.test.ts (8 tests)
PASS  __tests__/rateLimiter.test.ts (7 tests)

Statements: 78.4% | Branches: 71.2% | Functions: 85.0% | Lines: 79.1%
```

## Real-World Example

A backend engineer at a fintech startup inherits a 2-year-old Node.js payment service with 45 modules and 0% test coverage. The team needs to pass a SOC 2 audit in six weeks, which requires demonstrated test coverage above 70%.

1. She points the agent at the `src/` directory — it identifies 45 untested modules and ranks them by import frequency
2. Over two sessions, the agent generates test suites for the 30 most critical modules, producing 187 test cases
3. After running and auto-fixing 12 failing tests due to async mismatches, 175 tests pass on first run
4. The final coverage report shows 74.3% line coverage across the tested modules

What would have taken the engineer an estimated 90 hours of manual work is completed in under 4 hours of interactive sessions. The team passes the SOC 2 audit on schedule.

## Related Skills

- [code-reviewer](../skills/code-reviewer/) — Review generated tests for logical correctness before merging
- [coding-agent](../skills/coding-agent/) — Write missing implementation code when tests reveal gaps
