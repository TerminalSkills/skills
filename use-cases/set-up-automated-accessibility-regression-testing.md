---
title: "Set Up Automated Accessibility Regression Testing with AI"
slug: set-up-automated-accessibility-regression-testing
description: "Build a CI pipeline that catches accessibility regressions before they reach production using automated testing."
skills: [test-generator, cicd-pipeline, coding-agent]
category: development
tags: [accessibility, regression-testing, a11y, ci-cd, testing]
---

# Set Up Automated Accessibility Regression Testing with AI

## The Problem

Sofia is the frontend lead at a 25-person health tech startup. Six months ago, the team did a thorough accessibility audit and fixed 73 issues to reach WCAG 2.2 AA conformance. It took two weeks of focused work and felt like a real accomplishment.

Since then, new features have quietly undone that work. A modal was added without keyboard focus management, so users who navigate with a keyboard get stuck behind it or lose their place. A new dashboard uses color alone to indicate status (red for critical, green for healthy), which people with color vision deficiency cannot read. Form error messages lost their `aria-live` attributes during a refactor, so screen readers don't announce validation errors.

Nobody notices until a customer complains, and by then the damage is compounding. The team doesn't want to pay for a manual audit every quarter (about $8,000 each, in their case), but without automated checks, conformance slowly erodes after every sprint.

## The Solution

Use the **test-generator** skill to create accessibility-focused Playwright tests for key user flows, the **cicd-pipeline** skill's pipeline practices (stages, caching, required checks, artifacts) to make them a required CI check, and the **coding-agent** to write the custom tests that go beyond what axe-core catches automatically: keyboard navigation, focus management, and live-region announcements. Automated rules find only a share of real accessibility problems, so the flow tests and an occasional manual screen-reader pass still matter.

## Step-by-Step Walkthrough

### Step 1: Set Up the Scanner and Baseline the Current State

The tools are Playwright (`@playwright/test`) and the Deque `@axe-core/playwright` integration, which runs axe-core inside the page:

```bash
npm install --save-dev @playwright/test @axe-core/playwright
npx playwright install --with-deps chromium
```

Ask the agent to write the scan:

```text
Add a Playwright test that runs axe-core on every page in our sitemap with the WCAG 2.0/2.1/2.2 A and AA tags. Record every current violation (rule id, page, element selector) in a11y/baseline.json. The test must fail only on violations that are not in the baseline. Add an npm script that regenerates the baseline.
```

The core of the generated test:

```typescript
// a11y/a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, existsSync } from 'node:fs';

const baseline: string[] = existsSync('a11y/baseline.json')
  ? JSON.parse(readFileSync('a11y/baseline.json', 'utf8'))
  : [];

for (const path of ['/', '/login', '/dashboard']) {   // generated from the sitemap
  test(`no new WCAG A/AA violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const fresh = results.violations.flatMap((v) =>
      v.nodes
        .map((n) => `${path}|${v.id}|${n.target.join(' ')}`)
        .filter((key) => !baseline.includes(key)),
    );
    expect(fresh, 'violations missing from baseline').toEqual([]);
  });
}
```

Each violation becomes a stable key (`page|rule|selector`). A first run with an empty baseline lists everything; the team triages it, fixes what is cheap, and saves the rest as the accepted baseline. In Sofia's app that is 11 known issues: 3 serious (tracked in the backlog) and 8 moderate. From then on only violations that are not in the file fail the build.

### Step 2: Generate Flow-Specific Regression Tests

Page scans catch what axe-core can detect from the DOM: missing labels, contrast, invalid ARIA. They cannot tell that a checkout button is unreachable by keyboard. Those checks are ordinary Playwright tests:

```text
Generate Playwright accessibility tests for signup, login, dashboard, settings and checkout. Use getByRole and getByLabel locators (they fail if the accessible name is missing), test keyboard-only paths, and assert that error messages are exposed through role="alert" or aria-live regions.
```

For example, a dialog test:

```typescript
test('settings dialog takes focus and gives it back on Escape', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Open settings' });
  await opener.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('dialog :focus')).toHaveCount(1);     // focus moved into the dialog
  await page.keyboard.press('Tab');
  await expect(page.locator('dialog :focus')).toHaveCount(1);     // Tab stays inside (the dialog has 2+ controls)
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();                              // focus returns
});
```

The agent writes similar tests per flow, such as: every signup field is found by `getByLabel`; the submit button is reachable with Tab and activated with Enter; a wrong password produces an element with `role="alert"`; status indicators contain text in addition to color; settings toggles expose `role="switch"` with an `aria-checked` state. Review the generated tests: a test that cannot fail protects nothing, so break the page on purpose once and confirm each test goes red.

### Step 3: Run It in CI as a Required Check

```yaml
# .github/workflows/a11y.yml
name: Accessibility
on: [pull_request]

