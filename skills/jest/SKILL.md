---
name: jest
description: >
  Jest is a JavaScript and TypeScript testing framework from the OpenJS Foundation that bundles a test
  runner, assertions, mocking, snapshots and code coverage in one package. Use it when you need to
  write unit tests, mock modules or timers, test async code, enforce coverage thresholds, run tests in
  watch mode, or wire Jest into CI for Node.js, React or TypeScript projects.
license: Apache-2.0
compatibility: 'macos, linux, windows; Node.js 18.14+ (Jest 30)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/jestjs/jest
  tags:
    - javascript
    - testing
    - unit-testing
    - mocking
    - coverage
---

# Jest — JavaScript Testing Framework

## Overview

Jest ships a test runner, `expect` assertions, mocks, snapshots and Istanbul coverage in one package. Current major version is 30 (needs Node 18.14+, 20, 22 or 24+). This skill covers setup for TypeScript, writing tests, mocking, async code, snapshots, coverage and CI.

## Instructions

### Install and configure (TypeScript)

```bash
npm install --save-dev jest ts-jest typescript @types/jest ts-node
```

`ts-node` is needed only so Jest can read `jest.config.ts`. `ts-jest` 29.x supports Jest 29 and 30.

```typescript
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};

export default config;
```

The key is `coverageThreshold` (singular). A misspelling such as `coverageThresholds` only prints a validation warning, and no threshold is enforced.

TypeScript 6 no longer loads every `@types/*` package automatically, so without a `types` entry the globals `describe`, `test`, `expect` and `jest` fail with "Cannot find name". Either list them in `tsconfig.json` or import from `@jest/globals` in each test:

```json
{ "compilerOptions": { "target": "es2022", "module": "commonjs", "esModuleInterop": true, "strict": true, "types": ["jest", "node"] } }
```

Scripts:

```json
{ "scripts": { "test": "jest", "test:watch": "jest --watch", "test:coverage": "jest --coverage" } }
```

Test files match `**/__tests__/**/*.[jt]s?(x)` and `**/?(*.)+(spec|test).[jt]s?(x)` by default. Without ts-jest, `@swc/jest` is a faster transformer and `babel-jest` is built in.

### Assertions

```typescript
// src/math.test.ts
import { add, divide, createUser } from './math';

describe('math', () => {
  test('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });

  test('toEqual compares deeply, toBe compares identity', () => {
    expect(createUser('Alice', 30)).toEqual({ name: 'Alice', age: 30, id: expect.any(String) });
  });

  test('throws on division by zero', () => {
    expect(() => divide(10, 0)).toThrow('Cannot divide by zero');
  });
});
```

### Mocks

```typescript
// src/userService.test.ts
import { UserService } from './userService';
import { database } from './database';

jest.mock('./database'); // auto-mock every export

const mockedDb = jest.mocked(database);

beforeEach(() => jest.clearAllMocks());

test('fetches a user by id', async () => {
  mockedDb.findById.mockResolvedValue({ id: '1', name: 'Alice' });

  const user = await new UserService().getUser('1');

  expect(mockedDb.findById).toHaveBeenCalledWith('1');
  expect(user.name).toBe('Alice');
});

test('rejects when the user is missing', async () => {
  mockedDb.findById.mockResolvedValue(null);
  await expect(new UserService().getUser('999')).rejects.toThrow('User not found');
});
```

- `jest.fn()` makes a standalone mock; `.mockReturnValueOnce()`, `.mockResolvedValue()` and `.mockImplementation()` control it.
- `jest.spyOn(obj, 'method')` wraps a real method; `mockRestore()` puts it back.
- `clearAllMocks` resets call history, `resetAllMocks` also removes implementations, `restoreAllMocks` restores spies. Config keys `clearMocks`, `resetMocks` and `restoreMocks` do this before every test.

### Async code and timers

Always `await` or `return` the promise, otherwise the test ends before the assertion runs.

