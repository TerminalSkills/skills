---
title: Build a Reusable GitHub Actions Workflow Library
slug: build-github-actions-workflow-library
description: Build an organization-wide GitHub Actions workflow library with reusable workflows, composite actions, matrix builds, and release automation — so 50+ repos share the same CI/CD without copy-paste drift.
skills:
  - github-actions
difficulty: intermediate
time_estimate: "6 hours"
category: devops
tags:
  - github-actions
  - ci-cd
  - devops
  - automation
  - reusable-workflows
---

# Build a Reusable GitHub Actions Workflow Library

Marcus is the sole platform engineer at a 40-person startup. There are 54 repos. Each has its own `.github/workflows/` folder, each slightly different. When a new security scanner needed to be added last quarter, he spent three days copy-pasting the same YAML into 54 repos and fixing the inevitable drift. He wants a central workflow library — one place to update, everywhere it takes effect.

## Step 1 — Create the Workflow Library Repository

The library lives in a dedicated repo (`org/workflows`). Any repo in the organization can call into it.

```yaml
# .github/workflows/node-ci.yml — Reusable workflow for Node.js CI.
# Called with: uses: myorg/workflows/.github/workflows/node-ci.yml@main
# The `workflow_call` trigger makes this a reusable workflow.

name: Node.js CI

on:
  workflow_call:
    inputs:
      node-version:
        description: "Node.js version to use"
        type: string
        default: "20"
      working-directory:
        description: "Directory containing package.json"
        type: string
        default: "."
      run-e2e:
        description: "Run end-to-end tests"
        type: boolean
        default: false
    secrets:
      NPM_TOKEN:
        description: "npm registry token for private packages"
        required: false
      CODECOV_TOKEN:
        description: "Codecov upload token"
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ${{ inputs.working-directory }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: "npm"
          cache-dependency-path: "${{ inputs.working-directory }}/package-lock.json"
          registry-url: "https://registry.npmjs.org"

      - name: Install dependencies
        run: npm ci
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Lint
        run: npm run lint --if-present

      - name: Type check
        run: npm run typecheck --if-present

      - name: Unit tests
        run: npm test -- --coverage

      - name: Upload coverage
        if: secrets.CODECOV_TOKEN != ''
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

      - name: E2E tests
        if: inputs.run-e2e
        run: npm run test:e2e
```

## Step 2 — Matrix Builds for Multi-Platform Testing

```yaml
# .github/workflows/matrix-test.yml — Test across multiple Node versions and OS.
# Consumer repos pass a matrix config and the library handles the rest.

name: Matrix CI

on:
  workflow_call:
    inputs:
      node-versions:
        description: "JSON array of Node.js versions"
        type: string
        default: '["18", "20", "22"]'
      os-matrix:
        description: "JSON array of OS to test on"
        type: string
        default: '["ubuntu-latest"]'
      package-manager:
        description: "npm or pnpm"
        type: string
        default: "npm"

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        node: ${{ fromJson(inputs.node-versions) }}
        os: ${{ fromJson(inputs.os-matrix) }}

    runs-on: ${{ matrix.os }}
    name: "Node ${{ matrix.node }} on ${{ matrix.os }}"

    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        if: inputs.package-manager == 'pnpm'
        uses: pnpm/action-setup@v4
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: ${{ inputs.package-manager }}

      - name: Install
        run: ${{ inputs.package-manager }} ci

      - name: Test
        run: ${{ inputs.package-manager }} test
```

## Step 3 — Composite Actions for Shared Steps

Composite actions are reusable _steps_, not jobs. Use them for setup sequences that appear in multiple workflows.

