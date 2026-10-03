---
name: prettier
description: >
  Prettier is an opinionated code formatter that enforces a consistent style across your entire
  codebase. Unlike linters that flag problems for you to fix, Prettier rewrites your code automatically.
  It supports JavaScript, TypeScript, HTML, CSS, JSON, Markdown, YAML, and many other languages.
  By removing style debates from code review, Prettier lets teams focus on logic and architecture
  instead of arguing about tabs versus spaces or trailing commas.
license: Apache-2.0
compatibility: 'macos, linux, windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/prettier/prettier
  tags:
    - formatting
    - code-style
    - prettier
    - javascript
    - typescript
---

# Prettier — Code Formatting

## Overview

Prettier takes your code and reprints it from scratch according to a fixed set of rules. It parses your source into an AST, discards all original formatting, and outputs a consistently styled version. The result is that every developer on the team produces identically formatted code regardless of their editor or personal preferences.

This skill covers configuring Prettier, integrating it with ESLint, setting up editor support, and enforcing formatting in CI.

## Instructions

### Installing and Configuring Prettier

Prettier works with zero configuration, but most teams customize a few options to match their preferences.

```bash
# Install an exact version: even a patch release can change formatting slightly
npm install --save-dev --save-exact prettier
```

The current Prettier release declares Node.js 14 or newer. Create an empty `.prettierrc` to signal to editors that the project uses Prettier, or fill in a config as below.

Create a configuration file at the project root. Prettier supports a `"prettier"` key in `package.json`, `.prettierrc` (JSON or YAML), `.prettierrc.json/.yml/.yaml/.json5/.toml`, and JavaScript or TypeScript files (`prettier.config.js/.mjs/.cjs/.ts`, `.prettierrc.ts`). TypeScript config files need Node.js 22.6+ (before Node 24.3 run with `--experimental-strip-types`). Use `overrides` for per-file settings, and never put `parser` at the top level — only inside `overrides`, otherwise language detection by file extension is switched off.

```jsonc
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

Each option controls a specific formatting decision. Prettier intentionally keeps the option count small. Defaults in Prettier 3: `printWidth` 80, `tabWidth` 2, `semi` true, `singleQuote` false, `trailingComma` `"all"` (it was `"es5"` before 3.0), `arrowParens` `"always"`, `endOfLine` `"lf"`. Newer options include `objectWrap` (`"preserve"` by default; `"collapse"` joins objects onto one line when they fit) and `experimentalOperatorPosition` (`"end"` by default, `"start"` puts binary operators at the start of the continuation line).

The most impactful options are `printWidth` (line length before wrapping) and `singleQuote` (quote style); most teams keep the other defaults.

### Ignoring Files

Not every file should be formatted. Prettier already skips `node_modules` and version-control folders, and it follows the `.gitignore` in the directory where you run it. Add a `.prettierignore` (same syntax as `.gitignore`) for anything else, such as generated code or lock files. Inside a file, a `// prettier-ignore` comment skips the next node.

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

### Editor Integration

Prettier's real power comes from running on every save. When you configure your editor to format on save, you never think about formatting again — you just write code and it snaps into shape.

```jsonc
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

### Integrating Prettier with ESLint

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

### Running Prettier from the Command Line

Prettier provides commands for formatting files, checking if files are already formatted, and listing files that would change.

```bash
# Format all supported files in the project
npx prettier --write .

# Check if files are formatted (exit code 1 if not, 2 on a Prettier error) — use this in CI
npx prettier --check .

# Format specific file types
npx prettier --write "src/**/*.{ts,tsx,css,json}"

# List the files that would change, without writing
npx prettier --list-different .

# Speed up repeated runs (cache in node_modules/.cache/prettier) and skip unsupported file types
npx prettier --write --cache --ignore-unknown .
```

Add these as npm scripts for consistency across the team.

```jsonc
// package.json — Prettier scripts for team usage
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

### CI Enforcement

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
          node-version: 22
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

```jsonc
// package.json — lint-staged configuration for pre-commit formatting
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,css,md}": "prettier --write --ignore-unknown"
  }
}
```

This runs Prettier on every staged file before each commit, ensuring that formatting violations never reach the remote repository. If you also run ESLint, list it before Prettier, as above. Lefthook is a lighter alternative to husky plus lint-staged for hooks.

## Examples

### Example 1: Adopt Prettier in an existing repo
**Request:** "Add Prettier to our TypeScript service and make CI fail on unformatted code."

```bash
npm install --save-dev --save-exact prettier
echo '{ "singleQuote": true, "printWidth": 100 }' > .prettierrc.json
printf 'dist/\ncoverage/\n' > .prettierignore
npx prettier --write .
npx prettier --check .
```
The `--write` run lists every file it rewrote with a duration (`src/index.ts 42ms`); the final `--check` prints `All matched files use Prettier code style!` and exits 0. Commit the reformatting as its own commit, then add the CI job above.

### Example 2: Stop ESLint and Prettier from fighting
**Request:** "ESLint keeps reporting quote and semicolon errors after Prettier formats the file."

Install `eslint-config-prettier`, import it in `eslint.config.js`, and put it last in the exported array (as shown earlier). The stylistic ESLint rules that clash with Prettier are switched off, and `npx eslint .` reports only real code problems.

## Guidelines

- Pin Prettier to an exact version, and let the editor use the project's local copy so everyone formats identically.
- After upgrading Prettier (or changing options), reformat in one dedicated commit and, if you use `git blame`, list it in `.git-blame-ignore-revs`.
- Prettier formats code; it does not find bugs. Keep ESLint (or Biome) for quality rules and use `eslint-config-prettier`, not the old `eslint-plugin-prettier`, unless you specifically want Prettier differences reported as lint errors.
- Do not put `parser` at the top level of the config; set it per file pattern in `overrides`.
- `--write` rewrites files in place: run it on a clean working tree so the diff is only formatting.
- Commit `.prettierrc*`, `.prettierignore` and the editor settings so the whole team shares them.
