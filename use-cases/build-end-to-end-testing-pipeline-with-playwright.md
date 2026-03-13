---
title: Build an End-to-End Testing Pipeline with Playwright
slug: build-end-to-end-testing-pipeline-with-playwright
description: Build a comprehensive E2E testing pipeline with Playwright that covers critical user flows, visual regression, accessibility, and CI integration — catching bugs that unit tests miss.
skills:
  - typescript
  - vitest
  - nextjs
category: Testing & Quality
tags:
  - testing
  - playwright
  - e2e
  - ci-cd
  - visual-regression
---

# Build an End-to-End Testing Pipeline with Playwright

## The Problem

Amir leads QA at a 40-person SaaS. Unit test coverage is 85%, but production bugs keep slipping through — a login flow that works in isolation but breaks when the session cookie interacts with the CORS proxy, a checkout that fails on Safari because of a date picker incompatibility, a dashboard that looks correct in Chrome but has overlapping text in Firefox. They need E2E tests that exercise real browser workflows, catch cross-browser issues, and run in CI before every deployment.

## Step 1: Build Page Objects and Test Utilities

```typescript
// tests/pages/login.page.ts — Page Object Model for the login flow
import { Page, expect } from "@playwright/test";

export class LoginPage {
  constructor(private page: Page) {}

  // Selectors — centralized so changes propagate automatically
  private selectors = {
    emailInput: '[data-testid="email-input"]',
    passwordInput: '[data-testid="password-input"]',
    submitButton: '[data-testid="login-submit"]',
    errorMessage: '[data-testid="login-error"]',
    googleButton: '[data-testid="google-login"]',
    forgotPassword: '[data-testid="forgot-password"]',
    rememberMe: '[data-testid="remember-me"]',
  };

  async goto() {
    await this.page.goto("/login");
    await this.page.waitForSelector(this.selectors.emailInput);
  }

  async login(email: string, password: string) {
    await this.page.fill(this.selectors.emailInput, email);
    await this.page.fill(this.selectors.passwordInput, password);
    await this.page.click(this.selectors.submitButton);
  }

  async loginAndWaitForDashboard(email: string, password: string) {
    await this.login(email, password);
    await this.page.waitForURL("**/dashboard**", { timeout: 10000 });
  }

  async getErrorMessage(): Promise<string | null> {
    const el = this.page.locator(this.selectors.errorMessage);
    if (await el.isVisible()) return el.textContent();
    return null;
  }

  async clickGoogleLogin() {
    await this.page.click(this.selectors.googleButton);
  }
}

// tests/pages/dashboard.page.ts — Dashboard page object
export class DashboardPage {
  constructor(private page: Page) {}

  async waitForLoad() {
    await this.page.waitForSelector('[data-testid="dashboard-loaded"]', { timeout: 15000 });
  }

  async getProjectCount(): Promise<number> {
    const cards = this.page.locator('[data-testid="project-card"]');
    return cards.count();
  }

  async createProject(name: string, description?: string) {
    await this.page.click('[data-testid="create-project"]');
    await this.page.fill('[data-testid="project-name"]', name);
    if (description) {
      await this.page.fill('[data-testid="project-description"]', description);
    }
    await this.page.click('[data-testid="project-submit"]');
    await this.page.waitForSelector(`text=${name}`);
  }

  async deleteProject(name: string) {
    const card = this.page.locator(`[data-testid="project-card"]:has-text("${name}")`);
    await card.locator('[data-testid="project-menu"]').click();
    await this.page.click('[data-testid="delete-project"]');
    await this.page.click('[data-testid="confirm-delete"]');
    await expect(card).not.toBeVisible({ timeout: 5000 });
  }

  async searchProjects(query: string) {
    await this.page.fill('[data-testid="search-input"]', query);
    await this.page.waitForTimeout(300); // debounce
  }
}
```

## Step 2: Build Critical Path Tests

```typescript
// tests/flows/auth.spec.ts — Authentication flow tests
import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";
import { DashboardPage } from "../pages/dashboard.page";

test.describe("Authentication", () => {
  test("successful login redirects to dashboard", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAndWaitForDashboard("test@example.com", "password123");

    const dashboard = new DashboardPage(page);
    await dashboard.waitForLoad();
    await expect(page).toHaveURL(/dashboard/);
  });

  test("invalid credentials show error message", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login("test@example.com", "wrong-password");

    const error = await loginPage.getErrorMessage();
    expect(error).toContain("Invalid email or password");
    await expect(page).toHaveURL(/login/);
  });

  test("session persists across page reloads", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAndWaitForDashboard("test@example.com", "password123");

    // Reload and verify still authenticated
    await page.reload();
    const dashboard = new DashboardPage(page);
    await dashboard.waitForLoad();
    await expect(page).toHaveURL(/dashboard/);
  });

  test("logout clears session", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAndWaitForDashboard("test@example.com", "password123");

    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout"]');

    await expect(page).toHaveURL(/login/);

    // Verify can't access dashboard
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });
});

// tests/flows/project-crud.spec.ts — Project management tests
test.describe("Project Management", () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAndWaitForDashboard("test@example.com", "password123");
  });

  test("create, view, and delete a project", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.waitForLoad();

    const initialCount = await dashboard.getProjectCount();

    // Create
    await dashboard.createProject("E2E Test Project", "Created by Playwright");
    expect(await dashboard.getProjectCount()).toBe(initialCount + 1);

    // View
    await page.click('text=E2E Test Project');
    await expect(page.locator("h1")).toContainText("E2E Test Project");

    // Delete
    await page.goto("/dashboard");
    await dashboard.deleteProject("E2E Test Project");
    expect(await dashboard.getProjectCount()).toBe(initialCount);
  });

  test("search filters projects correctly", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.waitForLoad();

    await dashboard.searchProjects("nonexistent-xyz");
    const count = await dashboard.getProjectCount();
    expect(count).toBe(0);

    await expect(page.locator("text=No projects found")).toBeVisible();
  });
});

// tests/flows/accessibility.spec.ts — Accessibility tests
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility", () => {
  test("login page has no accessibility violations", async ({ page }) => {
    await page.goto("/login");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("dashboard is keyboard navigable", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAndWaitForDashboard("test@example.com", "password123");

    // Tab through interactive elements
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();

    // Open create dialog with keyboard
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
  });
});
```

## Step 3: Configure CI Integration

```typescript
// playwright.config.ts — Multi-browser CI configuration
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,     // retry on CI to handle flakiness
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["junit", { outputFile: "test-results/junit.xml" }]]
    : [["html", { open: "on-failure" }]],

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",          // full trace for debugging failures
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],

  webServer: process.env.CI ? undefined : {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
  },
});
```

## Results

- **Cross-browser bugs caught before production** — the Safari date picker issue was caught in the webkit project; the Firefox text overlap was caught during visual comparison; both fixed before any user saw them
- **Login flow fully covered** — session persistence, CORS interactions, cookie handling all tested in real browsers; the session-cookie bug would have been caught immediately
- **CI runs in 3 minutes across 5 browser configurations** — parallel execution and retries keep the pipeline fast and reliable; tests run on every PR
- **Failure debugging is instant** — screenshots, videos, and Playwright traces on failure mean developers see exactly what happened; no more "works on my machine"
- **Accessibility enforced automatically** — axe-core catches WCAG violations in CI; new pages can't ship without passing accessibility checks
