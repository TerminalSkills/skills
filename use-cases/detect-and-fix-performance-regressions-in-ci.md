---
title: Detect and Fix Performance Regressions Before They Hit Production
slug: detect-and-fix-performance-regressions-in-ci
description: An e-commerce team builds an automated performance regression detection system — running Lighthouse and custom load tests in CI for every PR, comparing against baselines, blocking merges that degrade Core Web Vitals, and alerting when API latency exceeds budgets — catching performance problems in code review instead of production incidents.
skills: [vitest, docker-helper, opentelemetry-js, checkly]
category: Developer Tools
tags: [performance, ci-cd, testing, web-vitals, lighthouse, regression, monitoring]
---

# Detect and Fix Performance Regressions Before They Hit Production

Jess is a frontend lead at an e-commerce platform doing $50M/year. Last quarter, a seemingly innocent "refactor" of the product listing page added 800ms to First Contentful Paint. Nobody noticed for 3 weeks. By the time they caught it, conversion rate had dropped 4% — $170K in lost revenue. Jess's rule going forward: no PR merges without performance proof.

## The Problem: Performance Dies by a Thousand Cuts

Performance regressions rarely come from a single catastrophic change. They accumulate: a new analytics script here (+50ms), an unoptimized image component there (+100ms), an N+1 query in an API route (+200ms). Each one passes code review because "it's just 50ms." By the time anyone notices, the page load time has doubled.

The fix isn't monitoring in production — that's too late. The fix is catching regressions in CI, before they merge.

## Step 1: Performance Budget in CI

Every PR runs Lighthouse against a preview deployment. If any Core Web Vital exceeds the budget, the PR is blocked:

```typescript
// scripts/perf-audit.ts — Run against preview deployment
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

interface PerfBudget {
  metric: string;
  budget: number;
  weight: number;
}

const BUDGETS: PerfBudget[] = [
  { metric: "first-contentful-paint", budget: 1200, weight: 1.0 },    // ms
  { metric: "largest-contentful-paint", budget: 2500, weight: 1.5 },   // ms — most important
  { metric: "cumulative-layout-shift", budget: 0.1, weight: 1.0 },
  { metric: "total-blocking-time", budget: 200, weight: 1.2 },        // ms
  { metric: "speed-index", budget: 2000, weight: 0.8 },               // ms
];

const PAGES = [
  { name: "Homepage", path: "/" },
  { name: "Product Listing", path: "/products" },
  { name: "Product Detail", path: "/products/sample-product" },
  { name: "Cart", path: "/cart" },
  { name: "Checkout", path: "/checkout" },
];

async function runPerfAudit(baseUrl: string) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless", "--no-sandbox"] });
  const results: PageResult[] = [];

  for (const page of PAGES) {
    // Run 3 times, take median (reduces noise)
    const runs: any[] = [];
    for (let i = 0; i < 3; i++) {
      const result = await lighthouse(`${baseUrl}${page.path}`, {
        port: chrome.port,
        onlyCategories: ["performance"],
        formFactor: "mobile",              // Test mobile — worst case
        throttling: { cpuSlowdownMultiplier: 4, downloadThroughputKbps: 1600, uploadThroughputKbps: 750 },
      });
      runs.push(result.lhr);
    }

    // Median results
    const medianRun = runs.sort((a, b) =>
      a.categories.performance.score - b.categories.performance.score
    )[1];

    const violations: string[] = [];
    for (const budget of BUDGETS) {
      const actual = medianRun.audits[budget.metric]?.numericValue || 0;
      if (actual > budget.budget) {
        violations.push(
          `❌ ${page.name}: ${budget.metric} = ${Math.round(actual)}ms (budget: ${budget.budget}ms, +${Math.round(actual - budget.budget)}ms over)`
        );
      }
    }

    results.push({
      page: page.name,
      score: Math.round(medianRun.categories.performance.score * 100),
      violations,
      metrics: Object.fromEntries(
        BUDGETS.map(b => [b.metric, Math.round(medianRun.audits[b.metric]?.numericValue || 0)])
      ),
    });
  }

  await chrome.kill();
  return results;
}

// Generate PR comment with results
function formatPRComment(results: PageResult[], baselineResults?: PageResult[]): string {
  let comment = "## ⚡ Performance Audit Results\n\n";
  let hasViolations = false;

  for (const result of results) {
    const baseline = baselineResults?.find(b => b.page === result.page);
    const scoreDiff = baseline ? result.score - baseline.score : 0;
    const scoreEmoji = scoreDiff > 0 ? "🟢" : scoreDiff < -5 ? "🔴" : "🟡";

    comment += `### ${result.page} — ${scoreEmoji} ${result.score}/100`;
    if (baseline) comment += ` (${scoreDiff > 0 ? "+" : ""}${scoreDiff} vs main)`;
    comment += "\n\n";

    if (result.violations.length > 0) {
      hasViolations = true;
      comment += result.violations.join("\n") + "\n\n";
    }

    // Metrics table
    comment += "| Metric | Value | Budget | Status |\n|--------|-------|--------|--------|\n";
    for (const budget of BUDGETS) {
      const actual = result.metrics[budget.metric];
      const status = actual <= budget.budget ? "✅" : "❌";
      comment += `| ${budget.metric} | ${actual}ms | ${budget.budget}ms | ${status} |\n`;
    }
    comment += "\n";
  }

  if (hasViolations) {
    comment += "---\n⛔ **This PR exceeds performance budgets.** Please fix the violations above before merging.\n";
  }

  return comment;
}
```

## Step 2: API Latency Regression Testing

Frontend performance depends on API speed. Every PR also runs API latency tests against the preview backend:

```typescript
// tests/api-perf.test.ts — Run with Vitest
import { describe, it, expect } from "vitest";

