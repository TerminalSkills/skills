---
title: Set Up a TypeScript Monorepo with Modern Tooling
slug: set-up-typescript-monorepo-with-modern-tooling
description: Configure a production monorepo with moonrepo for task orchestration, tsup for library bundling, oxlint for fast linting, and knip for dead code detection.
skills:
  - moonrepo
  - tsup
  - oxlint
  - knip
category: devops
tags:
  - monorepo
  - typescript
  - tooling
  - dx
  - ci
---

## The Problem

Sam's engineering team has three Next.js apps and five shared packages in a single repository. The current setup uses npm workspaces with hand-written scripts — `build.sh` that runs everything sequentially, taking 8 minutes even when only one file changed. ESLint takes 40 seconds. Nobody knows which of the 47 dependencies in the root `package.json` are actually used. New engineers spend half a day figuring out the build order because dependencies between packages aren't documented.

## The Solution

Use moonrepo to understand the project graph and run tasks in the correct order with caching. tsup for building shared packages (fast esbuild-powered bundling). oxlint for near-instant linting. knip to find and remove dead code and unused dependencies. The result: CI drops from 8 minutes to under 2 minutes for most PRs, and the entire developer experience improves.

## Step-by-Step Walkthrough

### Step 1: Initialize the Monorepo Structure

```
my-monorepo/
├── .moon/
│   ├── workspace.yml     # Project discovery
│   └── toolchain.yml     # Node.js/pnpm versions
├── apps/
│   ├── web/              # Main Next.js app
│   ├── admin/            # Admin dashboard
│   └── docs/             # Documentation site
├── packages/
│   ├── ui/               # Shared React components
│   ├── config/           # Shared configs (ESLint, TS, Tailwind)
│   ├── database/         # Drizzle schema + migrations
│   ├── auth/             # Authentication logic
│   └── utils/            # Shared utilities
├── package.json
└── pnpm-workspace.yaml
```

```yaml
# .moon/workspace.yml — Tell moon where projects live
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

```yaml
# .moon/toolchain.yml — Pin exact versions for the whole team
node:
  version: "20.11.0"
  packageManager: pnpm
  pnpm:
    version: "9.1.0"
```

### Step 2: Configure Shared Package Builds with tsup

Each shared package uses tsup for fast, zero-config bundling with ESM + CJS dual output.

```typescript
// packages/ui/tsup.config.ts — React component library
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  external: ["react", "react-dom"],  // Peer deps — don't bundle
  treeshake: true,
  sourcemap: true,
});
```

```json
// packages/ui/package.json
{
  "name": "@myorg/ui",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "scripts": { "build": "tsup" },
  "peerDependencies": { "react": "^18.0.0" }
}
```

```yaml
# packages/ui/moon.yml — Moon task config
type: library
language: typescript

tasks:
  build:
    command: tsup
    inputs:
      - "src/**/*"
      - "tsup.config.ts"
      - "package.json"
    outputs:
      - "dist"

  typecheck:
    command: tsc --noEmit
    inputs:
      - "src/**/*"
      - "tsconfig.json"

  lint:
    command: oxlint src/
    inputs:
      - "src/**/*"

  test:
    command: vitest run
    inputs:
      - "src/**/*"
      - "tests/**/*"
```

### Step 3: Configure App Builds with Dependencies

```yaml
# apps/web/moon.yml — Next.js app that depends on shared packages
type: application
language: typescript

dependsOn:
  - "packages/ui"
  - "packages/auth"
  - "packages/database"
  - "packages/utils"

tasks:
  dev:
    command: next dev
    local: true  # Only runs locally

  build:
    command: next build
    inputs:
      - "src/**/*"
      - "app/**/*"
      - "next.config.ts"
      - "package.json"
    outputs:
      - ".next"
    deps:
      - "packages/ui:build"
      - "packages/auth:build"
      - "packages/database:build"
      - "packages/utils:build"

  lint:
    command: oxlint src/ app/
    inputs:
      - "src/**/*"
      - "app/**/*"

  test:
    command: vitest run
    inputs:
      - "src/**/*"
      - "app/**/*"
      - "tests/**/*"
```

### Step 4: Fast Linting with oxlint

```json
// .oxlintrc.json — Root config for the whole monorepo
{
  "plugins": ["typescript", "react", "import"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn"
  },
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "warn",
    "eqeqeq": "error",
    "no-var": "error",
    "prefer-const": "warn"
  },
  "ignorePatterns": ["dist/", "node_modules/", ".next/", "coverage/"]
}
```

Running `moon run :lint` now lints the entire monorepo in under 1 second — compared to 40 seconds with ESLint.

### Step 5: Dead Code Detection with knip

```json
// knip.json — Monorepo-wide dead code detection
{
  "workspaces": {
    "apps/web": {
      "entry": ["app/layout.tsx", "app/**/page.tsx"],
      "next": true
    },
    "apps/admin": {
      "entry": ["app/layout.tsx", "app/**/page.tsx"],
      "next": true
    },
    "packages/ui": {
      "entry": ["src/index.ts"]
    },
    "packages/utils": {
      "entry": ["src/index.ts"]
    },
    "packages/database": {
      "entry": ["src/index.ts", "drizzle.config.ts"]
    }
  }
}
```

```bash
# Find all unused code across the monorepo
npx knip

# Sample output:
# Unused files (3)
#   packages/utils/src/legacy-date-parser.ts
#   packages/ui/src/components/DeprecatedModal.tsx
#   apps/web/src/hooks/useOldAnalytics.ts
#
# Unused dependencies (5)
#   apps/web: lodash, classnames
#   packages/utils: date-fns (replaced by Temporal)
#   Root: husky (removed pre-commit hooks months ago), lint-staged
#
# Unused exports (8)
#   packages/ui/src/index.ts: DeprecatedModal, OldButton, LegacyToast
#   packages/utils/src/index.ts: formatLegacyDate, parseCurrency
```

### Step 6: CI Configuration

```yaml
# .github/workflows/ci.yml — Fast CI with affected detection
name: CI
on: [pull_request]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: moonrepo/setup-toolchain@v0

      # Run only affected tasks — if you changed packages/ui,
      # it runs ui:build, ui:test, ui:lint AND web:build, admin:build
      # (because they depend on ui)
      - run: moon ci

  dead-code:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: npx knip
```

## The Outcome

Sam's monorepo goes from chaos to clarity. `moon run web:build` takes 12 seconds (with automatic dependency builds and caching) instead of 8 minutes. Re-running without changes: 200ms (full cache hit). CI runs only affected tasks — a change to `packages/ui` runs ui tests, ui build, and rebuilds the apps that use it. A change to `apps/docs` only runs docs tasks. oxlint finishes in 400ms for the whole monorepo. knip found 3 unused files, 5 unused dependencies, and 8 unused exports on the first run — all safely deleted. New engineers run `moon run web:dev` and everything just works: correct Node.js version, correct pnpm version, dependencies built in the right order.
