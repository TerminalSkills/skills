---
name: cucumber
description: >-
  Cucumber runs behavior-driven (BDD) tests written as plain-language Gherkin
  feature files and matches each Given/When/Then step to code. Use when the
  user wants to write feature files, implement step definitions in JavaScript
  or TypeScript with cucumber-js, share state through a World, add hooks, tags
  and profiles, or run BDD scenarios in CI. Also use when the user mentions
  "cucumber," "BDD," "Gherkin," "feature files," "given-when-then," "step
  definitions," or "behavior-driven." For contract testing, see pact.
license: Apache-2.0
compatibility: "Node.js 22, 24 or 26+ (cucumber-js 13)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/cucumber/cucumber-js
  tags:
    - bdd
    - gherkin
    - acceptance-testing
    - step-definitions
---

# Cucumber

## Overview

Cucumber executes specifications written in Gherkin: each `Given`/`When`/`Then` line in a `.feature` file is matched to a step definition function, so scenarios double as living documentation that developers, testers and stakeholders can all read. This skill covers cucumber-js (`@cucumber/cucumber`, version 13): feature files, step definitions in TypeScript, the World and hooks, profiles, filtering by tag, and CI.

## Instructions

### Initial Assessment

1. **Language** — JavaScript or TypeScript (this skill covers cucumber-js; other languages have their own Cucumber implementations)
2. **Scope** — API testing, UI testing, or both?
3. **Team** — Who writes feature files? (developers, QA, product)
4. **Existing tests** — Adding BDD to an existing suite or starting fresh?

### Setup (JavaScript)

```bash
# Install Cucumber.js with TypeScript support. Install it per project, never globally.
npm install --save-dev @cucumber/cucumber tsx typescript @types/node
mkdir -p features/step_definitions features/support
```

### Feature File

```gherkin
# features/login.feature
@login
Feature: User login
  As a registered user
  I want to log in to my account
  So that I can reach my dashboard

  Background:
    Given a registered user "dana.reyes@fernhill.dev" with password "Tr4il-Mix-88"

  @smoke
  Scenario: Successful login with valid credentials
    When I log in as "dana.reyes@fernhill.dev" with password "Tr4il-Mix-88"
    Then I should be redirected to "/dashboard"
    And I should see the message "Welcome back"

  Scenario: Failed login with a wrong password
    When I log in as "dana.reyes@fernhill.dev" with password "tr4il-mix"
    Then I should see the error "Invalid credentials"

  Scenario Outline: Login validation
    When I log in as "<email>" with password "<password>"
    Then I should see the error "<error>"

    Examples:
      | email                   | password     | error                |
      |                         | Tr4il-Mix-88 | Email is required    |
      | dana.reyes@fernhill.dev |              | Password is required |
      | not-an-email            | Tr4il-Mix-88 | Invalid email format |
```

### Step Definitions

```typescript
// features/step_definitions/login.steps.ts — maps Gherkin steps to code.
// Use `function`, not arrow functions: Cucumber binds the World to `this`.
import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import type { AppWorld } from '../support/world';

Given('a registered user {string} with password {string}',
  function (this: AppWorld, email: string, password: string) {
    this.auth.register(email, password);
  });

When('I log in as {string} with password {string}',
  function (this: AppWorld, email: string, password: string) {
    this.result = this.auth.login(email, password);
  });

Then('I should be redirected to {string}', function (this: AppWorld, path: string) {
  assert.equal(this.result?.redirect, path);
});

Then('I should see the message {string}', function (this: AppWorld, message: string) {
  assert.equal(this.result?.message, message);
});

Then('I should see the error {string}', function (this: AppWorld, error: string) {
  assert.equal(this.result?.ok, false);
  assert.equal(this.result?.error, error);
});
```

### Hooks and World

```typescript
// features/support/world.ts — a fresh World instance is created for every scenario.
import { setWorldConstructor, World } from '@cucumber/cucumber';
import { AuthService, type LoginResult } from '../../src/auth';

export interface Params { appUrl: string }

export class AppWorld extends World<Params> {
  auth = new AuthService();
  result?: LoginResult;
}

setWorldConstructor(AppWorld);
```

```typescript
// features/support/hooks.ts — setup and teardown around scenarios.
import { After, Before, BeforeAll, Status, setDefaultTimeout } from '@cucumber/cucumber';
import type { AppWorld } from './world';

setDefaultTimeout(10_000); // steps and hooks time out after 5000 ms by default

BeforeAll(async function () {
  // one-time setup; no World here, but this.parameters is available
});

Before({ tags: '@smoke' }, async function (this: AppWorld) {
  this.log(`running against ${this.parameters.appUrl}`);
});

After(async function (this: AppWorld, { result, pickle }) {
  if (result?.status === Status.FAILED) {
    this.attach(JSON.stringify(this.result, null, 2), 'application/json');
    this.log(`failed: ${pickle.name}`);
  }
});
```

### Cucumber Configuration

```javascript
// cucumber.js — profiles for a CommonJS project (no "type": "module" in package.json).
const common = {
  requireModule: ['tsx/cjs'],
  require: ['features/support/**/*.ts', 'features/step_definitions/**/*.ts'],
  worldParameters: { appUrl: process.env.APP_URL || 'http://localhost:3000' },
};

module.exports = {
  default: {
    ...common,
    format: ['progress', ['html', 'reports/cucumber.html']],
  },
  ci: {
    ...common,
    format: ['summary', ['junit', 'reports/cucumber.xml'], ['message', 'reports/cucumber.ndjson']],
    tags: 'not @wip',
    retry: 1,
  },
};
```

