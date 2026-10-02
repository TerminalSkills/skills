---
name: knip
description: >-
  Find and remove unused files, dependencies, and exports in JavaScript/TypeScript
  projects with Knip. Use when someone asks to "find unused code", "clean up
  dependencies", "remove dead code", "find unused exports", "Knip", "reduce
  bundle size by removing unused files", or "audit npm dependencies". Covers
  unused files, dependencies, exports, types, and CI integration.
license: Apache-2.0
compatibility: "Node.js 20.19+ or 22.12+ (Knip 6). TypeScript/JavaScript projects."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/webpro-nl/knip
  category: devops
  tags: ["unused-code", "dependencies", "knip", "cleanup", "dead-code"]
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

Knip reads `knip.json`, `knip.jsonc`, `.knip.json`, `knip.ts` or a `knip` key in `package.json`. Most projects need little: plugins read the framework and tool configs and add entry files themselves.

```jsonc
// knip.json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["src/index.ts", "src/server.ts!"],   // "!" = also an entry in --production mode
  "project": ["src/**/*.{ts,tsx}"],
  "ignoreDependencies": ["@types/node"],
  "ignoreBinaries": ["docker"],
  "ignoreIssues": { "src/generated/**": ["exports", "types"] },
  // Plugin options: override a plugin's entry/config, or set false to disable it
  "next": { "entry": ["app/**/page.tsx"] },
  "vitest": true
}
```

For monorepos, use `workspaces` with one entry per package directory (`"packages/api": { "entry": ["src/main.ts"] }`). Prefer tuning `entry` and `project` over the `ignore` option, which hides every issue in the matched files.

Useful flags: `--production` (skip tests and devDependencies, so code used only by tests is reported), `--strict`, `--include dependencies,exports` / `--exclude types`, `--reporter json`, `--max-issues 10`, `--no-exit-code`.

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
        with:
          node-version: 22
      - run: npm ci
      - run: npx knip
```

### Fix Mode

Commit or stash first: `--fix` rewrites files and `package.json`.

```bash
# Remove the "export" keyword from unused exports and unused dependencies from package.json
npx knip --fix

# Also delete unused files
npx knip --fix --allow-remove-files

# Fix only some issue types: dependencies, exports, types, files, catalog
npx knip --fix-type exports,types

# Format touched files with the project's formatter
npx knip --fix --format
```

There is no dry-run flag; review the plain `npx knip` report, then use `git diff` after fixing. After removing dependencies, run your package manager's install to refresh the lockfile.

## Examples

### Example 1: Audit a legacy project

**User prompt:** "This project has 200+ files and we're not sure what's still used. Find all dead code."

```bash
git status --short            # confirm a clean tree
npx knip --reporter json > knip-report.json   # machine-readable
npx knip                      # human-readable report
```

The report lists Unused files, Unused dependencies, Unused devDependencies, Unlisted dependencies and Unused exports. The agent checks suspicious entries (a "unused" file that a framework loads by convention means a missing entry pattern), fixes config, re-runs, then applies `npx knip --fix-type dependencies` and reviews `git diff package.json`.

### Example 2: Add to CI pipeline

**User prompt:** "Prevent new dead code from being merged. Add a CI check."

The agent runs `npm install -D knip`, adds `"knip": "knip"` to `package.json` scripts, creates `knip.json` with the real entry files, confirms `npm run knip` exits 0 (or sets `--max-issues` to the current count to ratchet down), and adds the workflow above. A PR that leaves an unused export now fails with exit code 1 and the file listed.

## Guidelines

- **Zero config works**: Knip detects frameworks and tools (Next.js, Vite, Vitest, ESLint, ...) from `package.json` and enables their plugins.
- **Start with `npx knip`** and read the report before configuring anything; most false positives are a missing entry file or a disabled plugin, not a reason to ignore.
- **`--fix` removes code**: it strips `export` keywords and dependencies (it does not rename with an underscore). Files go only with `--allow-remove-files`. Always work on a clean git tree.
- **Prefer `entry`/`project` over `ignore`**; use `ignoreDependencies` only for packages loaded in ways Knip cannot trace (runtime-only, CLI-invoked).
- **Test files are entries**, via the test-runner plugins; run `--production` to see what only tests keep alive.
- **Public libraries**: exports of the package entry are API, not unused; keep them in `entry`.
- **CI enforcement** with `npx knip` (non-zero exit on issues) stops regressions; use `--max-issues` to adopt gradually on a legacy codebase.
