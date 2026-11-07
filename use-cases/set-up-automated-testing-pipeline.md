---
title: "Set Up an Automated Testing Pipeline with Mocking and Regression Detection"
slug: set-up-automated-testing-pipeline
description: "Build a comprehensive testing strategy with generated unit tests, API mocking, browser E2E tests, and automated regression detection."
skills:
  - test-generator
  - msw
  - playwright-testing
  - regression-tester
category: development
tags:
  - testing
  - mocking
  - e2e
  - regression
  - automation
---

# Set Up an Automated Testing Pipeline with Mocking and Regression Detection

## The Problem

Your team writes tests inconsistently. Some modules have 90% coverage, others have none. API tests break every time the backend team deploys because they hit real endpoints. Browser tests are flaky because they depend on third-party services being available. When a regression slips through, nobody discovers it until a customer reports the bug three days later. The testing strategy is a patchwork of ad-hoc efforts rather than a systematic pipeline.

## The Solution

Use **test-generator** to create comprehensive unit tests for untested modules, **msw** (Mock Service Worker) to intercept API calls with realistic mock responses so tests never depend on live services, **playwright-testing** for reliable browser E2E tests, and **regression-tester** to prove that a refactor preserved behavior by running generated tests against the old and the new code. Visual regressions are caught by Playwright's own screenshot comparison.

## Step-by-Step Walkthrough

### 1. Generate unit tests for critical business logic

Start with the modules that handle money, authentication, and data integrity.

> Generate unit tests for our checkout service at src/services/checkout.ts. Cover the cart total calculation with discounts, tax computation by state, inventory reservation, and the Stripe charge flow. Use vitest as the test runner. Mock external dependencies but test the actual business logic.

The generator produces tests covering edge cases that manual test writing often misses: empty carts, negative quantities, expired discount codes, and tax-exempt states. Review every generated assertion against your business rules before committing it. Sample output:

```typescript
// src/services/__tests__/checkout.test.ts
describe("cart total calculation", () => {
  it("applies percentage discount before tax", () => {
    const cart = createCart([
      { sku: "WIDGET-01", price: 29.99, quantity: 2 },
      { sku: "GADGET-03", price: 49.99, quantity: 1 },
    ]);
    const total = calculateTotal(cart, { discount: { type: "percent", value: 15 } });
    expect(total.subtotal).toBe(109.97);
    expect(total.discount).toBe(16.50);
    expect(total.taxable).toBe(93.47);
  });

  it("rejects negative quantities", () => {
    expect(() => createCart([{ sku: "X", price: 10, quantity: -1 }]))
      .toThrow("Quantity must be positive");
  });

  it("handles empty cart without crashing", () => {
    const total = calculateTotal(createCart([]), {});
    expect(total.subtotal).toBe(0);
    expect(total.tax).toBe(0);
  });
});
```

### 2. Set up API mocking with MSW

Replace flaky network calls with deterministic mock responses that mirror real API behavior.

> Set up MSW 3 to mock our backend API during tests and local development. Create handlers for the /api/products, /api/cart, and /api/checkout endpoints. Include realistic response delays (200-400ms) and error scenarios: 401 unauthorized, 429 rate limited, and 500 server error. The mocks should work in both the Vitest runner and the browser.

MSW 3 is ESM-only and needs Node.js 22.12 or newer (use `msw@2` on older Node or CommonJS). Shared handlers go in `mocks/handlers.ts`; the Node server is `setupServer` from `msw/node`, the browser worker is `setupWorker` from `msw/browser`:

