---
name: oxlint
description: >-
  Lint JavaScript/TypeScript at blazing speed with oxlint — a Rust-based linter
  50-100x faster than ESLint. Use when someone asks to "speed up linting",
  "oxlint", "fast JavaScript linter", "replace ESLint", "Rust linter for JS",
  or "lint in CI faster". Covers rule configuration, ESLint migration,
  framework plugins, and CI integration.
license: Apache-2.0
compatibility: "Linux, macOS, Windows. JavaScript/TypeScript/JSX/TSX. The npm package needs Node.js 20.19+ or 22.12+; the Homebrew binary needs no Node.js."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/oxc-project/oxc
  category: devops
  tags: ["linting", "oxlint", "rust", "eslint", "code-quality"]
---

# oxlint

## Overview

oxlint is a JavaScript/TypeScript linter written in Rust — 50-100x faster than ESLint. It runs without Node.js, handles thousands of files in milliseconds, and implements the most common ESLint rules (correctness, suspicious, pedantic). Use it alongside ESLint (for rules oxlint doesn't cover yet) or as a standalone fast linter for CI.

## When to Use

- ESLint taking 30+ seconds in CI — oxlint runs in <1 second
- Large monorepos where linting is the CI bottleneck
- Want instant feedback in pre-commit hooks
- Need basic correctness checks without Node.js setup
- Transitioning from ESLint gradually

## Instructions

### Setup

```bash
# Per project (recommended): pins the version for everyone
npm install -D oxlint

# Standalone binary, no Node.js needed
brew install oxlint

npx oxlint --version      # checked against 1.86.0
npx oxlint --init         # writes a starter .oxlintrc.json
```

### Basic Usage

```bash
npx oxlint                       # lint the current directory (respects .gitignore)
npx oxlint src/ tests/           # specific paths
npx oxlint --fix src/            # apply safe fixes only
npx oxlint --fix-suggestions src/   # also apply suggestions (may change behavior)
npx oxlint -D correctness -W suspicious .   # categories on the command line
npx oxlint --deny-warnings .     # warnings fail the build
npx oxlint -f github .           # output format: default, github, gitlab, json, junit, sarif, stylish, unix, checkstyle
npx oxlint --rules               # list registered rules
```

By default only the `correctness` category is enabled (as errors). Other categories are `suspicious`, `pedantic`, `perf`, `style`, `restriction` and `nursery`.

### Configuration

Oxlint reads `.oxlintrc.json` (comments allowed), `.oxlintrc.jsonc`, or `oxlint.config.ts` (Node 22.18+ or 24+, npm package only) from the working directory. The format follows ESLint v8's `eslintrc` shape.

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "react", "import"],
  "categories": { "correctness": "error", "suspicious": "warn" },
  "rules": {
    "eqeqeq": "error",
    "no-var": "error",
    "prefer-const": "warn",
    "no-console": "warn",
    "no-debugger": "error"
  },
  "overrides": [
    { "files": ["**/*.test.ts"], "rules": { "no-console": "off" } }
  ],
  "ignorePatterns": ["dist/", "coverage/"]
}
```

Notes: setting `plugins` replaces the default list (`typescript`, `unicorn`, `oxc`), so list every plugin you want. Rules from non-core plugins are namespaced, for example `"typescript/no-explicit-any": "warn"` and `"react/rules-of-hooks": "error"`. `ignorePatterns` complements `.gitignore`, which is honored automatically.

### Type-aware rules

```bash
npm install -D oxlint-tsgolint@latest
npx oxlint --type-aware
```

Or set `"options": { "typeAware": true }` in the root config only. It covers most typescript-eslint type-aware rules (such as no-floating-promises) and needs resolvable types, so build workspace packages first in a monorepo.

### Migrate from ESLint

```bash
npx @oxlint/migrate                 # converts an ESLint v9+ flat config to .oxlintrc.json
npx @oxlint/migrate --type-aware    # keep typescript-eslint type-aware rules
```

ESLint v8 `.eslintrc` files must first be converted to a flat config. ESLint plugins that Oxlint lacks natively can be kept through `jsPlugins` (alpha). To run both linters during the transition:

```json
{ "scripts": { "lint": "oxlint && eslint .", "lint:fast": "oxlint" } }
```

```bash
npm install -D eslint-plugin-oxlint
```

```javascript
// eslint.config.js
import oxlint from "eslint-plugin-oxlint";

export default [
  // ...your ESLint config
  ...oxlint.configs["flat/recommended"],   // keep last: turns off rules Oxlint already runs
];
```

### CI Integration

```yaml
# .github/workflows/lint.yml
name: Lint
on: [pull_request]
permissions: {}
jobs:
  oxlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
      - run: npm ci
      - run: npx oxlint --deny-warnings
```

Oxlint switches to GitHub annotations automatically inside Actions. For GitLab use `--format=gitlab > gitlab-oxlint-report.json` as a Code Quality artifact.

### Pre-commit Hook

```bash
npm install -D lint-staged
```

```json
{ "lint-staged": { "*.{js,jsx,ts,tsx,mjs,cjs}": "oxlint --fix" } }
```

`pre-commit` users can use the `https://github.com/oxc-project/mirrors-oxlint` repository (hook id `oxlint`, pin `rev` to a release tag).

## Examples

### Example 1: Speed up CI linting

**User prompt:** "Our ESLint step takes 45 seconds in CI. Make it faster."

The agent installs oxlint, runs `npx @oxlint/migrate` to convert the flat config, adds `eslint-plugin-oxlint` so ESLint skips rules Oxlint covers, and changes the CI step to `oxlint --deny-warnings && eslint .`. The log shows Oxlint finishing in well under a second and ESLint only running the leftover rules.

### Example 2: Set up linting for a new project

**User prompt:** "Set up linting for my TypeScript project. I want it fast."

The agent runs `npx oxlint --init`, enables `correctness` as errors and `suspicious` as warnings, adds a `lint` script and a lint-staged hook, and writes a GitHub Actions job that runs `npx oxlint --deny-warnings`. A first run prints findings like `src/a.js:3:7: error eslint(eqeqeq): Expected === and instead saw ==` and exits 1.

## Guidelines

- **Run oxlint before ESLint** - it catches common issues in milliseconds.
- **Start with `correctness`** (the default), add `suspicious` as warnings, and only then try `pedantic` or `style`.
- **`--fix` is safe by default**; `--fix-suggestions` and `--fix-dangerously` can change behavior, so review the diff.
- **`--deny-warnings` or `--max-warnings`** in CI, otherwise warnings never fail a build.
- **Declare `plugins` explicitly** - the list replaces the defaults, and a rule from a plugin that is not enabled is silently inactive.
- **Not a complete ESLint replacement** - check the compatibility matrix at oxc.rs for the plugins you rely on, and use `jsPlugins` or ESLint for the rest.
- **Nested configs** are picked up automatically in monorepos; `-c` disables that lookup. `typeAware` options belong in the root config only.
- **`oxlint.config.ts` needs the npm package and a Node that runs TypeScript**; the standalone binary reads JSON configs only.
