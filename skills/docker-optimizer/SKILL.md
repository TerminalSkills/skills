---
name: docker-optimizer
description: >-
  Analyzes and optimizes Docker images for production. Use when you need to
  reduce image sizes, implement multi-stage builds, select minimal base images,
  optimize layer caching, create .dockerignore files, or audit Dockerfiles for
  bloat. Trigger words: Docker image size, optimize Dockerfile, multi-stage build,
  slim image, distroless, Alpine, reduce container size, layer caching, Docker bloat.
license: Apache-2.0
compatibility: "Docker 20+. BuildKit recommended for advanced caching features."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["docker", "optimization", "containers"]
---

# Docker Optimizer

## Overview

This skill enables AI agents to analyze Docker images for size inefficiencies and generate optimized Dockerfiles using multi-stage builds, minimal base images, and smart layer caching strategies. It targets production deployments where image size directly impacts deployment speed and infrastructure costs.

## Instructions

### 1. Audit Existing Dockerfiles

When asked to optimize Docker images, start by analyzing:

- **Base image**: Is it the full distribution or a slim/alpine variant?
- **Build artifacts**: Are compilers, build tools, or dev dependencies in the final image?
- **Layer count**: Each RUN, COPY, ADD creates a layer. Consolidate where possible
- **Copy scope**: Is the entire repo copied, or just what's needed?
- **.dockerignore**: Does it exist? Does it exclude .git, node_modules, tests, docs?
- **Layer ordering**: Are rarely-changing layers (dependencies) before frequently-changing ones (source code)?

### 2. Multi-Stage Build Pattern

Always recommend multi-stage builds for compiled languages and applications with build steps:

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 3: Runtime
FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

### 3. Base Image Selection Guide

| Stack | Development | Production | Minimal |
|-------|------------|------------|---------|
| Node.js | node:20 (1 GB) | node:20-alpine (180 MB) | distroless/nodejs20 (130 MB) |
| Python | python:3.12 (1 GB) | python:3.12-slim (150 MB) | distroless/python3 (52 MB) |
| Go | golang:1.22 (800 MB) | alpine:3.19 (7 MB) | scratch (0 MB + binary) |
| Java | eclipse-temurin:21 (460 MB) | eclipse-temurin:21-jre-alpine (190 MB) | distroless/java21 (230 MB) |
| Static files | node:20 (1 GB) | nginx:alpine (40 MB) | nginxinc/nginx-unprivileged:alpine (40 MB) |

**Alpine caveats**: Uses musl libc instead of glibc. Test native modules (bcrypt, sharp, psycopg2-binary) explicitly. If native modules fail, use `-slim` instead.

**Distroless caveats**: No shell, no package manager. Cannot exec into container for debugging. Use for production only; keep a debug variant with shell for troubleshooting.

### 4. Layer Caching Optimization

Order instructions from least to most frequently changed:

```
1. Base image (changes: rarely)
2. System packages (changes: monthly)
3. Dependency manifest (package.json, requirements.txt)
4. Dependency install (changes: weekly)
5. Source code copy (changes: every commit)
6. Build step (changes: every commit)
```

### 5. Size Reduction Techniques

- **Remove package manager cache**: `RUN apt-get clean && rm -rf /var/lib/apt/lists/*` or `--no-cache` for apk
- **Combine RUN statements**: Reduces layers and allows cleanup in same layer
- **Use --mount=type=cache**: BuildKit cache mounts for package managers
- **Strip binaries**: For Go/C/Rust, strip debug symbols in the build stage
- **Exclude test files**: Don't copy test directories into production images

### 6. Security Best Practices (Size-Adjacent)

- Run as non-root user (USER instruction)
- Pin base image versions (not `latest`)
- Add HEALTHCHECK instruction
- Use `COPY` not `ADD` (ADD has implicit tar extraction and URL fetching)
- Scan with `docker scout` or `trivy` — fewer packages means fewer CVEs

## Examples

### Example 1: Python Flask optimization

**Prompt**: "My Python Flask app image is 1.2 GB. Optimize it."

**Output**: The agent rewrites the Dockerfile using `python:3.12-slim` as base, a build stage for compiling C extensions, and a runtime stage with only the virtualenv copied over. Uses `--no-cache-dir` on pip install. Result: 165 MB.

### Example 2: Go microservice to scratch

**Prompt**: "Optimize my Go API Dockerfile. I want the smallest possible image."

**Output**: Build stage compiles with `CGO_ENABLED=0 GOOS=linux go build -ldflags='-s -w'`, then copies the single static binary to a `scratch` image with only a ca-certificates bundle. Result: 12 MB.

## Guidelines

- Always show before/after size comparison when optimizing
- Test the optimized image with the application's test suite before recommending
- For Alpine images, explicitly verify native module compatibility
- Keep a docker-compose.override.yml for development with full-size images if needed
- Consider build time vs image size tradeoffs — aggressive optimization may slow CI
