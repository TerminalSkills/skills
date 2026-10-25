---
name: eslint
description: >
  ESLint is the standard linting tool for JavaScript and TypeScript projects. It statically analyzes
  your code to find problems, enforce coding conventions, and catch bugs before they reach production.
  Flat config (`eslint.config.js`) is the only config format in ESLint 10; the legacy `.eslintrc`
  system is gone. Use for setting up linting, migrating from `.eslintrc`, TypeScript and React rules,
  custom rules, auto-fix, and CI lint checks.
license: Apache-2.0
compatibility: 'Node.js 20.19+, 22.13+ or 24+ (ESLint 10); macOS, Linux, Windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/eslint/eslint
  tags: "javascript, typescript, linting, code-quality"
---

# ESLint — JavaScript and TypeScript Linting

## Overview

ESLint reads your source code, applies a set of rules, and reports problems ranging from stylistic inconsistencies to genuine bugs. It catches unused variables, missing return statements, inconsistent naming, accessibility violations, and hundreds of other issues that slip past even careful code review.

This skill covers flat config, which works in ESLint 9 and 10. ESLint 10 (current, 10.13) requires Node.js 20.19+, 22.13+ or 24+ and no longer reads `.eslintrc*` files. Migrating an old project: `npx @eslint/migrate-config .eslintrc.json` writes a starting `eslint.config.mjs`; review it by hand.

## Instructions

### Installing ESLint

The fastest start is the wizard, which asks about your framework and installs the right packages: `npm init @eslint/config@latest`. To install by hand for a TypeScript project:

```bash
npm install --save-dev eslint @eslint/js typescript-eslint
# React projects also need the hooks plugin; add eslint-plugin-react if you want its JSX rules
npm install --save-dev eslint-plugin-react-hooks
```

Two compatibility traps as of October 2026:

- `typescript-eslint` 8.x supports TypeScript below 6.1 only, so a TypeScript 7 project must keep the linter on an older `typescript` for now.
- `eslint-plugin-react` 7.37.5 declares ESLint `^9.7` at most, so `npm install` fails on ESLint 10 with an ERESOLVE error. Either pin `eslint@9` (the config below works unchanged) or leave that plugin out; `eslint-plugin-react-hooks` 7 already supports 10.

### Flat Config Basics

The flat config lives in `eslint.config.js` (or `.mjs`, `.ts`) at your project root. Instead of deeply nested JSON with `extends` and `overrides`, flat config uses an array of configuration objects. Each object applies to files matching its `files` glob pattern.

The examples use `import` syntax, so a file named `eslint.config.js` needs `"type": "module"` in `package.json` (otherwise ESLint stops with "Cannot use import statement outside a module"); `eslint.config.mjs` works without it. The same applies to the custom rule file below.

```javascript
// eslint.config.js — Flat config for a TypeScript project
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // Ignore build output (a block with only `ignores` is global)
  globalIgnores(['dist/', 'coverage/']),

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // Warn on console.log left in code
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Unused variables are errors unless prefixed with an underscore
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
]);
```

`node_modules/` is ignored by default. For rules that need type information (`no-floating-promises`, `no-unsafe-*`), use `tseslint.configs.recommendedTypeChecked` and turn on the project service, which finds your `tsconfig.json` by itself:

```javascript
// Added to the array above
{
  files: ['**/*.{ts,tsx}'],
  languageOptions: {
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
},
// Plain JS files such as eslint.config.js are not in a tsconfig; skip type-aware rules there
{ files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
```

The flat config is plain JavaScript: each array element is a config object, merged in order.

### Adding React Support

React projects need JSX parsing and rules for hooks. The flat config makes it straightforward to layer these on top of your base configuration.

```javascript
// eslint.config.js — React TypeScript project
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react'; // needs ESLint 9, see the install notes
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/', '.next/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,

  {
    files: ['src/**/*.{jsx,tsx}'],
    plugins: { react },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/jsx-no-target-blank': 'error',
    },
  },
]);
```

`reactHooks.configs.flat.recommended` enables `rules-of-hooks` and `exhaustive-deps`. Version 7 of the plugin also ships React Compiler based rules in that preset (for example `react-hooks/set-state-in-effect`), which flag code that older versions accepted. Without `eslint-plugin-react`, drop the `react` lines and keep the rest.

### Understanding Rules

