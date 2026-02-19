---
name: biome
description: >-
  Assists with formatting and linting JavaScript, TypeScript, JSX, JSON, and CSS using Biome.
  Use when replacing ESLint and Prettier with a single fast tool, configuring lint rules,
  setting up CI checks, or migrating from existing linter configurations. Trigger words:
  biome, linter, formatter, code quality, lint, eslint replacement.
license: Apache-2.0
compatibility: "Requires Node.js 16+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["biome", "linter", "formatter", "code-quality", "typescript"]
---

# Biome

## Overview

Biome is a fast all-in-one formatter and linter for JavaScript, TypeScript, JSX, JSON, and CSS that replaces ESLint and Prettier with a single tool. It offers 300+ lint rules with auto-fix, formats 10K-file monorepos in under a second, and requires minimal configuration with sensible defaults.

## Instructions

- When setting up Biome, run `biome init` to generate `biome.json` with recommended defaults, then configure `indentStyle`, `lineWidth`, and `quoteStyle` to match team preferences.
- When running checks, use `biome check` for combined lint and format verification, `biome check --fix` for auto-fixing, and `biome ci` in CI pipelines for strict validation without fixes.
- When migrating from ESLint, run `biome migrate eslint` to automatically map ESLint rules, and `biome migrate prettier` to carry over formatter settings.
- When customizing rules, start with `"recommended": true` and disable specific rules only with documented reasons, using per-directory overrides for different rules in tests versus source.
- When integrating with editors, install the Biome VS Code extension or IntelliJ plugin for format-on-save and inline diagnostics.
- When setting up pre-commit hooks, use `biome check --fix` via `husky` or `lefthook` to fix issues before they reach CI.

## Examples

### Example 1: Replace ESLint and Prettier with Biome

**User request:** "Migrate my project from ESLint + Prettier to Biome"

**Actions:**
1. Run `biome migrate eslint` and `biome migrate prettier` to generate `biome.json`
2. Remove ESLint and Prettier configs, dependencies, and scripts
3. Update CI pipeline to use `biome ci` for combined lint and format checks
4. Configure VS Code settings to use Biome as default formatter

**Output:** A project using Biome as the single code quality tool, with faster checks and simpler configuration.

### Example 2: Set up Biome in a monorepo with pre-commit hooks

**User request:** "Configure Biome for a monorepo with different rules for apps and packages"

**Actions:**
1. Create root `biome.json` with `"recommended": true` and shared settings
2. Add per-directory overrides for test files (relaxed rules) and packages (strict rules)
3. Set up `lefthook` with `biome check --fix` on pre-commit
4. Add `biome ci` to the CI pipeline with `files.ignore` for generated code

**Output:** A monorepo with consistent code quality, auto-fix on commit, and strict CI validation.

## Guidelines

- Use `biome ci` in CI pipelines since it checks formatting and linting in one pass and fails fast.
- Start with `"recommended": true` and disable specific rules only with documented justification.
- Run `biome migrate eslint` to transition from ESLint since Biome maps most rules automatically.
- Use `biome check --fix` in pre-commit hooks to fix issues before they reach CI.
- Keep `biome.json` minimal since the defaults are well-chosen; override only what the team genuinely disagrees with.
- Enable organize imports since Biome sorts imports faster than ESLint plugins.