permissions:
  contents: read

jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test a11y/
      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

In the repository settings, mark the `a11y` job as a required status check on the protected branch, so a failing run blocks the merge. Let Playwright start the app itself with the `webServer` option in `playwright.config.ts`, bound to `127.0.0.1`. Moderate and minor violations can be reported without failing by filtering them out of the `expect` and printing them, then triaged in the next sprint.

### Step 4: Catch Regressions in Pull Requests

A developer submits a PR that adds a status indicator widget with light-gray text. The `a11y` check fails and the log shows:

```console
1) a11y.spec.ts:12:7 › no new WCAG A/AA violations on /dashboard
    Error: violations missing from baseline
    - Expected  - 1
    + Received  + 3
    + Array [
    +   "/dashboard|color-contrast|.status-indicator",
    + ]
```

The key names the page, the rule and the element. Opening the uploaded report (or running `npx playwright show-report` locally) shows axe's description: the foreground `#999999` on white has a contrast ratio of about 2.8:1 and 4.5:1 is required for normal text. Changing the color to `#767676` or darker (4.5:1 on white) fixes it in 30 seconds, and the next push turns the check green.

### Step 5: Generate Fix Suggestions for Each Violation

When violations accumulate over a sprint (in the moderate/non-blocking category), the agent can generate developer-friendly fix guides with before/after examples.

```text
For each new violation caught in the last sprint, generate a code fix suggestion with before/after examples and link to the relevant WCAG criterion.
```

Each fix suggestion includes the specific code change needed, a before/after comparison, and a link to the relevant WCAG success criterion so the developer understands the "why" -- not just the "what." A form field missing its label gets a three-line fix and a link to WCAG 1.3.1 (Info and Relationships). A color-only indicator gets a suggestion to add an icon and text alongside the color, with a link to WCAG 1.4.1 (Use of Color).

This turns accessibility fixes from research projects into copy-paste tasks. Developers don't need to become WCAG experts -- they need to know what line to change and why it matters.

## Real-World Example

Sofia sets up the baseline scan on a Monday. The 11 known issues go into the accepted baseline, and the 28 flow-specific tests go into CI as a required check.

Within two weeks, the system catches its first regression: a new modal component lacks focus trapping. A keyboard user who Tabs past the last button in the modal lands on the page behind it. The failing check names the page and the focus test that broke, and the agent suggests the fix: using the native `<dialog>` element with `showModal()`, and links to the WCAG 2.4.3 success criterion. The developer fixes it in the same PR, so it never reaches production.

Over three months, the automated tests in this example catch 9 regressions at the PR stage. A chart without a text alternative. A toggle switch that doesn't announce state changes. A form that lost its error announcements during a component library upgrade. All caught before merge, all fixed in minutes instead of discovered weeks later by a customer or an $8,000 audit.

In that window no new accessibility issue is reported from production. Sofia's team still schedules a yearly manual audit with real screen readers, because automated checks cover only part of WCAG, but the audit no longer finds a quarter's worth of regressions.
