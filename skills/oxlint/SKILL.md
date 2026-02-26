---
name: oxlint
description: >-
  Lint JavaScript/TypeScript at blazing speed with oxlint — a Rust-based linter
  50-100x faster than ESLint. Use when someone asks to "speed up linting",
  "oxlint", "fast JavaScript linter", "replace ESLint", "Rust linter for JS",
  or "lint in CI faster". Covers rule configuration, ESLint migration,
  framework plugins, and CI integration.
license: Apache-2.0
compatibility: "Any OS. JavaScript/TypeScript/JSX/TSX. No Node.js required."
metadata:
  author: terminal-skills
  version: "1.0.0"
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
# Install
npm install -D oxlint

# Or standalone binary via Homebrew (no Node.js needed)
brew install oxlint
```

### Basic Usage

```bash
# Lint entire project
npx oxlint .

# Lint specific files/directories
npx oxlint src/

# Fix auto-fixable issues
npx oxlint --fix src/

# Specific rule categories
npx oxlint --deny-warnings -D correctness -D suspicious .
```

### Configuration

```json
// .oxlintrc.json — Rule configuration
{
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "warn",
    "eqeqeq": "error",
    "no-var": "error",
    "prefer-const": "warn",
    "no-debugger": "error"
  },
  "plugins": ["typescript", "react", "import"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "pedantic": "off"
  },
  "ignorePatterns": ["dist/", "node_modules/", "*.config.*"]
}
```

### Use Alongside ESLint

```json
// package.json — Run oxlint first (fast), then ESLint (thorough)
{
  "scripts": {
    "lint": "oxlint . && eslint .",
    "lint:fast": "oxlint ."
  }
}
```

```bash
# In eslint.config.js — disable rules that oxlint covers
# eslint-plugin-oxlint does this automatically
npm install -D eslint-plugin-oxlint
```

```javascript
// eslint.config.js
import oxlint from "eslint-plugin-oxlint";

export default [
  // Your ESLint config...
  oxlint.configs["flat/recommended"],  // Disables ESLint rules covered by oxlint
];
```

### CI Integration

```yaml
# .github/workflows/lint.yml
name: Lint
on: [pull_request]

jobs:
  oxlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oxc-project/oxlint-action@v0
        with:
          deny-warnings: true
```

### Pre-commit Hook

```bash
# With lint-staged (runs in ~100ms even on large projects)
npm install -D lint-staged

# .lintstagedrc
{
  "*.{ts,tsx,js,jsx}": "oxlint --fix"
}
```

## Examples

### Example 1: Speed up CI linting

**User prompt:** "Our ESLint step takes 45 seconds in CI. Make it faster."

The agent will add oxlint for fast first-pass linting, disable overlapping ESLint rules with eslint-plugin-oxlint, and parallelize the remaining ESLint checks.

### Example 2: Set up linting for a new project

**User prompt:** "Set up linting for my TypeScript project. I want it fast."

The agent will configure oxlint with correctness + suspicious rules, add pre-commit hooks with lint-staged, and set up CI with the oxlint GitHub Action.

## Guidelines

- **Run oxlint before ESLint** — catch common issues instantly
- **`eslint-plugin-oxlint`** — prevents duplicate rule checking
- **`--fix` for auto-fixes** — works for many rules
- **Categories: correctness > suspicious > pedantic** — start with correctness
- **No config needed** — sensible defaults work for most projects
- **Pre-commit hooks** — fast enough for every commit (<500ms)
- **Not a full ESLint replacement (yet)** — missing some plugin ecosystems
- **Binary distribution** — no Node.js runtime needed for CI runners
- **TypeScript support built-in** — no @typescript-eslint setup required
