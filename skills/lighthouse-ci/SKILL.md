---
name: lighthouse-ci
description: >-
  Lighthouse CI (lhci) runs Google Lighthouse audits on every pull request, checks the scores and metrics against assertions or performance budgets, and uploads the reports. Use when a user asks to track Core Web Vitals in CI, stop performance regressions, audit accessibility on each PR, or set a performance budget for a web app.
license: Apache-2.0
compatibility: "Node.js and Chrome on the CI runner; GitHub Actions, GitLab CI, CircleCI or any shell CI. @lhci/cli 0.15.x (bundles Lighthouse 12.x)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/GoogleChrome/lighthouse-ci
  tags:
    - lighthouse
    - performance
    - web-vitals
    - accessibility
    - ci
---

# Lighthouse CI

## Overview

Lighthouse CI is the `lhci` command-line tool (npm package `@lhci/cli`, latest 0.15.1) that runs Lighthouse several times against your URLs, aggregates the runs, fails the build when assertions break, and uploads the reports. Reports can go to free temporary public storage, to your own Lighthouse CI server (history and build diffs), or to the local filesystem.

Lab runs measure First Contentful Paint, Largest Contentful Paint, Cumulative Layout Shift and Total Blocking Time. Interaction to Next Paint is a field metric and Lighthouse cannot measure it in CI; Total Blocking Time is the lab stand-in. Scores vary between runs, so assert on the median or optimistic value of several runs.

## Instructions

### Run it locally first

```bash
npm install --save-dev @lhci/cli@0.15.x
npx lhci healthcheck                         # checks config, Chrome and upload settings
npx lhci autorun --collect.numberOfRuns=3    # collect + assert + upload
```

In `autorun`, flags with values must use `=` (`--collect.numberOfRuns=5`, not a space). Without a config file, `autorun` uses `collect.staticDistDir` if it finds a build folder, otherwise an npm script named `serve:lhci`. Options can also come from `lighthouserc.js`, `.json`, `.yml` or `LHCI_*` environment variables.

### Configuration

```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000/', 'http://localhost:3000/pricing'],
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'ready|listening',   // regex; default is "listen|ready"
      startServerReadyTimeout: 60000,
      numberOfRuns: 3,                              // default 3
      settings: { preset: 'desktop' },              // omit for the mobile default
    },
    assert: {
      preset: 'lighthouse:no-pwa',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'resource-summary:script:size': ['warn', { maxNumericValue: 300000 }], // bytes
        'uses-webp-images': 'off',
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
};
```

For a purely static build, use `staticDistDir: './dist'` instead of `startServerCommand`; LHCI serves it itself (add `isSinglePageApplication: true` for SPA routing). Presets: `lighthouse:recommended` (every non-performance audit must pass, metrics warn below 0.9), `lighthouse:no-pwa` (same without PWA audits) and `lighthouse:all` (everything must be perfect, rarely realistic). Assertion levels are `off`, `warn` and `error`; only `error` fails the build.

### Performance budgets

Two styles, which cannot be mixed. Either point `assert.budgetsFile` at a Lighthouse `budget.json` (sizes in kilobytes; "cannot be used in conjunction with any other assert option"):

```bash
npx lhci assert --budgetsFile=./budget.json
```

```json
[{ "path": "/*",
   "resourceSizes": [{ "resourceType": "script", "budget": 300 }, { "resourceType": "total", "budget": 800 }],
   "resourceCounts": [{ "resourceType": "third-party", "budget": 5 }] }]
```

or write budgets as assertions named `resource-summary:<type>:size|count`, as in the config above (sizes in bytes). Use `assertMatrix` to apply different assertions to different URL patterns.

### GitHub Actions

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI
on: [pull_request]
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: ./lighthouserc.js
          uploadArtifacts: true
          temporaryPublicStorage: true
```

The action also accepts `urls`, `budgetPath` and `serverBaseUrl`. For richer PR status checks, install the Lighthouse CI GitHub App and pass its token as `LHCI_GITHUB_APP_TOKEN`, or set `upload.githubToken`. Without the Action, run `npx lhci autorun` after the build step.

## Examples

### Example 1: Block PRs that make the pricing page slower

Request: "Fail the build if the pricing page LCP goes over 2.5 seconds or accessibility drops below 95."

Put the config above in `lighthouserc.js`, build in CI, and run the workflow. When LCP is 3.1 s the `assert` step prints the failing audit, the URL, the expected `<= 2500` and the actual `3100`, then exits non-zero so the pull request check turns red.

### Example 2: Script budget on every page

Request: "Don't let JavaScript grow past 300 KB."

Add `'resource-summary:script:size': ['error', { maxNumericValue: 300000 }]` to `assertions` (bytes), or use a `budget.json` with `"budget": 300` and `assert.budgetsFile` (kilobytes). The run prints the transferred script size per URL and fails when a new dependency pushes it over.

## Guidelines

- Keep `numberOfRuns` at 3 or more; single runs are noisy. Start with `warn`, move to `error` once baselines are stable.
- Audit the pages that matter (landing, checkout, dashboard), not every URL.
- `temporary-public-storage` reports are public to anyone with the link and deleted after a few days; do not use it for private staging sites. Use `target: 'lhci'` with your own server (and `LHCI_TOKEN`) for history.
- Shared CI runners are slower than laptops; set thresholds from CI results, not from a local run.
- Do not mix `budgetsFile` with other assertions, and remember the unit difference (KB vs bytes).
- Lighthouse cannot log in by itself; use `collect.puppeteerScript` for authenticated pages.
- Lab data is not field data: pair it with real-user monitoring (CrUX) for INP.
