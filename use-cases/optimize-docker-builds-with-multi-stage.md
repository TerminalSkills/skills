---
title: Optimize Docker Builds with Multi-Stage Dockerfiles
slug: optimize-docker-builds-with-multi-stage
description: >-
  Shrink Docker images with multi-stage builds — separate build
  dependencies from runtime, cache layers efficiently, use distroless base
  images, and speed up CI/CD pipelines.
skills:
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

Rosa's Node.js API Docker image is well over a gigabyte. Deploys take 8 minutes because pushing and pulling that image is slow. The image includes build tools, dev dependencies, the TypeScript compiler and test files, none of which are needed at runtime. Multi-stage builds let her use a full Node image for building and copy only the production artifacts into a small runtime image. She measures every step with `docker images` and `docker history`.

## Step 1: Before, the bloated Dockerfile

```dockerfile
# Bad: the full Debian-based Node image plus every dev dependency and the source tree
FROM node:24
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
CMD ["node", "dist/index.js"]
```

Node 20 reached end of life in April 2026, so she also moves to Node 24 (an LTS line) at the same time. On a small test API (Express, TypeScript, a few dev dependencies) this Dockerfile produced an image of 1.73 GB on disk (427 MB compressed content).

## Step 2: After, a multi-stage build

Dependencies, production-only dependencies, the build and the runtime are separate stages. The dependency layers are reused as long as `package-lock.json` does not change, and the runtime stage starts from a clean base.

```dockerfile
# syntax=docker/dockerfile:1
# Dockerfile: the syntax line must be the first line of the file

# Stage 1: all dependencies (including dev) for the build
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

# Stage 2: production dependencies only
FROM deps AS prod-deps
RUN --mount=type=cache,target=/root/.npm npm prune --omit=dev --ignore-scripts

# Stage 3: compile
FROM deps AS builder
COPY . .
RUN npm run build

# Stage 4: runtime
FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
# The official Node images ship a non-root "node" user
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

`--ignore-scripts` skips dependency install scripts; if a package needs a build step on install (native addons), allow that package explicitly or drop the flag. On the same test API the image is 249 MB on disk (63 MB compressed content), and the container reports `healthy` and runs as `node`:

```console
$ docker build -t api:multi .
$ docker images api:multi
$ docker run -d --name api -p 127.0.0.1:3000:3000 api:multi
$ docker inspect -f '{{.State.Health.Status}}' api
healthy
```

Most of what remains is the base image. Only `node_modules` (production), `dist` and `package.json` are in the final stage.

## Step 3: Even smaller with distroless

Distroless images have no shell and no package manager, which shrinks the attack surface. They are Debian (glibc) based, so build the dependencies on a glibc image such as `node:24-slim`, not Alpine (musl). Native modules compiled on Alpine will not load.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

FROM deps AS prod-deps
RUN --mount=type=cache,target=/root/.npm npm prune --omit=dev --ignore-scripts

FROM deps AS builder
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs24-debian13:nonroot
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
EXPOSE 3000
# The image's entrypoint is already "node", so CMD is just the script
CMD ["dist/index.js"]
```

The same API built this way is 220 MB on disk (56 MB compressed) and answers on `/health`. There is no `wget` or `sh`, so `HEALTHCHECK` is left to the orchestrator (a Kubernetes probe or a Compose `healthcheck` that runs `node` itself). For debugging use the `:debug-nonroot` tag, which adds a busybox shell.

## Step 4: Next.js standalone build

Next.js can trace the files the server needs and write a self-contained `.next/standalone` folder. This follows the official `with-docker` example from the Next.js repository.

```javascript
// next.config.js
module.exports = {
  output: "standalone",
};
```

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Listen on all interfaces inside the container; publish the port on the host as needed
ENV HOSTNAME="0.0.0.0"

COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir .next && chown node:node .next
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

`public/` and `.next/static` are not part of the standalone output, so they are copied separately (a CDN can serve them instead). Run it with `docker run -p 127.0.0.1:3000:3000` unless the container is meant to be public.

## Step 5: Cache optimization in CI

BuildKit cache mounts (the `--mount=type=cache` lines above) keep the npm download cache between builds on one machine. CI runners start empty, so the workflow also stores the layer cache in the GitHub Actions cache:

```yaml
# .github/workflows/build.yml
name: Build
on:
  push:
    branches: [main]
permissions:
  contents: read
  packages: write        # lets GITHUB_TOKEN push to ghcr.io
jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

`mode=max` also caches the intermediate stages (deps, build), which is where the time goes. Unchanged `package-lock.json` means the install layer is a cache hit. (Cache mounts are not exported by the `gha` layer cache, only layers are.) Container image names must be lowercase; `github.repository` is already lowercase for most repos, but add a lowercase step if yours has capitals.

## Step 6: .dockerignore

```text
# .dockerignore: keep these out of the build context
node_modules
.next
.git
.gitignore
*.md
compose*.y*ml
docker-compose*.y*ml
.env*
coverage
tests
__tests__
.vscode
.idea
.turbo
dist
Dockerfile*
```

Excluding `.env*` also keeps local secrets out of image layers. Excluding `dist` is safe because the build stage rebuilds it.

## Summary

On the test API, the image went from 1.73 GB to 249 MB with Alpine and 220 MB with distroless, and the compressed size that actually moves over the network went from 427 MB to 63 MB and 56 MB. For Rosa's real service, the push and pull step fell from minutes to seconds and the deploy from 8 minutes to about 2 (her own timings). The deps, build and runtime split means only production code runs in the container, as a non-root user, and the GitHub Actions cache turns unchanged dependency layers into cache hits.

## Related Skills

- `docker-helper`: Dockerfile and Compose patterns, image-size checklist
- `github-actions`: CI workflow that builds and pushes the image
