---
title: "Build a Type-Safe Monorepo with Shared Packages"
description: "Unify multiple codebases into a single TypeScript monorepo with shared packages, strict type checking, and fast affected-only CI."
skills: [turborepo, github-actions, changesets]
difficulty: advanced
time_estimate: "6 hours"
tags: [monorepo, typescript, turborepo, nx, ci-cd, changesets, shared-packages]
---

# Build a Type-Safe Monorepo with Shared Packages

## The Problem

Your team runs three separate repos — a web app, a mobile app, and an admin panel. They share business logic, UI components, and database types, but each repo has its own copy. Changes cascade into three PRs, types drift, and CI runs everything every time even if you only changed a README.

**Goal:** One repo, shared packages, incremental builds, and CI that only tests what changed.

---

## Who This Is For

**Engineering lead** unifying 3 codebases into one monorepo. You need buy-in from the team, which means the setup must be fast and the DX must be better than what you're replacing.

---

## Architecture

```
my-monorepo/
├── apps/
│   ├── web/          # Next.js app
│   ├── mobile/       # Expo app
│   └── admin/        # Next.js admin panel
├── packages/
│   ├── ui/           # @myapp/ui — shared React components
│   ├── db/           # @myapp/db — Prisma client + migrations
│   ├── types/        # @myapp/types — shared TypeScript types
│   └── utils/        # @myapp/utils — shared utilities
├── turbo.json
├── package.json
└── .changeset/
```

---

## Step 1: Initialize the Monorepo

```bash
npx create-turbo@latest my-monorepo
cd my-monorepo
```

Or manually with pnpm workspaces:

```json
// package.json (root)
{
  "name": "my-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## Step 2: Configure Turborepo Pipeline

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "!.next/cache/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

The `^build` means: build all dependencies first. Turborepo handles the DAG automatically.

---

## Step 3: Create Shared Packages

### @myapp/types

```bash
mkdir -p packages/types/src
```

```json
// packages/types/package.json
{
  "name": "@myapp/types",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

```typescript
// packages/types/src/index.ts
export type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member" | "viewer";
  createdAt: Date;
};

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
```

### @myapp/utils

```typescript
// packages/utils/src/index.ts
export function formatDate(date: Date, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function chunk<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size)
  );
}
```

---

## Step 4: TypeScript Project References

Project references enable incremental builds — TypeScript only recompiles what changed.

```json
// tsconfig.base.json (root)
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "incremental": true
  }
}
```

```json
// packages/utils/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": []
}
```

```json
// apps/web/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist" },
  "references": [
    { "path": "../../packages/types" },
    { "path": "../../packages/utils" },
    { "path": "../../packages/ui" }
  ]
}
```

---

## Step 5: Changesets for Package Versioning

```bash
pnpm add -D @changesets/cli -w
pnpm changeset init
```

When you make a change to a shared package:

```bash
pnpm changeset
# → select affected packages
# → choose semver bump (patch / minor / major)
# → write a summary
```

Release process:

```bash
pnpm changeset version   # bumps versions, updates changelogs
pnpm changeset publish   # publishes to npm (optional for internal packages)
```

---

## Step 6: GitHub Actions — Affected-Only CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # needed for turbo --filter

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Cache Turbo
        uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-

      - name: Typecheck
        run: pnpm turbo typecheck

      - name: Lint
        run: pnpm turbo lint

      - name: Test
        run: pnpm turbo test

      - name: Build
        run: pnpm turbo build
```

Turborepo's remote cache means if nothing changed, CI finishes in seconds — it replays cached outputs.

---

## Step 7: Remote Caching (Optional but Recommended)

```bash
npx turbo login
npx turbo link
```

Or self-host with [ducktape](https://github.com/ducktape-dev/ducktape) / Vercel Remote Cache.

Add to turbo.json:
```json
{
  "remoteCache": { "enabled": true }
}
```

---

## Common Pitfalls

| Problem | Solution |
|---|---|
| Circular dependencies | Use `madge --circular` to detect them |
| Types not updating | Run `tsc --build` or `turbo typecheck` |
| `composite: true` missing | Required for project references |
| Changeset on wrong package | Run `pnpm changeset` from root |

---

## Result

- ✅ One repo, three apps, four shared packages
- ✅ TypeScript strict mode across everything
- ✅ CI only runs affected packages
- ✅ Internal packages versioned with Changesets
- ✅ Incremental builds via project references

**Payoff:** Teams merge shared logic once, every app benefits immediately, and CI stays fast as the monorepo grows.
