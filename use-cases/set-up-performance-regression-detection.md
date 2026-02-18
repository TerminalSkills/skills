---
title: "Set Up Automated Performance Regression Detection"
slug: set-up-performance-regression-detection
description: "Catch performance regressions in CI before they reach production by benchmarking every PR against baseline metrics."
skills: [cicd-pipeline, api-tester, report-generator]
category: devops
tags: [performance, regression, benchmarking, CI, latency]
---

# Set Up Automated Performance Regression Detection

## The Problem

Last Tuesday, a PR that "just refactored the query builder" made it to production and doubled the p95 latency on your main API endpoint. Nobody noticed until a customer complained 3 hours later. The rollback took another 45 minutes, and the root cause took a day to find — an innocent-looking change added an N+1 query inside a loop.

This keeps happening. Your 15-person engineering team ships 30-40 PRs per week. Each PR passes tests, gets code review, and merges. But nobody checks performance. Load testing happens quarterly at best. By the time regressions are noticed, they've been in production for days and are tangled with other changes.

You need automated performance checks on every PR — not a full load test, but enough to catch the obvious regressions before they merge.

## The Solution

Use **api-tester** to run performance benchmarks against key endpoints, **cicd-pipeline** to integrate checks into your PR workflow, and **report-generator** to surface results as clear PR comments.

```bash
npx terminal-skills install api-tester cicd-pipeline report-generator
```

## Step-by-Step Walkthrough

### 1. Identify critical performance paths

```text
Analyze our API routes and identify the top 10 endpoints by traffic volume and latency sensitivity. These will be our benchmark targets.
```

```text
CRITICAL PATHS (by traffic × impact):

  1. GET  /api/orders          — 12K req/hr, p95: 340ms, revenue-critical
  2. POST /api/orders          — 3K req/hr, p95: 280ms, checkout flow
  3. GET  /api/products/search — 8K req/hr, p95: 520ms, user-facing search
  4. GET  /api/dashboard/stats — 2K req/hr, p95: 890ms, admin dashboard
  5. POST /api/auth/login      — 1.5K req/hr, p95: 180ms, auth gate
  6. GET  /api/users/:id       — 4K req/hr, p95: 120ms, profile loads
  7. POST /api/webhooks/stripe — 500 req/hr, p95: 450ms, payment processing
  8. GET  /api/reports/export  — 200 req/hr, p95: 2.1s, data export
  9. POST /api/events          — 6K req/hr, p95: 90ms, analytics ingestion
  10. GET /api/notifications   — 3K req/hr, p95: 210ms, real-time feeds

Baseline recorded from production metrics (last 7 days, p50/p95/p99)
```

### 2. Create the benchmark suite

```text
Build a benchmark configuration that tests these 10 endpoints with realistic payloads. Each test should run 100 requests and measure p50, p95, and p99 latency.
```

```text
Created: benchmarks/performance.config.json

10 scenarios with realistic payloads (orders CRUD, search, dashboard, auth, etc.)
  Warmup: 10 requests | Benchmark: 100 requests, 10 concurrent
  Metrics: p50, p95, p99 latency + throughput
  Seed data in benchmarks/fixtures/ | Total runtime: ~45 seconds
```

### 3. Set up the CI pipeline

```text
Add a GitHub Actions workflow that runs benchmarks on every PR. Compare results against the main branch baseline. Fail the check if any endpoint regresses more than 20%.
```

```text
Created: .github/workflows/performance.yml

Workflow:
  Trigger: on PR (when src/ or package.json changes)
  Steps:
    1. Start services: docker compose up -d (postgres, redis, api)
    2. Seed benchmark data: npm run bench:seed
    3. Run baseline (main branch): npm run bench > baseline.json
    4. Run PR branch: npm run bench > current.json
    5. Compare: node benchmarks/compare.js baseline.json current.json

Thresholds:
  ⚠️ Warning: any endpoint p95 regressed >10%
  ❌ Failure: any endpoint p95 regressed >20%
  ❌ Failure: any endpoint p99 exceeded 3 seconds

Results posted as PR comment with comparison table
Runs in ~3 minutes (docker startup + 45s benchmarks × 2 branches)
```

### 4. Generate the comparison report

```text
Format the benchmark comparison as a clear PR comment showing before/after for each endpoint.
```

```text
## ⚡ Performance Benchmark Results

| Endpoint | Baseline p95 | PR p95 | Change | Status |
|----------|-------------|--------|--------|--------|
| GET /orders | 342ms | 348ms | +1.8% | ✅ |
| POST /orders | 278ms | 412ms | +48.2% | ❌ REGRESSION |
| GET /products/search | 518ms | 502ms | -3.1% | ✅ improved |
| GET /dashboard/stats | 891ms | 884ms | -0.8% | ✅ |
| POST /auth/login | 182ms | 179ms | -1.6% | ✅ |
| ... | ... | ... | ... | ... |

❌ 1 regression detected: POST /orders (+48.2%)
  Likely cause: new middleware added in src/orders/create.ts
  Suggestion: check for N+1 queries or unnecessary async operations
```

### 5. Track performance trends over time

```text
Store benchmark results from each merged PR. Generate a weekly trend report showing performance trajectory per endpoint.
```

```text
Stored: benchmarks/history/ — JSON per merged PR with timestamp

Weekly Performance Trend (last 4 weeks):
  GET /orders: 340ms → 342ms → 338ms → 348ms (stable)
  GET /products/search: 580ms → 540ms → 520ms → 502ms (improving ↓)
  GET /dashboard/stats: 650ms → 780ms → 850ms → 884ms (degrading ↑ — investigate)

Alert: /dashboard/stats has regressed 36% over 4 weeks across 8 small PRs
  No single PR triggered the threshold, but cumulative drift is significant
  Opened issue: "Performance: /dashboard/stats cumulative regression"
```

## Real-World Example

Amir, a senior engineer at a 15-person e-commerce SaaS, was tired of being the human performance detector. He'd notice slow endpoints in production, bisect through recent PRs, and find the culprit — usually a well-meaning change with an unexpected performance impact. This happened 2-3 times per month.

He set up the three-skill workflow on a Friday. The api-tester created benchmarks for the 10 highest-traffic endpoints. The cicd-pipeline added a 3-minute performance check to every PR. In the first week, it caught 2 regressions before merge — one was an N+1 query in the orders endpoint (+48% latency), the other was an unnecessary JSON serialization in the auth flow.

The weekly trend report revealed something the team hadn't noticed: the dashboard stats endpoint had been slowly degrading over 4 weeks across 8 small PRs, each adding 3-5% latency. No single PR triggered the threshold, but the cumulative drift was 36%. The team consolidated 3 queries into 1 and brought it back to baseline. Monthly performance incidents dropped from 2-3 to zero over the next quarter.
