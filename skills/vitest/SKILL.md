---
name: vitest
description: >-
  Assists with unit and integration testing using Vitest, a Vite-native test runner. Use when
  writing tests, configuring mocks, setting up coverage, or migrating from Jest. Trigger words:
  vitest, unit testing, test runner, vi.fn, vi.mock, test coverage, jest replacement.
license: Apache-2.0
compatibility: "Requires Vite or standalone Vitest configuration"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["vitest", "testing", "unit-testing", "vite", "jest-alternative"]
---

# Vitest

## Overview

Vitest is a Vite-native test runner that provides a Jest-compatible API with native ESM support, instant watch mode via Vite's HMR, and shared Vite configuration for aliases, plugins, and transforms. It serves as a drop-in Jest replacement with significantly faster startup and execution.

## Instructions

- When writing tests, use `describe()` blocks to group related tests, `it()` or `test()` for individual cases, and follow the pattern of naming tests as behavior descriptions (e.g., "should return 404 when user not found").
- When mocking, use `vi.fn()` for function mocks, `vi.mock("./module")` for module mocks, `vi.useFakeTimers()` for timer control, and `vi.setSystemTime()` for date mocking.
- When setting up assertions, use `toBe()` for primitives, `toEqual()` for objects/arrays, and `toMatchInlineSnapshot()` for small expected outputs.
- When configuring, define test settings in `vite.config.ts` under the `test` property or in a separate `vitest.config.ts`, choosing the appropriate environment (`jsdom`, `happy-dom`, `node`).
- When measuring coverage, use `@vitest/coverage-v8` with `vitest --coverage` and set minimum thresholds in CI with `--coverage.thresholds.lines=80`.
- When testing in browsers, use `@vitest/browser` with Playwright or WebDriverIO providers for real DOM testing instead of jsdom simulation.
- When working in monorepos, use `vitest.workspace.ts` for multi-project configuration that shares common settings.

## Examples

### Example 1: Test a service with API mocking

**User request:** "Write Vitest tests for a user service that calls an external API"

**Actions:**
1. Mock the HTTP module with `vi.mock()` to intercept API calls
2. Write tests for success, error, and edge cases using `describe` and `it`
3. Assert responses with `toEqual()` and error handling with `toThrow()`
4. Use `beforeEach` with `vi.clearAllMocks()` for test isolation

**Output:** Isolated unit tests for the user service with mocked external dependencies.

### Example 2: Migrate from Jest to Vitest

**User request:** "Switch our test suite from Jest to Vitest"

**Actions:**
1. Install `vitest` and add test config to `vite.config.ts`
2. Replace `jest.fn()` with `vi.fn()` and `jest.mock()` with `vi.mock()`
3. Update `package.json` scripts to use `vitest` and `vitest --coverage`
4. Remove `ts-jest`, `babel-jest`, and Jest config files

**Output:** A Vitest-powered test suite with the same tests running faster with native ESM support.

## Guidelines

- Use `describe` blocks to group related tests; keep individual tests focused on one behavior.
- Prefer `toEqual()` for objects/arrays and `toBe()` for primitives.
- Mock external dependencies (HTTP, database), not internal modules; test real integration where possible.
- Use `beforeEach` for test isolation, not `beforeAll`; shared state between tests causes flaky results.
- Name tests as behavior descriptions: "should return 404 when user not found", not "test getUserById".
- Use inline snapshots for small expected outputs; file snapshots for large/complex structures.
- Run `vitest --coverage` in CI with a minimum threshold: `--coverage.thresholds.lines=80`.
