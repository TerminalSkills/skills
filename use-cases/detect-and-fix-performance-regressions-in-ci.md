---
title: Detect and Fix Performance Regressions Before They Hit Production
slug: detect-and-fix-performance-regressions-in-ci
description: An e-commerce team builds an automated performance regression detection system — running Lighthouse and custom load tests in CI for every PR, comparing against baselines, blocking merges that degrade Core Web Vitals, and alerting when API latency exceeds budgets — catching performance problems in code review instead of production incidents.
skills: [vitest, docker-helper, otel-js, checkly]
category: development
tags: [performance, ci-cd, testing, web-vitals, lighthouse, regression, monitoring]
---

# Detect and Fix Performance Regressions Before They Hit Production

Jess is a frontend lead at an e-commerce platform doing $50M/year. Last quarter, a seemingly innocent "refactor" of the product listing page added 800ms to First Contentful Paint. Nobody noticed for 3 weeks. By the time they caught it, conversion rate had dropped 4% — $170K in lost revenue. Jess's rule going forward: no PR merges without performance proof.

## The Problem: Performance Dies by a Thousand Cuts

Performance regressions rarely come from a single catastrophic change. They accumulate: a new analytics script here (+50ms), an unoptimized image component there (+100ms), an N+1 query in an API route (+200ms). Each one passes code review because "it's just 50ms." By the time anyone notices, the page load time has doubled.

The fix isn't monitoring in production — that's too late. The fix is catching regressions in CI, before they merge.

## Step 1: Run the Preview in Docker and Audit It with Lighthouse

Lighthouse needs a stable, production-built target. CI starts the preview stack from a compose file, waits until both services are healthy, and audits it (the `docker-helper` skill covers Compose healthchecks and `--wait`). Ports are bound to `127.0.0.1` so the runner never exposes the preview on its network:

```yaml
# compose.perf.yaml
services:
  web:
    build: .
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      NODE_ENV: production
      API_URL: http://api:4000
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 5s
      timeout: 5s
      retries: 12
  api:
    build: ./api
    ports:
      - "127.0.0.1:4000:4000"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:4000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 5s
      timeout: 5s
      retries: 12
```

```console
$ docker compose -f compose.perf.yaml up -d --build --wait
$ node scripts/perf-audit.ts http://127.0.0.1:3000
$ docker compose -f compose.perf.yaml down -v
```

Run the `down` step with `if: always()` in the workflow so a failed audit does not leave containers behind. Install the audit tooling with `npm i -D lighthouse chrome-launcher` and set `"type": "module"` in `package.json`. Lighthouse 13 needs Node 22.19 or newer, which runs the `.ts` file directly by stripping types. Run it with `node`, not `tsx`: under tsx Lighthouse fails inside the browser with `__name is not defined`. The script runs each page three times, keeps the median run and exits non-zero when a Core Web Vital exceeds its budget. The default budgets are the "good" thresholds from web.dev (FCP 1.8s, LCP 2.5s, CLS 0.1, TBT 200ms, Speed Index 3.4s):

```typescript
// scripts/perf-audit.ts: run against the preview deployment
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { writeFileSync } from "node:fs";

interface PerfBudget {
  metric: string;
  budget: number;
  unit: "ms" | "";
}

const BUDGETS: PerfBudget[] = [
  { metric: "first-contentful-paint", budget: 1800, unit: "ms" },
  { metric: "largest-contentful-paint", budget: 2500, unit: "ms" },
  { metric: "cumulative-layout-shift", budget: 0.1, unit: "" }, // unitless score
  { metric: "total-blocking-time", budget: 200, unit: "ms" },
  { metric: "speed-index", budget: 3400, unit: "ms" },
];

const PAGES = [
  { name: "Homepage", path: "/" },
  { name: "Product Listing", path: "/products" },
  { name: "Product Detail", path: "/products/sample-product" },
  { name: "Cart", path: "/cart" },
];

interface PageResult {
  page: string;
  score: number;
  violations: string[];
  metrics: Record<string, number>;
}

export async function runPerfAudit(baseUrl: string): Promise<PageResult[]> {
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless", "--no-sandbox"] });
  const results: PageResult[] = [];
  try {
    for (const page of PAGES) {
      // Run 3 times and keep the median run (reduces noise)
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const result = await lighthouse(`${baseUrl}${page.path}`, {
          port: chrome.port,
          onlyCategories: ["performance"],
          // Lighthouse emulates a mobile device by default; simulated throttling
          // (the default) is the most repeatable on shared CI runners.
          throttlingMethod: "simulate",
        });
        if (!result) throw new Error(`Lighthouse returned no result for ${page.path}`);
        runs.push(result.lhr);
      }
      runs.sort((a, b) => (a.categories.performance.score ?? 0) - (b.categories.performance.score ?? 0));
      const medianRun = runs[1];

      const violations: string[] = [];
      for (const b of BUDGETS) {
        const actual = medianRun.audits[b.metric]?.numericValue ?? 0;
        if (actual > b.budget) {
          violations.push(`${page.name}: ${b.metric} = ${+actual.toFixed(2)}${b.unit} (budget ${b.budget}${b.unit})`);
        }
      }
      results.push({
        page: page.name,
        score: Math.round((medianRun.categories.performance.score ?? 0) * 100),
        violations,
        metrics: Object.fromEntries(
          BUDGETS.map((b) => [b.metric, +(medianRun.audits[b.metric]?.numericValue ?? 0).toFixed(3)])
        ),
      });
    }
  } finally {
    await chrome.kill();
  }
  return results;
}

async function main() {
  const results = await runPerfAudit(process.argv[2] ?? "http://127.0.0.1:3000");
  writeFileSync("perf-results.json", JSON.stringify(results, null, 2));
  const failed = results.flatMap((r) => r.violations);
  failed.forEach((v) => console.error(`FAIL ${v}`));
  process.exit(failed.length ? 1 : 0);
}

main();
```

