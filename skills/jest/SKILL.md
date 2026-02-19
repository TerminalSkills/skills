---
name: jest
description: >
  Jest is a comprehensive JavaScript testing framework built by Meta, designed for zero-configuration
  testing of JavaScript and TypeScript applications. It provides a complete ecosystem for unit testing,
  integration testing, and snapshot testing with built-in code coverage, mocking capabilities, and
  parallel test execution. Jest works seamlessly with React, Node.js, Angular, Vue, and virtually
  any JavaScript project, making it the most widely adopted testing framework in the ecosystem.
license: Apache-2.0
compatibility:
  - macos
  - linux
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: testing
  tags:
    - javascript
    - testing
    - unit-testing
    - mocking
    - coverage
    - snapshot-testing
    - tdd
---

# Jest — JavaScript Testing Framework

Jest brings a batteries-included approach to JavaScript testing. Where other frameworks require you to assemble a test runner, assertion library, and mocking tool separately, Jest ships all three in a single package. You install it, write a test, and run it. That simplicity is why it dominates the JavaScript testing landscape.

This skill walks you through Jest from first principles — writing assertions, mocking dependencies, testing asynchronous code, generating coverage reports, and integrating everything into a CI pipeline.

## Installing and Configuring Jest

Every Jest setup begins with installation and a configuration file. Jest works out of the box for plain JavaScript, but most real projects need a bit of configuration for TypeScript, JSX, or module resolution.

```bash
# Install Jest and its TypeScript support
npm install --save-dev jest ts-jest @types/jest
```

Once installed, create a configuration file at the root of your project. The `jest.config.ts` format gives you type checking on your configuration options.

```typescript
// jest.config.ts — Root Jest configuration for a TypeScript project
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
```

Add test scripts to your `package.json` so your team has consistent commands.

```json
// package.json — Scripts section for Jest commands
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --reporters=default --reporters=jest-junit"
  }
}
```

## Writing Assertions

Jest's `expect` API gives you a fluent interface for asserting values. Every test follows the same pattern: arrange your data, act on it, then assert the result.

```typescript
// src/__tests__/math.test.ts — Basic assertion patterns with Jest matchers
describe('arithmetic operations', () => {
  test('adds two numbers correctly', () => {
    const result = add(2, 3);
    expect(result).toBe(5);
  });

  test('returns an object with computed properties', () => {
    const result = createUser('Alice', 30);

    // toEqual performs deep equality, unlike toBe which checks reference
    expect(result).toEqual({
      name: 'Alice',
      age: 30,
      id: expect.any(String),
    });
  });

  test('array contains specific items', () => {
    const fruits = getFruits();

    expect(fruits).toContain('apple');
    expect(fruits).toHaveLength(3);
    expect(fruits).toEqual(expect.arrayContaining(['apple', 'banana']));
  });

  test('function throws on invalid input', () => {
    expect(() => divide(10, 0)).toThrow('Cannot divide by zero');
    expect(() => divide(10, 0)).toThrow(ArithmeticError);
  });
});
```

## Mock Functions and Module Mocking

Mocking is where Jest truly shines. You can replace any function, module, or timer with a controllable substitute. This lets you test units in complete isolation.

```typescript
// src/__tests__/userService.test.ts — Mocking external dependencies
import { UserService } from '../userService';
import { database } from '../database';

// Replace the entire database module with auto-mocked version
jest.mock('../database');

const mockedDb = jest.mocked(database);

describe('UserService', () => {
  beforeEach(() => {
    // Clear all mock state between tests
    jest.clearAllMocks();
  });

  test('fetches a user by ID from the database', async () => {
    const mockUser = { id: '1', name: 'Alice', email: 'alice@example.com' };
    mockedDb.findById.mockResolvedValue(mockUser);

    const service = new UserService();
    const user = await service.getUser('1');

    expect(mockedDb.findById).toHaveBeenCalledWith('1');
    expect(mockedDb.findById).toHaveBeenCalledTimes(1);
    expect(user).toEqual(mockUser);
  });

  test('throws when user is not found', async () => {
    mockedDb.findById.mockResolvedValue(null);

    const service = new UserService();

    await expect(service.getUser('999')).rejects.toThrow('User not found');
  });
});
```

