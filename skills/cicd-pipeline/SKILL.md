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
  version: "1.1.0"
  category: devops
  tags: ["cicd", "gitlab-ci", "circleci", "pipeline", "deployment"]
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

**GitLab CI — Node.js example:**

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

**GitLab CI — Docker build and deploy:**

```yaml
build-image:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only:
    - main

deploy:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | ssh-add -
  script:
    - ssh -o StrictHostKeyChecking=no $DEPLOY_USER@$DEPLOY_HOST "docker pull $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA && docker-compose up -d"
  when: manual
  only:
    - main
```

**CircleCI — Node.js example:**

```yaml
# .circleci/config.yml
version: 2.1

orbs:
  node: circleci/node@5

jobs:
  lint-and-test:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - node/install-packages
      - run: npm run lint
      - run: npm test -- --coverage
      - store_test_results:
          path: test-results
      - store_artifacts:
          path: coverage

  build:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - node/install-packages
      - run: npm run build
      - persist_to_workspace:
          root: .
          paths: [dist]

  deploy:
    docker:
      - image: cimg/node:20.11
    steps:
      - attach_workspace:
          at: .
      - run: npx vercel deploy --prod --token $VERCEL_TOKEN

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

## Examples

### Example 1: GitLab CI for a Django API with Docker deployment

**User request:** "Create a GitLab CI pipeline for my Django app with Docker deployment"

**Actions taken:**
1. Detected: Django 4.2, Poetry, Pytest, PostgreSQL dependency
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
- Store secrets in CI/CD variables, never in pipeline files.
- Use `only`/`rules` in GitLab CI or `filters` in CircleCI to control when jobs run.
- For monorepos, use path-based triggers to only run relevant pipelines.
- GitLab CI supports `extends` and YAML anchors for DRY configs — use them for shared job configurations.
- CircleCI orbs encapsulate common patterns (Node, Python, Docker) — prefer orbs over manual setup.
- Add `when: manual` in GitLab CI or approval jobs in CircleCI for production deploys to prevent accidental releases.
