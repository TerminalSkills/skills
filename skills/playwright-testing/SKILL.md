---
name: playwright-testing
description: >-
  Write and maintain end-to-end tests with Playwright. Use when someone asks to
  "add e2e tests", "test my web app", "set up Playwright", "write browser tests",
  "test login flow", "visual regression testing", "test across browsers", or
  "automate UI testing". Covers test setup, page objects, authentication, API mocking,
  visual comparisons, and CI integration.
license: Apache-2.0
compatibility: "Playwright 1.40+, Node.js 18+. Supports Chromium, Firefox, WebKit."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["playwright", "testing", "e2e", "browser-testing", "automation", "qa"]
---

# Playwright Testing

## Overview

This skill helps AI agents write reliable end-to-end tests using Playwright. It covers project setup, writing tests with auto-waiting locators, page object patterns, authentication handling, API mocking, visual regression, accessibility testing, and CI/CD integration.

## Instructions

### Step 1: Project Setup

```bash
# Install
npm init playwright@latest

# Or add to existing project
npm install -D @playwright/test
npx playwright install
```

Configuration:

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

### Step 2: Write Tests

Use Playwright's auto-waiting locators — they wait for elements automatically:

```typescript
// tests/homepage.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should display hero section and navigate to features', async ({ page }) => {
    await page.goto('/');

    // Auto-waits for element to be visible
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
    await expect(page.getByText('Start building today')).toBeVisible();

    // Click and verify navigation
    await page.getByRole('link', { name: 'View Features' }).click();
    await expect(page).toHaveURL(/.*features/);
    await expect(page.getByRole('heading', { name: /features/i })).toBeVisible();
  });

  test('should show search results', async ({ page }) => {
    await page.goto('/');

    await page.getByPlaceholder('Search...').fill('playwright');
    await page.getByPlaceholder('Search...').press('Enter');

    // Wait for results to load
    await expect(page.getByTestId('search-results')).toBeVisible();
    const results = page.getByTestId('search-result-item');
    await expect(results).toHaveCount(10);
    await expect(results.first()).toContainText('playwright');
  });
});
```

### Step 3: Authentication Pattern

Set up authenticated state once, reuse across tests:

```typescript
// tests/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect after login
  await expect(page).toHaveURL('/dashboard');

  // Save auth state
  await page.context().storageState({ path: authFile });
});
```

```typescript
// playwright.config.ts — add setup project
projects: [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      storageState: 'tests/.auth/user.json',
    },
    dependencies: ['setup'],
  },
],
```

```typescript
// tests/dashboard.spec.ts — runs authenticated
import { test, expect } from '@playwright/test';

test('dashboard shows user projects', async ({ page }) => {
  await page.goto('/dashboard');
  // Already authenticated via storageState
  await expect(page.getByRole('heading', { name: 'My Projects' })).toBeVisible();
  await expect(page.getByTestId('project-card')).toHaveCount(3);
});
```

### Step 4: Page Object Pattern

```typescript
// tests/pages/login.page.ts
import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.errorMessage = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string) {
    await expect(this.errorMessage).toContainText(message);
  }
}
```

```typescript
// tests/login.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';

test.describe('Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await loginPage.login('test@example.com', 'password123');
    await expect(page).toHaveURL('/dashboard');
  });

  test('invalid credentials show error', async () => {
    await loginPage.login('wrong@example.com', 'wrong');
    await loginPage.expectError('Invalid email or password');
  });
});
```

### Step 5: API Mocking

```typescript
// Mock API responses for isolated UI testing
test('shows error state when API fails', async ({ page }) => {
  await page.route('**/api/projects', (route) => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal server error' }),
    });
  });

  await page.goto('/dashboard');
  await expect(page.getByText('Failed to load projects')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('shows empty state', async ({ page }) => {
  await page.route('**/api/projects', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: [] }),
    });
  });

  await page.goto('/dashboard');
  await expect(page.getByText('No projects yet')).toBeVisible();
});

// Intercept and modify responses
test('modify response data', async ({ page }) => {
  await page.route('**/api/user', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.plan = 'enterprise'; // Override plan for testing premium features
    await route.fulfill({ response, json });
  });

  await page.goto('/settings');
  await expect(page.getByText('Enterprise Plan')).toBeVisible();
});
```

### Step 6: Visual Regression Testing

```typescript
test('homepage visual regression', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});

test('component visual test', async ({ page }) => {
  await page.goto('/components/button');
  const button = page.getByTestId('primary-button');
  await expect(button).toHaveScreenshot('primary-button.png');
});

// Update snapshots: npx playwright test --update-snapshots
```

### Step 7: Accessibility Testing

```typescript
import AxeBuilder from '@axe-core/playwright';

test('homepage has no accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.third-party-widget')
    .analyze();

  expect(results.violations).toEqual([]);
});
```

### Step 8: CI Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

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

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run tests
        run: npx playwright test
        env:
          BASE_URL: http://localhost:3000

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/
          retention-days: 30
```

### Useful Commands

```bash
# Run all tests
npx playwright test

# Run specific file
npx playwright test tests/login.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Run specific browser
npx playwright test --project=chromium

# Debug mode (step through)
npx playwright test --debug

# Generate test code by recording actions
npx playwright codegen http://localhost:3000

# Show HTML report
npx playwright show-report

# Update visual snapshots
npx playwright test --update-snapshots
```

## Best Practices

- Use role-based locators (`getByRole`, `getByLabel`, `getByText`) over CSS selectors — they're more resilient to DOM changes
- Add `data-testid` attributes only when no semantic locator works
- Never use `page.waitForTimeout()` — use auto-waiting locators or `expect` with timeout
- Run auth setup once and share state across tests via `storageState`
- Use page objects for complex pages to keep tests readable
- Mock external APIs in tests — test UI behavior, not third-party services
- Run tests in parallel (`fullyParallel: true`) for speed
- Capture traces on first retry — invaluable for debugging flaky tests in CI
- Use `webServer` config to auto-start your dev server during tests
- Keep visual snapshots in version control and review changes in PRs
