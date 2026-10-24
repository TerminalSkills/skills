---
title: "Set Up a Production-Ready CI/CD Pipeline with AI"
slug: set-up-cicd-pipeline
description: "Build a complete CI/CD pipeline with automated testing, Docker optimization, and security scanning gates for production deployments."
skills: [github-actions, docker-helper, test-generator, security-audit]
category: devops
tags: [cicd, docker, testing, security, deployment]
---

# Set Up a Production-Ready CI/CD Pipeline with AI

## The Problem

Eight developers deploy by SSH-ing into production, running `git pull`, and restarting PM2. No automated tests. No staging environment. No rollback plan. The Docker image is over a gigabyte and takes minutes to build. Last Friday, a broken migration took the API down for 45 minutes before anyone noticed -- on a Friday afternoon, when half the team had already signed off.

Setting up CI/CD properly means coordinating tests, container optimization, security scanning, and deployment. Each one takes a day to configure, and they all need to work together. Nobody wants to spend a week on infrastructure plumbing, so the `git pull` workflow persists.

## The Solution

Four skills build a pipeline you can adopt in an afternoon. **test-generator** writes integration tests so the pipeline gates on something meaningful. **docker-helper** produces a multi-stage, non-root Dockerfile. **github-actions** assembles the workflow with staging and production stages. **security-audit** supplies the vulnerability and secret checks that become required gates. (On GitLab or CircleCI the same stages apply; the `cicd-pipeline` skill covers those syntaxes.)

## Step-by-Step Walkthrough

### Step 1: Generate tests worth gating on

A pipeline without tests is automated deployment of broken code. Ask for integration tests of the paths that hurt most:

```text
Generate integration tests for the core API: user management, billing, and webhook processing. Use the project's existing test runner.
```

Run them locally and read the coverage report before trusting them (`npx vitest run --coverage` or your runner's equivalent). Wire the same command to `npm test`, since the workflow calls that.

### Step 2: Replace the Dockerfile with a multi-stage build

```text
Optimize our Dockerfile: multi-stage, non-root, cached dependency layer, .dockerignore.
```

Expect this shape (Node 20 reached end of life in April 2026, so use an LTS such as 24):

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

Add a `.dockerignore` with `node_modules`, `.git`, `.env` and `tests`. Measure the result yourself with `docker images` and `docker build` timings before and after; the gain depends on what the old image contained. For reproducible builds pin the base image to a version tag, and to a digest once you have a process to update it.

### Step 3: Assemble the workflow

```text
Create a GitHub Actions workflow: lint, test with Postgres, build the image and push to GHCR, deploy to staging on merge to main, to production on a v*.*.* tag with manual approval.
```

```yaml
# .github/workflows/ci.yml
name: ci
on:
  pull_request:
  push:
    branches: [main]
    tags: ["v*.*.*"]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_PASSWORD: ci-only-password
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgres://postgres:ci-only-password@127.0.0.1:5432/postgres
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Dependency audit
        run: npm audit --omit=dev --audit-level=high
      - name: Secrets and vulnerable lockfile entries
        uses: aquasecurity/trivy-action@v0.36.0
        with:
          scan-type: fs
          scan-ref: .
          scanners: vuln,secret
          severity: CRITICAL,HIGH
          exit-code: "1"
          ignore-unfixed: true

  sast:
    runs-on: ubuntu-latest
    container:
      image: semgrep/semgrep
    steps:
      - uses: actions/checkout@v7
      - run: semgrep scan --config p/nodejs --config p/secrets --error

  build:
    needs: [test, security, sast]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        if: github.event_name != 'pull_request'
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v6
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=sha,format=long
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          load: ${{ github.event_name == 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: Scan the built image
        uses: aquasecurity/trivy-action@v0.36.0
        with:
          image-ref: ${{ fromJSON(steps.meta.outputs.json).tags[0] }}   # the sha- tag, lowercased by metadata-action
          severity: CRITICAL
          exit-code: "1"
          ignore-unfixed: true
        if: github.event_name != 'pull_request'

  deploy-staging:
    if: github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v7
      - run: ./scripts/deploy.sh staging "sha-${{ github.sha }}"
        env:
          DEPLOY_HOST: ${{ vars.DEPLOY_HOST }}
          DEPLOY_USER: ${{ vars.DEPLOY_USER }}
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          SSH_KNOWN_HOSTS: ${{ vars.SSH_KNOWN_HOSTS }}

  deploy-production:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: build
    runs-on: ubuntu-latest
    environment: production   # add required reviewers in Settings > Environments
    steps:
      - uses: actions/checkout@v7
      - run: ./scripts/deploy.sh production "${GITHUB_REF_NAME#v}"
        env:
          DEPLOY_HOST: ${{ vars.DEPLOY_HOST }}
          DEPLOY_USER: ${{ vars.DEPLOY_USER }}
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          SSH_KNOWN_HOSTS: ${{ vars.SSH_KNOWN_HOSTS }}
```

Define `DEPLOY_HOST`, `DEPLOY_USER` and `SSH_KNOWN_HOSTS` (the output of `ssh-keyscan`, checked by a person once) per environment, and `SSH_PRIVATE_KEY` as an environment secret. Environment-scoped values let staging and production use different servers. Tags created by `type=semver` need a pushed `v1.2.3` tag, which is what the production job expects.

### Step 4: Write the deploy script with a health check and rollback

```bash
#!/usr/bin/env bash
# scripts/deploy.sh <environment> <image-tag>
set -euo pipefail
env_name="$1"; tag="$2"
eval "$(ssh-agent -s)" >/dev/null
echo "$SSH_PRIVATE_KEY" | ssh-add -
mkdir -p ~/.ssh && echo "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
ssh "$DEPLOY_USER@$DEPLOY_HOST" bash -s -- "$env_name" "$tag" <<'REMOTE'
set -euo pipefail
cd "/srv/app-$1"
previous="$(cat .current-tag 2>/dev/null || true)"
IMAGE_TAG="$2" docker compose pull
IMAGE_TAG="$2" docker compose up -d
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null; then echo "$2" > .current-tag; exit 0; fi
  sleep 5
done
echo "health check failed, rolling back to ${previous:-none}" >&2
[ -n "$previous" ] && IMAGE_TAG="$previous" docker compose up -d
exit 1
REMOTE
```

The server's `compose.yaml` reads `image: ghcr.io/your-org/your-app:${IMAGE_TAG}` and needs `docker login ghcr.io` with a read-only token. This is a rolling restart with automatic rollback, not blue-green; if you need zero downtime, put a second instance behind a load balancer first.

### Step 5: Make the gates required and run the pipeline once

In the repository settings, add a branch protection rule (or ruleset) for `main` that requires the `test`, `security`, `sast` and `build` checks. Open a pull request, confirm each job runs, then merge and watch staging. Deliberately commit a known-vulnerable dependency on a throwaway branch once to prove that the audit gate actually fails.

## Real-World Example

An eight-developer team (invented) used to deploy by SSH and `git pull`. After adopting the pipeline, the first pull request fails the audit job on an outdated HTTP client with a high-severity advisory; the fix is a version bump. The same week the billing tests catch a retry bug before merge. A broken migration can still ship, but now it first hits staging, and a failed health check on production puts the previous image back instead of leaving the API down. Friday deploys become a matter of pushing a tag and approving the production environment.

## Related Skills

- **github-actions**: workflow structure, caching, environments and secrets.
- **docker-helper**: multi-stage Dockerfile and compose configuration.
- **test-generator**: integration tests that give the gates meaning.
- **security-audit**: dependency audit, secret detection and static analysis.
