---
name: github-actions
category: devops
version: 1.0.0
description: >-
  Build CI/CD pipelines with GitHub Actions — workflows, jobs, steps, triggers,
  caching, artifacts, matrix builds, secrets, environments, reusable workflows,
  and custom actions. Use when tasks involve automating tests, builds, deployments,
  code quality checks, or any GitHub-triggered automation.
author: terminal-skills
tags: [github-actions, cicd, automation, testing, deployment, github]
---

# GitHub Actions

Build CI/CD pipelines that run on every push, PR, schedule, or manual trigger directly in GitHub.

## Workflow Structure

Workflows live in `.github/workflows/`. Each YAML file is an independent pipeline.

```yaml
# .github/workflows/ci.yml

name: CI                            # Display name in GitHub UI

on:                                 # Triggers
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:                        # Cancel duplicate runs
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:                             # Job ID
    runs-on: ubuntu-latest          # Runner OS
    steps:
      - uses: actions/checkout@v4   # Clone repo
      - uses: actions/setup-node@v4 # Install Node.js
        with:
          node-version: 20
          cache: npm                # Cache npm dependencies
      - run: npm ci                 # Install dependencies
      - run: npm test               # Run tests
```

## Triggers

```yaml
on:
  # Code events
  push:
    branches: [main, develop]
    paths: ['src/**', 'package.json']    # Only trigger on specific file changes
    tags: ['v*']                          # Tag pushes (releases)
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

  # Scheduled (cron)
  schedule:
    - cron: '0 8 * * 1'    # Every Monday at 8:00 UTC

  # Manual trigger
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deploy target'
        required: true
        type: choice
        options: [staging, production]

  # Triggered by other workflows
  workflow_call:
    inputs:
      node-version:
        type: string
        default: '20'
```

## Caching

Caching dependencies cuts 30-60 seconds off every run:

```yaml
# Automatic cache with setup-node
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm       # Also supports: yarn, pnpm

# Manual cache (any directory)
- uses: actions/cache@v4
  with:
    path: |
      node_modules
      .next/cache
    key: ${{ runner.os }}-deps-${{ hashFiles('package-lock.json') }}
    restore-keys: ${{ runner.os }}-deps-

# Split save/restore for parallel jobs
# Job 1: save
- uses: actions/cache/save@v4
  with:
    path: node_modules
    key: modules-${{ hashFiles('package-lock.json') }}

# Job 2+: restore
- uses: actions/cache/restore@v4
  with:
    path: node_modules
    key: modules-${{ hashFiles('package-lock.json') }}
```

## Artifacts

Share build outputs between jobs:

```yaml
# Upload
- uses: actions/upload-artifact@v4
  with:
    name: build
    path: dist/
    retention-days: 1      # Save storage costs

# Download (in another job)
- uses: actions/download-artifact@v4
  with:
    name: build
    path: dist/
```

## Matrix Builds

Test across multiple versions/platforms in parallel:

```yaml
jobs:
  test:
    strategy:
      fail-fast: false     # Don't cancel other jobs if one fails
      matrix:
        node-version: [18, 20, 22]
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
```

## Secrets and Environments

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production          # Requires approval if configured

    steps:
      - run: deploy --token ${{ secrets.DEPLOY_TOKEN }}

      # Environment-specific secrets
      - run: echo "Deploying to ${{ vars.API_URL }}"
```

Set secrets at: Settings → Secrets and variables → Actions.

## Job Dependencies and Outputs

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.ver.outputs.version }}
    steps:
      - id: ver
        run: echo "version=$(node -p 'require(\"./package.json\").version')" >> $GITHUB_OUTPUT

  deploy:
    needs: build                    # Runs after build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'  # Only on main branch
    steps:
      - run: echo "Deploying version ${{ needs.build.outputs.version }}"
```

## Common Patterns

### Lint + Test + Build + Deploy

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test

  build:
    needs: [lint, test]            # Both must pass
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with: { name: build, path: dist/ }

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/download-artifact@v4
        with: { name: build, path: dist/ }
      - run: npx vercel deploy --prod --token ${{ secrets.VERCEL_TOKEN }}
```

### Docker Build and Push

```yaml
jobs:
  docker:
    runs-on: ubuntu-latest
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### PR Comment with Results

```yaml
- uses: actions/github-script@v7
  with:
    script: |
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body: '✅ Build succeeded! Preview: https://...'
      });
```

### Deploy via SSH

```yaml
- uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.SERVER_HOST }}
    username: deploy
    key: ${{ secrets.SSH_PRIVATE_KEY }}
    script: |
      cd /opt/app
      git pull origin main
      npm ci --production
      npm run build
      pm2 restart app
```

## Reusable Workflows

Share workflows across repos:

```yaml
# .github/workflows/shared-ci.yml (in a shared repo)
on:
  workflow_call:
    inputs:
      node-version:
        type: string
        default: '20'
    secrets:
      npm-token:
        required: false

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ inputs.node-version }}, cache: npm }
      - run: npm ci
      - run: npm test
```

```yaml
# .github/workflows/ci.yml (in consuming repo)
jobs:
  ci:
    uses: org/shared-workflows/.github/workflows/shared-ci.yml@main
    with:
      node-version: '20'
```

## Services (Databases in CI)

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s

      redis:
        image: redis:7
        ports: ['6379:6379']

    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/testdb
      REDIS_URL: redis://localhost:6379

    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
```

## Billing

- **Public repos**: unlimited minutes, free
- **Private repos (free tier)**: 2,000 minutes/month
- **Linux runners**: 1x multiplier
- **macOS runners**: 10x multiplier (use sparingly)
- **Windows runners**: 2x multiplier

## Guidelines

- **`concurrency` with `cancel-in-progress`** — always add this to avoid wasting minutes on outdated runs
- **Cache aggressively** — `actions/cache` for node_modules, build outputs, Docker layers. Saves 30-60s per run.
- **`fail-fast: false` in matrix builds** — see all failures, not just the first one
- **Don't store secrets in workflow files** — use GitHub Secrets. Never `echo` secrets in logs.
- **Pin action versions to SHA** — `uses: actions/checkout@abc123` is more secure than `@v4` (prevents supply chain attacks)
- **Use `needs` for job ordering** — parallel by default. Add `needs` only when there's a real dependency.
- **Artifacts expire** — set `retention-days` to the minimum needed. Default 90 days wastes storage.
- **`if: github.ref == 'refs/heads/main'`** — guard deploy jobs to prevent accidental production deploys from PRs
- **Reusable workflows for org-wide standards** — extract common CI patterns into a shared repo
