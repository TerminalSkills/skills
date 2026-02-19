---
name: eslint
description: >
  ESLint is the standard linting tool for JavaScript and TypeScript projects. It statically analyzes
  your code to find problems, enforce coding conventions, and catch bugs before they reach production.
  ESLint 9 introduced the flat config format, replacing the legacy `.eslintrc` system with a simpler,
  more composable `eslint.config.js` file. With a rich plugin ecosystem covering React, TypeScript,
  accessibility, and import ordering, ESLint is the backbone of code quality in modern web development.
license: Apache-2.0
compatibility:
  - macos
  - linux
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: linting
  tags:
    - javascript
    - typescript
    - linting
    - code-quality
    - eslint
    - static-analysis
    - react
---

# ESLint — JavaScript and TypeScript Linting

ESLint reads your source code, applies a set of rules, and reports problems ranging from stylistic inconsistencies to genuine bugs. It catches unused variables, missing return statements, inconsistent naming, accessibility violations, and hundreds of other issues that slip past even careful code review.

This skill covers ESLint 9+ with the modern flat config format. If you're starting a new project or migrating from the legacy `.eslintrc` format, flat config is the way forward.

## Installing ESLint

ESLint 9 ships as a single package. TypeScript and React support come from companion plugins.

```bash
# Install ESLint and common plugins for a TypeScript React project
npm install --save-dev eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks
```

## Flat Config Basics

The flat config lives in `eslint.config.js` (or `.mjs`, `.ts`) at your project root. Instead of deeply nested JSON with `extends` and `overrides`, flat config uses an array of configuration objects. Each object applies to files matching its `files` glob pattern.

```javascript
// eslint.config.js — Flat config for a TypeScript project
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // Base JavaScript recommended rules
  js.configs.recommended,

  // TypeScript recommended rules (type-aware)
  ...tseslint.configs.recommended,

  // Custom configuration for source files
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // Warn on console.log left in code
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Enforce consistent return types
      '@typescript-eslint/explicit-function-return-type': 'off',

      // Prevent unused variables (ignore underscore-prefixed)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },

  // Ignore build output and dependencies
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '*.config.js'],
  },
];
```

The flat config is pure JavaScript. You can use conditionals, spread operators, and factory functions to compose configurations. There's no magic — each array element is a config object that gets merged in order.

## Adding React Support

React projects need JSX parsing and rules for hooks. The flat config makes it straightforward to layer these on top of your base configuration.

```javascript
// eslint.config.js — Full config for a React TypeScript project
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // React plugin configuration
  {
    files: ['src/**/*.tsx', 'src/**/*.jsx'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React rules
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+ JSX transform
      'react/prop-types': 'off', // Using TypeScript for prop validation
      'react/jsx-no-target-blank': 'error',

      // Hooks rules — these catch real bugs
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  { ignores: ['dist/', 'node_modules/', '.next/'] },
];
```

## Understanding Rules

Every ESLint rule has three severity levels: `'off'` (0), `'warn'` (1), and `'error'` (2). Warnings appear in your editor but don't fail CI. Errors break the build.

Rules can also take options as a second array element. The pattern is always `[severity, ...options]`.

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
        { selector: 'enum', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
      ],

      // Complexity limits
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
    },
  },
];
```

## Writing Custom Rules

When the built-in rules and plugins don't cover your team's specific conventions, you can write custom rules. ESLint rules are functions that receive an AST node and report problems.

```javascript
// eslint-rules/no-hardcoded-urls.js — Custom rule to prevent hardcoded API URLs
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded API URLs in source files',
    },
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

## Auto-Fix

Many ESLint rules support automatic fixing. The `--fix` flag rewrites your source files to resolve fixable violations — things like adding missing semicolons, removing unused imports, or reordering object keys.

```bash
# Fix all auto-fixable issues
npx eslint --fix src/

# Preview what would change without writing files
npx eslint --fix-dry-run src/

# Fix only specific rules
npx eslint --fix --rule '{"import/order": "error"}' src/
```

In your editor, configure ESLint to fix on save for a seamless experience.

```json
// .vscode/settings.json — Auto-fix ESLint issues on save
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.validate": [
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact"
  ]
}
```

## Running ESLint in CI

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
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx eslint src/ --max-warnings 0
```

The `--max-warnings 0` flag treats warnings as errors in CI. This prevents warning count from growing unbounded while still letting developers see warnings in their editors during development.
