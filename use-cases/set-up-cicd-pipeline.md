---
title: "Set Up a Production-Grade CI/CD Pipeline with AI"
slug: set-up-cicd-pipeline
description: "Generate complete GitHub Actions workflows with tests, security gates, preview deploys, and auto-rollback."
skills: [cicd-pipeline]
category: devops
tags: [cicd, github-actions, deployment, automation, devops]
---

# Set Up a Production-Grade CI/CD Pipeline with AI

## The Problem

Your team deploys by SSH-ing into a server and running `git pull && pm2 restart`. Last Friday, a developer pulled a commit that needed a database migration nobody ran. The app crashed, 800 users saw 500 errors, and it took 45 minutes to figure out what happened and roll back.

Setting up proper CI/CD feels like assembling furniture from 15 IKEA boxes with no shared manual. GitHub Actions has 400+ config options. Add Docker builds, service containers, secret management, preview deploys, staging environments, approval gates, and Slack notifications — that's 8-12 hours of YAML and Stack Overflow.

Most teams get basic "run tests on push" and never finish the hard parts: parallel execution, layer caching, preview URLs, staged rollouts, and auto-rollback on health check failure. Every manual deployment is a risk. The average SaaS downtime costs $5,600 per minute.

## The Solution

The **cicd-pipeline** skill analyzes your project structure, tech stack, and hosting setup, then generates a complete CI/CD pipeline — not a starter template. Parallel testing, Docker optimization, security gates, preview environments, staged deployments, and rollback automation, all tailored to your actual setup.

```bash
npx terminal-skills install cicd-pipeline
```

## Step-by-Step Walkthrough

### 1. Analyze the project and generate the pipeline

```
Set up a complete CI/CD pipeline with GitHub Actions. We use Node.js 20, PostgreSQL, Redis, Docker, and deploy to AWS ECS.
```

```
Project analysis:
  Runtime: Node.js 20 | Package manager: pnpm | Tests: Vitest (148 files)
  Database: PostgreSQL 15 | Cache: Redis 7 | Deploy: AWS ECS

Generated: .github/workflows/ci.yml, .github/workflows/deploy.yml

CI (every push/PR):
  1. Lint + typecheck (parallel) ........... ~45s
  2. Unit tests (3 shards, parallel) ....... ~2min
  3. Integration tests (Postgres + Redis) .. ~3min
  4. Security audit ........................ ~1min
  Total: ~4 minutes (down from ~14 minutes serial)

Deploy (merge to main):
  Build → Push ECR → Staging → Smoke tests → Approval gate → Production → Health check
```

### 2. Optimize Docker builds

```
Optimize the Docker build for CI. Current build takes 8 minutes.
```

```
Optimizations applied:
  1. Multi-stage restructured: deps → build → runtime (Alpine)
  2. Layer cache via actions/cache (buildx)
  3. pnpm store + Turbo build cache across runs

  First build: 3m 20s | Cached (deps unchanged): 1m 10s
  Image size: 847MB → 142MB
```

### 3. Add preview deployments for PRs

```
Set up preview deployments so every PR gets its own URL.
```

```
Generated: .github/workflows/preview.yml

  PR open → Build image → Deploy ECS temp service → Comment PR with URL
  🔗 Preview: https://preview-pr-142.staging.yourapp.com
  PR close → Auto-teardown service + target group

  Cost: ~$0.15/hr per active preview (Fargate spot)
```

### 4. Configure production safety gates

```
Add approval gates, smoke tests after deploy, and auto-rollback on health check failure.
```

```
  1. Manual approval: production env requires @team-leads, 72h timeout
  2. Smoke tests: /health, /api/status, test login — 3 runs, 10s intervals
  3. Auto-rollback: 5-minute health monitor, rolls back + Slack alert on failure
  4. Notifications: ✅ success → #deployments, 🚨 failure → #incidents

Created: .github/workflows/rollback.yml, scripts/smoke-test.sh
```

### 5. Test the complete pipeline

```
Walk me through what the developer experience looks like end-to-end.
```

```
  1. Push branch → CI (3m 54s)
     ✓ Lint, typecheck, 148 tests (3 shards), security — all green

  2. Create PR → Preview deploys
     🔗 https://preview-pr-142.staging.yourapp.com

  3. Merge → Deploy pipeline
     ✓ Docker build (1m 12s) → ECR → Staging → Smoke tests
     ⏳ Awaiting approval... ✓ Approved by @sarah
     ✓ Production deploy → Health check passed
     ✅ #deployments notified

Developer time on CI/CD config: 0 minutes
```

## Real-World Example

A full-stack developer at a 4-person early-stage startup was the only person who knew how to deploy. Every release meant SSH, git pull, migrations, restart. Fridays meant deploying and then fixing whatever broke. After a 90-minute outage from a missing environment variable, he decided to automate.

He spent 6 hours on a Saturday writing GitHub Actions workflows. Got basic tests running but gave up on Docker caching, preview deploys, and rollback — too complex. The cicd-pipeline skill generated the complete setup in one session. By Tuesday: parallel CI (3m 47s, down from 11min), preview URLs on every PR, staged deploys with approval gates, and auto-rollback.

The first production deploy through the pipeline caught a database migration that would have failed — staging smoke tests flagged it before production. Over two months, the team went from weekly Friday deploys to 3-4 times daily. Deployment incidents: 2/month → zero. He was no longer the bottleneck — any team member could merge and the pipeline handled the rest.

## Related Skills

- [docker-helper](../skills/docker-helper/) — Optimize Dockerfiles for smaller images and faster builds
- [test-generator](../skills/test-generator/) — Generate test suites for your CI pipeline to run
- [security-audit](../skills/security-audit/) — Add security scanning as a deployment gate
