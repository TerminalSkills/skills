---
title: "Run a Combined Accessibility and Performance Audit"
slug: run-web-quality-audit
description: "Audit your web application for both WCAG accessibility violations and Core Web Vitals failures in a single pass to prioritize fixes that improve quality across the board."
skills:
  - accessibility-auditor
  - web-vitals-analyzer
category: development
tags:
  - accessibility
  - web-vitals
  - wcag
  - performance
---

# Run a Combined Accessibility and Performance Audit

## The Problem

Your web application fails Core Web Vitals on 40% of pages and has never been audited for WCAG compliance. The frontend team treats accessibility and performance as separate backlogs, but many of the same components cause both problems. A hero image without dimensions causes layout shift (CLS failure) and also lacks alt text (WCAG 1.1.1 failure). A modal that blocks the main thread for 400 ms degrades INP and also traps keyboard focus (WCAG 2.1.2 failure).

The European Accessibility Act has applied to many consumer-facing products and services since 28 June 2025, and Search Console shows pages stuck in the "Needs improvement" and "Poor" Core Web Vitals groups. The team cannot afford a 3-week accessibility audit followed by a 2-week performance sprint. They need one pass that finds the component fixes that improve both dimensions at once.

## The Solution

Use the **accessibility-auditor** and **web-vitals-analyzer** skills together. Tools measure what code review cannot: axe-core (through `@axe-core/cli`, or the accessibility category of Lighthouse) finds the automatable WCAG failures, and Lighthouse gives lab LCP and CLS. The skills then read the component source behind each finding, merge the two lists per component, and propose one change that closes both. Automated checks cover only part of WCAG, so keyboard and screen reader testing stays on the list, and Core Web Vitals pass or fail on field data (Chrome UX Report, PageSpeed Insights), where INP is measured. Lighthouse cannot measure INP; its Total Blocking Time is only a lab proxy.

## Step-by-Step Walkthrough

### 1. Baseline both metrics on critical pages

Start with the highest-traffic page templates, against a staging or local build you can reach by URL. Collect the lab numbers first:

```console
$ npx lighthouse https://staging.example.com/products/42 --only-categories=performance,accessibility \
    --output=json --output-path=./audit/product-detail.json
$ npx @axe-core/cli https://staging.example.com/products/42 \
    --tags wcag2a,wcag2aa,wcag21aa,wcag22aa --save ./audit/product-detail-axe.json
```

Lighthouse 13 needs a local Chrome; the axe CLI needs a matching chromedriver (`npx browser-driver-manager install chrome@<version>`, or pass `--chromedriver-path`). Then ask the agent to interpret the results against the code:

> Audit ProductDetail, Checkout, Home, Search and Account. Use the Lighthouse and axe reports in ./audit/ and the source in src/pages/ and src/components/. For each page list the WCAG 2.2 AA violations (criterion, element, file) and the LCP element, CLS sources and long tasks. Pull INP from our field data in the attached PageSpeed Insights export; do not estimate it from the code.

On ProductDetail the report shows an LCP of 5.1 s from a 2 MB hero image that is also missing alt text, and a CLS of 0.31 from a review widget that loads late and also traps keyboard focus. Checkout has three form fields without labels (WCAG 3.3.2) and a payment button whose field INP is 280 ms because validation runs synchronously in the click handler.

### 2. Identify overlapping fixes

> Cross-reference the accessibility violations with the Web Vitals failures. Show me which components appear in both lists and what single code change would fix both.

The hero image is the clearest overlap. One edit adds `width`/`height`, a real `alt`, `fetchpriority="high"` and removes `loading="lazy"` from the LCP image, and it also moves it to a lighter format (WebP is the safe default; AVIF compresses better but decodes slower). That change targets LCP and CLS and closes WCAG 1.1.1 at the same time. A modal rewritten around the native `<dialog>` element gets focus trapping, Escape handling and focus return for free, and the click handler can hand non-urgent work to `setTimeout` or `scheduler.yield()` (feature-detect it; Chromium only) to shorten the interaction.

### 3. Prioritize by combined impact

> Create a prioritized fix list sorted by combined impact. Rank WCAG Critical violations and CWV failures that keep a page out of "Good" highest. Include a time estimate for each item.

The result is one backlog instead of two. Fixes that touch both lists come first, followed by accessibility-only quick wins (form labels, `autocomplete` attributes, `aria-live` on error messages) that take minutes each. Treat the time estimates as guesses until the first fixes are done.

### 4. Implement fixes and verify both checks pass

> Re-audit ProductDetail and Checkout after my changes. Confirm the WCAG violations are resolved and the lab LCP and CLS are inside the "Good" thresholds (LCP at most 2.5 s, CLS at most 0.1). Flag any new issues the changes introduced.

Re-run the same Lighthouse and axe commands and diff the JSON. Field INP updates only as real visits arrive, over roughly 28 days in the Chrome UX Report, so track it separately and do not wait on it to merge.

### 5. Set up regression monitoring

Run both checks on every pull request with Lighthouse CI. Its `categories:accessibility` score is built on axe-core, and numeric assertions fail the build when lab LCP or CLS regress:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:4173/", "http://localhost:4173/products/42"],
      "startServerCommand": "npm run preview -- --port 4173",
      "startServerReadyPattern": "Local",
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["warn", { "maxNumericValue": 200 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }]
      }
    }
  }
}
```

Save it as `lighthouserc.json` and run `npx @lhci/cli autorun` in CI (version 0.16 at the time of writing). When an assertion fails the command exits 1 and prints which one failed and by how much. A new lazy-loaded hero image would be caught by the LCP assertion, and a missing `alt` or an unlabeled input by the accessibility score. Lab thresholds are a guard against regressions, not a substitute for the field data.

## Real-World Example

A SaaS company preparing for the European Accessibility Act ran separate accessibility and performance audits on its 30-page application. The accessibility consultant reported 67 violations and the performance engineer 14 Core Web Vitals failures.

When the two lists were mapped to components, 19 of the accessibility fixes and 8 of the performance fixes landed on the same 12 components: shared navigation, hero sections, modals and form elements. The team fixed those 12 first. A navigation component that trapped keyboard focus also ran a synchronous resize listener that held up interactions; one refactor addressed both. By the team's own estimate, the combined backlog took about 3.5 weeks instead of the 5 they had planned for two separate projects.

## Related Skills

- **accessibility-auditor**: WCAG 2.2 AA checks, axe-core pass and exact code fixes for Steps 1 to 4
- **web-vitals-analyzer**: LCP, CLS and INP diagnosis, with field data as the pass/fail source
