---
name: turborepo
description: >-
  Turborepo is a build system for JavaScript/TypeScript monorepos that caches task outputs and runs
  tasks in dependency order. Use when configuring
  build pipelines, setting up caching, pruning workspaces for Docker, or optimizing CI/CD
  for monorepo projects. Trigger words: turborepo, turbo, monorepo, pipeline, workspace,
  remote cache, turbo.json.
license: Apache-2.0
compatibility: "Requires a current Node.js LTS with npm, yarn, pnpm or bun workspaces"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/vercel/turborepo"
  category: development
  tags: "turborepo, monorepo, build-system, caching, ci-cd"
---

# Turborepo

## Overview

Turborepo is a high-performance build system for JavaScript/TypeScript monorepos that intelligently caches task outputs, parallelizes execution across CPU cores, and ensures teams only rebuild what has changed. It integrates with npm, yarn, and pnpm workspaces.

## Instructions

- Install `turbo` as a root devDependency (`npm install turbo --save-dev`, or the pnpm/yarn/bun equivalent) and run it through the package manager. Turborepo 2.x needs a `packageManager` field in the root `package.json` and a workspace definition (`workspaces`, or `pnpm-workspace.yaml`).
- Define tasks under the `tasks` key of `turbo.json` (it was called `pipeline` in 1.x; `npx @turbo/codemod migrate` upgrades old repos). Use `dependsOn` for ordering, the `^` prefix for the same task in dependencies (`"dependsOn": ["^build"]`), and `outputs` for cacheable artifacts (`["dist/**", ".next/**", "!.next/cache/**"]`).
- Run tasks with `turbo run build lint` (or `turbo build`). Add `--ui=stream` for plain log output in CI. Mark long-running tasks `"cache": false, "persistent": true`.
- Caching: the hash covers the package's files, its dependencies' hashes, the task's `inputs` (default: all git-tracked files in the package) and declared environment variables. Declare variables in a task's `env` (or root `globalEnv`). Task `env` mode is `strict` by default: undeclared variables are not passed to the task, so list runtime-only secrets in `passThroughEnv` rather than `env` if they should not affect the hash.
- Filtering: `--filter=@shop/web` for one package, `--filter=@shop/web...` for it plus its dependencies, `--filter='...[origin/main]'` for packages changed since a git ref, or `--affected` for packages changed against `main` (and their dependents). `turbo ls` lists packages; `turbo run build --graph=graph.mermaid` writes the task graph; `--dry=json` shows what would run and the hashes.
- Docker: `turbo prune @shop/web --docker` writes `out/json` (package.json files and pruned lockfile, for the install layer), `out/full` (sources) and the lockfile. Copy `out/json/` first, install, then copy `out/full/` and build. The `--scope` flag no longer exists; pass the package name as an argument. Add a `.dockerignore` with `node_modules`.
- Remote Cache: `npx turbo login` then `npx turbo link` for the Vercel Remote Cache (free on all plans). In CI, set `TURBO_TOKEN` and `TURBO_TEAM` instead. Set `"remoteCache": {"signature": true}` plus `TURBO_REMOTE_CACHE_SIGNATURE_KEY` to sign artifacts. Self-hosted caches implement the documented Remote Cache API and are selected with `TURBO_API`.
- Shared packages: create focused internal packages (`@repo/ui`, `@repo/db`) with shared `tsconfig` and ESLint config packages; `turbo generate` scaffolds a new app or package.

## Examples

### Example 1: Set up a monorepo with a web app and a shared UI package

**User request:** "Initialize a monorepo with a Next.js app and shared UI library, with caching"

Root `package.json` and `turbo.json`:

```json
{
  "name": "shop",
  "private": true,
  "packageManager": "pnpm@10.18.0",
  "devDependencies": { "turbo": "^2.11.10" }
}
```

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"],
      "env": ["NEXT_PUBLIC_API_URL"]
    },
    "lint": {},
    "dev": { "cache": false, "persistent": true }
  }
}
```

With `pnpm-workspace.yaml` listing `apps/*` and `packages/*` (`apps/web` named `@shop/web`, `packages/ui` named `@shop/ui`), run `pnpm turbo run build`. The first run prints `cache miss, executing`; an immediate second run prints `cache hit, replaying logs` for both packages and ends with `FULL TURBO`. Changing `NEXT_PUBLIC_API_URL` produces a miss again because it is declared in `env`.

### Example 2: Build one service into a small Docker image

**User request:** "Create a Dockerfile for deploying @shop/api from our Turborepo monorepo"

```console
$ npx turbo prune @shop/api --docker
Generating pruned monorepo for @shop/api in ./out
 - Added @shop/api
 - Added @shop/db
```

```dockerfile
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx turbo@2 prune @shop/api --docker

FROM base AS build
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@shop/api

CMD ["node", "apps/api/dist/server.js"]
```

The install layer is reused until a `package.json` or the lockfile changes, and the image holds only `@shop/api` and `@shop/db`. Pass `TURBO_TOKEN` and `TURBO_TEAM` as build secrets if the build should use the Remote Cache.

## Guidelines

- Always declare `outputs` for tasks that produce files; a task with no `outputs` caches only its logs. Exclude framework caches such as `!.next/cache/**`.
- Declare every environment variable that changes build output in `env` or `globalEnv`; forgetting one gives stale cache hits, and `strict` mode hides undeclared variables from the task.
- Use `^build` in `dependsOn` when a task consumes dependencies' build output; use a plain name (`"dependsOn": ["build"]`) for same-package ordering.
- Run `turbo` from the repository root, and commit the lockfile: it is part of the hash and `turbo prune` needs it.
- Never copy the whole monorepo into an image; use `turbo prune --docker`.
- Keep tokens (`TURBO_TOKEN`) in CI secrets, not in `turbo.json` or the repository. Enable signature verification when the cache is shared with less trusted contributors.
- Turborepo orchestrates scripts; it does not replace a bundler or a package manager. For a single-package repository it adds little.
