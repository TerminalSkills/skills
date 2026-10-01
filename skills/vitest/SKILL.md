---
name: vitest
description: >-
  Vitest is a test runner for JavaScript and TypeScript built on Vite, with a
  Jest-compatible API, built-in mocking, snapshots and code coverage. Use when
  a user asks to set up or run unit tests in a Vite or Node project, write
  tests with describe/it/expect, mock modules with vi.mock, add coverage
  thresholds, configure vitest.config.ts or test projects, migrate from Jest,
  or upgrade to Vitest 5.
license: Apache-2.0
compatibility: "Node.js 22.12+ and Vite 6.4+ (Vitest 5)"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/vitest-dev/vitest
  tags:
    - testing
    - vite
    - typescript
    - mocking
    - coverage
---

# Vitest — Blazing Fast Unit Testing

## Overview

Vitest is the Vite-native testing framework. It runs unit, integration and component tests with native TypeScript support, a Jest-compatible API, built-in mocking, code coverage, snapshot testing and watch mode — reusing Vite's transform pipeline, so tests need no separate compilation step. This skill targets Vitest 5 (released September 2026), which changed several defaults; the Guidelines list what to check when upgrading.

## Instructions

### Installation

```bash
npm install -D vitest
npm install -D @vitest/coverage-v8         # Coverage
npm install -D @vitest/ui                  # Browser UI
npm install -D jsdom                       # Only for environment: "jsdom"
```

Vitest 5 needs Node.js 22.12+ and Vite 6.4+. Vite is a peer dependency: npm, pnpm and Bun install it automatically, Yarn needs `yarn add -D vitest vite`. Add `.vitest/` (reports and artifacts) and `coverage/` to `.gitignore`.

### Tests

```typescript
// src/pricing.test.ts
import { describe, it, expect } from "vitest";
import { calculateDiscount, formatPrice } from "./pricing";

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

Test files must contain `.test.` or `.spec.` in their name (default `include`: `**/*.{test,spec}.?(c|m)[jt]s?(x)`).

### Mocking

```typescript
// src/orders.test.ts
import { describe, it, expect, vi } from "vitest";
import { processOrder } from "./orders";
import { sendEmail } from "./email";
import { chargeCard } from "./payments";

// vi.mock is hoisted above the imports — keep it at the top level of the file
vi.mock("./email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./payments", () => ({
  chargeCard: vi.fn().mockResolvedValue({ chargeId: "ch_3PqXk2" }),
}));

describe("processOrder", () => {
  // No beforeEach(vi.clearAllMocks) needed: Vitest 5 clears call history before every test

  it("charges card and sends confirmation email", async () => {
    const order = { userId: "u_481", items: [{ id: "sku_114", qty: 2 }], total: 59.98 };
    const result = await processOrder(order);

    expect(chargeCard).toHaveBeenCalledWith({ amount: 59.98, userId: "u_481" });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order_confirmation", userId: "u_481" }),
    );
    expect(result.status).toBe("completed");
  });

  it("stops on payment failure", async () => {
    vi.mocked(chargeCard).mockRejectedValueOnce(new Error("Card declined"));

    await expect(processOrder({ userId: "u_481", items: [], total: 0 }))
      .rejects.toThrow("Card declined");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("spies on a method", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    console.log("order shipped");
    expect(spy).toHaveBeenCalledWith("order shipped");
  });

  it("controls timers", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    setTimeout(callback, 5000);
    vi.advanceTimersByTime(5000);
    expect(callback).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

To keep the real implementation and only record calls, pass `{ spy: true }` instead of a factory: `vi.mock(import("./payments"), { spy: true })`.

### Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,                         // No need to import describe/it/expect
    environment: "node",                   // Or "jsdom" / "happy-dom" for browser APIs
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],            // Also report files no test imports
      thresholds: { lines: 80, branches: 75, functions: 80 },
    },
    include: ["**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],       // The file must exist; drop the line if there is none
  },
});
```

Vitest also reads `test` from an existing `vite.config.ts`. With `globals: true`, add `"types": ["vitest/globals"]` to `compilerOptions` in `tsconfig.json`. A single file can switch environment with a `// @vitest-environment jsdom` comment at the top of the file.

Several configurations in one run (monorepo packages, node + DOM tests) are declared as `projects` in the root config:

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: { provider: "v8", include: ["src/**/*.ts"] },   // root-only option
    projects: [
      { test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" } },
      { test: { name: "dom", include: ["src/**/*.dom.test.tsx"], environment: "jsdom" } },
      "packages/*",                        // every folder in packages/ is a project
    ],
  },
});
```

### Running

```bash
npx vitest                                 # Watch mode; single run in CI or without a TTY
npx vitest run                             # Single run (CI)
npx vitest run --coverage                  # With coverage, fails below thresholds
npx vitest --ui                            # Browser UI — open the printed URL, it carries a token
npx vitest run src/pricing.test.ts         # Files whose path contains the filter
npx vitest run -t "applies percentage"     # Tests whose full name matches
npx vitest run --project unit              # One project
npx vitest related src/pricing.ts --run    # Tests that import the given source files
npx vitest run --changed                   # Tests affected by uncommitted changes
npx vitest run --reporter=junit            # Writes .vitest/junit/output.xml
```

## Examples

### Example 1: Add tests and a coverage gate to a TypeScript project

User: "Set up Vitest for our pricing module and make CI fail under 80% line coverage."

```bash
npm install -D vitest @vitest/coverage-v8
npm pkg set scripts.test="vitest" scripts.test:ci="vitest run --coverage"
npm run test:ci
```

With the two test files and the first configuration above (and an existing `test/setup.ts`), the mocked `email.ts` and `payments.ts` never execute, so the totals fall under the threshold and the command exits with code 1:

```text
 Test Files  2 passed (2)
      Tests  10 passed (10)

 % Coverage report from v8