```typescript
test('retries a failed fetch', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

  const result = await fetchWithRetry('/api/orders', { retries: 3 });

  expect(result.error).toBe('Network error');
  expect(global.fetch).toHaveBeenCalledTimes(4); // first call + 3 retries
});

test('debounced search fires once', () => {
  jest.useFakeTimers();
  const onSearch = jest.fn();
  const search = debounce(onSearch, 300);

  search('jest'); search('jest co');
  jest.advanceTimersByTime(300);

  expect(onSearch).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
```

### Snapshots

```typescript
import { render } from '@testing-library/react';
import { UserCard } from './UserCard';

test('renders the admin card', () => {
  const { container } = render(<UserCard name="Alice Johnson" role="admin" />);
  expect(container).toMatchSnapshot();
});

test('formats an address', () => {
  expect(formatAddress({ street: '123 Main St', city: 'Springfield', state: 'IL' }))
    .toMatchInlineSnapshot(`"123 Main St, Springfield, IL"`);
});
```

Update intentionally changed snapshots with `npx jest --updateSnapshot` (`-u`). Review the snapshot diff in the pull request like any code.

React component tests need `testEnvironment: 'jsdom'` and, since Jest 28, a separate package: `npm install --save-dev jest-environment-jsdom @testing-library/react @testing-library/jest-dom`. Load the matchers in a setup file listed in `setupFilesAfterEnv` with `import '@testing-library/jest-dom'`.

### Coverage, watch mode, filtering

```bash
npx jest --coverage --coverageReporters=text --coverageReporters=lcov
npx jest --watch                       # re-runs tests related to changed files (needs git)
npx jest --testPathPatterns=billing    # Jest 30 name; Jest 29 used --testPathPattern
npx jest -t "retries a failed fetch"   # filter by test name
npx jest --onlyChanged
```

In watch mode press `p` to filter by file name, `t` by test name, `a` to run all.

## Examples

### Example 1: "Add Jest to my TypeScript API and fail CI under 80% coverage"

```bash
npm install --save-dev jest ts-jest typescript @types/jest ts-node
```

Create `jest.config.ts` as above with `coverageThreshold`, then run `npx jest --ci --coverage`. When a threshold is missed Jest exits non-zero and prints, for example, `Jest: Coverage for branches (50%) does not meet "global" threshold (80%)`.

### Example 2: "Test a function that uses setTimeout without waiting"

Use `jest.useFakeTimers()`, trigger the code, then `jest.advanceTimersByTime(ms)` or `jest.runAllTimers()` as in the debounce example. Call `jest.useRealTimers()` afterwards. Result: the test runs in milliseconds and the callback count is exact.

### Example 3: GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx jest --ci --coverage --maxWorkers=2
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/lcov-report/
```

`--ci` makes a missing snapshot fail instead of being written. `--maxWorkers` matches the runner's CPU count. For JUnit XML install `jest-junit` and add `--reporters=default --reporters=jest-junit`.

## Guidelines

- Prefer `toEqual` for objects and arrays, `toBe` for primitives and identity, `toStrictEqual` when `undefined` properties matter.
- `jest.mock` calls are hoisted above imports by babel-jest and ts-jest. In ESM mode (`"type": "module"`) they are not; use `jest.unstable_mockModule` and run with `NODE_OPTIONS=--experimental-vm-modules`, or keep tests in CommonJS.
- Jest 30 removed or renamed several APIs (`--testPathPattern` became `--testPathPatterns`, `jest.genMockFromModule` was removed in favour of `jest.createMockFromModule`, the old `toBeCalled`-style aliases were dropped). Read the Jest 30 upgrade guide when moving from 29.
- Avoid snapshots of large or volatile output; assert on the values that matter.
- Keep tests independent: reset mocks and timers in `beforeEach`/`afterEach`.
- For a project already built with Vite, Vitest is usually less setup than Jest.
