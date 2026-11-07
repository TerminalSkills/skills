---
title: Build an Automated Load Testing Framework
slug: build-automated-load-testing-framework
description: >
  Catch performance regressions before production with automated load
  tests that run on every PR — ramping virtual users against a preview
  stack and failing the build when latency or error rate passes a budget.
skills:
  - typescript
  - github-actions
  - docker-helper
  - zod
  - k6
category: devops
tags:
  - load-testing
  - performance
  - ci-cd
  - benchmarking
  - stress-testing
  - regression-detection
---

# Build an Automated Load Testing Framework

## The Problem

A SaaS API handles 5K requests/second at peak. Performance issues are only discovered in production: last month, a new database query doubled p99 latency from 200ms to 400ms, triggering SLA violations for 3 enterprise customers ($15K in credits). The team has a k6 script someone wrote 8 months ago, but nobody runs it. Manual load testing happens "when we remember" — roughly never. Every deployment is a gamble.

The fix is to stop writing a load generator and to run a proper one (k6) automatically: scenarios described once, validated, run against a throwaway stack in Docker on every PR, with thresholds that fail the job. A hand-rolled `fetch` loop in Node cannot generate thousands of concurrent users; the load generator would saturate before the API did.

## Step 1: Define and Validate Scenarios

Scenarios live in one JSON file that both the k6 script and CI read. A small Zod schema rejects a malformed scenario before any load is generated:

```typescript
// loadtest/validate.ts — run with `npx tsx loadtest/validate.ts`
import { readFileSync } from "node:fs";
import { z } from "zod";

const Scenario = z.object({
  name: z.string(),
  stages: z.array(z.object({ duration: z.string().regex(/^\d+[smh]$/), target: z.number().int().nonnegative() })),
  endpoints: z.array(z.object({
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
    path: z.string().startsWith("/"),
    weight: z.number().positive(),
    body: z.unknown().optional(),
    expectedStatus: z.number().int().default(200),
  })).min(1),
  thresholds: z.object({
    p95LatencyMs: z.number().positive(),
    p99LatencyMs: z.number().positive(),
    errorRate: z.number().min(0).max(1),
  }),
});

const scenarios = z.array(Scenario).parse(JSON.parse(readFileSync("loadtest/scenarios.json", "utf-8")));
console.log(`${scenarios.length} scenarios valid`);
```

```json
[
  {
    "name": "smoke",
    "stages": [
      { "duration": "10s", "target": 50 },
      { "duration": "10s", "target": 100 },
      { "duration": "10s", "target": 0 }
    ],
    "endpoints": [
      { "method": "GET", "path": "/api/v1/projects", "weight": 5 },
      { "method": "GET", "path": "/api/v1/tasks?limit=20", "weight": 4 },
      { "method": "POST", "path": "/api/v1/tasks", "weight": 2, "body": { "title": "Load test task" }, "expectedStatus": 201 },
      { "method": "GET", "path": "/api/v1/search?q=test", "weight": 1 }
    ],
    "thresholds": { "p95LatencyMs": 300, "p99LatencyMs": 500, "errorRate": 0.01 }
  },
  {
    "name": "soak",
    "stages": [
      { "duration": "1m", "target": 500 },
      { "duration": "5m", "target": 1000 },
      { "duration": "2m", "target": 0 }
    ],
    "endpoints": [
      { "method": "GET", "path": "/api/v1/projects", "weight": 5 },
      { "method": "GET", "path": "/api/v1/tasks?limit=50", "weight": 5 },
      { "method": "GET", "path": "/api/v1/search?q=test", "weight": 3 }
    ],
    "thresholds": { "p95LatencyMs": 250, "p99LatencyMs": 500, "errorRate": 0.005 }
  }
]
```

## Step 2: The k6 Script

k6 runs `.ts` files directly (type information is stripped, not checked, so the Zod step above is what guards the data). Virtual users (VUs) ramp through the stages; each iteration picks an endpoint by weight; thresholds come from the scenario, so a breach makes `k6 run` exit non-zero:

