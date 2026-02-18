---
title: "Add End-to-End Tests with Playwright to Catch Bugs Before Users Do"
slug: add-e2e-tests-with-playwright
description: "Set up Playwright for automated end-to-end testing — write tests for critical user flows, mock APIs, add visual regression checks, and integrate into CI to catch breakages before they reach production."
skills: [playwright-testing, cicd-pipeline, test-generator]
category: development
tags: [playwright, testing, e2e, browser-testing, ci-cd, qa]
---

# Add End-to-End Tests with Playwright to Catch Bugs Before Users Do

## The Problem

Dani is a frontend lead at a 15-person startup building a B2B analytics dashboard. The team ships fast — 3-4 PRs merged daily — but has no end-to-end tests. They rely on manual QA before releases, which means the QA engineer spends 4 hours clicking through flows every Thursday. Despite this, production bugs slip through regularly: last sprint, a CSS change broke the login button on Safari, a refactor silently removed a form validation, and a dashboard filter stopped working after an API response format changed.

The team tried Cypress a year ago but abandoned it — tests were slow, flaky, and broke every time the UI changed because they were coupled to CSS selectors. They need a testing setup that is fast, stable, works across browsers, and does not turn into a maintenance burden.

## The Solution

Use **playwright-testing** to set up a robust e2e test suite with auto-waiting locators that resist UI changes, **test-generator** to scaffold initial tests for critical flows, and **cicd-pipeline** to run tests on every PR so broken code never reaches main.

## Step-by-Step Walkthrough

### 1. Set up Playwright with the right configuration

```text
Set up Playwright for our Next.js analytics dashboard. We need to test on Chromium, Firefox, and WebKit (our users report Safari bugs often). Configure it to: auto-start our dev server (npm run dev on port 3000), capture traces and screenshots only on failure (save CI storage), retry failed tests twice in CI, run tests in parallel locally but sequentially in CI (our CI runner is small). We use TypeScript.
```

The agent generates the configuration:

```text
Playwright configured:

  playwright.config.ts:
    Test directory: ./tests/e2e
    Browsers: Chromium, Firefox, WebKit
    Parallel: yes locally, 1 worker in CI
    Retries: 2 in CI, 0 locally
    Traces: on-first-retry (captures timeline, DOM, network)
    Screenshots: only-on-failure
    Video: on-first-retry
    Web server: npm run dev, port 3000, reuse if running

  Project structure:
    tests/
      e2e/
        auth.setup.ts          — Login once, save session
        pages/                 — Page object models
        flows/                 — User flow tests
        visual/                — Screenshot comparison tests
      .auth/                   — Saved auth state (gitignored)

  Dependencies installed:
    @playwright/test, @axe-core/playwright
    Browsers: chromium, firefox, webkit downloaded
```

### 2. Write tests for the 5 most critical user flows

```text
Write e2e tests for our most critical flows. Our app is a B2B analytics dashboard. The critical flows are:

1. Login — email/password, should redirect to /dashboard, show user's name in header
2. Dashboard — load default dashboard, verify 4 KPI cards render with numbers (not loading spinners), date range picker works
3. Create report — click "New Report", select metrics (revenue, users, conversion), choose date range, generate report, verify chart renders
4. Filter and export — apply filters (date range, country, device), verify table updates, click Export CSV, verify download starts
5. Team invite — go to Settings > Team, enter email, select role, send invite, verify invite appears in pending list

Use page objects for each page. Use role-based locators (getByRole, getByLabel) not CSS selectors.
```

The agent writes the test suite:

```text
5 critical flow tests created:

  tests/e2e/pages/
    login.page.ts        — email, password, submit, error locators
    dashboard.page.ts    — KPI cards, date picker, navigation
    report.page.ts       — metric selector, chart, generate button
    data-table.page.ts   — filters, table rows, export button
    settings.page.ts     — team tab, invite form, pending list

  tests/e2e/flows/
    01-login.spec.ts
      ✓ successful login redirects to dashboard
      ✓ invalid credentials show error message
      ✓ empty fields show validation errors

    02-dashboard.spec.ts
      ✓ KPI cards show numbers (not loading state)
      ✓ date range picker updates all cards
      ✓ clicking KPI card navigates to detail view

    03-create-report.spec.ts
      ✓ create report with revenue + users metrics
      ✓ chart renders with correct date range
      ✓ report appears in sidebar after save

    04-filter-export.spec.ts
      ✓ country filter updates table data
      ✓ date range filter shows correct rows
      ✓ CSV export triggers download with filtered data

    05-team-invite.spec.ts
      ✓ invite team member with viewer role
      ✓ pending invite shows in list
      ✓ duplicate email shows error

  Total: 15 tests across 3 browsers = 45 test runs
  Estimated runtime: ~90 seconds (parallel)

  Auth setup:
    auth.setup.ts logs in once, saves storageState
    All flow tests reuse saved session (no repeated logins)
```

