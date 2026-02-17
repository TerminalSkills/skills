---
title: "Optimize Docker Image Sizes for Production with AI"
slug: optimize-docker-image-sizes
description: "Analyze and shrink bloated Docker images using multi-stage builds, minimal base images, and layer optimization."
skills: [docker-optimizer, docker-helper, security-audit]
category: devops
tags: [docker, optimization, containers, production, devops]
---

# Optimize Docker Image Sizes for Production with AI

## The Problem

Your Docker image started at 200MB and somehow grew to 1.8GB. Deployments take 4 minutes because pulling the image over the network is painfully slow. Your cloud registry bill keeps climbing. Kubernetes nodes run out of disk space because every microservice brings a gigabyte of unnecessary build tools, test fixtures, and cached package managers. You know multi-stage builds exist, but refactoring 15 Dockerfiles across your services feels like a weekend project nobody volunteers for.

## The Solution

Use the **docker-optimizer** skill to analyze existing Dockerfiles and produce optimized versions, the **docker-helper** skill for container management and build commands, and the **security-audit** skill to verify the slimmed images do not introduce vulnerabilities.

```bash
npx terminal-skills install docker-optimizer docker-helper security-audit
```

## Step-by-Step Walkthrough

### 1. Audit your current Docker images

Start by understanding where the bloat lives:

```
Analyze all Dockerfiles in my monorepo. For each service (services/api, services/worker, services/web-app), show the current image size, base image, number of layers, and identify the biggest optimization opportunities. Also check if any service is missing a .dockerignore file.
```

The agent inspects each Dockerfile and reports:

```
Docker Image Audit:
┌─────────────────┬──────────────┬─────────────┬────────┬────────────────────────────┐
│ Service         │ Base Image   │ Image Size  │ Layers │ Top Issue                  │
├─────────────────┼──────────────┼─────────────┼────────┼────────────────────────────┤
│ services/api    │ node:18      │ 1.4 GB      │ 22     │ No multi-stage, full node  │
│ services/worker │ python:3.11  │ 1.8 GB      │ 18     │ Build tools in final image │
│ services/web-app│ node:18      │ 980 MB      │ 15     │ Dev dependencies included  │
└─────────────────┴──────────────┴─────────────┴────────┴────────────────────────────┘

Missing .dockerignore: services/api, services/worker
Estimated total savings with optimization: 3.2 GB → 520 MB (84% reduction)
```

### 2. Optimize the largest image first

Take the worst offender and get a fully optimized Dockerfile:

```
Optimize the Dockerfile for services/worker. It's a Python 3.11 service that uses pandas, scikit-learn, and celery. The current image includes gcc, build-essential, and the entire pip cache. I need it to run as non-root with a health check. Generate the optimized Dockerfile and a .dockerignore file.
```

The agent produces a multi-stage Dockerfile that compiles C extensions in a build stage and copies only the installed packages to a slim runtime stage, plus a comprehensive .dockerignore:

```
Optimization applied:
  Before: python:3.11 (1.8 GB) — 18 layers, running as root
  After:  python:3.11-slim (340 MB) — 9 layers, non-root user, health check
  Savings: 1.46 GB (81% reduction)

Key changes:
  ✓ Multi-stage build separates compilation from runtime
  ✓ Build tools (gcc, build-essential) only in build stage
  ✓ pip --no-cache-dir eliminates 180MB of cached wheels
  ✓ .dockerignore excludes tests/, docs/, .git/, __pycache__/
  ✓ Non-root user 'appuser' with minimal permissions
  ✓ HEALTHCHECK pings the Celery worker status endpoint
```

### 3. Batch-optimize remaining services

Apply the same treatment to all services at once:

```
Now optimize the Dockerfiles for services/api and services/web-app using the same approach. The API is a Node.js Express app with TypeScript. The web-app is a Next.js frontend. For the web-app, use standalone output mode and only include the necessary files in the final image. Generate all optimized Dockerfiles and .dockerignore files.
```

The agent generates optimized Dockerfiles for both services. The Next.js one uses the standalone output trace to include only referenced files:

```
services/api:     node:18 (1.4 GB) → node:18-alpine (165 MB)  — 88% reduction
services/web-app: node:18 (980 MB) → node:18-alpine (120 MB)  — 88% reduction

Next.js standalone optimization copies only:
  .next/standalone/ — the self-contained server
  .next/static/     — pre-built static assets
  public/           — static files
  Total: ~120 MB instead of full node_modules + source
```

### 4. Verify the optimized images work correctly

Before deploying, make sure nothing broke:

```
Write a verification script that builds all 3 optimized images, runs them, checks that health endpoints respond, verifies they run as non-root, confirms no build tools are present in the final images, and compares sizes against the old images. Use docker compose for orchestration.
```

The agent creates a verification script:

```bash
$ ./scripts/verify-docker-optimization.sh

Building optimized images...
  ✓ services/api built in 45s (165 MB)
  ✓ services/worker built in 62s (340 MB)
  ✓ services/web-app built in 38s (120 MB)

Health checks:
  ✓ api: GET /health → 200 OK (12ms)
  ✓ worker: celery inspect ping → OK
  ✓ web-app: GET / → 200 OK (8ms)

Security checks:
  ✓ api: running as uid=1001 (appuser)
  ✓ worker: running as uid=1001 (appuser)
  ✓ web-app: running as uid=1001 (nextuser)
  ✓ No gcc/g++ found in any production image
  ✓ No pip/npm cache directories present

Size comparison:
  Total before: 4.18 GB
  Total after:  625 MB
  Saved: 3.56 GB (85%)
```

### 5. Set up automated image scanning

Keep images lean going forward:

```
Add a CI step that runs on every PR modifying a Dockerfile. It should build the image, check that it's under the size threshold (api: 200MB, worker: 400MB, web-app: 150MB), scan for CVEs using docker scout, and fail the build if any high/critical vulnerabilities are found or the image exceeds the size limit.
```

## Real-World Example

A platform team at a growing fintech company manages 12 microservices deployed to Kubernetes. Each deployment takes 6 minutes because images average 1.5GB and the cluster pulls them fresh on every rolling update. Registry storage costs USD 340/month and climbing.

1. They ask the agent to audit all 12 Dockerfiles — it identifies that 9 use full base images and none have multi-stage builds
2. The agent batch-generates optimized Dockerfiles with multi-stage builds, Alpine base images, and proper .dockerignore files
3. Average image size drops from 1.5GB to 190MB — a 87% reduction
4. Deployment time drops from 6 minutes to 90 seconds because image pulls are 8x faster
5. Registry costs drop to USD 45/month, and the CI pipeline adds automated size and CVE checks to prevent regression

The entire optimization takes one afternoon for 12 services, and the team adds a CI gate to prevent image bloat from returning.

## Related Skills

- [docker-helper](../skills/docker-helper/) — General Docker container management and troubleshooting
- [security-audit](../skills/security-audit/) — Scans optimized images for vulnerabilities
- [cicd-pipeline](../skills/cicd-pipeline/) — Automate image size checks and scanning in CI