In an ESM project (`"type": "module"`), write the profiles as `export default { … }` and `export const ci = { … }`, and load TypeScript with `import: ['./tsx-register.js', 'features/**/*.ts']` instead of `requireModule`/`require`, where `tsx-register.js` contains `import { register } from 'tsx/esm/api'; register()`. Configuration can also live in `cucumber.json`, `cucumber.yaml` or `cucumber.mjs`.

### Running Cucumber

```bash
npx cucumber-js                       # all features (features/**/*.feature), default profile
npx cucumber-js --profile ci          # a named profile
npx cucumber-js --tags "@smoke"       # by tag
npx cucumber-js --tags "@login and not @wip"
npx cucumber-js features/login.feature
npx cucumber-js features/login.feature:12   # the scenario at line 12
npx cucumber-js --name "validation"   # scenarios whose name matches the regex
npx cucumber-js --dry-run             # check that every step has a definition
npx cucumber-js --parallel 4          # worker threads
npx cucumber-js --shard 1/3           # split a run across CI jobs
npx cucumber-js --fail-fast
```

### CI Integration

```yaml
# .github/workflows/cucumber.yml — run BDD tests and keep the reports.
name: BDD Tests
on: [push]
jobs:
  cucumber:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - run: npx cucumber-js --profile ci
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: cucumber-report
          path: reports/
```

## Examples

### Example 1: Add a BDD suite for login to a TypeScript project

User: "Write Cucumber tests for our login service and run them."

Create the feature file, step definitions, World, hooks and `cucumber.js` shown above (the steps call an `AuthService` class in `src/auth.ts` with `register` and `login` methods), then:

```bash
npx cucumber-js
```

```text
.......................

1 hook (1 passed)
5 scenarios (5 passed)
22 steps (22 passed)
0m 0.8s (0m 0.0s executing your code)
```

The outline expands to three scenarios, and `reports/cucumber.html` holds the HTML report. `npx cucumber-js --tags "@smoke" --format pretty` prints the single smoke scenario step by step with a ✔ per step.

### Example 2: Turn a new scenario from the product owner into step stubs

User: "Product added features/cart.feature. What code do I need to write?"

```gherkin
Feature: Cart
  Scenario: Add an item
    Given an empty cart
    When I add 2 units of "SKU-4417"
    Then the cart total should be 59.98
```

```bash
npx cucumber-js features/cart.feature
```

Steps without a definition are reported as undefined, the run exits with code 1, and Cucumber prints ready-to-paste snippets (shortened here: for the number `2` it also prints a second `When` snippet with `{float}` — keep only one of the two, or the step becomes ambiguous):

```text
1 scenario (1 undefined)
4 steps (1 passed, 3 undefined)

You can implement missing steps with the snippets below:

Given('an empty cart', function () {
  // Write code here that turns the phrase above into concrete actions
  return 'pending';
});

When('I add {int} units of {string}', function (int, string) {
  // Write code here that turns the phrase above into concrete actions
  return 'pending';
});

Then('the cart total should be {float}', function (float) {
  // Write code here that turns the phrase above into concrete actions
  return 'pending';
});
```

Paste them into `features/step_definitions/cart.steps.ts`, add types, and replace `return 'pending'` with real code.

## Guidelines

- **Describe behavior, not clicks.** "When I log in as …" survives a redesign; "When I click the blue button" does not. Aim for 3–5 steps per scenario and keep the mechanics inside step definitions.
- **Keep state in the World**, not in module-level variables: every scenario (and every retry) gets a fresh instance, which also makes `--parallel` safe.
- **No arrow functions** for steps and hooks that use `this`; with arrows, import `world` from `@cucumber/cucumber` instead.
- **Use `tsx`, not `ts-node`.** The cucumber-js docs recommend it, and `ts-node/register` crashes with TypeScript 7.
- **Removed options fail the run.** `publishQuiet` / `--publish-quiet` was removed in v12 and the CLI rejects unknown options; delete it from old configs. v13 dropped Node.js 20 and the `Cli` export (use `runCucumber` from `@cucumber/cucumber/api`).
- **Parallel mode** runs `BeforeAll`/`AfterAll` once per worker. For one-time setup such as starting a server, use `BeforeAll({ on: HookTarget.COORDINATOR }, …)` (v13.2+).
- **Reports:** the built-in `json` formatter is in maintenance mode; prefer `message` (NDJSON), `junit` or `html`. On the command line write a formatter with a path as `--format "html":"reports/cucumber.html"`.
- **Retries hide flakiness.** Limit them with `retryTagFilter: '@flaky'` rather than retrying everything.
- **Pending and undefined steps fail the run** (`strict` is on by default); tag unfinished work `@wip` and exclude it with `--tags "not @wip"`.
- **Real credentials** (staging accounts, API tokens) belong in environment variables read in `cucumber.js` or hooks; feature files are shared widely and should only contain seeded test data.
- **When not to use it:** if nobody outside engineering reads the scenarios, plain unit or end-to-end tests are cheaper to maintain than a Gherkin layer.
