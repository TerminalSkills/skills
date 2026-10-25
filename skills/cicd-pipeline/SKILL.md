---
name: cicd-pipeline
description: >-
  Generate and optimize CI/CD pipelines for GitLab CI and CircleCI. Use when a
  user asks to set up GitLab CI, create a CircleCI pipeline, build a CI pipeline
  for GitLab, automate deployments with CircleCI, add test automation to GitLab,
  or configure continuous integration on non-GitHub platforms. For GitHub Actions
  pipelines, use the github-actions skill instead.
license: Apache-2.0
compatibility: "Any project with Git version control"
metadata:
  author: terminal-skills
  version: "1.2.0"
  category: devops
  tags: "cicd, gitlab-ci, circleci, pipeline, deployment"
---

# CI/CD Pipeline (GitLab CI & CircleCI)

## Overview

Generate production-ready CI/CD pipeline configurations for automated testing, building, and deploying applications on GitLab CI and CircleCI. This skill creates well-structured workflows with proper caching, matrix testing, environment separation, and deployment strategies. For GitHub Actions pipelines, use the `github-actions` skill.

## Instructions

When a user asks to create or improve a CI/CD pipeline, follow these steps:

### Step 1: Analyze the project

Detect the project type and requirements:

```bash
# Determine language and framework
ls package.json pyproject.toml Gemfile go.mod Cargo.toml pom.xml build.gradle 2>/dev/null

# Check for existing CI config
ls .gitlab-ci.yml .circleci/config.yml 2>/dev/null

# Detect test commands
cat package.json | grep -A5 '"scripts"' 2>/dev/null
cat Makefile 2>/dev/null | grep -E "^test|^lint|^build"
```

Identify:
- **Language/runtime**: Node.js, Python, Go, Rust, Java
- **Package manager**: npm, pnpm, yarn, pip, poetry
- **Test framework**: Jest, Pytest, Go test, etc.
- **Build output**: Docker image, static site, binary, package
- **Deploy target**: AWS, Docker registry, npm registry, SSH server

### Step 2: Choose the CI/CD platform

Default to **GitLab CI** if the repo is on GitLab. Use **CircleCI** if specified or if the project already has a `.circleci/` directory.

### Step 3: Generate the pipeline configuration

**GitLab CI: Node.js example:**

```yaml
# .gitlab-ci.yml
stages:
  - lint
  - test
  - build
  - deploy

variables:
  NODE_VERSION: "22"
  npm_config_cache: "$CI_PROJECT_DIR/.npm"

.node-job:
  image: node:${NODE_VERSION}
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
  before_script:
    - npm ci

lint:
  extends: .node-job
  stage: lint
  script:
    - npm run lint

test:
  extends: .node-job
  stage: test
  script:
    - npm test -- --coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'
  artifacts:
    when: always
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

build:
  extends: .node-job
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

Use `rules:` for conditions. `only`/`except` are deprecated GitLab keywords. Without a `workflow:rules` block, a push with an open merge request can start two pipelines (branch and MR); add `workflow:` rules if you see duplicates. The Cobertura file is produced by Jest's `coverageReporters: ['text', 'cobertura']`.

**GitLab CI: Docker build and deploy:**

```yaml
build-image:
  stage: build
  image: docker:29-cli
  services:
    - docker:29-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"
    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA" .
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

deploy:
  stage: deploy
  image: alpine:3.22
  before_script:
    - apk add --no-cache openssh-client
    - eval "$(ssh-agent -s)"
    - echo "$SSH_PRIVATE_KEY" | ssh-add -
    - mkdir -p ~/.ssh && echo "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
  script:
    - ssh "$DEPLOY_USER@$DEPLOY_HOST" "docker pull $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA && IMAGE_TAG=$CI_COMMIT_SHA docker compose up -d"
  environment: production
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
```

`SSH_KNOWN_HOSTS` holds the output of `ssh-keyscan` taken once and checked by a human; do not disable host key checking with `StrictHostKeyChecking=no`. The server must have logged in to the registry too, or use a deploy token.

**CircleCI: Node.js example:**

```yaml
# .circleci/config.yml
version: 2.1

orbs:
  node: circleci/node@7

