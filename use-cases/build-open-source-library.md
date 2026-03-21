---
title: Build, Document, and Launch an Open-Source TypeScript Library
slug: build-open-source-library
description: Bootstrap a production-ready open-source TypeScript library — dual CJS/ESM build, automated docs, CI across Node versions, npm publish with Changesets, and a contributing guide that gets PRs merged fast.
skills:
  - github-actions
  - changesets
category: development
tags:
  - open-source
  - typescript
  - npm
  - library
  - ci-cd
  - documentation
---

# Build, Document, and Launch an Open-Source TypeScript Library

Alex has been copy-pasting the same 200-line date utility between projects for three years. It handles relative time formatting, business day calculation, timezone-aware comparisons, and human-readable duration strings. Every project gets a slightly different version. Alex wants to publish it properly: a typed npm package that anyone can install, with docs, tests, CI, and a release process that doesn't require remembering a sequence of shell commands.

## Step 1 — Package Structure

A well-organized library is easy to contribute to and easy to consume.

```
date-utils/
├── src/
│   ├── index.ts          # Public API — re-exports everything
│   ├── relative.ts       # Relative time formatting
│   ├── business.ts       # Business day calculations
│   ├── format.ts         # Duration and display formatting
│   └── types.ts          # Shared interfaces
├── tests/
│   ├── relative.test.ts
│   ├── business.test.ts
│   └── format.test.ts
├── docs/                 # TypeDoc output (generated, gitignored)
├── .changeset/           # Changesets for versioning
├── .github/
│   ├── workflows/
│   │   ├── ci.yml        # Test on Node 18/20/22
│   │   └── release.yml   # Publish to npm on tag
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md
│       └── feature_request.md
├── CONTRIBUTING.md
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

```typescript
// src/index.ts — Public API. Only export what users should depend on.

export type { DateInput, DurationUnit, BusinessDayOptions } from "./types";
export { formatRelative, formatRelativeShort } from "./relative";
export { addBusinessDays, isBusinessDay, businessDaysBetween } from "./business";
export { formatDuration, humanizeDuration } from "./format";
```

```typescript
// src/types.ts — Shared types, exported so consumers can type-check their usage.

export type DateInput = Date | string | number;

export type DurationUnit = "years" | "months" | "weeks" | "days" | "hours" | "minutes" | "seconds";

export interface BusinessDayOptions {
  holidays?: Date[];
  workdaysPerWeek?: number[]; // 0=Sun, 1=Mon ... 6=Sat, default [1,2,3,4,5]
}
```

## Step 2 — Dual CJS/ESM Build with tsup

Modern packages ship both CommonJS (for Node.js `require()`) and ESM (for `import` and bundlers). `tsup` handles both in one command.

```typescript
// tsup.config.ts — Build CJS and ESM, generate type declarations.

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,              // Generate .d.ts files
  splitting: false,        // Single file output per format
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,           // Don't minify libraries — makes debugging harder
  outDir: "dist",
  target: "node18",
});
```

```json
// package.json — Correct exports map for CJS/ESM dual package.
{
  "name": "@yourname/date-utils",
  "version": "0.1.0",
  "description": "TypeScript date utilities — relative time, business days, duration formatting",
  "license": "MIT",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests --ext .ts",
    "docs": "typedoc src/index.ts --out docs",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "npm run build && changeset publish"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "typedoc": "^0.25.0",
    "@changesets/cli": "^2.27.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0"
  }
}
```

## Step 3 — CI: Test on Node 18/20/22 with GitHub Actions

Every PR runs tests, typecheck, and lint on all supported Node versions.

```yaml
# .github/workflows/ci.yml — Run on every push and PR.

