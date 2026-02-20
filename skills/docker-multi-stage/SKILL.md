---
name: docker-multi-stage
description: >-
  Build optimized Docker images with multi-stage builds. Use when a user asks
  to reduce Docker image size, optimize build times, separate build and runtime
  dependencies, or create production Docker images.
license: Apache-2.0
compatibility: 'Docker 17.05+, any language'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - docker
    - multi-stage
    - optimization
    - containers
    - production
---

# Docker Multi-Stage Builds

## Overview

Multi-stage builds separate the build environment from the runtime image. Install compilers, dev dependencies, and build tools in one stage, then copy only the compiled output to a minimal runtime image. Result: 10-50x smaller images, faster deploys, and smaller attack surface.

## Instructions

### Step 1: Node.js App

```dockerfile
# Dockerfile — Multi-stage Node.js build
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Non-root user for security
RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 app

COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./

USER app
EXPOSE 3000
CMD ["node", "dist/server.js"]
# Result: ~150MB instead of ~1.2GB with full dev dependencies
```

### Step 2: Go App

```dockerfile
# Dockerfile — Go binary with scratch base
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

# Scratch = empty image, only the static binary
FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
# Result: ~12MB instead of ~800MB
```

### Step 3: Python App

```dockerfile
# Dockerfile — Python with virtual environment
FROM python:3.12-slim AS builder
WORKDIR /app
RUN pip install --no-cache-dir poetry
COPY pyproject.toml poetry.lock ./
RUN poetry config virtualenvs.in-project true && \
    poetry install --only main --no-interaction

FROM python:3.12-slim AS runner
WORKDIR /app
COPY --from=builder /app/.venv ./.venv
COPY . .
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
# Result: ~200MB instead of ~1GB with all build tools
```

### Step 4: Next.js Standalone

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN adduser --system --uid 1001 nextjs

# Next.js standalone output — only essential files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
# Result: ~100MB instead of ~500MB+
```

## Guidelines

- Always use `--frozen-lockfile` / `--ci` for reproducible installs.
- Run as non-root user in production images (`USER app`).
- Use Alpine-based images for smallest size; use `slim` when Alpine causes compatibility issues.
- Add `.dockerignore` to exclude `node_modules`, `.git`, `.env` from build context.
- Use BuildKit cache mounts for even faster builds: `RUN --mount=type=cache,target=/root/.npm npm ci`.
