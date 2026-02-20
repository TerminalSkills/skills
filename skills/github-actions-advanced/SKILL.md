---
name: github-actions-advanced
description: >-
  Build advanced CI/CD pipelines with GitHub Actions. Use when a user asks
  to create reusable workflows, build matrix strategies, implement conditional
  deployments, cache dependencies, or optimize CI pipeline speed.
license: Apache-2.0
compatibility: 'Any language, any platform'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - github-actions
    - ci-cd
    - automation
    - workflows
    - devops
---

# GitHub Actions (Advanced)

## Overview

Beyond basic CI, GitHub Actions supports reusable workflows, matrix builds, deployment environments with approval gates, caching strategies, and custom composite actions. This skill covers patterns for production-grade CI/CD pipelines.

## Instructions

### Step 1: Optimized CI Pipeline

```yaml
# .github/workflows/ci.yml — Fast CI with caching and parallelism
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true          # cancel outdated runs on same branch

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'              # built-in dependency caching

      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]         # split tests across 4 parallel runners
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }

      - run: pnpm install --frozen-lockfile
      - run: pnpm test --shard=${{ matrix.shard }}/4

  e2e:
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck]      # only run after lint passes
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }

      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
      - run: pnpm e2e
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
```

### Step 2: Deployment with Environments

```yaml
# .github/workflows/deploy.yml — Deploy with approval gates
name: Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=sha,prefix=

      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging                 # auto-deploys
    steps:
      - run: |
          kubectl set image deployment/app \
            app=${{ needs.build.outputs.image-tag }} \
            --namespace staging

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production              # requires manual approval
    steps:
      - run: |
          kubectl set image deployment/app \
            app=${{ needs.build.outputs.image-tag }} \
            --namespace production
```

### Step 3: Reusable Workflow

```yaml
# .github/workflows/reusable-deploy.yml — Called by other workflows
name: Reusable Deploy

on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      image-tag:
        required: true
        type: string
    secrets:
      KUBE_CONFIG:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - run: echo "Deploying ${{ inputs.image-tag }} to ${{ inputs.environment }}"
```

## Guidelines

- Use `concurrency` to cancel outdated runs — saves CI minutes on PRs.
- Shard tests across matrix jobs for parallel execution (4x speed on large test suites).
- Use GitHub Environments for deployment approval gates (staging auto, production manual).
- `cache-from: type=gha` reuses Docker layer cache between runs.
- Reusable workflows (`workflow_call`) eliminate duplication across repositories.