```typescript
// mocks/handlers.ts
import { http, HttpResponse, delay } from "msw";

export const handlers = [
  http.get("http://localhost:3000/api/products", async () => {
    await delay(300);
    return HttpResponse.json([{ sku: "WIDGET-01", price: 29.99 }]);
  }),
  http.post("http://localhost:3000/api/checkout", () =>
    HttpResponse.json({ id: "ord_1001", status: "paid" }, { status: 201 }),
  ),
];

// vitest.setup.ts: fail any test that makes a request with no handler
import { setupServer } from "msw/node";
import { handlers } from "./mocks/handlers";
import { beforeAll, afterEach, afterAll } from "vitest";
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

Error scenarios go inside the individual test with `server.use(http.post(url, () => HttpResponse.json({ error: "rate_limited" }, { status: 429 })))`, which `resetHandlers()` removes afterwards. In the browser, run `npx msw init ./public --save` once and call `worker.start()` in development only.

MSW intercepts requests at the network level, so the application code does not know it is talking to a mock. This catches bugs that higher-level mocking misses, like incorrect request headers or missing content-type handling.

### 3. Add E2E tests with Playwright

Test complete user flows through the real browser to catch integration issues.

> Write Playwright E2E tests for the critical purchase flow: browse products, add to cart, apply discount code, enter shipping address, complete checkout, and verify the confirmation page. Use page object models to keep tests maintainable. Configure projects for Chromium, Firefox, and WebKit.

Use locators with auto-waiting (`getByRole`, `getByLabel`) and `expect(...)` assertions rather than fixed sleeps. Install browsers with `npx playwright install` (add `--with-deps` on a fresh Linux CI machine). Note that WebKit is the engine Safari is built on, not Safari itself, so it catches many but not all Safari-specific issues.

### 4. Configure regression detection

Catch visual and behavioral regressions automatically on every pull request. Two tools do two different jobs here.

> Set up visual regression checks that run on every PR using Playwright's `await expect(page).toHaveScreenshot()` on the key pages, with baselines committed to the repo and a small `maxDiffPixelRatio`. Run them in the official Playwright Docker image (`mcr.microsoft.com/playwright:v1.65.0-noble`, matching the installed `@playwright/test` version) so fonts render the same every time. Fail the job on a diff and upload the HTML report as a build artifact. Generate or refresh baselines deliberately with `npx playwright test --update-snapshots`.

> I refactored src/services/tax.ts. Use the regression-tester approach: generate tests for its public behavior, check out the pre-refactor commit in a separate git worktree, run the same tests there and in the working tree, and report any test that passes on the old code but fails on the new.

Screenshot diffs show what changed on screen; the regression-tester flow checks that refactored logic (such as tax rounding) returns the same results as before.

## Real-World Example

In this example, an e-commerce team was spending hours each week debugging flaky tests that failed because the staging API was down or returned unexpected data. After moving unit and component tests onto MSW handlers, those failures stopped, because no test depended on a live service. The test generator added unit tests to previously untested modules, which the team reviewed before merging. A Playwright WebKit run caught a CSS regression where the checkout button was hidden behind a banner on a narrow viewport. A regression-tester run on a tax refactor failed on a rounding case: the refactor had changed banker's rounding to floor rounding, and the team fixed it before merge.

## Tips

- Generate unit tests for modules that handle money, authentication, and data integrity first. Bugs in those areas have the highest business impact.
- Keep MSW handlers in a shared `mocks/` directory used by both the test runner and the local dev server. This guarantees the mock responses you test against match what developers see during development.
- Avoid `page.waitForLoadState("networkidle")`; Playwright's docs discourage it. Wait for specific elements with `expect(locator).toBeVisible()`, which is faster and less flaky.
- Run screenshot comparisons in one consistent environment (the Playwright Docker image). Screenshots taken locally differ from CI because of font rendering and OS differences.

## Related Skills

- **test-generator** -- drafts the unit tests for untested business logic; review the assertions before committing.
- **msw** -- network-level API mocks for tests and local development, with per-test error overrides.
- **playwright-testing** -- cross-browser E2E tests, page objects and `toHaveScreenshot` visual checks.
- **regression-tester** -- verifies a refactor preserved behavior by running tests on the old and new code.
