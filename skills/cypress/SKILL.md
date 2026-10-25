---
name: cypress
description: >-
  Assists with end-to-end testing of web applications using Cypress. Use when writing E2E tests,
  setting up component testing, configuring CI pipelines with parallelization, or building custom
  test commands. Trigger words: cypress, e2e testing, end-to-end, cypress run, cy.get, integration
  testing, browser testing.
license: Apache-2.0
compatibility: "Cypress 16 requires Node.js 22, 24 or 26+; runs in Chrome, Chromium, Edge, Firefox, WebKit (experimental) and Electron (deprecated in 16)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/cypress-io/cypress
  category: development
  tags: "cypress, e2e-testing, testing, browser-testing, automation"
---

# Cypress

## Overview

Cypress is an end-to-end testing framework for web applications that runs tests directly in the browser for fast, reliable feedback. It provides element selection, network interception, component testing, and CI integration with parallelization and video recording. This skill targets Cypress 16 (16.2.0 at the time of writing); notes mark what changed from 13-15.

## Instructions

### Install and configure

```bash
npm install --save-dev cypress
npx cypress open      # first run: pick E2E or Component Testing, the launchpad creates the files
```

```ts
// cypress.config.ts
import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.{js,ts}',
    setupNodeEvents(on, config) {
      on('task', {
        // runs in Node: use it for DB seeding instead of cy.exec (removed in 16)
        'db:seed': (name: string) => seedDatabase(name),
      })
      return config
    },
  },
  expose: { apiVersion: 'v2' }, // public values, read with Cypress.expose('apiVersion')
  video: false,                 // default; set true to record cypress run videos
})
```

- Cypress 16 needs Node.js 22, 24 or 26+ (Node 18 and 20 were dropped in 15 and 16). Install through a package manager; the direct-download installer was removed in 15.
- `Cypress.env()` and the `allowCypressEnv` option were removed in 16. Put public values in the top-level `expose` block and read them with `Cypress.expose('apiVersion')`. Read secrets (tokens, passwords) with the asynchronous `cy.env(['apiToken']).then(({ apiToken }) => ...)`. The Command Log shows only the variable names, never the values.
- `cy.exec()` and `execTimeout` were removed in 16: register a `cy.task()` in `setupNodeEvents` and use `taskTimeout`. `cy.end()` was also removed; delete those calls.
- `testIsolation` is on by default: the page, cookies and storage are cleared before every test, so each test must visit and log in itself.

### Write tests

- Select with `data-cy` or `data-testid` attributes: `cy.get("[data-cy='submit']")`. Since 16.2 you can also query by accessible role: `cy.getByRole('tab', { name: 'Billing' })`.
- Use `.type()`, `.click()`, `.select()`, `.check()` for actions and chain `.should()` for outcomes; assertions retry until they pass or time out (default 4000 ms).
- Stub or spy with `cy.intercept()` and `cy.wait('@alias')`; never `cy.wait(ms)`. Chrome, Chromium and Edge use native network interception in 16 (`req.httpVersion` is no longer reported; set `forceHttp1` to fall back).
- Cache logins with `cy.session()` inside a custom command rather than logging in through the UI before every test.
- Add custom commands with `Cypress.Commands.add()` in `cypress/support/commands.ts` and declare them in the `Chainable` interface for TypeScript.

### Component testing

Cypress ships its own mount adapters, so you do not install `@cypress/react` or `@cypress/vue` separately (`@cypress/react18` is deprecated). React 18/19 with Vite 8+, Webpack or Next.js 15.0.4+ is supported (Vite 5-7 and Next.js 14 were dropped in 16).

```ts
// cypress/support/component.ts
import { mount } from 'cypress/react'
import './commands'

declare global {
  namespace Cypress {
    interface Chainable { mount: typeof mount }
  }
}
Cypress.Commands.add('mount', mount)
```

```ts
// cypress.config.ts (component part)
component: { devServer: { framework: 'react', bundler: 'vite' } },
```

For Vue import `mount` from `cypress/vue`; for Angular import it from `cypress/angular`, which needs Angular 21+ in Cypress 16.

### CI

```bash
npx cypress run --browser chrome                      # headless, all specs
npx cypress run --component                           # component specs
npx cypress run --record --key "$CYPRESS_RECORD_KEY" --parallel --ci-build-id "$GITHUB_RUN_ID"
```

`--record`, `--parallel` and `--ci-build-id` need a Cypress Cloud project; without Cloud, split specs across jobs with `--spec`. Use the official `cypress-io/github-action` on GitHub Actions to install, cache the binary and start the server.

## Examples

### Example 1: Write E2E tests for a checkout flow

**User request:** "Add Cypress tests for our e-commerce checkout process"

```ts
// cypress/e2e/checkout.cy.ts
describe('checkout', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/cart', { statusCode: 201, fixture: 'cart.json' }).as('addToCart')
    cy.intercept('POST', '/api/orders', { statusCode: 201, body: { id: 'ord_1042' } }).as('placeOrder')
    cy.visit('/products/trail-runner-2')
  })

  it('places an order and shows the confirmation', () => {
    cy.get("[data-cy='add-to-cart']").click()
    cy.wait('@addToCart')
    cy.visit('/checkout')
    cy.get("[data-cy='email']").type('maria.lopez@shop-demo.net')
    cy.get("[data-cy='address']").type('18 Harbor Street, Portland')
    cy.get("[data-cy='place-order']").click()
    cy.wait('@placeOrder').its('request.body').should('have.property', 'email')
    cy.url().should('include', '/confirmation/ord_1042')
    cy.contains('Thank you for your order').should('be.visible')
  })
})
```

**Result:** `npx cypress run --spec cypress/e2e/checkout.cy.ts` prints one passing test; a failure writes a screenshot to `cypress/screenshots/`.

### Example 2: Set up component testing for React

**User request:** "Configure Cypress component testing for our React project"

**Actions:** run `npx cypress open`, choose Component Testing (Vite is detected), accept the generated `cypress/support/component.ts`, then write a spec next to the component.

```tsx
// src/components/Counter.cy.tsx
import Counter from './Counter'

it('increments on click', () => {
  cy.mount(<Counter initial={2} />)
  cy.get("[data-cy='increment']").click()
  cy.get("[data-cy='value']").should('have.text', '3')
})
```

**Result:** `npx cypress run --component` runs the spec in a real browser, mounting only the component.

## Guidelines

- Use dedicated `data-cy` or `data-testid` attributes for selectors; avoid CSS classes and DOM structure. Role queries are fine for accessible elements.
- Keep tests independent: each test sets up its own state (`cy.session()` for login, `cy.task()` for seeding).
- Stub external services with `cy.intercept()` so tests do not depend on third-party availability; keep large payloads in `cypress/fixtures/`.
- Never use `cy.wait(ms)` for timing; wait on an alias or an assertion.
- Do not store secrets in `expose` or `env` files committed to the repository; pass them as `CYPRESS_*` environment variables and read them with `cy.env()`.
- Cypress commands are queued, not promises: do not `await` them or assign their results to variables; use `.then()` or aliases.
- Cypress tests one browser tab per test and, within a test, cross-origin pages need `cy.origin()`. For multi-tab or multi-browser-context flows consider Playwright.
