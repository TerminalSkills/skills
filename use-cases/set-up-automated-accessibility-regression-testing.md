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

A 25-person product team did an accessibility audit six months ago and fixed 73 issues to reach WCAG 2.1 AA compliance. Since then, new features have quietly reintroduced accessibility problems. A modal was added without keyboard trap management. A new dashboard uses color alone to indicate status. Form error messages lost their aria-live attributes during a refactor. Nobody notices until a customer complains or a manual audit reveals dozens of new violations. The team doesn't want to pay for quarterly manual audits, but without automated checks, compliance slowly erodes after every fix.

## The Solution

Use the **test-generator** skill to create accessibility-focused test cases, the **cicd-pipeline** skill to integrate them into your build process, and the **coding-agent** to write custom accessibility testing utilities that go beyond what axe-core catches out of the box.

```bash
npx terminal-skills install test-generator cicd-pipeline coding-agent
```

## Step-by-Step Walkthrough

### 1. Baseline your current accessibility state

Tell the agent to scan your app:

```
Run an accessibility audit on our web app. Test all pages listed in our sitemap. Capture every WCAG 2.1 AA violation with its severity, element, and page. Save this as our baseline — future tests should catch any new violations that aren't in this baseline.
```

### 2. The agent scans and creates a baseline

```
Accessibility baseline created: a11y/baseline.json

Scan results across 34 pages:
- 0 critical violations (blocking)
- 3 serious violations (known, tracked in backlog)
- 8 moderate violations (cosmetic, accepted)
- Total elements tested: 4,271

Baseline saved with 11 known issues. Future scans will alert on anything new.
```

### 3. Generate accessibility regression tests

```
Generate accessibility tests for our key user flows: signup, login, dashboard, settings, and checkout. Test keyboard navigation, screen reader compatibility, color contrast, and form labeling.
```

The agent creates targeted a11y tests:

```
Generated 28 accessibility tests across 5 flows:

- Signup flow: 6 tests (form labels, error announcements, keyboard submit)
- Login flow: 4 tests (focus management, error states, password visibility toggle)
- Dashboard: 7 tests (chart alt text, color-independent indicators, table headers)
- Settings: 5 tests (toggle announcements, form grouping, save confirmation)
- Checkout: 6 tests (price reader compatibility, address autocomplete, focus return)
```

### 4. Integrate into CI pipeline

The agent adds accessibility testing as a required CI check:

```
CI integration configured: .github/workflows/a11y-tests.yml

Pipeline stages:
1. Run axe-core scan on all pages (catches common violations)
2. Run custom a11y test suite (catches flow-specific issues)
3. Compare results against baseline (flag new violations only)
4. Post results as PR comment with violation details and fix suggestions

Blocking: any new critical or serious violation fails the build
Warning: new moderate violations are flagged but don't block
```

### 5. Handle new violations

When a PR introduces a new accessibility issue, the CI posts a clear comment:

```
⚠️ New accessibility violation detected in this PR:

Page: /dashboard
Element: <div class="status-indicator">
Rule: color-contrast (serious)
Issue: Insufficient contrast ratio 2.8:1 (minimum 4.5:1)
Fix: Change text color from #999 to #767676 or darker

This issue was not in the baseline. Please fix before merging.
```

### 6. Generate accessibility fix suggestions

```
For each new violation caught in the last sprint, generate a code fix suggestion with before/after examples and link to the relevant WCAG criterion.
```

The agent reads violation reports from recent CI runs and produces developer-friendly fix guides with specific code changes.

## Real-World Example

Sofia is the frontend lead at a 25-person health tech startup. After spending two weeks fixing 73 accessibility issues for compliance, she's frustrated to find 12 new violations introduced in the following quarter.

1. She asks the agent to scan all 34 pages and create an accessibility baseline, capturing the 11 known accepted issues
2. The agent generates 28 accessibility-specific tests covering keyboard navigation, screen reader support, and contrast ratios for all key user flows
3. It integrates the tests into GitHub Actions so every PR is checked for new violations
4. Two weeks later, a developer's PR is flagged — a new modal component lacks focus trapping. The CI comment explains the issue and suggests the fix
5. Over three months, the automated tests catch 9 regressions at the PR stage. Zero new accessibility issues reach production

## Related Skills

- [test-generator](../skills/test-generator/) -- Creates accessibility-specific test cases for user flows
- [cicd-pipeline](../skills/cicd-pipeline/) -- Integrates a11y testing as a required CI check with baseline comparison
- [coding-agent](../skills/coding-agent/) -- Writes custom accessibility utilities beyond standard axe-core rules
