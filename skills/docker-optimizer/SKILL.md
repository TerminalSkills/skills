---
name: docker-optimizer
description: >-
  Analyze and optimize Docker images for smaller sizes, faster builds, and
  production readiness. Use when Dockerfiles produce bloated images, builds are
  slow, or images need hardening for production. Trigger words: Docker image size,
  reduce Docker image, multi-stage build, slim image, distroless, layer caching,
  Dockerfile optimization, container size, Docker build slow.
license: Apache-2.0
compatibility: "Docker 20+ or Podman 4+; dive tool recommended for analysis"
metadata:
  author: carlos
  version: "1.0.0"
  category: devops
  tags: ["docker", "optimization", "containers", "production"]
---

# Docker Optimizer

## Overview

This skill analyzes Dockerfiles and built images to identify size bloat, inefficient layer caching, security issues, and production readiness problems. It produces optimized Dockerfiles using multi-stage builds, minimal base images, and layer optimization techniques.

## Instructions

### 1. Analyze the Current Dockerfile

When given a Dockerfile, check for these common issues:
- **Base image bloat**: Using `node:18` (900MB) instead of `node:18-alpine` (170MB) or distroless (130MB)
- **Missing multi-stage build**: Build dependencies included in the final image
- **Layer cache invalidation**: COPY . before npm install invalidates dependency cache on every code change
- **Unnecessary files**: node_modules test files, .git, documentation in the image
- **Root user**: Running as root in production
- **Missing .dockerignore**: Sending unnecessary files to build context
- **Redundant commands**: Multiple RUN layers that could be combined

### 2. Calculate Savings

For each issue, estimate the size impact:
- Base image swap: typically saves 500-800MB
- Multi-stage build: saves 200-500MB (build tools, dev dependencies)
- .dockerignore: saves 50-200MB (node_modules, .git)
- Layer combining: marginal size but significant build speed improvement

### 3. Generate Optimized Dockerfile

Apply these techniques in order of impact:
1. **Multi-stage build**: Separate build stage from runtime stage
2. **Minimal base image**: Alpine, slim, or distroless for runtime stage
3. **Dependency caching**: Copy package files first, install, then copy source
4. **Layer optimization**: Combine RUN commands, clean up in the same layer
5. **Security hardening**: Non-root user, read-only filesystem, no shell in distroless
6. **.dockerignore**: Generate a comprehensive ignore file

### 4. Verify the Optimization

Suggest verification commands:
```bash
# Compare sizes
docker images | grep myapp

# Analyze layers with dive
dive myapp:optimized

# Scan for vulnerabilities
docker scout cves myapp:optimized

# Test the image works
docker run --rm myapp:optimized npm test
```

## Examples

### Example 1: Node.js API optimization

**User prompt:**
```
Optimize this Dockerfile for my Node.js API. Current image is 1.2GB.
```

**Original Dockerfile:**
```dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**Optimized Dockerfile:**
```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
RUN npm ci --omit=dev --ignore-scripts

# Production stage
FROM node:18-alpine AS production
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

**Result**: 1.2GB → 180MB (85% reduction)

### Example 2: Python ML service with large dependencies

**User prompt:**
```
My Python ML API image is 4.5GB because of PyTorch and model files. Help me shrink it.
```

**Optimized approach:**
```dockerfile
# Build stage with full build tools
FROM python:3.11-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Production stage
FROM python:3.11-slim AS production
COPY --from=builder /install /usr/local
RUN useradd -m -r appuser && mkdir /app /models && chown appuser:appuser /app /models
WORKDIR /app
COPY --chown=appuser:appuser app/ ./app/
COPY --chown=appuser:appuser models/ /models/
USER appuser
ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Additional tips for ML images:**
- Use PyTorch CPU-only variant if not using GPU: `torch==2.0.0+cpu`
- Store large model files externally (S3) and download at startup
- Use ONNX Runtime instead of full PyTorch for inference-only services
- Consider `nvidia/cuda` base only for GPU instances

## Guidelines

- Always use `.dockerignore` — at minimum exclude `.git`, `node_modules`, `*.md`, `tests/`, `.env`
- Pin exact base image versions with SHA digests for reproducible builds: `FROM node:18-alpine@sha256:abc123...`
- Never store secrets in Docker images — use build-time secrets (`--mount=type=secret`) or runtime env vars
- Add HEALTHCHECK instructions for orchestrator integration (Kubernetes, ECS)
- For Node.js: use `npm ci` not `npm install` for deterministic builds
- For Python: use `--no-cache-dir` with pip to avoid caching wheels in the image
- Test that the optimized image actually works — smaller is useless if it's broken
- Run `docker scout` or `trivy` to verify the smaller image also has fewer vulnerabilities
