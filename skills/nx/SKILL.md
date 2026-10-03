---
name: nx
description: >-
  Builds and manages JavaScript/TypeScript monorepos with Nx, a build system with task caching, a project graph, code generators and affected commands. Use when a user asks to set up a monorepo, manage multiple packages or apps, cache builds, run only affected tests in CI, or add Nx to an existing repo.
license: Apache-2.0
compatibility: 'Node.js 20+ and npm, pnpm, yarn or bun; any framework (React, Angular, Node, Next.js and more)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/nrwl/nx
  tags:
    - nx
    - monorepo
    - build
    - cache
    - workspace
---

# Nx

## Overview
Nx is a build system for monorepos. It reads your workspace into a project graph, runs tasks in dependency order, caches results (locally, and remotely with Nx Cloud or a self-hosted cache), and can run only the tasks affected by a change. Plugins (`@nx/js`, `@nx/react`, `@nx/node`, `@nx/next`, ...) infer tasks from the tool configs they find (tsconfig, vite config, jest config), so most projects need no hand-written `project.json`. Checked against Nx 23.2.

## Instructions

### Step 1: Create a workspace or add Nx to an existing repo
```bash
# New workspace: pick a preset with --preset, skip the Nx Cloud prompt, no questions
npx create-nx-workspace@latest acme-platform --preset=ts --nxCloud=skip --no-interactive --packageManager=npm

# Existing repo (any package manager): installs nx and creates nx.json
cd acme-platform && npx nx@latest init
```
Other presets include `react-monorepo`, `next`, `node-monorepo`, `angular-monorepo`, `vue-monorepo`, `nest`, `expo`. With `--no-interactive`, `--preset` is required.

### Step 2: Add plugins and projects
```bash
npx nx add @nx/react                                     # install + initialize a plugin
npx nx g @nx/js:lib packages/shared-utils --bundler=tsc  # new library
npx nx g @nx/react:app apps/storefront                   # new app (answers prompts if interactive)
```
New projects are named from their `package.json` (for example `@org/shared-utils`); `nx build shared-utils` still works with the short name when it is unique.

### Step 3: Run tasks
```bash
npx nx build shared-utils           # one project, dependencies built first (^build)
npx nx run-many -t build test lint  # everything
npx nx affected -t test --base=origin/main   # only projects changed since main
npx nx graph                        # open the project graph; nx show projects lists them
npx nx show project shared-utils    # inferred targets, cache flags, inputs and outputs
```
Rerun a cached task and Nx replays the output ("1/1 hit (100%)") instead of running it.

### Step 4: Tune nx.json
Plugin-inferred tasks (build, typecheck, test) are already cacheable. Use `targetDefaults` for your own targets or to change inputs:
```json
{
  "namedInputs": {
    "production": ["default", "!{projectRoot}/**/*.spec.ts"]
  },
  "targetDefaults": {
    "build": { "dependsOn": ["^build"], "cache": true, "inputs": ["production", "^production"] },
    "lint": { "cache": true }
  }
}
```
Tasks that are not deterministic (deploy, dev servers) must not be cached.

### Step 5: Remote cache and CI
```bash
npx nx@latest connect     # link the workspace to Nx Cloud for a shared cache
npx nx reset              # clear local cache and the daemon state when results look stale
npx nx migrate latest && npx nx migrate --run-migrations   # upgrade; one major version at a time
```

## Examples

### Example 1: Start a TypeScript monorepo with a shared library
Request: "Set up a monorepo with a shared utils package and build it."
```bash
npx create-nx-workspace@latest acme-platform --preset=ts --nxCloud=skip --no-interactive
cd acme-platform
npx nx g @nx/js:lib packages/shared-utils --bundler=tsc --unitTestRunner=none --linter=none
npx nx build shared-utils && npx nx build shared-utils
```
The first build prints `Cache: 0/1 hit (0%)`; the second replays from the cache and prints `1/1 hit (100%)` in a few milliseconds.

### Example 2: Only test what a pull request touched
Request: "CI takes 25 minutes, make it run only what changed."
```bash
git fetch origin main
npx nx affected -t lint test build --base=origin/main --head=HEAD --parallel=3
```
Nx finds the changed files, maps them to projects through the graph, and also runs dependents of those projects. Untouched packages are skipped; if nothing is affected it prints "No tasks were run". In GitHub Actions use a full checkout (`fetch-depth: 0`) so the base commit exists.

## Guidelines
- Cache correctness depends on declared inputs and outputs: if a task reads an env var or a file outside the project, add it to `inputs`, or stale results will be replayed.
- `nx affected` needs git history; a shallow clone gives wrong or empty results.
- Remote caches are shared: do not put secrets in task outputs, and restrict write access to CI.
- Keep Nx and all `@nx/*` packages on the same version; upgrade with `nx migrate`, not by editing versions.
- A single small package does not need Nx; it pays off with several projects, shared libraries or slow CI.
