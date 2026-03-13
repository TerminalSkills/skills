---
name: biome
description: >-
   You are an expert in Biome, the Rust-based toolchain that replaces ESLint
  and Prettier with a single, fast tool. You help developers configure
  linting, formatting, and import sorting for JavaScript, TypeScript, JSX,
  JSON, and CSS — achieving 100x faster execution than ESLint+Prettier with
  zero configuration, unified diagnostics, and IDE integration.
category: Developer Tools
tags: [linter, formatter, rust, fast, eslint-alternative, prettier-alternative]
version: 1.0.0
author: terminal-skills
---

# Biome — Fast Linter and Formatter (ESLint + Prettier Replacement)

You are an expert in Biome, the Rust-based toolchain that replaces ESLint and Prettier with a single, fast tool. You help developers configure linting, formatting, and import sorting for JavaScript, TypeScript, JSX, JSON, and CSS — achieving 100x faster execution than ESLint+Prettier with zero configuration, unified diagnostics, and IDE integration.

## Core Capabilities

### Configuration

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noForEach": "warn",
        "useSimplifiedLogicExpression": "warn"
      },
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error",
        "useExhaustiveDependencies": "warn"
      },
      "suspicious": {
        "noExplicitAny": "warn",
        "noConsoleLog": "warn"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useConst": "error"
      },
      "nursery": {
        "useSortedClasses": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always"
    }
  },
  "files": {
    "ignore": ["node_modules", "dist", ".next", "*.gen.ts"]
  }
}
```

### Usage

```bash
# Format
biome format --write .

# Lint
biome lint .

# Both + import sorting
biome check --write .

# CI (check without writing)
biome ci .

# Migrate from ESLint/Prettier
biome migrate eslint --write
biome migrate prettier --write
```

### IDE Integration

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  }
}
```

## Installation

```bash
npm install -D @biomejs/biome
npx @biomejs/biome init                   # Generate biome.json
```

## Best Practices

1. **Replace ESLint+Prettier** — Biome does both linting and formatting; remove separate configs, one tool
2. **`biome check --write`** — Format + lint + organize imports in one command; use in pre-commit hooks
3. **`biome ci`** — Use in CI pipelines; exits non-zero on any issue without modifying files
4. **Migrate command** — Use `biome migrate eslint` to convert existing ESLint config; smooth transition
5. **Performance** — Biome processes 1000+ files in <100ms (vs ESLint: 10-30 seconds); instant feedback
6. **Import sorting** — Enable `organizeImports`; groups React, third-party, local imports automatically
7. **Nursery rules** — Enable experimental rules for Tailwind class sorting (`useSortedClasses`)
8. **Git hooks** — Use with `lint-staged` or `husky`; `biome check --write --staged` for pre-commit