name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: Test on Node ${{ matrix.node-version }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
      fail-fast: false  # Don't cancel other versions if one fails

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Check exports
        run: |
          # Verify CJS require() works
          node -e "const lib = require('./dist/index.cjs'); console.log('CJS OK:', Object.keys(lib).length, 'exports')"
          # Verify ESM import works
          node --input-type=module -e "import('./dist/index.js').then(m => console.log('ESM OK:', Object.keys(m).length, 'exports'))"
```

## Step 4 — npm Publish with Changesets

Changesets manages versioning: contributors add a changeset file describing the change (patch/minor/major), and the release workflow bumps versions and publishes automatically on tag.

```yaml
# .github/workflows/release.yml — Publish to npm on version bump PR merge.

name: Release

on:
  push:
    branches: [main]

concurrency:
  group: release
  cancel-in-progress: true

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Changesets needs git history

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
          registry-url: "https://registry.npmjs.org"

      - run: npm ci

      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: npm run release
          title: "chore: release packages"
          commit: "chore: release packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

```markdown
<!-- .changeset/README.md — Instructions for contributors. -->

## Adding a Changeset

When you make a change that affects the public API or behavior, add a changeset:

```bash
npm run changeset
```

Choose the bump type:
- **patch**: bug fix, no API change
- **minor**: new feature, backwards compatible
- **major**: breaking change

Write a one-line description. Commit the generated `.changeset/*.md` file with your PR.

When your PR merges, the release workflow opens a "Release PR" that bumps the version and updates CHANGELOG.md. When that PR merges, it publishes to npm automatically.
```

## Step 5 — Automated Docs with TypeDoc + GitHub Pages

JSDoc comments in source become a searchable API reference, published to GitHub Pages on every main branch push.

```typescript
// src/relative.ts — Example with JSDoc comments that TypeDoc picks up.

/**
 * Format a date as a human-readable relative string.
 *
 * @param date - The date to format. Accepts Date, ISO string, or Unix timestamp.
 * @param relativeTo - The reference date. Defaults to now.
 * @returns A relative time string like "3 hours ago" or "in 2 days".
 *
 * @example
 * ```ts
 * formatRelative(new Date(Date.now() - 3600000)); // "1 hour ago"
 * formatRelative("2025-01-15", new Date("2025-01-20")); // "5 days ago"
 * formatRelative(Date.now() + 86400000); // "in 1 day"
 * ```
 */
export function formatRelative(date: DateInput, relativeTo: DateInput = new Date()): string {
  const d = toDate(date);
  const ref = toDate(relativeTo);
  const diffMs = d.getTime() - ref.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  const diffMonth = Math.round(diffDay / 30);
  const diffYear = Math.round(diffDay / 365);

  if (Math.abs(diffSec) < 60) return diffSec >= 0 ? "just now" : "just now";
  if (Math.abs(diffMin) < 60) return diffMin > 0 ? `in ${diffMin} minute${diffMin !== 1 ? "s" : ""}` : `${-diffMin} minute${-diffMin !== 1 ? "s" : ""} ago`;
  if (Math.abs(diffHour) < 24) return diffHour > 0 ? `in ${diffHour} hour${diffHour !== 1 ? "s" : ""}` : `${-diffHour} hour${-diffHour !== 1 ? "s" : ""} ago`;
  if (Math.abs(diffDay) < 30) return diffDay > 0 ? `in ${diffDay} day${diffDay !== 1 ? "s" : ""}` : `${-diffDay} day${-diffDay !== 1 ? "s" : ""} ago`;
  if (Math.abs(diffMonth) < 12) return diffMonth > 0 ? `in ${diffMonth} month${diffMonth !== 1 ? "s" : ""}` : `${-diffMonth} month${-diffMonth !== 1 ? "s" : ""} ago`;
  return diffYear > 0 ? `in ${diffYear} year${diffYear !== 1 ? "s" : ""}` : `${-diffYear} year${-diffYear !== 1 ? "s" : ""} ago`;
}

function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}
```

```yaml
# .github/workflows/docs.yml — Deploy TypeDoc to GitHub Pages on main push.
name: Docs

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy-docs:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run docs
      - uses: actions/upload-pages-artifact@v3
        with: { path: docs }
      - uses: actions/deploy-pages@v4
        id: deployment
```

## Results

Alex published the library and shared it on X and HN "Show HN." Six months later:

- **npm downloads: 2,400/month** — a "Show HN" post got 80 points and surfaced the package to the right audience.
- **Zero breaking changes** — Changesets enforced semantic versioning from day one. Contributors know what bump to choose.
- **CI on Node 18/20/22**: caught one bug that only appeared on Node 18 due to a `structuredClone` behavior difference. Would've been a surprise production issue.
- **TypeDoc site**: linked from the README. Users don't need to read source to understand the API.
- **Contributing: 6 external PRs** in the first 3 months — the CONTRIBUTING.md and issue templates lowered the barrier enough that people actually sent PRs.
- **Alex's own projects**: all import from the package now. When a bug is fixed, all projects get the fix via `npm update`.
- **Build time: ~12 hours** — project scaffold, implementation, tests, CI, docs, release workflow.
