---
name: github-actions
description: >-
  GitHub Actions runs CI/CD pipelines defined as YAML workflows inside a
  GitHub repository. Use when someone asks to "set up CI", "add a GitHub
  Actions workflow", "run tests on every pull request", "cache dependencies",
  "build a matrix", "deploy from Actions", "push a Docker image to ghcr.io" or
  "reuse a workflow", or needs triggers, secrets, environments, artifacts and
  permissions explained.
license: Apache-2.0
compatibility: "A GitHub repository with Actions enabled; workflows run on GitHub-hosted or self-hosted runners"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags:
    - github-actions
    - cicd
    - automation
    - testing
    - deployment
  repository: https://github.com/actions
---

# GitHub Actions

## Overview

A workflow is a YAML file in `.github/workflows/`. It reacts to events (push, pull request, schedule, manual), runs one or more jobs on fresh runners, and each job runs steps: shell commands or reusable actions. This skill uses the action majors current in October 2026, all running on Node 24: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/cache@v6`, `actions/upload-artifact@v7`, `actions/download-artifact@v8`, `docker/login-action@v4`, `docker/setup-buildx-action@v4`, `docker/build-push-action@v7`, `actions/github-script@v9`. Check a new action's latest major on its Releases page before copying a version from an old blog post.

## Instructions

### 1. Minimal CI workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read            # least privilege; add scopes per job when needed

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm              # caches ~/.npm keyed on package-lock.json
      - run: npm ci
      - run: npm test
```

Without a `permissions` block the `GITHUB_TOKEN` gets the repository default, which can be read-write. Declare it explicitly. Set `timeout-minutes` because a hung job otherwise runs for 6 hours.

### 2. Triggers

```yaml
on:
  push:
    branches: [main, develop]
    paths: ['src/**', 'package.json']   # only when these files change
    tags: ['v*']
  pull_request:
    types: [opened, synchronize, reopened]
  schedule:
    - cron: '0 8 * * 1'                 # Mondays 08:00 UTC; runs only on the default branch
  workflow_dispatch:                    # manual run from the UI, gh CLI or API
    inputs:
      environment:
        description: Deploy target
        required: true
        type: choice
        options: [staging, production]
  workflow_call:                        # makes this file a reusable workflow
```

`branches` and `paths` together mean both must match. Add `workflow_dispatch` to any workflow you may need to start by hand. Run it with `gh workflow run ci.yml -f environment=staging`.

### 3. Caching and artifacts

`setup-node`, `setup-python`, `setup-go` and `setup-java` cache their package manager with a `cache:` input. For anything else use `actions/cache`:

```yaml
- uses: actions/cache@v6
  with:
    path: .next/cache
    key: next-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
    restore-keys: next-${{ runner.os }}-
```

Cache entries are shared by branch scope (a PR can read the base branch's cache but not siblings') and are evicted after 7 days without access or when the repository exceeds its size limit. Use `actions/cache/restore` and `actions/cache/save` to split the two halves.

Artifacts move files between jobs or keep them after the run:

```yaml
- uses: actions/upload-artifact@v7
  with:
    name: build-${{ github.sha }}
    path: dist/
    retention-days: 7
# in a later job with needs: build
- uses: actions/download-artifact@v8
  with:
    name: build-${{ github.sha }}
    path: dist/
```

Since artifact v4 an artifact name is unique per run: uploading the same `name` twice fails, so put the matrix key in the name (`name: test-results-${{ matrix.os }}`).

### 4. Matrix, outputs and job order

```yaml
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        node-version: [22, 24]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: "${{ matrix.node-version }}", cache: npm }
      - run: npm ci
      - run: npm test

  build:
    needs: test                 # runs only after every matrix leg passes
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.ver.outputs.version }}
    steps:
      - uses: actions/checkout@v7
      - id: ver
        run: echo "version=$(jq -r .version package.json)" >> "$GITHUB_OUTPUT"
```

Jobs run in parallel unless `needs` links them. Read another job's output as `${{ needs.build.outputs.version }}`. Steps write outputs to the `$GITHUB_OUTPUT` file; the old `::set-output` command is removed.

