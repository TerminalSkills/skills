---
name: prettier
description: >
  Prettier is an opinionated code formatter that enforces a consistent style across your entire
  codebase. Unlike linters that flag problems for you to fix, Prettier rewrites your code automatically.
  It supports JavaScript, TypeScript, HTML, CSS, JSON, Markdown, YAML, and many other languages.
  By removing style debates from code review, Prettier lets teams focus on logic and architecture
  instead of arguing about tabs versus spaces or trailing commas.
license: Apache-2.0
compatibility:
  - macos
  - linux
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: formatting
  tags:
    - formatting
    - code-style
    - prettier
    - javascript
    - typescript
    - css
    - html
---

# Prettier — Code Formatting

Prettier takes your code and reprints it from scratch according to a fixed set of rules. It parses your source into an AST, discards all original formatting, and outputs a consistently styled version. The result is that every developer on the team produces identically formatted code regardless of their editor or personal preferences.

This skill covers configuring Prettier, integrating it with ESLint, setting up editor support, and enforcing formatting in CI.

## Installing and Configuring Prettier

Prettier works with zero configuration, but most teams customize a few options to match their preferences.

```bash
# Install Prettier as a dev dependency
npm install --save-dev prettier
```

Create a configuration file at the project root. Prettier supports several formats — `.prettierrc.json` is the most common.

```json
// .prettierrc.json — Prettier configuration for a TypeScript project
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "jsxSingleQuote": false
}
```

Each option controls a specific formatting decision. Prettier intentionally keeps the option count small — there are roughly 20 options total. This is by design. Fewer options means fewer debates.

The most impactful options are `printWidth` (line length before wrapping), `singleQuote` (quote style), and `trailingComma` (helps with cleaner git diffs when set to `"all"`).

## Ignoring Files

Not every file should be formatted. Build output, generated code, and certain configuration files often need to be excluded. Create a `.prettierignore` file using the same syntax as `.gitignore`.

```text
# .prettierignore — Files and directories Prettier should skip
dist/
build/
coverage/
node_modules/
.next/

# Generated files
src/generated/
*.min.js
*.min.css

# Lock files
package-lock.json
pnpm-lock.yaml
```

## Editor Integration

Prettier's real power comes from running on every save. When you configure your editor to format on save, you never think about formatting again — you just write code and it snaps into shape.

```json
// .vscode/settings.json — VS Code settings for Prettier format-on-save
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[css]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[markdown]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

Include this in your project's `.vscode/settings.json` and commit it to the repository. This way every developer who opens the project in VS Code automatically gets format-on-save without manual setup.

## Integrating Prettier with ESLint

Prettier and ESLint overlap on formatting rules. Running both without coordination causes conflicts — ESLint might demand semicolons while Prettier removes them, creating an endless loop.

The solution is `eslint-config-prettier`, which disables all ESLint rules that conflict with Prettier. This lets ESLint handle code quality rules while Prettier handles formatting exclusively.

```bash
# Install the ESLint-Prettier integration
npm install --save-dev eslint-config-prettier
```

```javascript
// eslint.config.js — Flat config with Prettier compatibility
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Project-specific rules
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },

  // Prettier config MUST be last — it disables conflicting rules
  prettierConfig,

  { ignores: ['dist/', 'node_modules/'] },
];
```

The order matters. `prettierConfig` must come last in the array so it overrides any formatting rules set by earlier configs.

## Running Prettier from the Command Line

Prettier provides commands for formatting files, checking if files are already formatted, and listing files that would change.

```bash
# Format all supported files in the project
npx prettier --write .

# Check if files are formatted (exits with error code if not) — use this in CI
npx prettier --check .

# Format specific file types
npx prettier --write "src/**/*.{ts,tsx,css,json}"

# See what would change without writing files
npx prettier --list-different .
```

Add these as npm scripts for consistency across the team.

```json
// package.json — Prettier scripts for team usage
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

## CI Enforcement

Formatting should be a required check in your CI pipeline. The `--check` flag verifies that all files are already formatted and exits with a non-zero code if any file needs changes. This catches PRs where the developer forgot to run Prettier.

```yaml
# .github/workflows/format.yml — Prettier check as a CI gate
name: Format
on: [push, pull_request]

jobs:
  prettier:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx prettier --check .
```

When this check fails, the fix is simple: run `npx prettier --write .` locally, commit the changes, and push. Some teams add a pre-commit hook with `husky` and `lint-staged` to prevent unformatted code from being committed in the first place.

```bash
# Install pre-commit tooling
npm install --save-dev husky lint-staged
npx husky init
```

```json
// package.json — lint-staged configuration for pre-commit formatting
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,css,md}": "prettier --write"
  }
}
```

This runs Prettier on every staged file before each commit, ensuring that formatting violations never reach the remote repository.