Lighthouse emulates a mobile device by default. Simulated throttling is its default too, and is the most repeatable choice on shared runners; compare scores from the same runner type only. Post `perf-results.json` as a PR comment with a workflow step of your choice and compare it against the file produced on `main`.

## Step 2: API Latency Regression Testing

Frontend performance depends on API speed. Every PR also runs API latency tests against the preview backend:

```typescript
// tests/api-perf.test.ts: run with `npx vitest run`
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

Every KB costs mobile users. Build the PR and the base branch in two separate checkouts (never `git stash` and switch branches inside the PR job), measure each, then compare:

```yaml
# .github/workflows/perf-check.yml (excerpt)
- uses: actions/checkout@v7
- uses: actions/checkout@v7
  with:
    ref: ${{ github.base_ref }}
    path: base
- run: npm ci && npm run build && node scripts/measure-bundle.mjs > bundle-current.json
- run: cd base && npm ci && npm run build && node ../scripts/measure-bundle.mjs > ../bundle-baseline.json
- run: node scripts/compare-bundles.mjs bundle-baseline.json bundle-current.json
```

`measure-bundle.mjs` sums the size of the emitted `.js` files in your build output directory (for example `dist/assets`) and prints `{ "totalSizeKB": <number> }`. The comparison fails the job on a growth above 10KB or a total above the budget:

```javascript
// scripts/compare-bundles.mjs
import { readFileSync } from "node:fs";

const BUDGET_KB = 250; // total JS budget
const baseline = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const current = JSON.parse(readFileSync(process.argv[3], "utf-8"));

const diff = current.totalSizeKB - baseline.totalSizeKB;
if (diff > 10) {
  console.error(`Bundle grew by ${diff.toFixed(1)}KB. Investigate before merging.`);
  process.exit(1);
}
if (current.totalSizeKB > BUDGET_KB) {
  console.error(`Total bundle ${current.totalSizeKB.toFixed(1)}KB exceeds the ${BUDGET_KB}KB budget.`);
  process.exit(1);
}
console.log(`Bundle: ${current.totalSizeKB.toFixed(1)}KB (${diff > 0 ? "+" : ""}${diff.toFixed(1)}KB vs base)`);
```

## Step 4: Trace Slow Requests and Keep Watching After the Merge

CI catches what the tests exercise; production catches the rest. Two small additions close the loop (see the `otel-js` and `checkly` skills for the full setup).

Add OpenTelemetry to the API, so a latency alert points at the slow span (an N+1 query shows up as dozens of identical database spans under one request) instead of a guess. Load the SDK before the app, and set the destination with `OTEL_EXPORTER_OTLP_ENDPOINT`:

```console
$ OTEL_SERVICE_NAME=storefront-api OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 node --import ./instrumentation.ts src/server.ts
```

Then run the same latency budgets against production on a schedule with a Checkly API check, so a regression that slips through still pages someone:

```typescript
// __checks__/products-api.check.ts
import { ApiCheck, AssertionBuilder, Frequency } from "checkly/constructs";

new ApiCheck("products-api-latency", {
  name: "Products API latency",
  frequency: Frequency.EVERY_5M,
  degradedResponseTime: 200, // ms: marks the check degraded
  maxResponseTime: 500,      // ms: marks the check failed
  request: {
    method: "GET",
    url: "https://shop.example.com/api/products",
    assertions: [AssertionBuilder.statusCode().equals(200)],
  },
});
```

`npx checkly test` runs the checks once from your machine and `npx checkly deploy` publishes them.

## Results

After 6 months of performance-gated CI, Jess's team reports (their own numbers):

- 34 PRs blocked for budget violations, all fixed before merge
- Product listing LCP down from 3.2s to 1.8s; JavaScript bundle down from 380KB to 210KB through budget enforcement
- Three N+1 queries caught by the API latency tests and traced with OpenTelemetry spans
- No extra infrastructure: the checks run on existing CI, and Lighthouse and Vitest are free
- The 3-run median keeps flaky failures rare; budgets are loosened per page only with a reviewed change
