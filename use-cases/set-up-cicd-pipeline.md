---
title: "Set Up a Production-Ready CI/CD Pipeline with AI"
slug: set-up-cicd-pipeline
description: "Build a complete CI/CD pipeline with automated testing, Docker optimization, and security scanning gates for production deployments."
skills: [cicd-pipeline, docker-helper, test-generator, security-audit]
category: devops
tags: [cicd, docker, testing, security, deployment]
---

# Set Up a Production-Ready CI/CD Pipeline with AI

## The Problem

Your team deploys by SSH-ing into production, running `git pull`, and restarting PM2. No automated tests, no staging, no rollback. The Docker image is 1.4GB and takes 8 minutes to build. Last Friday, a broken migration took the API down for 45 minutes before anyone noticed.

Setting up CI/CD properly means coordinating tests, container optimization, security scanning, and deployment — each takes a day to configure, and they all need to work together.

## The Solution

Four skills build a production-ready pipeline. **test-generator** creates tests so the pipeline gates on something meaningful. **docker-helper** optimizes images for fast builds. **cicd-pipeline** creates the GitHub Actions workflow with staging and production stages. **security-audit** adds vulnerability scanning as a required gate.

## Step-by-Step Walkthrough

### 1. Generate tests for the pipeline to run

```text
Generate integration tests for the core API: user management, billing, and webhook processing.
```

```text
  tests/integration/users.test.js    — 16 tests (CRUD, validation, pagination)
  tests/integration/billing.test.js  — 14 tests (subscriptions, invoices, retries)
  tests/integration/webhooks.test.js — 11 tests (signatures, idempotency, dead letters)

Total: 41 tests, all passing. Coverage: 64%. Run time: 12 seconds.
```

### 2. Optimize the Docker build

```text
Optimize our Dockerfile. Currently 1.4GB, 8 minutes to build. Needs smaller images, faster builds, security hardening.
```

```text
  Image size:  1.4GB → 156MB (89% reduction)
  Build time:  8:12 → 1:43 (79% faster)

  ✓ Multi-stage build (compile → runtime only)
  ✓ node:20 → node:20-alpine
  ✓ .dockerignore (excludes tests, docs, .git)
  ✓ Dependency layer caching (package*.json first, then npm ci --production)
  ✓ Non-root user with minimal permissions
  ✓ HEALTHCHECK every 30s
  ✓ Base image pinned to SHA digest
```

### 3. Build the CI/CD pipeline

```text
Create a GitHub Actions pipeline: lint, test, build Docker image, deploy to staging on merge, production on release tag. Cache node_modules and Docker layers.
```

```text
Created: .github/workflows/ci.yml

  1. LINT (30s) — ESLint + Prettier
  2. TEST (45s) — 41 tests with PostgreSQL service, coverage report as PR comment
     Gate: fails below 60% coverage
  3. BUILD (1:43) — Multi-stage Docker, layer cache, push to GitHub Container Registry
  4. STAGING — On merge to main, deploy + smoke tests
  5. PRODUCTION — On v*.*.* tags, blue-green deploy with health checks
     Auto-rollback if health check fails within 5 minutes

Total: ~4 minutes commit-to-staging
```

### 4. Add security scanning gates

```text
Add security scanning to the pipeline. SAST, dependency audit, Docker image scan, secret detection. Block on critical findings.
```

```text
Security gates added between TEST and BUILD:

  ✓ SAST — Semgrep with Node.js + Express rulesets
  ✓ Dependency scan — npm audit + Snyk for transitive CVEs
  ✓ Secret detection — Gitleaks on PR diff
  Post-build: Trivy scans Docker image, fails on CRITICAL

  Gate: PRs require all security checks green
  Findings posted as inline PR review comments

Initial scan found 2 issues:
  ✗ axios 0.21.1 SSRF vulnerability → updated to 1.6.2 ✓
  ✗ Missing X-Content-Type-Options header → added helmet ✓
```

### 5. Validate the complete pipeline

```text
Run the full pipeline end-to-end. Deploy to staging and verify everything works together.
```

```text
Full Pipeline — SUCCESS ✓

  ✓ Lint:           32s (0 issues)
  ✓ Tests:          41/41 passing, 64% coverage
  ✓ Dependency scan: 0 vulnerabilities
  ✓ SAST:           0 findings
  ✓ Secret scan:    0 leaks
  ✓ Docker build:   1:43 (156MB, cached)
  ✓ Container scan: 0 critical
  ✓ Staging deploy: health check passing
  ✓ Smoke tests:    5/5 passing

Total: 4:18 commit → staging. Pipeline ready.
```

## Real-World Example

A DevOps engineer at a 35-person e-commerce startup was tasked with fixing their deployment process after the third outage in two months. Eight developers deployed by SSH, no tests, 1.6GB Docker image. He started Monday: test-generator produced 52 integration tests in 20 minutes. docker-helper cut the image to 142MB and build time to 2 minutes. cicd-pipeline created the full workflow with staging and production. security-audit added gates that immediately caught 3 dependency CVEs and a hardcoded API key.

First week live: security gates blocked 2 PRs with vulnerabilities, test gates caught 1 regression — all before production. Deployment: 25 minutes manual → 4 minutes automated. Zero outages in the following 3 months.
