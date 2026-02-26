---
title: Set Up a Comprehensive Test Suite for a React Application
slug: set-up-comprehensive-test-suite-for-react-app
description: Build a multi-layer test suite with Testing Library for components, fast-check for edge cases, Happy DOM for speed, and Vitest for orchestration.
skills:
  - testing-library
  - happy-dom
  - fast-check
  - vitest
category: development
tags:
  - testing
  - react
  - vitest
  - property-based
  - testing-library
---

## The Problem

Noa's team has a React application with 200+ components and growing, but only 30 hand-written tests — mostly snapshot tests that break on every CSS change and catch nothing. The team skips writing tests because the existing suite is slow (jsdom takes 40 seconds) and the tests don't catch real bugs. Last month, a pricing calculation bug shipped to production because nobody thought to test negative quantities. The quarter before that, a form refactor broke accessibility for screen reader users — no test caught it because they were all testing CSS classes.

## The Solution

Build a three-layer testing strategy: Testing Library for user-centric component tests (catches accessibility issues by default), fast-check for property-based testing of business logic (finds edge cases like negative quantities automatically), and Happy DOM as the test environment (3-5x faster than jsdom). Vitest orchestrates everything with parallel execution and watch mode.

## Step-by-Step Walkthrough

### Step 1: Test Infrastructure

```bash
npm install -D vitest happy-dom @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event fast-check @vitejs/plugin-react msw
```

```typescript
// vitest.config.ts — Test configuration optimized for speed
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",         // 3-5x faster than jsdom
    globals: true,                     // No need to import describe/it/expect
    setupFiles: ["./tests/setup.ts"],
    css: false,                        // Don't process CSS in tests
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.*", "src/**/*.stories.*"],
      thresholds: { branches: 80, functions: 80, lines: 80 },
    },
  },
  resolve: {
    alias: { "@": "./src" },
  },
});
```

```typescript
// tests/setup.ts — Global test setup
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Auto-cleanup after each test
afterEach(() => cleanup());
```

### Step 2: Component Tests with Testing Library

Test components the way users interact with them — by role, text, and label.

```tsx
// src/components/PricingCalculator.test.tsx
/**
 * Tests the pricing calculator from the user's perspective.
 * Finds elements by accessible roles — if a screen reader can't find
 * the button, neither can this test.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PricingCalculator } from "./PricingCalculator";

describe("PricingCalculator", () => {
  it("calculates total for a standard order", async () => {
    const user = userEvent.setup();
    render(<PricingCalculator />);

    // Find by accessible label — tests accessibility for free
    await user.type(screen.getByLabelText("Quantity"), "5");
    await user.selectOptions(screen.getByLabelText("Plan"), "pro");

    // Verify the calculated total is displayed
    const summary = screen.getByRole("region", { name: "Order Summary" });
    expect(within(summary).getByText("$245.00")).toBeInTheDocument();
  });

  it("applies discount code and shows savings", async () => {
    const user = userEvent.setup();
    render(<PricingCalculator />);

    await user.type(screen.getByLabelText("Quantity"), "10");
    await user.type(screen.getByLabelText("Discount Code"), "SAVE20");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    // Discount applied
    expect(screen.getByText(/20% off/i)).toBeInTheDocument();
    expect(screen.getByText("$392.00")).toBeInTheDocument();  // 490 * 0.8
    expect(screen.getByText("You save $98.00")).toBeInTheDocument();
  });

  it("shows validation error for zero quantity", async () => {
    const user = userEvent.setup();
    render(<PricingCalculator />);

    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "0");
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Quantity must be at least 1");
  });

  it("is keyboard navigable", async () => {
    const user = userEvent.setup();
    render(<PricingCalculator />);

    // Tab through the form
    await user.tab();
    expect(screen.getByLabelText("Quantity")).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText("Plan")).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText("Discount Code")).toHaveFocus();

    // Submit with Enter
    await user.tab();
    expect(screen.getByRole("button", { name: "Calculate" })).toHaveFocus();
    await user.keyboard("{Enter}");
  });
});
```

### Step 3: Property-Based Testing for Business Logic

Hand-written tests only cover cases you think of. fast-check generates thousands of random inputs to find the ones you didn't.

```typescript
// src/lib/pricing.test.ts — Property-based pricing logic tests
/**
 * These tests found 3 bugs in the first run:
 * 1. Negative quantity produced negative prices
 * 2. Discount > 100% produced negative totals
 * 3. Floating point rounding gave $49.999999 instead of $50.00
 */
import fc from "fast-check";
import { calculatePrice, applyDiscount, formatCurrency } from "./pricing";

describe("calculatePrice — property-based", () => {
  it("price is always non-negative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),  // Include negative to test validation
        fc.constantFrom("free", "starter", "pro", "enterprise"),
        (quantity, plan) => {
          const price = calculatePrice(quantity, plan);
          expect(price).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });

  it("price increases with quantity (for positive quantities)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.constantFrom("starter", "pro", "enterprise"),
        (q1, q2, plan) => {
          if (q1 < q2) {
            expect(calculatePrice(q1, plan)).toBeLessThanOrEqual(calculatePrice(q2, plan));
          }
        }
      )
    );
  });

  it("discount never makes price higher", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom("starter", "pro", "enterprise"),
        fc.integer({ min: 0, max: 200 }),  // Include >100% to test validation
        (quantity, plan, discountPercent) => {
          const original = calculatePrice(quantity, plan);
          const discounted = applyDiscount(original, discountPercent);
          expect(discounted).toBeLessThanOrEqual(original);
          expect(discounted).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });

  it("formatCurrency roundtrips correctly", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99999999 }),  // Cents
        (cents) => {
          const formatted = formatCurrency(cents);  // "$123.45"
          const parsed = parseCurrency(formatted);   // 12345
          expect(parsed).toBe(cents);
        }
      )
    );
  });
});
```

### Step 4: API Mocking with MSW

```typescript
// tests/mocks/handlers.ts — Mock API responses
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/plans", () =>
    HttpResponse.json([
      { id: "free", name: "Free", price: 0, limit: 1000 },
      { id: "pro", name: "Pro", price: 4900, limit: 100000 },
    ])
  ),

  http.post("/api/checkout", async ({ request }) => {
    const body = await request.json();
    if (body.quantity <= 0) {
      return HttpResponse.json({ error: "Invalid quantity" }, { status: 400 });
    }
    return HttpResponse.json({ sessionId: "cs_test_123", url: "https://checkout..." });
  }),
];
```

```typescript
// tests/mocks/server.ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";
export const server = setupServer(...handlers);
```

```typescript
// tests/setup.ts — Add MSW to test setup
import { server } from "./mocks/server";

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## The Outcome

Noa's test suite goes from 30 brittle snapshot tests to 180 meaningful tests across three layers. Component tests with Testing Library catch accessibility regressions automatically — the keyboard navigation test would have caught last quarter's screen reader bug. Property-based tests with fast-check found 3 pricing bugs on the first run: negative quantity prices, discounts over 100%, and floating-point rounding errors. The full suite runs in 3.2 seconds on Happy DOM (down from 40 seconds on jsdom). Watch mode re-runs affected tests in 200ms. Coverage sits at 87%, with the property-based tests covering thousands of input combinations that hand-written tests never would.
