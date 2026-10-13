---
name: docker-helper
description: >-
  Build, debug, and optimize Docker configurations. Use when a user asks to
  create a Dockerfile, fix Docker build errors, optimize image size, write
  docker-compose files, debug container issues, set up multi-stage builds,
  or troubleshoot networking between containers. Covers Dockerfile best
  practices and compose orchestration.
license: Apache-2.0
compatibility: "Requires Docker Engine 25+ with the Compose v2 plugin"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["docker", "containers", "dockerfile", "compose", "devops"]
  repository: https://github.com/docker/cli
---

# Docker Helper

## Overview

Create, debug, and optimize Docker configurations including Dockerfiles, docker-compose setups, and container troubleshooting. Follows Docker best practices for security, image size, and build speed.

## Instructions

When a user asks for help with Docker, determine which task they need:

### Task A: Create a Dockerfile

1. Identify the application language and framework. `docker init` can generate a starting Dockerfile, `compose.yaml` and `.dockerignore` for common stacks; review its output before keeping it.
2. Choose the right base image (prefer `-slim` or `-alpine` variants, and a currently supported release: Node 20 reached end of life in April 2026, so use an LTS such as 24 or 22).
3. Use multi-stage builds for compiled or bundled apps.
4. Order instructions for layer caching:

```dockerfile
# Stage 1: build (needs dev dependencies)
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Stage 2: runtime
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

The official Node images already ship a non-root `node` user. Installing with `npm ci --omit=dev` in the builder would break `npm run build` when the build tool is a dev dependency; prune afterwards instead. (`--only=production` is the deprecated spelling of `--omit=dev`.)

**Key rules:**
- Copy dependency files first, then source (caching)
- Run as a non-root user (`USER` before `CMD`)
- Use `.dockerignore` to exclude `node_modules`, `.git`, `.env`
- Pin base images to a version tag (e.g. `node:24.8-alpine`); for reproducible builds pin the digest too (`image@sha256:...`)
- Chain related `RUN` steps with `&&` so cleanup happens in the same layer

### Task B: Write compose.yaml

Docker Compose v2 is the `docker compose` plugin (not the old `docker-compose` binary). The top-level `version:` key is obsolete and only produces a warning; omit it. The preferred file name is `compose.yaml` (`docker-compose.yml` is still read).

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://orders:${POSTGRES_PASSWORD:?set it in .env}@db:5432/orders
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:18-alpine
    volumes:
      - pgdata:/var/lib/postgresql
    environment:
      POSTGRES_USER: orders
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set it in .env}
      POSTGRES_DB: orders
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orders -d orders"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

Run it with `docker compose up -d --wait` (waits until services are healthy), check with `docker compose ps`, and validate the merged file with `docker compose config`.

**Key rules:**
- Use `depends_on` with `condition: service_healthy`, not just service names
- Use named volumes for persistent data. Postgres 18 images keep data in a versioned subdirectory of `/var/lib/postgresql`, so mount the volume there; for 17 and older the mount point is `/var/lib/postgresql/data`
- Keep secrets out of the file: read them from `.env` (interpolation, as above) or use Compose `secrets:`
- Set restart policies
- For local development, `docker compose watch` with a `develop.watch` section syncs or rebuilds on file changes

### Task C: Debug container issues

Follow this diagnostic sequence:

```bash
# 1. Check container status
docker ps -a

# 2. Read container logs
docker logs web --tail 50

# 3. Inspect container details (exit code, OOM kill, health)
docker inspect --format '{{json .State}}' web

# 4. Check resource usage
docker stats --no-stream

# 5. Get a shell inside the container
docker exec -it web /bin/sh

# 6. Check networking
docker network ls
docker network inspect orders_default
```

For Compose projects, use `docker compose logs -f app` and `docker compose ps`. If the image has no shell, `docker run --rm -it --entrypoint sh <image>` or `docker debug <container>` (Docker Desktop / subscription feature) helps.

Common issues and fixes:
- **Container exits immediately**: check logs; usually a missing env var or config file. `docker inspect` shows `ExitCode` (137 usually means killed, often out of memory)
- **Port already in use**: `lsof -i :3000` to find the conflict
- **Cannot connect between containers**: put them on the same network and use service names as hostnames, never `localhost`
- **Out of disk space**: `docker system df` shows usage; `docker system prune` removes stopped containers, unused networks and dangling images. Add `-a` (all unused images) or `--volumes` only after checking what they will delete, since volumes hold data
- **Build fails at COPY**: check `.dockerignore` and verify paths are relative to the build context

### Task D: Optimize image size

```bash
# Check current image size
docker images myapp

# Analyze layers
docker history myapp:latest
```

Optimization checklist:
1. Switch to slim or alpine base images (alpine uses musl; some Python wheels and native Node modules need a glibc `-slim` image instead)
2. Use multi-stage builds (build deps stay in the builder stage)
3. Combine RUN commands with `&&`
4. Remove package manager caches in the same layer (`rm -rf /var/cache/apk/*`, or `apk add --no-cache`; `apt-get ... && rm -rf /var/lib/apt/lists/*`)
5. Use `.dockerignore` to exclude test files, docs, .git
6. Do not install dev dependencies in the final image

## Examples

### Example 1: Create a Dockerfile for a Python FastAPI app

**User request:** "Create a Dockerfile for my FastAPI project"

**Output Dockerfile:**
```dockerfile
FROM python:3.14-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.14-slim
WORKDIR /app
RUN useradd -r -s /usr/sbin/nologin appuser
COPY --from=builder /install /usr/local
COPY . .
USER appuser
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Output .dockerignore:**
```
__pycache__
*.pyc
.git
.env
.venv
tests/
*.md
```

**Result:** Image size ~180MB instead of ~1.2GB with the full Python image.

### Example 2: Debug a container that keeps restarting

**User request:** "My web container keeps restarting, can you help?"

**Diagnostic steps:**
```
$ docker ps -a
CONTAINER ID  IMAGE    STATUS                     NAMES
a1b2c3d4e5f6  web:1.0  Restarting (1) 5 sec ago   web

$ docker logs web --tail 20
Error: ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect

Root cause: The app is trying to connect to PostgreSQL at 127.0.0.1,
but in Docker the database is a separate container.

Fix: Change DATABASE_URL from localhost to the service name:
  DATABASE_URL=postgres://orders:${POSTGRES_PASSWORD}@db:5432/orders
                                           ^^ service name, not localhost
```

## Guidelines

- Always create a `.dockerignore` alongside any Dockerfile.
- Pin base image versions to specific tags, not `latest`, and move off end-of-life releases.
- Never store secrets in Docker images or Dockerfiles. Use environment variables or Docker secrets.
- For production, always run as a non-root user.
- When optimizing, measure before and after with `docker images`.
- If a build is slow, check layer ordering. Dependencies (package.json, requirements.txt) should be copied and installed before source code.
- For local development, use bind mounts for live reloading. For production, use COPY.
- Health checks should test actual application readiness, not just process existence.