### 3. Add API mocking for edge cases you can not test with real data

```text
Add tests for error states and edge cases using API mocking. Test these scenarios:

1. Dashboard API returns 500 — should show error state with retry button
2. Dashboard API returns empty data — should show "No data for this period" message
3. Report generation takes more than 5 seconds — should show progress indicator
4. Export fails mid-download — should show error toast
5. Session expires while user is on dashboard — should redirect to login

Use Playwright's route mocking, don't hit real APIs for these tests.
```

The agent creates mocked tests:

```text
Edge case tests with API mocking:

  tests/e2e/flows/edge-cases.spec.ts

    ✓ API error → shows error state with retry button
      Mocks: /api/dashboard → 500
      Verifies: error message visible, retry button works, data loads after retry

    ✓ Empty data → shows empty state
      Mocks: /api/dashboard → 200, { data: [] }
      Verifies: "No data for this period" message, suggests changing date range

    ✓ Slow report generation → shows progress
      Mocks: /api/reports/generate → 3s delay → 200
      Verifies: progress indicator appears, chart renders after response

    ✓ Export failure → shows error toast
      Mocks: /api/export → starts response, then aborts
      Verifies: error toast appears with "Export failed", retry option shown

    ✓ Expired session → redirects to login
      Mocks: /api/dashboard → 401
      Verifies: redirect to /login, "Session expired" message shown

  These tests run without a backend — pure UI behavior testing.
  Runtime: ~15 seconds (all API responses are mocked, no network wait).
```

### 4. Add visual regression tests for key pages

```text
Add visual regression tests that catch unexpected CSS changes. Take screenshots of: the login page, the dashboard with KPI cards, a generated report with chart, and the settings page. Mock API responses to ensure consistent data for screenshots. Configure a 1% pixel diff threshold so minor anti-aliasing differences don't cause failures.
```

The agent sets up visual testing:

```text
Visual regression tests configured:

  tests/e2e/visual/screenshots.spec.ts

    Pages captured:
      login.png          — Login page (no auth needed)
      dashboard.png      — Dashboard with 4 KPI cards (mocked data)
      report-chart.png   — Report with line chart (mocked data)
      settings-team.png  — Settings > Team tab (mocked members)

    Configuration:
      maxDiffPixelRatio: 0.01 (1% threshold)
      Mocked API data for deterministic screenshots
      Frozen date/time to prevent timestamp drift

    Snapshot storage:
      tests/e2e/visual/screenshots.spec.ts-snapshots/
      → Committed to git, reviewed in PRs

    Update command:
      npx playwright test tests/e2e/visual --update-snapshots
```

### 5. Integrate into CI so every PR is tested

```text
Create a GitHub Actions workflow that runs the full Playwright suite on every PR to main. Cache the Playwright browsers between runs to speed up CI. Upload the HTML report as an artifact on failure so developers can debug. Add a PR comment that summarizes test results (passed/failed/skipped). The workflow should block merge if any test fails.
```

The agent creates the CI pipeline:

```text
CI workflow created: .github/workflows/e2e.yml

  Trigger: pull_request to main

  Steps:
    1. Checkout + setup Node 20
    2. npm ci (cached)
    3. Install Playwright browsers (cached — saves ~45s)
    4. Run all tests: npx playwright test
    5. Upload HTML report artifact (always, for debugging)
    6. Post PR comment with results summary

  PR comment example:
    🎭 Playwright Results: 45/45 passed
    ✅ Chromium: 15 passed
    ✅ Firefox: 15 passed
    ✅ WebKit: 15 passed
    ⏱️ Duration: 2m 14s

  On failure:
    🎭 Playwright Results: 43/45 passed, 2 failed
    ❌ Firefox: filter-export.spec.ts › CSV export (trace attached)
    ❌ WebKit: login.spec.ts › redirect after login (screenshot attached)
    📎 Download full report: [artifact link]

  Branch protection:
    → Require "E2E Tests" check to pass before merge
    → Blocks merge on any test failure

  Total CI time: ~3 minutes (parallel tests, cached browsers)
```

## Real-World Example

A frontend team at a B2B startup ships 3-4 PRs daily with no e2e tests. Every release, their QA engineer spends 4 hours manually clicking through flows, and bugs still slip through — a broken Safari login, missing form validation, a filter that stopped working after an API change.

1. They ask the agent to set up Playwright — it configures multi-browser testing with auth state reuse and page objects
2. 15 tests cover the 5 most critical flows, running across Chrome, Firefox, and Safari in 90 seconds
3. API mocking catches edge cases that are impossible to test manually — error states, timeouts, expired sessions
4. Visual regression tests catch a CSS change that would have broken the dashboard layout on mobile
5. CI runs the full suite on every PR — the team catches 3 bugs in the first week that would have reached production
6. QA time drops from 4 hours per release to 30 minutes of exploratory testing. The QA engineer focuses on finding new bugs instead of re-checking old flows
