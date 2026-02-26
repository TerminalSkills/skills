---
name: moonrepo
description: >-
  Manage monorepos and task orchestration with moonrepo — a Rust-based build
  system for JavaScript/TypeScript projects. Use when someone asks to "manage
  a monorepo", "moonrepo", "task runner for monorepo", "faster than Turborepo",
  "build system with dependency graph", or "monorepo tooling". Covers project
  configuration, task orchestration, dependency graph, caching, CI optimization,
  and toolchain management.
license: Apache-2.0
compatibility: "Any OS. JavaScript/TypeScript monorepos. Rust-powered."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["monorepo", "build-system", "moonrepo", "task-runner", "ci", "rust"]
---

# moonrepo

## Overview

moonrepo (moon) is a Rust-based monorepo management tool and task runner. It understands your project dependency graph, runs tasks in the correct order with caching, manages toolchain versions (Node.js, Bun, etc.), and generates CI pipelines automatically. Faster and more deterministic than Turborepo, with built-in toolchain management that Nx doesn't have.

## When to Use

- Managing a monorepo with multiple packages/apps
- Need deterministic task execution with dependency-aware ordering
- Want consistent toolchain versions across the team
- CI is slow because it builds everything on every PR
- Need better caching than npm scripts provide

## Instructions

### Setup

```bash
# Install moon CLI
curl -fsSL https://moonrepo.dev/install/moon.sh | bash

# Initialize in your monorepo
moon init
```

### Workspace Configuration

```yaml
# .moon/workspace.yml — Monorepo root config
projects:
  - "apps/*"
  - "packages/*"

vcs:
  manager: git
  defaultBranch: main

runner:
  cacheLifetime: 7d
  logStyle: stream
```

### Toolchain Management

```yaml
# .moon/toolchain.yml — Pin Node.js and package manager versions
node:
  version: "20.11.0"
  packageManager: pnpm
  pnpm:
    version: "9.1.0"

# Automatically downloads and uses these exact versions
# No more "works on my machine" — everyone uses the same toolchain
```

### Project Configuration

```yaml
# apps/web/moon.yml — Project-level config
type: application
language: typescript

dependsOn:
  - "packages/ui"
  - "packages/shared"

tasks:
  dev:
    command: next dev
    local: true       # Only runs locally, not in CI

  build:
    command: next build
    inputs:
      - "src/**/*"
      - "package.json"
      - "next.config.js"
    outputs:
      - ".next"
    deps:
      - "packages/ui:build"    # Build ui package first
      - "packages/shared:build"

  test:
    command: vitest run
    inputs:
      - "src/**/*"
      - "tests/**/*"

  lint:
    command: oxlint src/
    inputs:
      - "src/**/*"
```

```yaml
# packages/ui/moon.yml — Shared UI library
type: library
language: typescript

tasks:
  build:
    command: tsup
    inputs:
      - "src/**/*"
      - "tsup.config.ts"
    outputs:
      - "dist"

  test:
    command: vitest run
    inputs:
      - "src/**/*"
      - "tests/**/*"
```

### Run Tasks

```bash
# Run a task in a specific project
moon run web:build

# Run task across all projects that have it
moon run :test

# Run with dependency graph (builds deps first)
moon run web:build  # Automatically builds packages/ui first

# Check what would run (dry run)
moon run web:build --dryRun

# Run affected tasks only (based on git diff)
moon run :test --affected
```

### CI Optimization

```yaml
# .github/workflows/ci.yml — Only run what changed
name: CI
on: [pull_request]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for affected detection

      - uses: moonrepo/setup-toolchain@v0

      - run: moon ci  # Runs all affected tasks in optimal order
```

```bash
# moon ci does:
# 1. Detects which files changed in the PR
# 2. Determines which projects are affected
# 3. Runs only the affected tasks in dependency order
# 4. Uses cache for unchanged outputs
```

## Examples

### Example 1: Set up a new monorepo

**User prompt:** "I have a Next.js app and 3 shared packages. Set up a monorepo with proper task orchestration."

The agent will initialize moon, configure workspace projects, define tasks with proper inputs/outputs/deps, and set up CI with affected detection.

### Example 2: Migrate from Turborepo

**User prompt:** "Our Turborepo setup is getting complex. Migrate to moonrepo."

The agent will translate turbo.json pipeline to moon task configs, set up toolchain management, and configure CI with moon's affected detection.

## Guidelines

- **`inputs` and `outputs` for caching** — define what files affect a task and what it produces
- **`deps` for task ordering** — `"packages/ui:build"` runs before `"web:build"`
- **`--affected` for CI** — only run tasks for changed projects
- **`moon ci` is the CI command** — handles affected detection, ordering, and caching
- **Toolchain pinning** — everyone uses exactly the same Node.js/pnpm version
- **`type: application` vs `library`** — affects dependency graph behavior
- **`local: true` for dev tasks** — skipped in CI automatically
- **Project references via `dependsOn`** — moon understands the monorepo graph
- **Cache is content-addressed** — same inputs = cache hit, regardless of branch
