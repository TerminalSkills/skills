---
name: cypress
description: >-
  Assists with end-to-end testing of web applications using Cypress. Use when writing E2E tests,
  setting up component testing, configuring CI pipelines with parallelization, or building custom
  test commands. Trigger words: cypress, e2e testing, end-to-end, cypress run, cy.get, integration
  testing, browser testing.
license: Apache-2.0
compatibility: "Requires Node.js 18+ and a supported browser (Chrome, Firefox, Edge)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["cypress", "e2e-testing", "testing", "browser-testing", "automation"]
---

# Cypress

## Overview

Cypress is an end-to-end testing framework for web applications that runs tests directly in the browser for fast, reliable feedback. It provides element selection, network interception, component testing, and CI integration with parallelization and video recording.

## Instructions

- When selecting elements, use `data-testid` or `data-cy` attributes with `cy.get("[data-testid='submit']")` instead of CSS classes or IDs for resilient selectors.
- When testing interactions, use `cy.get().type()`, `.click()`, `.select()`, and `.check()` for user actions, and chain `.should()` assertions for expected outcomes.
- When handling API calls, use `cy.intercept()` to stub external APIs with fixtures or spy on requests, and `cy.wait("@alias")` after actions that trigger calls instead of `cy.wait(ms)`.
- When writing custom commands, use `Cypress.Commands.add()` for reusable patterns like login, database seeding, and common workflows, with TypeScript declarations for IntelliSense.
- When testing components, use `cy.mount()` with framework-specific mounting libraries (`@cypress/react`, `@cypress/vue`) to test components in isolation.
- When configuring CI, use `cypress run --record --key` for Cypress Cloud integration with `--parallel` to split tests across machines, and `--browser` to specify the browser.
- When setting up the project, configure `cypress.config.ts` with `baseUrl`, viewport dimensions, timeouts, and environment variables.

## Examples

### Example 1: Write E2E tests for a checkout flow

**User request:** "Add Cypress tests for our e-commerce checkout process"

**Actions:**
1. Set up test with `cy.visit("/products")` and select a product
2. Intercept the cart API with `cy.intercept("POST", "/api/cart")` and alias it
3. Fill in shipping form using `cy.get("[data-testid='email']").type(...)`
4. Assert order confirmation with `cy.url().should("include", "/confirmation")`

**Output:** A reliable E2E test covering the full checkout flow with stubbed API responses.

### Example 2: Set up component testing for React

**User request:** "Configure Cypress component testing for our React project"

**Actions:**
1. Install `@cypress/react` and configure component testing in `cypress.config.ts`
2. Create stories for key components using `cy.mount(<Component />)`
3. Test interactions with `cy.get().click()` and assert DOM changes
4. Add to CI pipeline alongside E2E tests

**Output:** Isolated component tests running in a real browser with full Cypress API.

## Guidelines

- Use `data-testid` attributes for test selectors; never rely on CSS classes, text content, or DOM structure.
- Keep tests independent: each test should set up its own state (login, seed data).
- Use `cy.intercept()` to stub external APIs; do not let tests depend on third-party service availability.
- Add `cy.wait("@alias")` after actions that trigger API calls; do not use `cy.wait(ms)` for timing.
- Write tests from the user's perspective: "fill in the form, click submit, see confirmation."
- Use fixtures for large API response data; inline small responses in `cy.intercept()`.
- Run Cypress in CI with `--record` for test replay, screenshots, and video on failure.
