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

Last Tuesday, a PR that "just refactored the query builder" made it to production and doubled the p95 latency on your main API endpoint. Nobody noticed until a customer complained 3 hours later. The rollback took another 45 minutes, and the root cause took a day to find: an innocent-looking change added an N+1 query inside a loop.

This keeps happening. Your 15-person engineering team ships 30-40 PRs per week. Each passes tests, gets reviewed, and merges, but nobody checks performance. Load testing happens quarterly at best. By the time regressions are noticed they are tangled with other changes, and bisecting 30 PRs to find 200ms of latency is nobody's idea of a productive afternoon.

You need an automated performance check on every PR: not a full load test, but enough to catch the obvious regressions before they merge.

## The Solution

Use **api-tester** to design and run the benchmark scenarios, **cicd-pipeline** to run them on every PR against the base branch, and **report-generator** to turn results into a PR comment and a weekly trend report.

## Step-by-Step Walkthrough

### Step 1: Identify Critical Performance Paths

```text
Analyze our API routes and the last 7 days of production metrics, and pick the 10 endpoints with the highest traffic and latency sensitivity. These will be our benchmark targets.
```

Not every endpoint needs benchmarking, only the ones where a regression would matter. Example output (the team's own numbers):

| Endpoint | Traffic | Current p95 | Why it matters |
|----------|---------|-------------|----------------|
| `GET /api/orders` | 12K req/hr | 340ms | Revenue-critical, most-hit page |
| `POST /api/orders` | 3K req/hr | 280ms | Checkout flow |
| `GET /api/products/search` | 8K req/hr | 520ms | User-facing search |
| `GET /api/dashboard/stats` | 2K req/hr | 890ms | Admin dashboard |
| `POST /api/auth/login` | 1.5K req/hr | 180ms | Auth gate, blocks everything |

Production numbers are used only to *choose* endpoints. The pass/fail decision compares the PR against the base branch measured on the same machine in the same job, because a CI runner will never match production latency.

### Step 2: Create the Benchmark Suite

```text
Build benchmarks/bench.mjs with autocannon. For each scenario: a 50-request warm-up that is discarded, then 500 requests at 10 connections. Record p50, p90, p97.5, p99, requests/sec and the count of non-2xx responses. Write the results as JSON.
```

[autocannon](https://github.com/mcollina/autocannon) is an npm HTTP benchmarking tool with a programmatic API. Its latency histogram has `p50`, `p90`, `p97_5` and `p99` but no p95, so the suite tracks p97.5 as the tail metric.

```javascript
import autocannon from "autocannon";
import { writeFileSync } from "node:fs";

const base = process.env.BENCH_URL;            // e.g. http://127.0.0.1:4010
const scenarios = [
  { name: "GET /api/orders", method: "GET", path: "/api/orders" },
  { name: "POST /api/orders", method: "POST", path: "/api/orders",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ sku: "A-100", qty: 2 }] }) },
];

const out = {};
for (const s of scenarios) {
  const run = (amount) => autocannon({ url: base + s.path, method: s.method,
    headers: s.headers, body: s.body, connections: 10, amount });
  await run(50);                               // warm-up, discarded
  const r = await run(500);
  out[s.name] = { p50: r.latency.p50, p90: r.latency.p90, p97_5: r.latency.p97_5,
                  p99: r.latency.p99, rps: r.requests.average, non2xx: r.non2xx };
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
```

Use realistic payloads and seed data from `benchmarks/fixtures/`, so every run exercises the same query paths (real order objects, search terms that hit the full-text index). Auth tokens for the benchmark user come from a CI secret, and endpoints that need a signature, such as webhooks, need the signature computed in the scenario. The full suite takes about a minute.

### Step 3: Set Up the CI Pipeline

```text
Add a GitHub Actions workflow that benchmarks the PR and its base commit on the same runner, compares them, fails on a tail-latency regression above 20%, and posts the table as a PR comment.
```

```yaml
name: performance
on:
  pull_request:
    paths: ["src/**", "package.json", "package-lock.json", "benchmarks/**"]
permissions:
  contents: read
  pull-requests: write
jobs:
  bench:
    # Fork PRs get a read-only token and cannot post comments
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: ci-only-password }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s --health-retries 10
    env:
      DATABASE_URL: postgres://postgres:ci-only-password@127.0.0.1:5432/postgres
      PORT: "4010"
      BENCH_URL: http://127.0.0.1:4010
    steps:
      - uses: actions/checkout@v7
        with: { path: pr }
      - uses: actions/checkout@v7
        with: { ref: "${{ github.event.pull_request.base.sha }}", path: base }
      - uses: actions/setup-node@v7
        with: { node-version: 22 }
      - name: Benchmark base, then PR
        run: |
          for side in base pr; do
            (cd "$side" && npm ci && npm run bench:seed)
            # run node directly (not "npm start") so the saved PID is the server itself
            (cd "$side" && exec node src/server.js > "../$side.log" 2>&1) & echo $! > "$side.pid"
            for i in $(seq 1 30); do curl -sf "$BENCH_URL/healthz" && break; sleep 1; done
            (cd pr && node benchmarks/bench.mjs "../$side.json")
            kill "$(cat "$side.pid")"
          done
      - name: Compare
        shell: bash   # adds pipefail, so a failing compare is not hidden by tee
        run: node pr/benchmarks/compare.mjs base.json pr.json | tee comment.md
      - name: Comment on the PR
        if: always()
        env: { GH_TOKEN: "${{ github.token }}" }
        run: |
          gh pr comment "${{ github.event.pull_request.number }}" --repo "$GITHUB_REPOSITORY" \
            --edit-last --body-file comment.md \
            || gh pr comment "${{ github.event.pull_request.number }}" --repo "$GITHUB_REPOSITORY" --body-file comment.md
```

Both sides use the same runner, database image, seed data and benchmark script (always the PR's copy of `bench.mjs`); only the application code differs. The comparison script has two thresholds and a noise floor, because shared CI runners jitter:

```javascript
import { readFileSync, appendFileSync } from "node:fs";

const [basePath, curPath] = process.argv.slice(2);
const base = JSON.parse(readFileSync(basePath, "utf8"));
const cur = JSON.parse(readFileSync(curPath, "utf8"));
const WARN = 0.10, FAIL = 0.20, MIN_ABS_MS = 15;   // ignore changes smaller than runner noise

let failed = false;
const rows = ["| Endpoint | Base p97.5 | PR p97.5 | Change | Status |", "|---|---|---|---|---|"];
for (const [name, b] of Object.entries(base)) {
  const c = cur[name];
  if (!c) { rows.push(`| ${name} | ${b.p97_5}ms | - | - | **MISSING** |`); failed = true; continue; }
  const delta = (c.p97_5 - b.p97_5) / b.p97_5;
  const big = c.p97_5 - b.p97_5 >= MIN_ABS_MS;
  const status = c.non2xx > 0 ? "**ERRORS**" : big && delta > FAIL ? "**REGRESSION**" : big && delta > WARN ? "Warning" : "Pass";
  if (status === "**REGRESSION**" || status === "**ERRORS**") failed = true;
  rows.push(`| ${name} | ${b.p97_5}ms | ${c.p97_5}ms | ${(delta * 100).toFixed(1)}% | ${status} |`);
}
const md = rows.join("\n");
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
process.exit(failed ? 1 : 0);
```

A warning only informs; a failure (exit code 1) turns the check red. Mark the `performance` check as required in branch protection to block merges. A 500-request sample on a shared runner is a smoke test for gross regressions like an N+1 query, not a lab measurement; if you need tighter thresholds, use a dedicated self-hosted runner.

### Step 4: Generate the Comparison Report

The **report-generator** skill formats the table that `compare.mjs` prints as a PR comment that anyone can read at a glance:

| Endpoint | Base p97.5 | PR p97.5 | Change | Status |
|----------|-----------|----------|--------|--------|
| GET /api/orders | 342ms | 348ms | 1.8% | Pass |
| POST /api/orders | 278ms | 412ms | 48.2% | **REGRESSION** |
| GET /api/products/search | 518ms | 502ms | -3.1% | Pass |

When an endpoint regresses, ask the agent to add the likely cause from the diff (`git diff --name-only` against the base): "POST /api/orders slowed by 134ms; the PR changes `src/orders/create.ts`, check for queries inside loops". Treat that as a lead, not a verdict.

### Step 5: Track Performance Trends Over Time

Per-PR thresholds miss cumulative drift: eight PRs that each add 4% never trip a 20% gate. Run the same benchmark on every push to `main`, and store the JSON in a dedicated orphan branch (`perf-history`, written with the workflow's `contents: write` permission) with one timestamped file per merge.

A scheduled workflow then asks **report-generator** for a weekly Markdown trend report:

| Endpoint | Week 1 | Week 2 | Week 3 | Week 4 | Trend |
|----------|--------|--------|--------|--------|-------|
| GET /api/orders | 340ms | 342ms | 338ms | 348ms | Stable |
| GET /api/dashboard/stats | 650ms | 780ms | 850ms | 884ms | **Degrading** |

If an endpoint is more than 20% above its four-week-old value, the job opens an issue ("Performance: /dashboard/stats +36% over 4 weeks") with the commit range where the drift started.

## Real-World Example

Amir, a senior engineer at a 15-person e-commerce SaaS, was tired of being the human performance detector. He set up the workflow on a Friday: ten benchmarked endpoints and a performance check of a few minutes on every PR. In the first week it caught two regressions before merge, an N+1 query on the orders endpoint and an unnecessary JSON serialization in the auth flow.

The weekly trend report showed that the dashboard stats endpoint had been degrading for four weeks across eight small PRs, each adding a few percent. The team merged three database queries into one and brought it back to baseline. Performance incidents that used to take hours of bisecting became a red check on the PR that caused them.

## Related Skills

- [api-tester](../skills/api-tester/) -- designs the scenarios and verifies each endpoint answers correctly before it is benchmarked
- [cicd-pipeline](../skills/cicd-pipeline/) -- runs the benchmark job on every PR and on every merge
- [report-generator](../skills/report-generator/) -- formats the PR comment and the weekly trend report
