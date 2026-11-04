---
title: "Automate Cross-Browser Testing with AI"
slug: automate-cross-browser-testing
description: "Generate and maintain cross-browser test suites that catch rendering and behavior differences across Chrome, Firefox, and Safari."
skills: [test-generator, coding-agent, web-scraper]
category: development
tags: [cross-browser, testing, automation, playwright, compatibility]
---

# Automate Cross-Browser Testing with AI

## The Problem

Your web app looks perfect in Chrome, but customers on Safari report broken layouts, and Firefox users see a flash of unstyled content on page load. Your QA process is a developer manually opening the app in three browsers before each release, clicking through key flows, and hoping they catch visual regressions. This takes 3-4 hours per release, misses subtle CSS differences, and is the first thing skipped when deadlines are tight. Last month, a Safari flexbox bug shipped to production and stayed there for two weeks because nobody tested on WebKit.

## The Solution

Use the **web-scraper** skill (its JavaScript-rendered fetch, which drives Playwright) to inventory the routes and links of the running app, the **test-generator** skill to create Playwright test suites for them, and the **coding-agent** to configure multi-browser execution, CSS fixes and CI. Baseline screenshots come from Playwright itself (`toHaveScreenshot`), not from the scraper.

## Step-by-Step Walkthrough

### Step 1: Analyze Your App for Cross-Browser Risk Areas

```text
Our app is a Next.js dashboard at http://127.0.0.1:3000. Key user flows:
login, dashboard overview, create report, export to PDF. We have zero
cross-browser tests. Crawl the running app to list its routes, then set up
Playwright tests across Chromium, Firefox and WebKit. Focus on the areas
most likely to break.
```

The web-scraper skill's Playwright fetch loads each page, waits for rendering and collects same-origin `a[href]` links, which gives the list of routes the tests must cover. Not every part of the app carries the same cross-browser risk. Standard layouts and form submissions work fine everywhere. The danger lives in newer CSS features and JavaScript APIs, and in the browser versions you promise to support: check each feature on MDN or caniuse against your support policy.

### Step 2: Identify High-Risk Components

The codebase analysis flags specific CSS features and JavaScript APIs with known browser differences:

**Higher risk (features that need a version or prefix check):**

| Component | CSS Feature | Browser Issue |
|---|---|---|
| Dashboard grid | CSS subgrid | Firefox 71+, Chrome 117+, Safari 16+; older versions ignore it |
| Date picker | `:has()` selector | Safari 15.4+, Chrome 105+, Firefox 121+ |
| Export modal | `backdrop-filter` | Safari needed the `-webkit-` prefix until version 18 |
| PDF preview | Container queries | Chrome 105+, Safari 16+, Firefox 110+ |

**Medium risk (JavaScript behavior differences):**
- File upload drag-and-drop — `DataTransfer` and drop behavior differ between engines
- Rich text editor — clipboard paste handling varies, especially for formatted content
- Infinite scroll — `IntersectionObserver` threshold behavior differs subtly

Low risk items (standard layouts, form submissions, navigation) get basic coverage but do not need the same scrutiny.

### Step 3: Generate Playwright Test Suites

The test suites target five browser configurations, not just three, because mobile viewports introduce their own issues. Playwright's `webkit` is the WebKit engine, not the Safari application, so it catches engine differences but not everything real Safari does; keep a manual Safari pass for releases that touch media, payments or input handling.

```
tests/
  cross-browser/
    login.spec.ts              # Auth flow across all browsers
    dashboard-layout.spec.ts   # Grid rendering, responsive breakpoints
    create-report.spec.ts      # Form interactions, date picker
    export-pdf.spec.ts         # Modal, file download behavior
    visual-regression.spec.ts  # Screenshot comparisons per browser
  playwright.config.ts         # Multi-browser configuration
  fixtures/
    test-data.ts               # Shared test data
```

