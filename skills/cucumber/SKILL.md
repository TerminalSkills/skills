---
name: cucumber
description: When the user wants to write behavior-driven development (BDD) tests using Gherkin syntax and Cucumber step definitions. Also use when the user mentions "cucumber," "BDD," "Gherkin," "feature files," "given-when-then," "step definitions," or "behavior-driven." For contract testing, see pact.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - bdd
    - gherkin
    - acceptance-testing
    - step-definitions
---

# Cucumber

## Overview

You are an expert in Cucumber and BDD testing. You help users write feature files in Gherkin syntax, implement step definitions in JavaScript/TypeScript or other languages, organize test suites with tags and hooks, and integrate Cucumber into CI. You value well-written scenarios that serve as living documentation — readable by developers, testers, and stakeholders.

## Instructions

### Initial Assessment

1. **Language** — JavaScript/TypeScript, Java, Ruby, or Python?
2. **Scope** — API testing, UI testing, or both?
3. **Team** — Who writes feature files? (developers, QA, product)
4. **Existing tests** — Adding BDD to an existing suite or starting fresh?

### Setup (JavaScript)

```bash
# setup-cucumber.sh — Install Cucumber.js with TypeScript support.
npm install --save-dev @cucumber/cucumber ts-node typescript
mkdir -p features/step_definitions features/support
```

### Feature File

```gherkin
# features/login.feature — Login feature with multiple scenarios.
# Written in Gherkin syntax for non-technical stakeholders.
Feature: User Login
  As a registered user
  I want to log in to my account
  So that I can access my dashboard

  Background:
    Given the application is running
    And the database has been seeded with test users

  Scenario: Successful login with valid credentials
    Given I am on the login page
    When I enter "user@example.com" as the email
    And I enter "password123" as the password
    And I click the login button
    Then I should be redirected to the dashboard
    And I should see "Welcome back" on the page

  Scenario: Failed login with invalid password
    Given I am on the login page
    When I enter "user@example.com" as the email
    And I enter "wrongpassword" as the password
    And I click the login button
    Then I should see an error message "Invalid credentials"
    And I should remain on the login page

  Scenario Outline: Login validation
    Given I am on the login page
    When I enter "<email>" as the email
    And I enter "<password>" as the password
    And I click the login button
    Then I should see an error message "<error>"

    Examples:
      | email              | password    | error                    |
      |                    | password123 | Email is required        |
      | user@example.com   |             | Password is required     |
      | not-an-email       | password123 | Invalid email format     |
```

### Step Definitions

```typescript
// features/step_definitions/login.steps.ts — Step definitions for the login feature.
// Maps Gherkin steps to test automation code.
import { Given, When, Then, Before } from '@cucumber/cucumber';
import { expect } from 'chai';

let app: any;
let currentPage: string;
let pageContent: string;
let errorMessage: string;

Before(async function () {
  app = await startTestApp();
});

Given('the application is running', async function () {
  const health = await app.get('/health');
  expect(health.status).to.equal(200);
});

Given('the database has been seeded with test users', async function () {
  await app.post('/test/seed', {
    users: [{ email: 'user@example.com', password: 'password123' }],
  });
});

Given('I am on the login page', async function () {
  currentPage = '/login';
  const res = await app.get('/login');
  expect(res.status).to.equal(200);
});

When('I enter {string} as the email', async function (email: string) {
  this.email = email;
});

When('I enter {string} as the password', async function (password: string) {
  this.password = password;
});

When('I click the login button', async function () {
  const res = await app.post('/login', {
    email: this.email,
    password: this.password,
  });
  this.response = res;
  if (res.status === 200) {
    currentPage = '/dashboard';
    pageContent = res.data.message;
  } else {
    errorMessage = res.data.error;
  }
});

Then('I should be redirected to the dashboard', function () {
  expect(currentPage).to.equal('/dashboard');
});

Then('I should see {string} on the page', function (text: string) {
  expect(pageContent).to.include(text);
});

Then('I should see an error message {string}', function (message: string) {
  expect(errorMessage).to.equal(message);
});

Then('I should remain on the login page', function () {
  expect(currentPage).to.equal('/login');
});
```

### Hooks and World

```typescript
// features/support/world.ts — Custom World object for sharing state between steps.
// Provides helpers and context available in all step definitions.
import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';

export class CustomWorld extends World {
  app: any;
  authToken: string | null = null;

  constructor(options: IWorldOptions) {
    super(options);
  }

  async authenticate(email: string, password: string) {
    const res = await this.app.post('/login', { email, password });
    this.authToken = res.data.token;
    return res;
  }

  async apiGet(path: string) {
    return this.app.get(path, {
      headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {},
    });
  }
}

setWorldConstructor(CustomWorld);
```

### Cucumber Configuration

```javascript
// cucumber.js — Cucumber.js configuration file.
// Defines profiles for different test environments.
module.exports = {
  default: {
    requireModule: ['ts-node/register'],
    require: ['features/step_definitions/**/*.ts', 'features/support/**/*.ts'],
    format: ['progress', 'html:reports/cucumber.html', 'json:reports/cucumber.json'],
    publishQuiet: true,
  },
  ci: {
    requireModule: ['ts-node/register'],
    require: ['features/step_definitions/**/*.ts', 'features/support/**/*.ts'],
    format: ['json:reports/cucumber.json'],
    tags: 'not @wip',
    publishQuiet: true,
  },
};
```

### Running Cucumber

```bash
# run-cucumber.sh — Common Cucumber commands.
# Run all features, specific tags, or individual scenarios.

# Run all features
npx cucumber-js

# Run with specific profile
npx cucumber-js --profile ci

# Run by tag
npx cucumber-js --tags "@smoke"
npx cucumber-js --tags "@login and not @wip"

# Run specific feature
npx cucumber-js features/login.feature
```

### CI Integration

```yaml
# .github/workflows/cucumber.yml — Run Cucumber BDD tests in CI.
# Publishes HTML report as artifact.
name: BDD Tests
on: [push]
jobs:
  cucumber:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx cucumber-js --profile ci
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: cucumber-report
          path: reports/
```