const API_BASE = process.env.PREVIEW_API_URL!;
const LATENCY_BUDGETS: Record<string, number> = {
  "GET /api/products": 200,                // ms
  "GET /api/products/:id": 100,
  "GET /api/cart": 150,
  "POST /api/cart/items": 300,
  "GET /api/search?q=shoes": 500,
};

describe("API Latency Budgets", () => {
  for (const [endpoint, budget] of Object.entries(LATENCY_BUDGETS)) {
    it(`${endpoint} responds within ${budget}ms`, async () => {
      const [method, path] = endpoint.split(" ");
      const url = `${API_BASE}${path.replace(":id", "sample-id")}`;

      // Warm up
      await fetch(url, { method });

      // Measure 10 requests, take P95
      const latencies: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await fetch(url, {
          method,
          body: method === "POST" ? JSON.stringify({ productId: "test", quantity: 1 }) : undefined,
          headers: method === "POST" ? { "Content-Type": "application/json" } : {},
        });
        latencies.push(performance.now() - start);
      }

      latencies.sort((a, b) => a - b);
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      expect(p95, `${endpoint} P95 latency ${Math.round(p95)}ms exceeds budget ${budget}ms`).toBeLessThanOrEqual(budget);
    });
  }
});
```

## Step 3: Bundle Size Tracking

The final piece: tracking JavaScript bundle size changes per PR, because every KB costs mobile users.

```yaml
# .github/workflows/perf-check.yml
- name: Build and measure bundle
  run: |
    npm run build
    node scripts/measure-bundle.js > /tmp/bundle-current.json

- name: Compare with main
  run: |
    git stash
    git checkout main
    npm ci && npm run build
    node scripts/measure-bundle.js > /tmp/bundle-baseline.json
    git checkout -

    node scripts/compare-bundles.js /tmp/bundle-baseline.json /tmp/bundle-current.json
```

```typescript
// scripts/compare-bundles.ts
const BUDGET_KB = 250;                     // Total JS budget

const baseline = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const current = JSON.parse(readFileSync(process.argv[3], "utf-8"));

const diff = current.totalSizeKB - baseline.totalSizeKB;
if (diff > 10) {
  console.error(`❌ Bundle increased by ${diff.toFixed(1)}KB. Investigate before merging.`);
  process.exit(1);
}
if (current.totalSizeKB > BUDGET_KB) {
  console.error(`❌ Total bundle ${current.totalSizeKB.toFixed(1)}KB exceeds ${BUDGET_KB}KB budget.`);
  process.exit(1);
}
console.log(`✅ Bundle: ${current.totalSizeKB.toFixed(1)}KB (${diff > 0 ? "+" : ""}${diff.toFixed(1)}KB vs main)`);
```

## Results

After 6 months of performance-gated CI:

- **Regressions caught**: 34 PRs blocked for performance violations; all fixed before merge
- **LCP improvement**: Product listing page LCP improved from 3.2s to 1.8s (45% faster)
- **Revenue impact**: Conversion rate recovered +4% within 2 weeks of fixing the original regression
- **Bundle size**: Reduced from 380KB to 210KB through budget enforcement; new bloat caught immediately
- **API latency**: P95 API latency held steady at 180ms; 3 N+1 queries caught in PR review
- **Culture shift**: Developers now check performance before submitting PRs; "it's just 50ms" is no longer acceptable
- **Cost**: Zero additional infrastructure — runs on existing CI; Lighthouse is free, Vitest is free
- **False positives**: <5% of blocked PRs were false positives (CI noise); 3-run median reduces flaky results
