---
name: playwright-testing
description: >-
  Write and maintain end-to-end tests with Playwright. Use when someone asks to
  "add e2e tests", "test my web app", "set up Playwright", "write browser
  tests", "test login flow", "visual regression testing", "test across
  browsers", or "automate UI testing". Covers test setup, page objects,
  authentication, API mocking, visual comparisons, and CI integration.
license: Apache-2.0
compatibility: 'Playwright 1.40+, Node.js 18+. Supports Chromium, Firefox, WebKit.'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - playwright
    - testing
    - e2e
    - browser-testing
    - automation
---

# Playwright Testing

## Overview

This skill helps AI agents write reliable end-to-end tests using Playwright. It covers project setup, writing tests with auto-waiting locators, page object patterns, authentication handling, API mocking, visual regression, accessibility testing, and CI/CD integration.

## Instructions

### Step 1: Project Setup

```bash
npm init playwright@latest
# Or add to existing project:
npm install -D @playwright/test && npx playwright install
```

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Step 2: Write Tests

```typescript
import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('displays hero and navigates to features', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
    await page.getByRole('link', { name: 'View Features' }).click();
    await expect(page).toHaveURL(/.*features/);
  });

  test('shows search results', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Search...').fill('playwright');
    await page.getByPlaceholder('Search...').press('Enter');
    await expect(page.getByTestId('search-results')).toBeVisible();
    await expect(page.getByTestId('search-result-item')).toHaveCount(10);
  });
});
```

### Step 3: Authentication Pattern

```typescript
// tests/auth.setup.ts — authenticate once, reuse across tests
import { test as setup } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/dashboard');
  await page.context().storageState({ path: authFile });
});

// In config: add setup dependency
// projects: [
//   { name: 'setup', testMatch: /.*\.setup\.ts/ },
//   { name: 'chromium', use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/user.json' }, dependencies: ['setup'] },
// ]
```

### Step 4: Page Object Pattern

```typescript
// tests/pages/login.page.ts
import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(private page: Page) {
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.errorMessage = page.getByRole('alert');
  }

  async goto() { await this.page.goto('/login'); }
  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
  async expectError(msg: string) { await expect(this.errorMessage).toContainText(msg); }
}

// tests/login.spec.ts
test.describe('Login', () => {
  let loginPage: LoginPage;
  test.beforeEach(async ({ page }) => { loginPage = new LoginPage(page); await loginPage.goto(); });

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
test('shows error state when API fails', async ({ page }) => {
  await page.route('**/api/projects', (route) => route.fulfill({
    status: 500, contentType: 'application/json',
    body: JSON.stringify({ error: 'Internal server error' }),
  }));
  await page.goto('/dashboard');
  await expect(page.getByText('Failed to load projects')).toBeVisible();
});

test('modify API response for premium features', async ({ page }) => {
  await page.route('**/api/user', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.plan = 'enterprise';
    await route.fulfill({ response, json });
  });
  await page.goto('/settings');
  await expect(page.getByText('Enterprise Plan')).toBeVisible();
});
```

### Step 6: Visual & Accessibility Testing

```typescript
test('homepage visual regression', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png', { fullPage: true, maxDiffPixelRatio: 0.01 });
});
// Update snapshots: npx playwright test --update-snapshots

import AxeBuilder from '@axe-core/playwright';
test('no accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
```

### Step 7: CI Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: playwright-report, path: playwright-report/, retention-days: 30 }
```

### Useful Commands

```bash
npx playwright test                          # Run all tests
npx playwright test tests/login.spec.ts      # Specific file
npx playwright test --headed                 # See browser
npx playwright test --project=chromium       # Specific browser
npx playwright test --debug                  # Step-through debugger
npx playwright codegen http://localhost:3000 # Record actions
npx playwright show-report                   # View HTML report
```

## Examples

### Example 1: Add e2e tests for a login flow with page objects
**User prompt:** "Write Playwright tests for our login page that test successful login, invalid credentials, and form validation, using the page object pattern."

The agent will:
1. Create `tests/pages/login.page.ts` with locators for email, password, submit button, and error message using role-based selectors (`getByLabel`, `getByRole`)
2. Add `goto()`, `login()`, and `expectError()` methods to the page object
3. Write three tests: successful login verifying redirect to `/dashboard`, invalid credentials checking the error alert, and empty form submission checking validation messages
4. Set up `beforeEach` to instantiate the page object and navigate to `/login`

### Example 2: Mock API responses to test error and empty states
**User prompt:** "Add tests for our dashboard that verify it handles API errors gracefully and shows an empty state when there are no projects."

The agent will:
1. Use `page.route('**/api/projects', ...)` to intercept the API call
2. For the error test: fulfill with status 500 and verify the "Failed to load projects" message and Retry button appear
3. For the empty test: fulfill with status 200 and an empty projects array, then verify the "No projects yet" empty state is shown
4. Both tests run in isolation without needing a real backend, making them fast and reliable in CI

## Guidelines

- Use role-based locators (`getByRole`, `getByLabel`, `getByText`) over CSS selectors — more resilient to DOM changes
- Add `data-testid` attributes only when no semantic locator works
- Never use `page.waitForTimeout()` — use auto-waiting locators or `expect` with timeout
- Run auth setup once and share state across tests via `storageState`
- Use page objects for complex pages to keep tests readable
- Mock external APIs in tests — test UI behavior, not third-party services
- Run tests in parallel (`fullyParallel: true`) for speed
- Capture traces on first retry — invaluable for debugging flaky tests in CI
- Use `webServer` config to auto-start your dev server during tests
- Keep visual snapshots in version control and review changes in PRs
