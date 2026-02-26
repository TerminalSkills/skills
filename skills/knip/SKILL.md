---
name: knip
description: >-
  Find and remove unused files, dependencies, and exports in JavaScript/TypeScript
  projects with Knip. Use when someone asks to "find unused code", "clean up
  dependencies", "remove dead code", "find unused exports", "Knip", "reduce
  bundle size by removing unused files", or "audit npm dependencies". Covers
  unused files, dependencies, exports, types, and CI integration.
license: Apache-2.0
compatibility: "Node.js 18+. TypeScript/JavaScript projects."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["dx", "unused-code", "dependencies", "knip", "cleanup", "dead-code"]
---

# Knip

## Overview

Knip finds unused files, dependencies, and exports in your TypeScript/JavaScript project. It understands your project structure — framework entry points, config files, scripts — and reports what's truly unused. Unlike ESLint's no-unused-vars (which only checks within files), Knip works across the entire project: unused exports, orphan files, unlisted dependencies, and packages in package.json that no code actually imports.

## When to Use

- Cleaning up a codebase that's accumulated dead code over time
- Auditing npm dependencies (unused, unlisted, or duplicate)
- Reducing bundle size by removing unused exports
- Pre-refactoring analysis to identify what can be safely deleted
- CI gate to prevent new unused code from being merged

## Instructions

### Setup

```bash
npx knip  # Zero config — works out of the box

# Or install
npm install -D knip
```

### What Knip Detects

```bash
# Run a full analysis
npx knip

# Output:
# Unused files (2)
#   src/utils/legacy-helper.ts
#   src/components/OldBanner.tsx
#
# Unused dependencies (3)
#   lodash
#   moment
#   chalk
#
# Unused exports (5)
#   src/lib/api.ts: formatDate, parseResponse
#   src/types/index.ts: LegacyUser, OldConfig
#   src/utils/math.ts: calculateTax
#
# Unlisted dependencies (1)
#   dotenv (used in src/config.ts but not in package.json)
```

### Configuration

```json
// knip.json — Customize detection
{
  "entry": ["src/index.ts", "src/server.ts"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": ["**/*.test.ts", "**/*.spec.ts"],
  "ignoreDependencies": ["@types/node"],
  "ignoreBinaries": ["docker"],
  // Framework plugins (auto-detected)
  "next": { "entry": ["pages/**/*.tsx", "app/**/*.tsx"] },
  "vitest": { "entry": ["**/*.test.ts"] }
}
```

### CI Integration

```yaml
# .github/workflows/knip.yml — Fail CI on unused code
name: Unused Code Check
on: [pull_request]

jobs:
  knip:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx knip
```

### Fix Mode

```bash
# Auto-remove unused exports (adds underscore prefix)
npx knip --fix

# Remove unused files
npx knip --fix --allow-remove-files

# Dry run — see what would change
npx knip --fix --dry-run
```

## Examples

### Example 1: Audit a legacy project

**User prompt:** "This project has 200+ files and we're not sure what's still used. Find all dead code."

The agent will run Knip to identify unused files, exports, and dependencies, then categorize results by confidence level and provide a cleanup plan.

### Example 2: Add to CI pipeline

**User prompt:** "Prevent new dead code from being merged. Add a CI check."

The agent will configure Knip with the project's entry points, add a GitHub Actions workflow, and set up framework plugins for accurate detection.

## Guidelines

- **Zero config works** — Knip auto-detects frameworks (Next.js, Remix, Vite, etc.)
- **Framework plugins are key** — they tell Knip about framework-specific entry points
- **Start with `npx knip`** — see what it finds before configuring
- **`--fix` is cautious** — it prefixes unused exports with `_`, doesn't delete
- **`--allow-remove-files` for cleanup** — actually removes orphan files
- **Ignore test files in `ignore`** — tests reference things that aren't "used" by app code
- **`ignoreDependencies` for false positives** — runtime-only deps that Knip can't trace
- **Run before major refactors** — know what's dead before restructuring
- **CI enforcement prevents regression** — new dead code fails the build
