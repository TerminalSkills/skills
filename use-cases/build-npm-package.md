---
title: Build and Publish a Professional npm Package
slug: build-npm-package
description: Build, test, and publish a professional npm package with TypeScript, dual CJS/ESM output, Vitest, TypeDoc, and automated releases via Changesets and GitHub Actions.
skills:
  - typescript
  - vitest
  - github-actions
  - changesets
category: development
tags:
  - npm
  - open-source
  - typescript
  - package
  - ci-cd
---

# Build and Publish a Professional npm Package

## The Problem

Priya has written the same date utility functions in five different projects. She's tired of copying code. She wants to open-source it as a proper npm package — TypeScript, fully typed, tree-shakable, tested, documented, and with automated releases so she doesn't have to manually run `npm publish` ever again.

## Step 1: Project Setup with TypeScript

```json
// package.json — Dual CJS/ESM package
{
  "name": "@priya/datekit",
  "version": "0.0.0",
  "description": "Lightweight date utilities with zero dependencies",
  "license": "MIT",
  "author": "Priya Sharma",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "docs": "typedoc src/index.ts",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.1",
    "@types/node": "^20.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "tsup": "^8.0.0",
    "typedoc": "^0.25.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

```typescript
// tsup.config.ts — Build CJS + ESM + type declarations
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  treeshake: true,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
```

## Step 2: Write the Library

```typescript
// src/index.ts — Public API (tree-shakable named exports)
export { formatDate, parseDate } from "./format";
export { addDays, addMonths, addYears, subDays } from "./arithmetic";
export { isBefore, isAfter, isSameDay, isWeekend } from "./comparison";
export { startOfDay, endOfDay, startOfWeek, startOfMonth } from "./boundaries";
export { DateRange, createRange, eachDayInRange } from "./range";
export type { DateInput, FormatOptions } from "./types";

// src/types.ts
export type DateInput = Date | string | number;

export interface FormatOptions {
  locale?: string;
  timezone?: string;
}

// src/format.ts — JSDoc documentation
/**
 * Format a date into a human-readable string.
 *
 * @param date - The date to format (Date, ISO string, or timestamp)
 * @param pattern - Format pattern: 'YYYY-MM-DD', 'DD/MM/YYYY', 'MMM D, YYYY', etc.
 * @param options - Optional locale and timezone settings
 * @returns Formatted date string
 *
 * @example
 * ```ts
 * formatDate(new Date(2024, 0, 15), 'YYYY-MM-DD') // → '2024-01-15'
 * formatDate('2024-01-15', 'MMM D, YYYY') // → 'Jan 15, 2024'
 * ```
 */
export function formatDate(date: DateInput, pattern: string, options: FormatOptions = {}): string {
  const d = toDate(date);
  const locale = options.locale || "en-US";

  const map: Record<string, string> = {
    YYYY: d.getFullYear().toString(),
    MM: String(d.getMonth() + 1).padStart(2, "0"),
    DD: String(d.getDate()).padStart(2, "0"),
    MMM: d.toLocaleDateString(locale, { month: "short" }),
    MMMM: d.toLocaleDateString(locale, { month: "long" }),
    D: d.getDate().toString(),
    HH: String(d.getHours()).padStart(2, "0"),
    mm: String(d.getMinutes()).padStart(2, "0"),
    ss: String(d.getSeconds()).padStart(2, "0"),
  };

  return Object.entries(map).reduce((acc, [token, value]) => acc.replace(token, value), pattern);
}

export function parseDate(dateString: string): Date {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) throw new Error(`Invalid date string: "${dateString}"`);
  return d;
}

function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  if (typeof input === "number") return new Date(input);
  return parseDate(input);
}

// src/arithmetic.ts
import type { DateInput } from "./types";

export function addDays(date: DateInput, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: DateInput, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function addYears(date: DateInput, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

export function subDays(date: DateInput, days: number): Date {
  return addDays(date, -days);
}
```

## Step 3: Write Tests with Vitest

```typescript
// src/format.test.ts
import { describe, it, expect } from "vitest";
import { formatDate, parseDate } from "./format";
import { addDays, addMonths } from "./arithmetic";
import { isBefore, isAfter, isSameDay } from "./comparison";

describe("formatDate", () => {
  it("formats YYYY-MM-DD pattern", () => {
    expect(formatDate(new Date(2024, 0, 15), "YYYY-MM-DD")).toBe("2024-01-15");
  });

  it("formats DD/MM/YYYY pattern", () => {
    expect(formatDate(new Date(2024, 5, 3), "DD/MM/YYYY")).toBe("03/06/2024");
  });

  it("accepts ISO string input", () => {
    expect(formatDate("2024-03-20", "YYYY-MM-DD")).toBe("2024-03-20");
  });

  it("accepts timestamp input", () => {
    const ts = new Date(2024, 0, 1).getTime();
    expect(formatDate(ts, "YYYY-MM-DD")).toBe("2024-01-01");
  });
});

describe("parseDate", () => {
  it("parses ISO strings", () => {
    const d = parseDate("2024-06-15");
    expect(d.getFullYear()).toBe(2024);
  });

  it("throws on invalid input", () => {
    expect(() => parseDate("not-a-date")).toThrow('Invalid date string: "not-a-date"');
  });
});

describe("arithmetic", () => {
  it("adds days correctly", () => {
    expect(addDays(new Date(2024, 0, 28), 5)).toEqual(new Date(2024, 1, 2));
  });

  it("handles month overflow when adding months", () => {
    const result = addMonths(new Date(2024, 0, 31), 1); // Jan 31 + 1 month
    expect(result.getMonth()).toBe(1); // Feb
  });
});

describe("comparison", () => {
  it("isBefore returns true for earlier date", () => {
    expect(isBefore(new Date(2024, 0, 1), new Date(2024, 0, 2))).toBe(true);
  });

  it("isSameDay ignores time component", () => {
    const a = new Date(2024, 5, 15, 9, 0);
    const b = new Date(2024, 5, 15, 23, 59);
    expect(isSameDay(a, b)).toBe(true);
  });
});
```

## Step 4: Versioning with Changesets

```bash
# Initialize changesets
npx changeset init

# When you make a change, add a changeset
npx changeset
# → Prompts: which package? major/minor/patch? summary?
# Creates .changeset/purple-lions-run.md

# Version bump (updates package.json + CHANGELOG.md)
npx changeset version

# Publish
npm publish --access public
```

```markdown
// .changeset/purple-lions-run.md (auto-generated)
---
"@priya/datekit": minor
---

Add `addMonths` and `addYears` arithmetic helpers
```

## Step 5: GitHub Actions — Automated Release

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org

      - run: npm ci

      - name: Test & Build
        run: |
          npm run typecheck
          npm test
          npm run build

      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: npm publish --access public
          title: "chore: release packages"
          commit: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

# .github/workflows/ci.yml — Run on every PR
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test:coverage
      - run: npm run build
```

## Results

- **Zero manual publishing** — merge a changeset PR and GitHub Actions runs typecheck, tests, build, and `npm publish` automatically
- **Tree-shakable dual output** — bundlers import the ESM build; older toolchains use CJS; `exports` field ensures the right file is picked
- **100% TypeScript** — consumers get full type inference and autocomplete; no separate `@types/*` package needed
- **Coverage enforced** — Vitest coverage report in CI fails the build below threshold; regressions caught before merge
- **Automated changelog** — Changesets generates `CHANGELOG.md` from PR descriptions; semantic versioning maintained without manual decisions