For more granular control, `jest.fn()` creates standalone mock functions you can pass as callbacks or method implementations.

```typescript
// src/__tests__/eventHandler.test.ts — Using jest.fn() for callback testing
describe('event handler', () => {
  test('calls the callback with processed data', () => {
    const callback = jest.fn();

    processEvents([{ type: 'click', target: 'button' }], callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      type: 'click',
      target: 'button',
      timestamp: expect.any(Number),
    });
  });

  test('mock implementation controls return value', () => {
    const getPrice = jest.fn()
      .mockReturnValueOnce(10.99)
      .mockReturnValueOnce(24.99)
      .mockReturnValue(0);

    expect(getPrice()).toBe(10.99);
    expect(getPrice()).toBe(24.99);
    expect(getPrice()).toBe(0);
  });
});
```

## Testing Asynchronous Code

Modern JavaScript is heavily asynchronous. Jest handles promises, async/await, and callbacks with equal ease. The key is always returning or awaiting the asynchronous operation so Jest knows when the test is done.

```typescript
// src/__tests__/api.test.ts — Patterns for testing async operations
describe('API client', () => {
  test('fetches data with async/await', async () => {
    const data = await fetchUserProfile('alice');

    expect(data.username).toBe('alice');
    expect(data.posts).toBeInstanceOf(Array);
  });

  test('handles API errors gracefully', async () => {
    // Mock fetch to simulate a network failure
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchWithRetry('/api/data', { retries: 3 });

    expect(result.error).toBe('Network error');
    expect(global.fetch).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  test('resolves multiple concurrent requests', async () => {
    const [users, posts] = await Promise.all([
      fetchUsers(),
      fetchPosts(),
    ]);

    expect(users).toHaveLength(10);
    expect(posts).toHaveLength(25);
  });
});
```

## Snapshot Testing

Snapshots capture the output of a component or function and compare it against a saved reference. They are invaluable for catching unintended changes in UI components or serialized data structures.

```typescript
// src/__tests__/components.test.tsx — Snapshot testing for React components
import { render } from '@testing-library/react';
import { UserCard } from '../components/UserCard';

describe('UserCard', () => {
  test('renders correctly with user data', () => {
    const { container } = render(
      <UserCard
        name="Alice Johnson"
        email="alice@example.com"
        role="admin"
      />
    );

    expect(container).toMatchSnapshot();
  });

  test('inline snapshot for small outputs', () => {
    const formatted = formatAddress({
      street: '123 Main St',
      city: 'Springfield',
      state: 'IL',
    });

    expect(formatted).toMatchInlineSnapshot(`"123 Main St, Springfield, IL"`);
  });
});
```

When a snapshot test fails because you intentionally changed the output, update the snapshots with `jest --updateSnapshot`.

## Coverage Reports and Watch Mode

Jest's built-in coverage tool uses Istanbul under the hood. It generates reports showing which lines, branches, functions, and statements your tests exercise.

```bash
# Generate a coverage report in multiple formats
npx jest --coverage --coverageReporters='text' --coverageReporters='lcov'
```

Watch mode is where Jest becomes a development companion. It watches for file changes and re-runs only the tests affected by those changes.

```bash
# Start watch mode — press 'p' to filter by filename, 't' to filter by test name
npx jest --watch
```

Watch mode supports interactive filtering. Press `p` to filter tests by a filename regex, `t` to filter by test name, or `a` to run all tests. This tight feedback loop makes TDD practical even in large codebases.

## CI Integration

In continuous integration, Jest should run with specific flags that optimize for non-interactive environments and produce machine-readable output.

```yaml
# .github/workflows/test.yml — GitHub Actions workflow running Jest
name: Tests
on: [push, pull_request]

jobs:
  test:
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

The `--ci` flag changes snapshot behavior to fail instead of writing new snapshots, preventing accidental snapshot updates in CI. The `--maxWorkers` flag controls parallelism to match your CI runner's CPU count and avoid out-of-memory failures.
