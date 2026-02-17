---
name: cicd-pipeline
description: >-
  Generate and optimize CI/CD pipelines for automated testing, building, and
  deployment. Use when a user asks to create a GitHub Actions workflow, set up
  GitLab CI, build a CI pipeline, automate deployments, add test automation,
  configure continuous integration, set up continuous deployment, create a
  release workflow, or optimize build times. Supports GitHub Actions, GitLab CI,
  and CircleCI.
license: Apache-2.0
compatibility: "Any project with Git version control"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["cicd", "github-actions", "gitlab-ci", "pipeline", "deployment"]
---

# CI/CD Pipeline

## Overview

Generate production-ready CI/CD pipeline configurations for automated testing, building, and deploying applications. This skill creates well-structured workflows with proper caching, matrix testing, environment separation, and deployment strategies for GitHub Actions, GitLab CI, and CircleCI.

## Instructions

When a user asks to create or improve a CI/CD pipeline, follow these steps:

### Step 1: Analyze the project

Detect the project type and requirements:

```bash
# Determine language and framework
ls package.json pyproject.toml Gemfile go.mod Cargo.toml pom.xml build.gradle 2>/dev/null

# Check for existing CI config
ls .github/workflows/*.yml .gitlab-ci.yml .circleci/config.yml 2>/dev/null

# Detect test commands
cat package.json | grep -A5 '"scripts"' 2>/dev/null
cat Makefile 2>/dev/null | grep -E "^test|^lint|^build"
```

Identify:
- **Language/runtime**: Node.js, Python, Go, Rust, Java
- **Package manager**: npm, pnpm, yarn, pip, poetry
- **Test framework**: Jest, Pytest, Go test, etc.
- **Build output**: Docker image, static site, binary, package
- **Deploy target**: Vercel, AWS, Docker registry, npm registry

### Step 2: Choose the CI/CD platform

Default to **GitHub Actions** unless the user specifies otherwise or the repo is on GitLab.

### Step 3: Generate the pipeline configuration

Create the workflow file with these standard stages:

**GitHub Actions — Node.js example:**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        if: matrix.node-version == 20
        with:
          name: coverage
          path: coverage/

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/
```

**GitHub Actions — Python example:**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
          cache: 'pip'
      - run: pip install -e '.[dev]'
      - run: pytest --cov=src --cov-report=xml
      - uses: codecov/codecov-action@v4
        if: matrix.python-version == '3.12'
        with:
          file: coverage.xml
```

**GitLab CI example:**

```yaml
# .gitlab-ci.yml
stages:
  - lint
  - test
  - build
  - deploy

variables:
  NODE_VERSION: "20"

.node-cache:
  cache:
    key: ${CI_COMMIT_REF_SLUG}
    paths:
      - node_modules/

lint:
  stage: lint
  extends: .node-cache
  image: node:${NODE_VERSION}
  script:
    - npm ci
    - npm run lint

test:
  stage: test
  extends: .node-cache
  image: node:${NODE_VERSION}
  script:
    - npm ci
    - npm test -- --coverage
  coverage: '/All files.*\|.*\s+([\d\.]+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

build:
  stage: build
  extends: .node-cache
  image: node:${NODE_VERSION}
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
  only:
    - main
```

### Step 4: Add deployment stage if requested

**Deploy to Vercel:**
```yaml
deploy:
  needs: [build]
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'
  steps:
    - uses: actions/checkout@v4
    - uses: amondnet/vercel-action@v25
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
        vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
        vercel-args: '--prod'
```

**Deploy Docker image:**
```yaml
deploy:
  needs: [test]
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'
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
        tags: ghcr.io/${{ github.repository }}:latest
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

### Step 5: Add release workflow if needed

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci && npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
```

## Examples

### Example 1: Full CI/CD for a Next.js app deploying to Vercel

**User request:** "Set up CI/CD for my Next.js project with tests, linting, and Vercel deploy"

**Actions taken:**
1. Detected: Next.js 14, npm, Vitest, ESLint
2. Created `.github/workflows/ci.yml` with lint, test, build jobs
3. Added Vercel deployment on main branch pushes
4. Configured concurrency to cancel outdated runs

**Result:**
```
Created: .github/workflows/ci.yml
- Lint job: ESLint + Prettier check
- Test job: Vitest with coverage upload (Node 18/20 matrix)
- Build job: next build (depends on lint + test passing)
- Deploy job: Vercel production deploy (main branch only)
Estimated run time: ~3 minutes
Required secrets: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
```

### Example 2: GitLab CI for a Python Django API with Docker

**User request:** "Create a GitLab CI pipeline for my Django app with Docker deployment"

**Actions taken:**
1. Detected: Django 4.2, Poetry, Pytest, PostgreSQL dependency
2. Created `.gitlab-ci.yml` with lint, test (with Postgres service), build, deploy stages
3. Added Postgres service container for integration tests
4. Configured Docker image build and push to GitLab Container Registry

**Result:**
```
Created: .gitlab-ci.yml
Stages: lint → test → build → deploy
- lint: ruff + mypy type checking
- test: pytest with PostgreSQL 16 service container
- build: Docker image build, pushed to $CI_REGISTRY_IMAGE
- deploy: SSH deploy to production (manual trigger)
Required variables: DEPLOY_HOST, DEPLOY_USER, SSH_PRIVATE_KEY
```

## Guidelines

- Always use `actions/checkout@v4` and the latest stable action versions.
- Enable dependency caching (`cache: 'npm'`, `cache: 'pip'`) to speed up runs.
- Use `concurrency` with `cancel-in-progress: true` to avoid wasted compute on PRs.
- Pin action versions to major tags (e.g., `@v4`) not `@main` or commit SHAs for readability.
- Use matrix strategy for testing across multiple runtime versions.
- Separate CI (runs on every PR) from CD (runs only on main/tags).
- Store secrets in repository/organization secrets, never in workflow files.
- Add `if: github.ref == 'refs/heads/main'` to deployment jobs to prevent accidental deploys from PRs.
- For monorepos, use path filters to only run relevant pipelines: `paths: ['packages/api/**']`.
- Include a status badge in README: `![CI](https://github.com/org/repo/actions/workflows/ci.yml/badge.svg)`.
