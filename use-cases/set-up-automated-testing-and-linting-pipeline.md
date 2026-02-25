---
title: Set Up Automated Testing and Linting Pipeline
slug: set-up-automated-testing-and-linting-pipeline
description: >
  A team adds automated testing and linting to their Next.js project. They configure Jest for
  unit tests, ESLint for code quality, Prettier for consistent formatting, and GitHub Actions
  to enforce everything on pull requests. By the end, no code merges without passing tests,
  clean linting, and proper formatting.
skills:
  - jest
  - eslint
  - prettier
  - github-actions
category: devops
tags:
  - testing
  - linting
  - formatting
  - ci
  - github-actions
  - next.js
  - automation
---

# Set Up Automated Testing and Linting Pipeline

Your team has a growing Next.js application. Developers submit pull requests with inconsistent formatting, occasional lint violations, and no test requirements. Code review becomes tedious because reviewers spend time pointing out style issues instead of evaluating logic. Bugs slip through because there's no automated test gate.

This walkthrough builds a complete quality pipeline from scratch. You'll configure Jest for unit testing, ESLint for catching code problems, Prettier for formatting enforcement, and GitHub Actions to run all three on every pull request. When you're done, merging requires passing all checks automatically.

## Step 1: Install the Toolchain

Start by installing everything your pipeline needs. A single install command keeps the setup atomic.

```bash
# Install all testing and linting dependencies at once
npm install --save-dev \
  jest ts-jest @types/jest @testing-library/react @testing-library/jest-dom \
  eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks eslint-config-prettier \
  prettier
```

This gives you Jest with TypeScript support and React Testing Library for component tests, ESLint with TypeScript and React plugins, the Prettier-ESLint bridge to prevent rule conflicts, and Prettier itself.

## Step 2: Configure Jest for Next.js

Next.js has specific requirements for Jest — it needs a custom transform for JSX, module path aliases matching `tsconfig.json`, and the jsdom test environment for component tests.

```typescript
// jest.config.ts — Jest configuration tailored for a Next.js TypeScript project
import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterSetup: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/layout.tsx',
    '!src/**/loading.tsx',
    '!src/app/**/page.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default createJestConfig(config);
```

Create the setup file that configures Testing Library matchers.

```typescript
// jest.setup.ts — Global test setup that imports Testing Library matchers
import '@testing-library/jest-dom';
```

Write a first test to verify the setup works end to end.

```typescript
// src/__tests__/components/Button.test.tsx — Verifying Jest works with a React component test
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/Button';

describe('Button component', () => {
  test('renders with the provided label', () => {
    render(<Button label="Submit" onClick={() => {}} />);

    expect(screen.getByRole('button')).toHaveTextContent('Submit');
  });

  test('calls onClick handler when clicked', () => {
    const handleClick = jest.fn();
    render(<Button label="Submit" onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('disables the button when loading', () => {
    render(<Button label="Submit" onClick={() => {}} loading />);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

Run the test to confirm everything is wired up correctly.

```bash
# Run the test suite once
npx jest
```

## Step 3: Configure ESLint with Flat Config

Set up ESLint using the modern flat config format. This config covers TypeScript, React, hooks rules, and Prettier compatibility in a single file.

```javascript
// eslint.config.js — Flat config for a Next.js TypeScript project with Prettier
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
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
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Prettier must be last to override formatting rules
  prettierConfig,

  { ignores: ['dist/', 'node_modules/', '.next/', 'coverage/'] },
];
```

Verify the config works by running ESLint against your source files.

```bash
# Lint all source files and report issues
npx eslint src/
```

## Step 4: Configure Prettier

Create the Prettier configuration and ignore file so formatting is consistent and predictable.

```json
// .prettierrc.json — Formatting rules for the project
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

```text
# .prettierignore — Files Prettier should not format
dist/
.next/
coverage/
node_modules/
package-lock.json
pnpm-lock.yaml
```

Run Prettier once to format the entire codebase. This initial pass brings everything into alignment so future diffs only contain meaningful changes.

```bash
# Format all files in the project
npx prettier --write .
```

## Step 5: Add NPM Scripts

Give your team consistent commands by adding scripts to `package.json`. Every developer runs the same commands regardless of their editor.

```json
// package.json — Scripts section for the complete quality pipeline
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "quality": "npm run format:check && npm run lint && npm run test"
  }
}
```

The `quality` script runs all three checks in sequence — formatting, linting, then tests. Developers can run this before pushing to catch issues locally.

## Step 6: Create the GitHub Actions Workflow

Now wire everything into GitHub Actions. This workflow runs on every push and pull request, executing formatting checks, linting, and tests as parallel jobs.

```yaml
# .github/workflows/quality.yml — Complete quality gate for pull requests
name: Quality

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  format:
    name: Check Formatting
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx prettier --check .

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx eslint src/ --max-warnings 0

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npx jest --ci --coverage --maxWorkers=2

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/lcov-report/
```

The three jobs run in parallel since they're independent. Formatting and linting complete in seconds. Tests take longer but run concurrently, so the total pipeline time equals the slowest job rather than the sum.

## Step 7: Protect the Main Branch

The final step happens in GitHub's repository settings. Navigate to **Settings → Branches → Branch protection rules** and create a rule for `main`.

Enable **Require status checks to pass before merging** and select the three jobs: `Check Formatting`, `Lint`, and `Test`. This makes all three checks mandatory — a pull request cannot be merged until every job passes.

With this protection in place, the pipeline is complete. Every pull request automatically runs formatting verification, linting, and tests. Reviewers no longer need to check for style issues or wonder if tests pass — the green checkmarks tell them. Code review can focus entirely on logic, architecture, and business requirements.
