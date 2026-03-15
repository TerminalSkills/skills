---
title: Optimize Docker Builds with Multi-Stage Dockerfiles
slug: optimize-docker-builds-with-multi-stage
description: >-
  Reduce Docker image sizes by 90% using multi-stage builds — separate build
  dependencies from runtime, cache layers efficiently, use distroless base
  images, and speed up CI/CD pipelines.
skills:
  - docker-multi-stage
  - docker-helper
  - github-actions
category: devops
tags:
  - docker
  - optimization
  - ci-cd
  - containers
  - devops
---

# Optimize Docker Builds with Multi-Stage Dockerfiles

Rosa's Node.js API Docker image is 1.2GB. Deploys take 8 minutes because pushing and pulling that image is slow. The image includes build tools, dev dependencies, TypeScript compiler, and test files — none of which are needed at runtime. Multi-stage builds let her use a full Node image for building and copy only the production artifacts into a tiny runtime image.

## Step 1: Before — The Bloated Dockerfile

```dockerfile
# ❌ BAD: 1.2GB image with everything included
FROM node:20
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
CMD ["node", "dist/index.js"]
# Includes: devDependencies, .git, tests, source code, build tools
```

## Step 2: After — Multi-Stage Build

```dockerfile
# Dockerfile — Optimized multi-stage build

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Prune to production deps only
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Stage 3: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

# Don't run as root
RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 app

# Copy only what's needed to run
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./

USER app
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

```bash
# Result:
# Before: 1.2GB
# After:  ~150MB (88% smaller)
```

## Step 3: Even Smaller with Distroless

```dockerfile
# For apps that don't need a shell (no npm, no bash)
FROM gcr.io/distroless/nodejs20-debian12 AS runner
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER nonroot
EXPOSE 3000
CMD ["dist/index.js"]
# ~90MB — no shell, no package manager, minimal attack surface
```

## Step 4: Next.js Standalone Build

```dockerfile
# Dockerfile for Next.js — uses standalone output mode
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app

# Next.js standalone mode copies only required files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static

USER app
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
# ~120MB instead of 800MB+
```

```javascript
// next.config.js — Enable standalone output
module.exports = {
  output: "standalone",
};
```

## Step 5: Cache Optimization for CI

```dockerfile
# Use BuildKit cache mounts for faster rebuilds
# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build
```

```yaml
# .github/workflows/build.yml
name: Build
on: push
jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          # GHA cache makes subsequent builds 3-5x faster
```

## Step 6: .dockerignore

```
# .dockerignore — Don't copy these into the build context
node_modules
.next
.git
.gitignore
*.md
docker-compose*.yml
.env*
coverage
tests
__tests__
.vscode
.idea
.turbo
dist
```

## Summary

Rosa's image dropped from 1.2GB to 150MB (or 90MB with distroless). Deploy time went from 8 minutes to 2 minutes because the image pushes and pulls in seconds. The three-stage pattern (deps → build → runtime) ensures only production code runs in the container. BuildKit cache mounts make CI rebuilds 3-5x faster by caching npm packages and Next.js build artifacts across runs. The distroless variant has no shell — if an attacker gets in, there's nothing to exploit. The `.dockerignore` prevents the build context from including unnecessary files, making `docker build` itself faster.