The Playwright config defines the browser matrix:

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/cross-browser',
  retries: process.env.CI ? 1 : 0,           // one retry in CI marks flaky tests
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
```

Each test file focuses on one user flow but runs across all five configurations. The dashboard layout test, for example, asserts `CSS.supports('grid-template-rows', 'subgrid')` and compares a full-page screenshot per project:

```typescript
await page.goto('/dashboard');
await expect(page).toHaveScreenshot('dashboard.png', { fullPage: true });
```

The first run with `--update-snapshots` writes the baselines.

### Step 4: Capture Visual Baselines and Fix Existing Issues

`npx playwright test --update-snapshots` captures baselines per project, stored as `dashboard-chromium-linux.png`, `dashboard-webkit-linux.png` and so on. Screenshots differ by operating system and fonts, so generate and compare them in the same environment, for example the `mcr.microsoft.com/playwright` container image matching your Playwright version. Reviewing the baselines side by side is where existing cross-browser bugs surface, before writing any new code. An example of what a review might find:

| Page | Browsers Match? | Issue Found |
|---|---|---|
| Login page | All 5 match | No issues |
| Dashboard overview | One engine differs | Card rows no longer align across the grid |
| Create report modal | All match | No issues |
| Export dialog | WebKit differs | `backdrop-filter` blur effect not rendering |

Both issues get fixed with CSS fallbacks:

```css
/* dashboard.module.css — align card rows with subgrid, fixed heights without it */
.dashboardGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.card { display: flex; flex-direction: column; }
.card header { min-height: 3rem; }          /* fallback: equal header height */

@supports (grid-template-rows: subgrid) {
  .card {
    display: grid;
    grid-row: span 2;                        /* header row + body row */
    grid-template-rows: subgrid;
  }
}
```

```css
/* modal.module.css — prefix for Safari versions before 18 */
.modalOverlay {
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
```

After fixes, new baselines are captured. These screenshots become the reference point — any future CSS change that causes a visual difference in any browser will be caught.

### Step 5: Integrate Tests into CI

The CI workflow runs cross-browser tests on every pull request:

```yaml
# .github/workflows/test.yml
jobs:
  cross-browser:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npx playwright install --with-deps ${{ matrix.browser }}
      - run: npx playwright test --project=${{ matrix.browser }}
        env:
          CI: "true"
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: diff-screenshots-${{ matrix.browser }}
          path: test-results/
```

Key details that keep CI fast and useful:

- **Parallel execution:** one CI job per engine, with Playwright running test files in parallel workers inside each job (mobile projects are added to the matrix the same way)
- **Visual regression:** compares every screenshot against the committed baseline
- **Flake detection:** `retries: 1` in CI retries a failed test once and reports it as flaky if it then passes
- **Diff artifacts:** on failure, the actual screenshot, expected screenshot, and pixel-diff image get uploaded for immediate debugging

The jobs run in parallel with the existing test suite, so the added wall time is a few minutes instead of hours of manual clicking, and screenshots catch subtle CSS differences that humans miss.

## Real-World Example

Aisha is a frontend lead at a 20-person SaaS startup. Their product is a data dashboard used by enterprise clients, some of whom mandate Safari on corporate MacBooks. Every other release breaks something in Safari or Firefox, and the team only finds out from support tickets — usually 3-5 days after the release, after the fix has become urgent.

She sets up cross-browser testing for the four critical user flows. During baseline review, the agent immediately finds two rendering issues that have been live in production: misaligned card rows in one engine and a missing blur effect in Safari. Both get fixed before writing a single new test — the setup process itself catches existing bugs.

Over the next quarter, the cross-browser tests catch several regressions before they reach production. A CSS grid change that looked fine in Chrome broke the dashboard layout in Safari. A date picker library update changed keyboard behavior in Firefox. A new modal animation used a property that WebKit renders differently. All caught in CI, all fixed before any customer noticed.

Safari-related support tickets drop sharply, and the 3-4 hours of manual cross-browser testing per release shrink to a short manual Safari check.
