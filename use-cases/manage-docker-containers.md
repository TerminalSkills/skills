---
title: "Optimize Docker Workflows and Cut Build Times"
slug: manage-docker-containers
description: "Create efficient Dockerfiles, streamline container orchestration, and optimize CI/CD pipelines to dramatically reduce build times and costs."
skills: [docker-helper, cicd-pipeline, golang]
category: devops
tags: [docker, containers, optimization, build-time, cicd]
---

# Optimize Docker Workflows and Cut Build Times

## The Problem

Every morning at Raj's 42-person e-commerce startup, the development team waits. Docker builds take 23 minutes for the Node.js frontend, 31 minutes for the Python analytics service, and 18 minutes for the Go API gateway. The images are 2.1 GB, 1.8 GB, and 967 MB, bloated with build tools, dev dependencies and poor layer caching.

CI is a bottleneck: 47 builds a day across 6 services, and every failed build costs the full build time plus a context switch. Deployments spend minutes just pulling images. Locally, a fresh checkout takes 11 minutes to start, the dev database fails on port conflicts and race conditions between services, and six engineers keep their own "docker fixes" in local setup scripts.

(The numbers are this example team's own.)

## The Solution

With the **docker-helper** skill the agent audits the current setup, writes multi-stage Dockerfiles with a proper layer order, and fixes the Compose orchestration. With **cicd-pipeline** it builds the services in parallel in GitLab CI with a registry layer cache. For the Go gateway it also uses the **golang** skill.

## Step-by-Step Walkthrough

### Step 1: Audit the Current Docker Setup

```text
Analyze the Dockerfiles and compose file of all 6 services. Find what makes builds slow and images large. Use docker images and docker history to measure each image first.
```

The agent measures before it changes anything (`docker images`, `docker history <image>`), then reports the same pattern in every service: single-stage builds that ship dev dependencies and compilers, a `COPY . .` before the dependency install so every code change reinstalls everything, no `.dockerignore`, and EOL base images (`node:18` reached end of life in April 2025).

| Service | Size | Build | Biggest issue |
|---------|------|-------|---------------|
| Node.js frontend | 2.1 GB | 23 min | full `node` image, dev deps, `npm install` on every build |
| Python analytics | 1.8 GB | 31 min | full `python` image, compilers and pip caches in the final image |
| Go API gateway | 967 MB | 18 min | whole Go toolchain in the final image, only the binary is needed |

### Step 2: Multi-Stage Builds

```text
Write multi-stage Dockerfiles for the three services: pinned current base images, dependency files copied before source, non-root users, and a .dockerignore for each.
```

Every service gets a `.dockerignore` (`.git`, `node_modules`, `.env`, `tests/`) and a pinned, supported base image.

**Node.js frontend.** Dev dependencies are needed to build, so install everything in the builder; only the static output reaches the final image. The npm cache is a BuildKit cache mount, so it survives between builds without ending up in a layer:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
```

The unprivileged nginx image runs as a non-root user and listens on 8080, so the `nginx.conf` server block must `listen 8080`.

**Python analytics.** Install into a virtualenv in the builder and copy only the venv across. Build tools never reach the final image:

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.14-slim AS builder
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

FROM python:3.14-slim
RUN useradd -r -s /usr/sbin/nologin appuser
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /app
COPY src/ ./src/
USER appuser
CMD ["python", "-m", "src.main"]
```

Prefer the `-slim` (glibc) image over Alpine for Python: any dependency that ships no musl wheel is compiled from source on Alpine, which is a common cause of 30-minute builds. Check `pip install` output for "Building wheel" lines.

**Go API gateway.** A static binary on `scratch`:

```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY go.* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api .

FROM scratch
COPY --from=builder /out/api /api
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/api"]
```

The final image is little more than the binary itself. `scratch` contains nothing but it: no shell, no `curl`, no package manager. That has a consequence for health checks (next step). If the gateway calls HTTPS upstreams, also copy `/etc/ssl/certs/ca-certificates.crt` from the builder.

### Step 3: Fix Orchestration with Health Checks

```text
Write a compose.yaml with health checks and condition: service_healthy dependencies, bind published ports to 127.0.0.1, and keep passwords in .env.
```

Most "works on my machine" failures are startup races: the API connects to Postgres before it is ready. The scratch image has no `curl`, so the gateway's health check must be a command the binary itself provides. Here the binary has a `-healthcheck` flag that requests `/health` and exits non-zero on failure. Use the exec form of the check: the shell form (`CMD-SHELL`) fails on `scratch` because there is no `/bin/sh`.

```yaml
services:
  frontend:
    build: ./frontend
    ports: ["127.0.0.1:3000:8080"]
    depends_on:
      api: { condition: service_healthy }
    restart: unless-stopped

  api:
    build: ./api
    ports: ["127.0.0.1:8080:8080"]
    environment:
      DATABASE_URL: postgres://app:${POSTGRES_PASSWORD:?set it in .env}@db:5432/app
    healthcheck:
      test: ["CMD", "/api", "-healthcheck"]
      interval: 10s
      timeout: 5s
      retries: 3
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped

  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set it in .env}
    volumes:
      - postgres_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
```

There is no top-level `version:` key; Compose v2 ignores it and warns. Postgres 18 images keep data in a versioned subdirectory of `/var/lib/postgresql`, so the volume is mounted there (for 17 and older it is `/var/lib/postgresql/data`). Start everything with `docker compose up -d --wait`, which returns once all health checks pass; `docker compose config` validates the merged file. The database is not published to the host at all: other services reach it as `db` on the Compose network.

### Step 4: Optimize the CI/CD Pipeline

```text
Build the three services in parallel in GitLab CI, with a BuildKit layer cache stored in the project's container registry. Push images tagged with the commit SHA.
```

Following **cicd-pipeline**, the build job uses the `docker:29-cli` image with the `docker:29-dind` service. A `parallel: matrix` fans out one job per service, and `type=registry` cache means unchanged layers (the dependency install) are pulled instead of rebuilt:

```yaml
build-image:
  stage: build
  image: docker:29-cli
  services:
    - docker:29-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  parallel:
    matrix:
      - SERVICE: [frontend, api, analytics]
  before_script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"
    - docker buildx create --use --driver docker-container
  script:
    - |
      docker buildx build ./$SERVICE \
        --cache-from type=registry,ref=$CI_REGISTRY_IMAGE/$SERVICE:buildcache \
        --cache-to type=registry,ref=$CI_REGISTRY_IMAGE/$SERVICE:buildcache,mode=max \
        --tag $CI_REGISTRY_IMAGE/$SERVICE:$CI_COMMIT_SHA \
        --push
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

The registry cache needs the `docker-container` buildx driver; the default `docker` driver cannot export it. Parallel jobs cut the total wall time to that of the slowest service, and the cache avoids reinstalling dependencies when only source files changed. The same fan-out works in CircleCI with workflow jobs. In a monorepo, `rules: changes:` on per-service jobs skips services whose directory did not change.

### Step 5: Standardize the Developer Workflow

```text
Replace the six local setup scripts with one Makefile that wraps docker compose.
```

| Command | What it does |
|---------|-------------|
| `make dev-start` | `docker compose up -d --wait` |
| `make dev-build` | `docker compose build` (BuildKit reuses cached layers) |
| `make dev-test` | `docker compose run --rm <service> <test command>`, one line per service |
| `make dev-logs` | `docker compose logs -f` |
| `make dev-shell` | `docker compose exec <service> sh` (not available for the `scratch` gateway; use `docker compose logs` and the health endpoint there) |
| `make dev-reset` | `docker compose down -v && docker compose up -d --wait`; `-v` deletes the database volume |

For active development, `docker compose watch` with a `develop.watch` section syncs or rebuilds on file changes. Do not add a shell to the production gateway image just for debugging; use its logs and health endpoint.

## Real-World Example

Raj's team does the work over one week. Monday the audit shows where time goes: dev dependencies in production images, `COPY . .` ahead of the install, no cache. Tuesday the three Dockerfiles go multi-stage and the largest images drop to a fraction of their size. Wednesday the compose file gets health checks and the pipeline gets the parallel matrix with a registry cache. After the change, the numbers they track are their own: image sizes in `docker images`, the pipeline duration in GitLab, and the minutes to a healthy local stack with `docker compose up -d --wait`. New developers run `make dev-start` instead of reading six scripts.

## Related Skills

- [docker-helper](/skills/docker-helper) — Writes the multi-stage Dockerfiles, `.dockerignore` files and the `compose.yaml` with `service_healthy` dependencies, and gives the diagnostic sequence for broken containers.
- [cicd-pipeline](/skills/cicd-pipeline) — Generates the GitLab CI job (`docker:29-cli` with `docker:29-dind`, `rules:`, secrets in CI variables) that builds and pushes the images.
- [golang](/skills/golang) — Choose golang for the Go API gateway service: a multi-stage build with cached go mod download and a CGO_ENABLED=0 -trimpath -ldflags "-s -w" static binary on a minimal base (scratch or distroless) is how its image shrinks from 967 MB.
