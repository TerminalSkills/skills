---
title: "Rescue a Failing CI/CD Pipeline and Cut Build Times"
slug: rescue-failing-cicd-pipeline
description: "Diagnose flaky tests, optimize slow builds, and fix unreliable CI/CD pipelines that waste engineering hours."
skills: [github-actions, test-generator, docker-helper]
category: devops
tags: [cicd, pipeline, optimization, flaky-tests, build-time]
---

# Rescue a Failing CI/CD Pipeline and Cut Build Times

## The Problem

Monday standup: "CI is red again." Three engineers nod -- they've already re-run builds twice hoping they'll pass. The pipeline takes 43 minutes and fails more than four runs in five because of flaky tests. Everyone knows the ritual: push, get coffee, fail, re-trigger, lunch, merge if green.

The numbers are brutal. Eight engineers, 6 PRs per day. Each failed run wastes 43 minutes of pipeline time plus 15 minutes of context-switching while the developer figures out whether the failure is real or random. That's 22 engineering hours per week -- nearly 3 full-time equivalents consumed by a broken pipeline. There are 14 tests that fail intermittently from timing issues, shared state, or race conditions. Combined, there is roughly an 85% chance that at least one of them fails on any given run (1 minus the product of each test's pass rate). A coin flip would be more reliable.

Slow builds compound the problem. Docker builds that don't cache. Serial tests that could parallelize. Dependencies installed from scratch every single run. A 43-minute feedback loop means bigger PRs, harder reviews, more conflicts. CI costs have crept from $200 to $840 per month from re-runs alone. The pipeline was supposed to give the team confidence. Instead, it's the team's biggest source of frustration.

## The Solution

Combine **github-actions** for workflow optimization, **test-generator** for replacing flaky tests with deterministic ones, and **docker-helper** for build performance. The approach: profile what's slow, identify what's flaky, fix both, then monitor for regression.

## Step-by-Step Walkthrough

### Step 1: Profile the Pipeline

First, figure out where the 43 minutes are actually going.

```text
Analyze our GitHub Actions pipeline. Where are the 43 minutes going and which tests are flaky?
```

The time breakdown reveals four distinct bottlenecks:

| Phase | Time | % of Total | Root Cause |
|---|---|---|---|
| `npm install` | 8m 47s | 20% | No dependency cache, `npm install` instead of `npm ci` |
| Test suite | 18m 33s | 43% | Running serially in a single shard |
| Docker build | 7m 48s | 18% | No layer cache, rebuilds from scratch |
| Other (checkout, lint, upload) | 8m 04s | 19% | Minor optimizations possible |

The flaky test analysis is even more telling:

| Test File | Fail Rate | Root Cause |
|---|---|---|
| `checkout.spec.ts:42` | 34% | `setTimeout` race with a webhook handler |
| `search.spec.ts:78` | 28% | Elasticsearch refresh lag |
| `websocket.spec.ts:15` | 23% | Hardcoded port collision |
| `email.spec.ts:31` | 19% | SMTP mock not ready before assertion |
| `cache.spec.ts:56` | 12% | Redis connection race in setup |
| 9 more tests | 5-10% each | Various timing assumptions |

Combined, these 14 tests produce the roughly 85% flake rate. Fix them all and the pipeline should stabilize to around a 97% pass rate.

### Step 2: Fix the Flaky Tests

Every flaky test has the same underlying pattern: it assumes something will be ready by a certain time instead of verifying it.

```text
Fix all 14 flaky tests with deterministic replacements.
```

The fixes follow a few recurring patterns:

- **`setTimeout` races** (4 tests): Replace `setTimeout(1000)` with polling on the real state, for example `await vi.waitFor(() => expect(order.status).toBe('paid'), { timeout: 5000, interval: 50 })` in Vitest (Jest: `waitFor` from Testing Library). The checkout test waited a fixed 1 second for a payment webhook to be processed -- sometimes that took 200ms, sometimes 1.5 seconds. The test should also post a signed fixture event to its own handler instead of waiting on the live payment provider.
- **Stale reads** (3 tests): Refresh the index before asserting (`await client.indices.refresh({ index: 'products' })` with the Elasticsearch JS client), or index with `refresh: 'wait_for'`. The search test was reading before the index caught up.
- **Port collisions** (2 tests): Replace hardcoded `port: 3001` with `port: 0` to let the OS assign a free port, then read it back from `server.address()`. Two test files were fighting over the same port when running concurrently.
- **Unready mocks** (3 tests): Await the mock server's `listening` event before running assertions. The email test was sending requests before the SMTP mock finished binding.
- **Connection races** (2 tests): Move `await redis.connect()` into `beforeEach` instead of fire-and-forget in module initialization.