### 5. Secrets, variables, environments

```yaml
  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production        # required reviewers and environment secrets apply here
    steps:
      - run: ./deploy.sh
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
          API_URL: ${{ vars.API_URL }}
```

Create them under Settings, Secrets and variables, Actions, or with `gh secret set DEPLOY_TOKEN`. Pass secrets through `env:` and never splice `${{ }}` of untrusted values (PR titles, branch names, issue bodies) into a `run:` script: that is script injection. Put the value in `env:` and use `"$TITLE"` in the shell. Secrets are not passed to workflows triggered by pull requests from forks.

For cloud deploys prefer OpenID Connect over stored keys: give the job `permissions: { id-token: write, contents: read }` and use the provider's login action (`aws-actions/configure-aws-credentials`, `google-github-actions/auth`, `azure/login`).

### 6. Docker image to GitHub Container Registry

```yaml
  docker:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4     # needed for the gha cache backend
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### 7. Service containers

```yaml
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: ci
          POSTGRES_PASSWORD: ci-password
          POSTGRES_DB: shop_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U ci" --health-interval 10s
          --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://ci:ci-password@localhost:5432/shop_test
    steps:
      - uses: actions/checkout@v7
      - run: npm ci && npm run test:integration
```

The step runs on the runner, so the service is reached on `localhost` through the mapped port. Inside a job that itself has `container:`, use the service name as host.

### 8. Reusable workflows

```yaml
# .github/workflows/node-ci.yml in the repository acme-corp/shared-workflows
on:
  workflow_call:
    inputs:
      node-version: { type: string, default: '24' }
    secrets:
      npm-token: { required: false }
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: "${{ inputs.node-version }}", cache: npm }
      - run: npm ci && npm test
```

```yaml
# caller, in another repository
jobs:
  ci:
    uses: acme-corp/shared-workflows/.github/workflows/node-ci.yml@main
    with:
      node-version: '22'
    secrets: inherit
```

The shared repository must allow access (Settings, Actions, General, Access) if it is private.

## Examples

### Example 1: "Run lint and tests on every PR, deploy main to production"

Create `ci.yml` from step 1 with `lint` and `test` jobs, a `build` job with `needs: [lint, test]` that uploads `dist/`, and a `deploy` job with `needs: build`, `if: github.ref == 'refs/heads/main'` and `environment: production`. Result: PRs show two required checks; a push to `main` pauses at the production environment until a reviewer approves.

### Example 2: "Comment the test summary on the pull request"

```yaml
  report:
    needs: test
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/github-script@v9
        with:
          script: |
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `Tests passed for ${context.sha.slice(0, 7)}.`,
            });
```

Without `pull-requests: write` the call returns 403 "Resource not accessible by integration". PRs from forks get a read-only token, so this step fails there.

## Guidelines

- Validate workflows locally with `actionlint` (a single Go binary, also `pip install actionlint-py`) before pushing; it catches expression typos, bad `needs` and unknown inputs.
- Pin third-party actions to a full commit SHA (`uses: owner/repo@<40-char sha> # v2.1.0`) and let Dependabot (`package-ecosystem: github-actions`) update them. First-party `actions/*` major tags are an accepted trade-off.
- Use `pull_request_target` only when you must write to the base repository on fork PRs, and never check out or run the PR's code in it.
- Billing: public repositories use standard runners for free. Private repositories get included minutes by plan (Free 2,000, Pro and Team 3,000 per month) and then pay per minute: Linux 2-core $0.006, Windows $0.010, macOS $0.062. Each job rounds up to whole minutes, so many tiny jobs cost more than one.
- Add `concurrency` to every CI and deploy workflow; for deploys use `cancel-in-progress: false` so a release is not killed halfway.
- Set `retention-days` on artifacts and avoid uploading `node_modules`; cache it instead.
- `ubuntu-latest` moves to new Ubuntu releases over time; pin `ubuntu-24.04` when a toolchain needs a fixed image.
- Do not echo secrets, and remember that masking only hides exact matches of the value.
