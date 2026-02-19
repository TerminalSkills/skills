---
name: msw
description: >-
  Assists with intercepting network requests for API mocking using Mock Service Worker (MSW).
  Use when mocking REST or GraphQL APIs for unit tests, integration tests, or local
  development without modifying application code or running mock servers. Trigger words:
  msw, mock service worker, api mocking, test mocking, request handlers, setupServer.
license: Apache-2.0
compatibility: "Requires Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["msw", "testing", "api-mocking", "rest", "graphql"]
---

# MSW (Mock Service Worker)

## Overview

MSW intercepts network requests at the service worker level (browser) or in-memory (Node.js) to mock REST and GraphQL APIs for tests and local development. It uses the same handlers for both environments, keeping mocks consistent, and works transparently with any HTTP client (fetch, axios, Apollo) without modifying application code.

## Instructions

- When setting up handlers, define REST handlers with `http.get()`, `http.post()`, etc. and GraphQL handlers with `graphql.query()` and `graphql.mutation()`, returning responses via `HttpResponse.json()`.
- When testing in Node.js, use `setupServer(...handlers)` with `server.listen()` before tests, `server.resetHandlers()` between tests, and `server.close()` after all tests.
- When developing in the browser, use `setupWorker(...handlers)` and run `npx msw init ./public` to generate the service worker file, which intercepts requests visible in DevTools.
- When overriding per test, use `server.use()` to add temporary handlers for error states or edge cases, which scope to the current test and reset afterward.
- When simulating network issues, use `delay(ms)` for latency, `HttpResponse.error()` for failures, and custom status codes for error responses.
- When organizing handlers, keep shared handlers in `src/mocks/handlers.ts` for reuse across test files and the dev server, with per-test overrides via `server.use()`.

## Examples

### Example 1: Mock a REST API for component tests

**User request:** "Set up MSW to mock my user API for React Testing Library tests"

**Actions:**
1. Define handlers in `src/mocks/handlers.ts` for GET `/api/users`, POST `/api/users`, and GET `/api/users/:id`
2. Set up `setupServer(...handlers)` in the test setup file with beforeAll/afterEach/afterAll hooks
3. Write component tests that render with data from the mock API
4. Add per-test error overrides with `server.use(http.get("/api/users", () => HttpResponse.json(null, { status: 500 })))`

**Output:** Component tests with realistic API mocking, including happy path and error state coverage.

### Example 2: Mock a GraphQL API for development

**User request:** "Set up MSW to mock my GraphQL API during local development"

**Actions:**
1. Define GraphQL handlers for queries (`GetPosts`, `GetUser`) and mutations (`CreatePost`)
2. Set up `setupWorker(...handlers)` in the browser entry point with conditional activation
3. Add `delay(300)` to simulate realistic network latency
4. Run `npx msw init ./public` and start the dev server

**Output:** A development environment with mocked GraphQL API visible in browser DevTools, with realistic latency.

## Guidelines

- Use MSW in both tests and development with the same handlers to keep mocks consistent.
- Define handlers in a shared `src/mocks/handlers.ts` file for reuse across test files and the dev server.
- Use `server.use()` for per-test overrides; keep the default happy path in shared handlers.
- Always mock error states in tests to verify error handling works correctly.
- Use `delay()` in development mocks to simulate real latency and catch loading state bugs.
- Reset handlers after each test with `afterEach(() => server.resetHandlers())` to prevent test pollution.