```yaml
# actions/setup-node-project/action.yml — Composite action for Node project setup.
# Usage: uses: myorg/workflows/actions/setup-node-project@main

name: "Setup Node Project"
description: "Checkout, setup Node.js, install dependencies, restore build cache"

inputs:
  node-version:
    description: "Node.js version"
    default: "20"
  npm-token:
    description: "npm token for private packages"
    required: false

outputs:
  cache-hit:
    description: "Whether the build cache was restored"
    value: ${{ steps.build-cache.outputs.cache-hit }}

runs:
  using: "composite"
  steps:
    - name: Checkout
      uses: actions/checkout@v4
      with:
        fetch-depth: 0         # Full history for semantic-release

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
        cache: "npm"
        registry-url: "https://registry.npmjs.org"

    - name: Install dependencies
      shell: bash
      run: npm ci
      env:
        NODE_AUTH_TOKEN: ${{ inputs.npm-token }}

    - name: Restore build cache
      id: build-cache
      uses: actions/cache@v4
      with:
        path: |
          .next/cache
          dist
          build
        key: ${{ runner.os }}-build-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**.[jt]s', '**.[jt]sx') }}
        restore-keys: |
          ${{ runner.os }}-build-${{ hashFiles('**/package-lock.json') }}-
          ${{ runner.os }}-build-
```

## Step 4 — Release Automation with Semantic Versioning

```yaml
# .github/workflows/release.yml — Reusable release workflow.
# Uses semantic-release to bump version, generate changelog, publish to npm/Docker.

name: Release

on:
  workflow_call:
    inputs:
      publish-npm:
        type: boolean
        default: false
      publish-docker:
        type: boolean
        default: false
      docker-registry:
        type: string
        default: "ghcr.io"
    secrets:
      NPM_TOKEN:
        required: false
      DOCKER_PASSWORD:
        required: false

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write          # Create releases and tags
      packages: write          # Push to GHCR
      issues: write            # Comment on issues/PRs
      pull-requests: write

    steps:
      - uses: myorg/workflows/actions/setup-node-project@main
        with:
          npm-token: ${{ secrets.NPM_TOKEN }}

      - name: Build
        run: npm run build

      - name: Semantic Release
        id: release
        env:
          GITHUB_TOKEN: ${{ github.token }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npx semantic-release

      - name: Build and push Docker image
        if: inputs.publish-docker && steps.release.outputs.new-release-published == 'true'
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ${{ inputs.docker-registry }}/${{ github.repository }}:latest
            ${{ inputs.docker-registry }}/${{ github.repository }}:${{ steps.release.outputs.new-release-version }}
```

## Step 5 — Using the Library from Consumer Repos

```yaml
# Consumer repo: .github/workflows/ci.yml
# One file. No copy-paste. Updates flow from the library automatically.

name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    uses: myorg/workflows/.github/workflows/node-ci.yml@main
    with:
      node-version: "20"
      run-e2e: ${{ github.ref == 'refs/heads/main' }}
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
      CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}

  release:
    needs: ci
    if: github.ref == 'refs/heads/main'
    uses: myorg/workflows/.github/workflows/release.yml@main
    with:
      publish-npm: true
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

```yaml
# Organization-level secrets: set once, available to all repos.
# In GitHub: Organization Settings → Secrets and Variables → Actions

# Required secrets (set at org level):
# - NPM_TOKEN          → npm publish token
# - CODECOV_TOKEN      → test coverage reporting
# - DOCKER_PASSWORD    → container registry

# Required variables (set at org level):
# - DEFAULT_NODE_VERSION → "20"
# - DOCKER_REGISTRY      → "ghcr.io"
```

## Results

Marcus migrated all 54 repos over two weeks. When the security team asked to add SAST scanning last month:

- **Update time: 20 minutes** — added the scanning step to `node-ci.yml` in the library, opened a PR, merged. All 54 repos picked it up on their next run. Previously this took three days.
- **Workflow drift eliminated** — every repo runs identical CI. No more "but it passes locally" caused by one repo being on an old Node version.
- **Release automation saves 30 min/release** — semantic-release reads conventional commits, bumps the version, writes the changelog, tags the release, and publishes to npm. Developers just write commits correctly.
- **Matrix builds caught 3 bugs** — two Node 18 compatibility issues and one Windows path separator bug were caught before they hit production.
- **Onboarding new repos: 5 minutes** — add a single 20-line `ci.yml` that calls the library. The new repo immediately gets lint, typecheck, tests, coverage, and release automation.
