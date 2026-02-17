---
title: "Rescue a Failing CI/CD Pipeline and Cut Build Times"
slug: rescue-failing-cicd-pipeline
description: "Diagnose flaky tests, optimize slow builds, and fix unreliable CI/CD pipelines that waste engineering hours."
skills: [cicd-pipeline, test-generator, docker-helper]
category: devops
tags: [cicd, pipeline, optimization, flaky-tests, build-time]
---

# Rescue a Failing CI/CD Pipeline and Cut Build Times

## The Problem

Monday standup: "CI is red again." Three engineers nod — they've already re-run builds twice hoping they'll pass. Your pipeline takes 43 minutes and fails 28% of the time from flaky tests. The ritual: push, get coffee, fail, re-trigger, lunch, merge if green.

The numbers: 8 engineers, 6 PRs/day. Each failed run wastes 43 minutes of pipeline time plus 15 minutes of context-switching. That's 22 engineering hours per week — nearly 3 full-time equivalents consumed by a broken pipeline. You have 14 tests that fail intermittently from timing issues, shared state, or race conditions. Combined flake probability: 72% chance at least one fails per run.

Slow builds compound the problem. Docker builds that don't cache. Serial tests that could parallelize. Dependencies installed from scratch every run. A 43-minute feedback loop means bigger PRs, harder reviews, more conflicts. CI costs have crept from $200 to $840/month from re-runs alone.

## The Solution

Combine **cicd-pipeline** for workflow optimization, **test-generator** for replacing flaky tests, and **docker-helper** for build performance. The approach: profile what's slow, identify what's flaky, fix both, monitor for regression.

```bash
npx terminal-skills install cicd-pipeline test-generator docker-helper
```

## Step-by-Step Walkthrough

### 1. Profile the pipeline

```
Analyze our GitHub Actions pipeline. Where are the 43 minutes going and which tests are flaky?
```

```
TIME BREAKDOWN (43m 12s avg):
  npm install:  8m 47s (20%) ← no cache
  Tests:       18m 33s (43%) ← serial execution
  Docker build: 7m 48s (18%) ← no layer cache
  Other:        8m 04s (19%)

FLAKY TESTS (14 identified):
  checkout.spec.ts:42     — 34% fail rate (setTimeout race)
  search.spec.ts:78       — 28% (Elasticsearch refresh lag)
  websocket.spec.ts:15    — 23% (port collision)
  email.spec.ts:31        — 19% (SMTP mock timing)
  cache.spec.ts:56        — 12% (Redis connection race)
  ... (9 more, 5-10% each)

Combined: 72% chance of flake per run → explains 28% pass rate

PROJECTED AFTER FIXES: 43m → 11m, failures 28% → ~3%
```

### 2. Fix flaky tests

```
Fix all 14 flaky tests with deterministic replacements.
```

```
  1. checkout.spec.ts — setTimeout(1000) for Stripe webhook → waitForCondition() polling
  2. search.spec.ts — Elasticsearch stale read → explicit index refresh before assert
  3. websocket.spec.ts — hardcoded port 3001 → port 0 (OS-assigned random)
  4. email.spec.ts — SMTP mock not ready → await 'listening' event before test
  5. cache.spec.ts — fire-and-forget Redis connect → await redis.connect() in beforeEach
  ... (9 more fixed)

Validation: Full suite 20 consecutive runs — 20/20 green ✓ (was ~5/20)
```

### 3. Optimize build performance

```
Add dependency caching, parallelize tests, and optimize Docker builds.
```

```
  1. DEPENDENCY CACHE: npm install 8m 47s → 12s (actions/cache on lockfile hash)
  2. PARALLEL TESTS: 3 shards running simultaneously
     18m 33s → 4m 11s (slowest shard)
  3. DOCKER CACHE: layer cache via buildx
     7m 48s → 1m 22s (deps unchanged)

RESULT: 43m 12s → 10m 47s average
CI cost: $840/mo → $310/mo (fewer minutes + fewer re-runs)
```

### 4. Add monitoring and alerts

```
Alert us if build times regress or flake rate increases.
```

```
Weekly Slack report (#engineering, Monday 9am):
  📊 Avg build: 10m 47s (target <15m) ✅
  📊 Pass rate: 97.2% (target >95%) ✅
  📊 Flaky tests detected: 1
  📊 Re-runs needed: 4 (2.7%)
  📊 Cost: $287 (budget $400) ✅

Instant alerts (#ci-alerts):
  🚨 Build >20min, 3 consecutive main failures, test fails 3+ times/day
```

### 5. Document pipeline standards

```
Create a playbook so new tests don't introduce flakiness.
```

```
Created: docs/CI-PLAYBOOK.md

  Performance budgets: Pipeline <15m, tests <5m/shard, Docker <2m cached
  Non-flaky test rules:
    - No setTimeout waits — use polling helpers
    - Random ports for test servers
    - Isolated DB state (transaction + rollback)
    - No live API calls in CI
  New test validation: Run 10x locally before pushing
```

## Real-World Example

An engineering manager at a Series A data infrastructure startup inherited a pipeline that was the team's biggest frustration. Eleven engineers, 8-10 PRs daily, 38-minute builds, 31% flake rate. Engineers had stopped trusting CI — some merged after one green run even after three flaky failures.

Tuesday: pipeline profiling revealed 72% wasted time (no caching, serial tests, Docker rebuilding from scratch). Flake analysis found 11 tests with identical root causes — race conditions and timing assumptions. By Thursday: all flaky tests fixed, 3-shard parallel CI with caching, Docker layer caching.

Results: 38 minutes → 9 minutes. The team went a full week without a flaky failure — unprecedented. Over the following month: PR velocity up 23%, CI costs $920 → $280/month, "CI issues" disappeared from retros. Engineers started pushing smaller, more frequent PRs because the feedback loop was fast enough. The optimization recovered an estimated 2.5 engineering weeks per month.

## Related Skills

- [cicd-pipeline](../skills/cicd-pipeline/) — Pipeline configuration with caching, parallelization, and deploy gates
- [test-generator](../skills/test-generator/) — Replace flaky tests with deterministic alternatives
- [docker-helper](../skills/docker-helper/) — Multi-stage Docker builds with layer caching for CI