```typescript
// loadtest/api.ts
import http from "k6/http";
import { check } from "k6";
import type { Options } from "k6/options";

interface Endpoint { method: string; path: string; weight: number; body?: unknown; expectedStatus?: number }
interface Scenario {
  name: string;
  stages: { duration: string; target: number }[];
  endpoints: Endpoint[];
  thresholds: { p95LatencyMs: number; p99LatencyMs: number; errorRate: number };
}

const scenarios = JSON.parse(open("./scenarios.json")) as Scenario[];
const scenario = scenarios.find((s) => s.name === __ENV.SCENARIO);
if (!scenario) throw new Error(`Unknown SCENARIO: ${__ENV.SCENARIO}`);

const BASE_URL = __ENV.BASE_URL ?? "http://127.0.0.1:3000";
const totalWeight = scenario.endpoints.reduce((sum, e) => sum + e.weight, 0);

export const options: Options = {
  // p(99) is not in k6's default summary trend stats; handleSummary below reads it
  summaryTrendStats: ["avg", "p(95)", "p(99)", "max"],
  scenarios: {
    load: { executor: "ramping-vus", startVUs: 0, stages: scenario.stages, gracefulRampDown: "10s" },
  },
  thresholds: {
    http_req_duration: [`p(95)<${scenario.thresholds.p95LatencyMs}`, `p(99)<${scenario.thresholds.p99LatencyMs}`],
    http_req_failed: [`rate<${scenario.thresholds.errorRate}`],
  },
};

function pick(): Endpoint {
  let r = Math.random() * totalWeight;
  for (const e of scenario!.endpoints) {
    r -= e.weight;
    if (r < 0) return e;
  }
  return scenario!.endpoints[scenario!.endpoints.length - 1];
}

export default function () {
  const e = pick();
  const params = { headers: { "Content-Type": "application/json", Authorization: `Bearer ${__ENV.API_TOKEN}` } };
  const res = http.request(e.method, `${BASE_URL}${e.path}`, e.body ? JSON.stringify(e.body) : null, params);
  check(res, { "expected status": (r) => r.status === (e.expectedStatus ?? 200) });
}

// Write the metrics we compare against the main branch
export function handleSummary(data: any) {
  const d = data.metrics.http_req_duration.values;
  const out = { p95: d["p(95)"], p99: d["p(99)"], rps: data.metrics.http_reqs.values.rate };
  return { "/results/summary.json": JSON.stringify(out, null, 2), stdout: `p95=${d["p(95)"]}ms p99=${d["p(99)"]}ms\n` };
}
```

`http_req_failed` counts responses outside the 2xx/3xx range as failures; the `check` also catches a 200 where 201 was expected.

## Step 3: Run It on Every PR with Docker and GitHub Actions

The API runs from the repo's compose file with a healthcheck (the `docker-helper` skill covers `depends_on` conditions and `--wait`), bound to loopback. k6 runs from its official image with the scripts mounted read-only and a results directory mounted for the summary. `--network host` lets the container reach the loopback-bound API on a Linux runner:

```yaml
# .github/workflows/loadtest.yml
name: load-test
on:
  pull_request:
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24 }
      - run: npm ci && npx tsx loadtest/validate.ts
      - run: docker compose up -d --build --wait    # api published on 127.0.0.1:3000
      - name: Run k6
        env:
          API_TOKEN: ${{ secrets.LOADTEST_API_TOKEN }}
        run: |
          mkdir -p results && chmod 777 results
          docker run --rm --network host \
            -v "$PWD/loadtest:/loadtest:ro" -v "$PWD/results:/results" \
            -e SCENARIO=smoke -e BASE_URL=http://127.0.0.1:3000 -e API_TOKEN \
            grafana/k6:2.3.0 run --quiet /loadtest/api.ts
      - run: node loadtest/compare.mjs results/summary.json baseline/summary.json
      - if: always()
        run: docker compose down -v
```

The image is pinned to `grafana/k6:2.3.0` (a Docker Hub tag) instead of the implicit `latest`, so a k6 release cannot change results between runs; bump it deliberately. Release candidates run the `soak` scenario from a `workflow_dispatch` or tag trigger instead.

A threshold breach is a failed `k6 run` (exit code 99), which fails the job. For the baseline comparison, store `summary.json` from the `main` run as a workflow artifact or cache entry, then fail a PR whose p95 is more than 15% above it:

```javascript
// loadtest/compare.mjs
import { readFileSync, existsSync } from "node:fs";

const [currentPath, baselinePath] = process.argv.slice(2);
const current = JSON.parse(readFileSync(currentPath, "utf-8"));
if (!existsSync(baselinePath)) { console.log("No baseline yet; skipping comparison"); process.exit(0); }
const baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));

const growth = (current.p95 - baseline.p95) / baseline.p95;
console.log(`p95 ${baseline.p95.toFixed(0)}ms -> ${current.p95.toFixed(0)}ms (${(growth * 100).toFixed(1)}%)`);
if (growth > 0.15) process.exit(1);
```

Shared CI runners are noisy, so keep the smoke thresholds loose enough to avoid flaky failures and use a dedicated runner for the soak run.

## Results

In this example team's first quarter with the pipeline:

- The 2x p99 regression from a new query failed the smoke job on the PR and never merged
- Every PR gets a 30-second smoke run; release candidates get the longer soak
- Latency budgets are reviewed in the scenario file, so the team argues about p95 targets instead of "it feels fast enough"
- The baseline summary from each `main` run gives a history of p95 over time

## Related Skills

- `k6` - scenarios, executors, thresholds and exit code 99
- `typescript` - typing the scenario file and the helper scripts
- `github-actions` - the per-PR workflow
- `docker-helper` - the compose stack with healthchecks and `--wait`
- `zod` - validating scenarios before load is generated