Validation: the full suite runs 20 consecutive times -- 20 out of 20 green. Previously it was about 3 out of 20. A plain loop proves it (`for i in $(seq 20); do npx vitest run || break; done`); do not hide flakes behind `retry` settings.

### Step 3: Optimize Build Performance

With flakiness fixed, the pipeline is reliable but still slow. Three changes cut 43 minutes to under 11.

```text
Add dependency caching, parallelize tests, and optimize Docker builds.
```

**Dependency cache**: `actions/setup-node` with `cache: npm` keys the npm download cache on `package-lock.json`, and `npm ci` installs exactly what the lockfile says. A cache hit skips the downloads, so install time drops from 8m 47s to about 40 seconds.

**Parallel test shards**: a matrix runs 3 jobs, each with `--shard=N/3` (supported by Vitest, Jest and Playwright). Wall-clock time is the slowest shard: 4m 11s instead of 18m 33s serial.

**Docker layer cache**: with the **docker-helper** skill, the Dockerfile is reordered so `package*.json` and `npm ci` come before `COPY . .`, and a `.dockerignore` keeps `node_modules` and `.git` out of the context. Buildx with the GitHub Actions cache backend then reuses unchanged layers. Time drops from 7m 48s to 1m 22s.

```yaml
# .github/workflows/ci.yml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
permissions: { contents: read }
concurrency: { group: "ci-${{ github.ref }}", cancel-in-progress: true }

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix: { shard: [1, 2, 3] }
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx vitest run --shard=${{ matrix.shard }}/3

  docker:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: false
          tags: app:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Pin third-party actions to a full commit SHA once the pipeline is stable (the github-actions skill's guideline); a mutable tag lets an upstream compromise run inside your CI.

The result:

| Metric | Before | After |
|---|---|---|
| Average build time | 43m 12s | 10m 47s |
| Runs failing from flakes | ~85% | ~3% |
| Monthly CI cost | $840 | $310 |
| Engineering hours wasted per week | 22 | ~3 |

### Step 4: Add Monitoring and Alerts

A pipeline that degrades slowly is worse than one that breaks loudly, because nobody notices until it's bad again. Monitoring prevents the backslide.

```text
Alert us if build times regress or flake rate increases.
```

Two monitoring channels go live:

**Weekly Slack report** (`#engineering`, Monday 9 AM): Average build time (target <15m), pass rate (target >95%), flaky tests detected, re-runs needed, and monthly cost. A single glanceable summary that catches drift before it becomes a problem.

**Instant alerts** (`#ci-alerts`): Fires immediately if any single build exceeds 20 minutes, if main fails 3 times consecutively, or if any test fails 3 or more times in a single day. These catch acute regressions -- a new test that introduces flakiness or a dependency change that blows up cache hits.

### Step 5: Document Pipeline Standards

The fixes are only permanent if the team knows the rules. A CI playbook prevents new contributions from reintroducing the same problems.

```text
Create a playbook so new tests don't introduce flakiness.
```

The playbook (`docs/CI-PLAYBOOK.md`) codifies what the team learned:

- **Performance budgets**: Total pipeline under 15 minutes, test suite under 5 minutes per shard, Docker build under 2 minutes cached
- **Non-flaky test rules**: No `setTimeout` waits (use polling helpers), random ports for test servers, isolated database state via transaction rollback, no live API calls in CI
- **New test validation**: Run 10 times locally before pushing -- if it fails once, it's flaky

## Real-World Example

An engineering manager at a Series A data infrastructure startup inherited this exact situation. Eleven engineers, 8-10 PRs daily, 38-minute builds, 31% of runs failing from flakes. Engineers had stopped trusting CI entirely -- some merged after a single green run even following three consecutive flaky failures.

On Tuesday, the pipeline profiling revealed the same pattern: no caching, serial tests, Docker rebuilding from scratch every time. 72% of build time was recoverable. Flake analysis found 11 tests with identical root causes -- race conditions and timing assumptions baked in months ago. By Thursday, all flaky tests were fixed, 3-shard parallel CI was running with dependency and layer caching enabled.

The result: 38 minutes dropped to 9. The team went a full week without a flaky failure -- unprecedented in the project's history. Over the following month, PR velocity increased 23%, CI costs dropped from $920 to $280 per month, and "CI issues" disappeared from sprint retrospectives entirely. Engineers started pushing smaller, more frequent PRs because the feedback loop was finally fast enough to support it. The optimization recovered an estimated 2.5 engineering weeks per month -- time that went back into building features instead of babysitting builds.
