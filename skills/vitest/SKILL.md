---
name: vitest
description: >-
   You are an expert in Vitest, the Vite-native testing framework. You help
  developers write and run unit tests, integration tests, and component tests
  with native TypeScript support, Jest-compatible API, built-in mocking, code
  coverage, snapshot testing, and watch mode — leveraging Vite's transform
  pipeline for instant test execution without separate compilation.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Developer Tools
  tags:
    - testing
    - vite
    - typescript
    - unit-test
    - mocking
    - coverage
    - fast
---

# Vitest — Blazing Fast Unit Testing

You are an expert in Vitest, the Vite-native testing framework. You help developers write and run unit tests, integration tests, and component tests with native TypeScript support, Jest-compatible API, built-in mocking, code coverage, snapshot testing, and watch mode — leveraging Vite's transform pipeline for instant test execution without separate compilation.

## Core Capabilities

### Tests

```typescript
// math.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { calculateDiscount, formatPrice, processOrder } from "./math";

describe("calculateDiscount", () => {
  it("applies percentage discount", () => {
    expect(calculateDiscount(100, 20)).toBe(80);
  });

  it("never goes below zero", () => {
    expect(calculateDiscount(10, 200)).toBe(0);
  });

  it.each([
    { price: 100, discount: 10, expected: 90 },
    { price: 50, discount: 50, expected: 25 },
    { price: 200, discount: 0, expected: 200 },
  ])("$price with $discount% = $expected", ({ price, discount, expected }) => {
    expect(calculateDiscount(price, discount)).toBe(expected);
  });
});

describe("formatPrice", () => {
  it("formats with currency symbol", () => {
    expect(formatPrice(29.99, "USD")).toBe("$29.99");
    expect(formatPrice(29.99, "EUR")).toBe("€29.99");
  });
});
```

### Mocking

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processOrder } from "./orders";
import { sendEmail } from "./email";
import { chargeCard } from "./payments";

// Mock modules
vi.mock("./email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./payments", () => ({
  chargeCard: vi.fn().mockResolvedValue({ chargeId: "ch_123" }),
}));

describe("processOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("charges card and sends confirmation email", async () => {
    const order = { userId: "u1", items: [{ id: "p1", qty: 2 }], total: 59.98 };
    const result = await processOrder(order);

    expect(chargeCard).toHaveBeenCalledWith({ amount: 59.98, userId: "u1" });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order_confirmation", userId: "u1" }),
    );
    expect(result.status).toBe("completed");
  });

  it("rolls back on payment failure", async () => {
    vi.mocked(chargeCard).mockRejectedValueOnce(new Error("Card declined"));
    
    await expect(processOrder({ userId: "u1", items: [], total: 0 }))
      .rejects.toThrow("Card declined");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// Spy on methods
const spy = vi.spyOn(console, "log");
doSomething();
expect(spy).toHaveBeenCalledWith("expected output");

// Fake timers
vi.useFakeTimers();
setTimeout(() => callback(), 5000);
vi.advanceTimersByTime(5000);
expect(callback).toHaveBeenCalled();
vi.useRealTimers();
```

### Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,                         // No need to import describe/it/expect
    environment: "node",                   // Or "jsdom" for browser APIs
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: { lines: 80, branches: 75, functions: 80 },
    },
    include: ["**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
});
```

```bash
npx vitest                                 # Watch mode
npx vitest run                             # Single run (CI)
npx vitest --coverage                      # With coverage
npx vitest --ui                            # Browser UI
```

## Installation

```bash
npm install -D vitest
npm install -D @vitest/coverage-v8         # Coverage
npm install -D @vitest/ui                  # Browser UI
```

## Best Practices

1. **Vite-powered** — Uses Vite's transform; TypeScript, JSX, ESM work without config; instant HMR in watch mode
2. **Jest-compatible** — Same `describe`/`it`/`expect` API; easy migration from Jest
3. **Native TypeScript** — No ts-jest, no babel; Vite handles transforms; tests run as-is
4. **vi.mock()** — Mock modules at the top level; automatic hoisting like Jest
5. **In-source testing** — Define tests alongside code with `if (import.meta.vitest)`; tree-shaken in production
6. **Workspace support** — `vitest.workspace.ts` for monorepo testing; run tests across packages
7. **Coverage thresholds** — Set in config; CI fails if coverage drops below threshold
8. **Watch mode** — Only re-runs affected tests on file change; instant feedback loop
