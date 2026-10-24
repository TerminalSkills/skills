---
name: biome
description: >-
  Biome is a single Rust-based tool that formats code and lints JavaScript, TypeScript, JSX, JSON and CSS, and sorts imports, as a faster replacement for ESLint plus Prettier. Use when a user wants to set up biome.json, replace ESLint or Prettier, migrate their configs, run lint and format in CI or pre-commit, or configure the VS Code extension.
license: Apache-2.0
compatibility: 'Node.js 14.21+ with npm, pnpm or yarn; standalone binaries also exist (Biome 2.x)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/biomejs/biome
  tags:
    - linter
    - formatter
    - rust
    - eslint-alternative
    - prettier-alternative
---

# Biome — Fast Linter and Formatter (ESLint + Prettier Replacement)

## Overview

Biome (`@biomejs/biome`, current major version 2.x) formats, lints and organizes imports in one native binary with one config file, `biome.json` (or `biome.jsonc`). It covers JavaScript, TypeScript, JSX/TSX, JSON, CSS and more, and it is much faster than ESLint plus Prettier on large repositories. It does not run ESLint plugins, so projects that depend on plugin-specific rules may keep ESLint for those. Version 2 changed the config: import sorting is an "assist" action, `files.ignore` became `files.includes`, and `rules.recommended` became `rules.preset`.

## Instructions

### Install and initialize

```bash
npm install --save-dev --save-exact @biomejs/biome
npx biome init        # writes biome.json with the schema URL of the installed version
```

Pin the exact version: formatting and lint results can change between releases. After upgrading, run `npx biome migrate --write` to update the config to the new schema.

### Configuration

```json
{
  "$schema": "https://biomejs.dev/schemas/2.6.3/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["src/**", "!**/*.gen.ts"] },
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "complexity": { "noForEach": "warn" },
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error",
        "useExhaustiveDependencies": "warn"
      },
      "suspicious": { "noExplicitAny": "warn", "noConsole": "warn" },
      "style": { "noNonNullAssertion": "warn", "useConst": "error" }
    }
  },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100, "lineEnding": "lf" },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "asNeeded", "trailingCommas": "all", "arrowParentheses": "always" }
  }
}
```

Set `$schema` to the installed version (`npx biome --version`). `files.includes` takes globs, and a leading `!` excludes a path; with `vcs.useIgnoreFile` Biome also skips files listed in `.gitignore`. Rule severities are `"off"`, `"info"`, `"warn"` and `"error"`. Rule names change between versions; `npx biome explain <ruleName>` prints the docs for one, and an unknown name makes `biome check` fail with a list of valid keys.

### Commands

```bash
npx biome format --write .      # format only
npx biome lint .                # lint only
npx biome check --write .       # format + lint safe fixes + organize imports
npx biome check --write --unsafe .   # also apply fixes that may change behavior; review the diff
npx biome ci .                  # CI: same checks, never writes, non-zero exit on problems
npx biome check --staged        # only staged files (pre-commit)
npx biome check --changed --since=origin/main   # only files changed against a branch
```

`--fix` is an alias of `--write`. Diagnostics print as `file:line:col lint/<group>/<rule>`; a rule can be silenced on the next line with `// biome-ignore lint/suspicious/noConsole: reason` (a reason is required).

### Migrating from ESLint and Prettier

```bash
npx biome migrate prettier --write     # imports .prettierrc and .prettierignore
npx biome migrate eslint --write       # imports rules from the ESLint config
npx biome check .
```

`migrate eslint` maps rules that have a Biome equivalent and skips the rest, including plugin rules, so read what it printed. In a run against an empty `biome.json` it also set `linter.rules.preset` to `"none"`; set it back to `"recommended"` if you want Biome's default rule set. Afterwards remove `eslint`, `prettier` and their configs and plugins from `package.json`.

### Editor

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  }
}
```

Put this in `.vscode/settings.json` and install the `biomejs.biome` extension. The extension uses the Biome version in the project's `node_modules`.

## Examples

**Request:** "Replace ESLint and Prettier in this React project with Biome."
Run `npm install -D -E @biomejs/biome`, `npx biome init`, `npx biome migrate eslint --write` and `npx biome migrate prettier --write`, then `npx biome check --write .`. Replace the `lint` script with `"lint": "biome check ."` and the CI step with `npx biome ci .`. The first check prints each remaining diagnostic with its rule name and location.

**Request:** "Only check the files I'm about to commit."
Add `"pre-commit": "biome check --write --staged"` to a husky or lefthook hook (or run `npx biome check --staged` in lint-staged). Staged files that fail unfixable rules abort the commit with the diagnostics.

## Guidelines

- Use `biome ci` in CI and `biome check --write` locally; do not run both formatters (Biome and Prettier) on the same files.
- Biome's formatter is close to Prettier but not identical; expect a one-time diff after migrating and commit it on its own.
- Safe fixes apply with `--write`; unsafe fixes need `--unsafe` and a diff review.
- There is no support for custom ESLint plugins; frameworks with their own rules (Vue templates, Svelte, Astro) have partial coverage, so check the language support page before dropping ESLint there.
- With `vcs.useIgnoreFile` enabled Biome stops with an error if the folder has no `.gitignore`; add one or turn the option off.