jobs:
  lint-and-test:
    docker:
      - image: cimg/node:22.23
    steps:
      - checkout
      - node/install-packages
      - run: npm run lint
      - run: npm test -- --coverage --reporters=default --reporters=jest-junit
        environment:
          JEST_JUNIT_OUTPUT_DIR: test-results
      - store_test_results:
          path: test-results
      - store_artifacts:
          path: coverage

  build:
    docker:
      - image: cimg/node:22.23
    steps:
      - checkout
      - node/install-packages
      - run: npm run build
      - persist_to_workspace:
          root: .
          paths: [dist]

  deploy:
    docker:
      - image: cimg/node:22.23
    steps:
      - checkout
      - attach_workspace:
          at: .
      - run: npx vercel deploy --prod --prebuilt --token "$VERCEL_TOKEN"

workflows:
  build-and-deploy:
    jobs:
      - lint-and-test
      - build:
          requires: [lint-and-test]
      - deploy:
          requires: [build]
          filters:
            branches:
              only: main
```

`jest-junit` must be a dev dependency for the test report step. `cimg/node` tags are `major.minor` (for example `22.23`); the `circleci/node` orb's `install-packages` caches dependencies by lockfile automatically. Node 20 reached end of life in April 2026, so new pipelines should start on 22 or 24.

**CircleCI monorepo path filtering** needs dynamic configuration: set `setup: true` in `.circleci/config.yml`, use the `circleci/path-filtering@3` orb to map changed paths to pipeline parameters (`mapping: "packages/api/.* run-api true"`), and put the per-package workflows in `.circleci/continue_config.yml` with `when: << pipeline.parameters.run-api >>`. Dynamic config must be enabled in the project settings.

## Examples

### Example 1: GitLab CI for a Django API with Docker deployment

**User request:** "Create a GitLab CI pipeline for my Django app with Docker deployment"

**Actions taken:**
1. Detected: Django 5.2, Poetry, Pytest, PostgreSQL dependency
2. Created `.gitlab-ci.yml` with lint, test (with Postgres service), build, deploy stages
3. Added Postgres service container for integration tests
4. Configured Docker image build and push to GitLab Container Registry

**Result:**
```
Created: .gitlab-ci.yml
Stages: lint -> test -> build -> deploy
- lint: ruff + mypy type checking
- test: pytest with PostgreSQL 16 service container
- build: Docker image build, pushed to $CI_REGISTRY_IMAGE
- deploy: SSH deploy to production (manual trigger)
Required variables: DEPLOY_HOST, DEPLOY_USER, SSH_PRIVATE_KEY
```

### Example 2: CircleCI for a Node.js monorepo

**User request:** "Set up CircleCI for my monorepo with separate test jobs per package"

**Actions taken:**
1. Detected: pnpm workspace with 3 packages (api, web, shared)
2. Created `.circleci/config.yml` with parallel test jobs per package
3. Used path filtering to only run jobs for changed packages
4. Added build and deploy workflow for the web package

**Result:**
```
Created: .circleci/config.yml
Jobs: test-api, test-web, test-shared, build-web, deploy-web
- Uses path filtering: only tests changed packages
- Shared dependency caching across jobs
- Deploy to Vercel on main branch only
Required env vars: VERCEL_TOKEN
Estimated run time: ~4 minutes (parallel jobs)
```

## Guidelines

- Enable dependency caching to speed up runs. GitLab uses `cache:` blocks; CircleCI uses orbs or `save_cache`/`restore_cache`.
- Use service containers for database tests (Postgres, Redis, etc.) rather than installing them in the job.
- Separate CI (runs on every push/MR) from CD (runs only on main/tags).
- Store secrets in CI/CD variables, never in pipeline files. In GitLab, mark them Masked and Protected; protected variables are only exposed to protected branches and tags.
- Pin image tags to a major version (`node:22`, `docker:29-cli`), not `latest`.
- Use `rules:` in GitLab CI (not the deprecated `only`/`except`) or `filters` in CircleCI to control when jobs run.
- For monorepos, use path-based triggers to only run relevant pipelines.
- GitLab CI supports `extends`, `include` and YAML anchors for DRY configs — use them for shared job configurations.
- CircleCI orbs encapsulate common patterns (Node, Python, Docker) — prefer orbs over manual setup.
- Add `when: manual` in GitLab CI or approval jobs in CircleCI for production deploys to prevent accidental releases.
