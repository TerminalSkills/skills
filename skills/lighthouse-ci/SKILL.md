---
name: lighthouse-ci
description: >-
  Automate Lighthouse audits in CI with Lighthouse CI. Use when a user asks
  to track Core Web Vitals, prevent performance regressions, audit
  accessibility in CI, or set performance budgets for web apps.
license: Apache-2.0
compatibility: 'Any web app, GitHub Actions, GitLab CI'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - lighthouse
    - performance
    - web-vitals
    - accessibility
    - ci
---

# Lighthouse CI

## Overview

Lighthouse CI runs Google Lighthouse audits automatically on every PR. Set performance budgets, track Core Web Vitals over time, and prevent regressions. Catches performance issues before they reach production.

## Instructions

### Step 1: Configuration

```javascript
// lighthouserc.js — Lighthouse CI config
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/dashboard',
        'http://localhost:3000/pricing',
      ],
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'ready on',
      numberOfRuns: 3,                      // average 3 runs for stability
      settings: {
        preset: 'desktop',                  // or 'mobile' (default)
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
        // Core Web Vitals
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',   // free, reports available for 7 days
    },
  },
}
```

### Step 2: GitHub Actions

```yaml
# .github/workflows/lighthouse.yml — Lighthouse CI in GitHub Actions
name: Lighthouse CI

on: [pull_request]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v11
        with:
          configPath: './lighthouserc.js'
          uploadArtifacts: true
          temporaryPublicStorage: true
```

### Step 3: Performance Budgets

```json
// budget.json — Resource budgets
[
  {
    "path": "/*",
    "resourceSizes": [
      { "resourceType": "script", "budget": 300 },
      { "resourceType": "total", "budget": 500 },
      { "resourceType": "image", "budget": 200 },
      { "resourceType": "stylesheet", "budget": 50 }
    ],
    "resourceCounts": [
      { "resourceType": "third-party", "budget": 5 }
    ]
  }
]
```

## Guidelines

- Set `numberOfRuns: 3` minimum — single runs have high variance.
- Start with `warn` assertions, switch to `error` once baselines are stable.
- Test critical user paths (landing, dashboard, checkout), not every page.
- Performance budgets prevent "just one more script" — bundle size creep caught early.
- Use `temporary-public-storage` for free report hosting; self-host LHCI Server for history.