-------------|---------|----------|---------|---------|-------------------
File         | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------|---------|----------|---------|---------|-------------------
All files    |   71.42 |      100 |      60 |   71.42 |
 email.ts    |       0 |      100 |       0 |       0 | 1
 payments.ts |       0 |      100 |       0 |       0 | 1
-------------|---------|----------|---------|---------|-------------------
ERROR: Coverage for lines (71.42%) does not meet global threshold (80%)
ERROR: Coverage for functions (60%) does not meet global threshold (80%)
```

The HTML report is written to `coverage/index.html`.

### Example 2: Upgrade a monorepo from Vitest 3 to Vitest 5

User: "After bumping vitest to 5 our workspace tests are gone and one file crashes with a vi.mock error."

1. `vitest.workspace.ts` is no longer read, and a `test.workspace` key throws "The `test.workspace` option was removed in Vitest 4". Move its entries into `test.projects` (see Configuration) and delete the file.
2. Move every `vi.mock` / `vi.hoisted` call out of `describe` and `test` callbacks to the top level of the file. Vitest 5 fails the file otherwise:

```text
Error: 1 call in "src/orders.test.ts" was defined outside of the module's top level scope:

- vi.mock("./email") at src/orders.test.ts:2:28
```

3. Run one project and read the full report:

```bash
npx vitest run --project unit --reporter=default
```

```text
 ✓ |unit| src/orders.test.ts (4 tests) 4ms
 ✓ |unit| src/pricing.test.ts (6 tests) 10ms

 Test Files  2 passed (2)
      Tests  10 passed (10)
```

4. Assertions that counted calls made in an earlier test or in `beforeAll` now see zero calls (`clearMocks` is on). Fix the test, or set `test.clearMocks: false` to restore the old behavior.

## Guidelines

1. **Vite-powered** — Uses Vite's transform; TypeScript, JSX, ESM work without config; instant re-runs in watch mode
2. **Jest-compatible** — Same `describe`/`it`/`expect` API; replace `jest.fn`/`jest.mock` with `vi.fn`/`vi.mock` when migrating
3. **Native TypeScript** — No ts-jest, no babel; Vite handles transforms. Tests run without type checking, so keep `tsc --noEmit` in CI
4. **vi.mock() is hoisted** — It runs before imports, so a factory cannot use variables declared below it; create those with `vi.hoisted()`. Use `vi.doMock()` when a mock must be registered later, inside a test
5. **Mock history resets by itself** — Since Vitest 5 `clearMocks` defaults to `true`: call counts are cleared before each test, implementations stay. `mockReset` and `restoreMocks` are still opt-in
6. **In-source testing** — Tests inside `if (import.meta.vitest)` blocks run once `test.includeSource` lists the files; add `define: { "import.meta.vitest": "undefined" }` to the build config so bundlers drop them from production
7. **Projects, not workspaces** — `test.projects` replaced `vitest.workspace.ts`. Inline projects inherit the root config by default in Vitest 5 (`extends: false` opts out); `coverage` and `reporters` can only be set at the root
8. **Coverage counts imported files only** — Set `coverage.include` to see untested files. In Vitest 5 a pattern without wildcards (`"src"`) is treated as a directory, and glob thresholds need their own `perFile`
9. **Reports go to `.vitest/`** — The `json` and `junit` reporters write `.vitest/json/output.json` and `.vitest/junit/output.xml` instead of stdout unless `outputFile` is set
10. **Quiet output under AI agents** — When Vitest detects a coding agent it switches to the `minimal` reporter, which prints only failures and the totals. Pass `--reporter=default` (or `verbose`) to see every file
11. **Config lookup** — Vitest 5 no longer searches parent directories for a config file; run from the project root or pass `--config ../vitest.config.ts`
12. **Not an end-to-end tool** — For full user flows across pages use Playwright or Cypress. Component tests that need a real browser can use Browser Mode (`npx vitest init browser`)