Rule severities are `'off'` (0), `'warn'` (1) and `'error'` (2); errors fail the run, warnings do not. Options go in an array: `[severity, ...options]`.

```javascript
// eslint.config.js — Examples of rule configuration patterns
export default [
  {
    files: ['src/**/*.ts'],
    rules: {
      // Simple on/off
      'no-debugger': 'error',

      // Rule with options
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['../../*'],
          message: 'Use path aliases (@/) instead of relative imports above two levels.',
        }],
      }],

      // Naming conventions via TypeScript plugin
      '@typescript-eslint/naming-convention': ['error',
        { selector: 'interface', format: ['PascalCase'] },
        { selector: 'typeAlias', format: ['PascalCase'] },
      ],

    },
  },
];
```

### Writing Custom Rules

When the built-in rules and plugins don't cover your team's specific conventions, you can write custom rules. ESLint rules are functions that receive an AST node and report problems.

```javascript
// eslint-rules/no-hardcoded-urls.js — Custom rule to prevent hardcoded API URLs
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded API URLs in source files',
    },
    schema: [], // required in ESLint 9+ if the rule takes options; [] means none
    messages: {
      hardcodedUrl: 'Use environment variables instead of hardcoded URLs. Found: "{{url}}"',
    },
  },
  create(context) {
    const urlPattern = /^https?:\/\/(api|staging|prod)\./;

    return {
      Literal(node) {
        if (typeof node.value === 'string' && urlPattern.test(node.value)) {
          context.report({
            node,
            messageId: 'hardcodedUrl',
            data: { url: node.value },
          });
        }
      },
    };
  },
};
```

Register the custom rule in your flat config using the `plugins` field.

```javascript
// eslint.config.js — Registering a custom rule
import noHardcodedUrls from './eslint-rules/no-hardcoded-urls.js';

export default [
  {
    files: ['src/**/*.ts'],
    plugins: {
      custom: {
        rules: {
          'no-hardcoded-urls': noHardcodedUrls,
        },
      },
    },
    rules: {
      'custom/no-hardcoded-urls': 'error',
    },
  },
];
```

### Auto-Fix

`--fix` rewrites files to resolve fixable violations.

```bash
# Fix all auto-fixable issues
npx eslint --fix src/

# Apply only some kinds of fix (directive, problem, suggestion, layout)
npx eslint --fix --fix-type problem,suggestion src/

# Preview without writing: npx eslint --fix-dry-run -f json src/
```

In VS Code, the ESLint extension can fix on save:

```jsonc
// .vscode/settings.json — Auto-fix ESLint issues on save
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

### Running ESLint in CI

In continuous integration, ESLint should run as a blocking check. Any error-level violation fails the pipeline, preventing the code from being merged.

```yaml
# .github/workflows/lint.yml — ESLint as a required CI check
name: Lint
on: [push, pull_request]

jobs:
  eslint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npx eslint src/ --max-warnings 0
```

The `--max-warnings 0` flag treats warnings as errors in CI. This prevents warning count from growing unbounded while still letting developers see warnings in their editors during development.

## Examples

### Example 1: "Add ESLint to my Vite React TypeScript app"

```bash
npm install --save-dev eslint @eslint/js typescript-eslint eslint-plugin-react-hooks
# create eslint.config.js from the React section above, then:
npx eslint src/
```

Result: `src/a.tsx  4:9  error  'unused' is assigned a value but never used  @typescript-eslint/no-unused-vars` and a `react-hooks/exhaustive-deps` warning for a missing effect dependency; exit code 1 on errors.

### Example 2: "We have 3,000 errors after enabling the strict preset"

Bulk suppressions (ESLint 9.24+) record current violations in `eslint-suppressions.json`, so CI fails only on new ones:

```bash
npx eslint --suppress-all src/        # writes eslint-suppressions.json
npx eslint --prune-suppressions src/  # after fixing some, drop entries that no longer apply
```

Commit the file and shrink it over time. Running `npx eslint src/` afterwards exits 0.

## Guidelines

- Run `npx eslint --print-config src/index.ts` to see the exact merged config for one file when a rule does not behave as expected; `npx eslint --inspect-config` opens a visual inspector.
- Later config objects override earlier ones: put your rules after presets.
- Use `// eslint-disable-next-line rule-name -- reason` for one line, not file-wide disables.
- Leave formatting to a formatter such as Prettier.
