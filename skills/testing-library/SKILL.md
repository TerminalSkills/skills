---
name: testing-library
description: >-
  Test UI components the way users interact with them using Testing Library —
  query by role, text, and label instead of implementation details. Use when
  someone asks to "test React components", "Testing Library", "user-centric
  testing", "test accessibility", "test without implementation details", or
  "render and query components in tests". Covers React Testing Library,
  queries, user events, async testing, and accessibility assertions.
license: Apache-2.0
compatibility: "@testing-library/react 16 (React 18 or 19), Vue, Svelte, Angular, Preact. Vitest or Jest with a DOM environment (happy-dom or jsdom)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/testing-library/react-testing-library
  tags: ["testing", "react", "components", "accessibility", "testing-library"]
---

# Testing Library

## Overview

Testing Library tests UI components from the user's perspective — find elements by their accessible role, text content, or label, not by CSS class or test ID. If a user can't find a button, your test shouldn't find it either. This approach catches accessibility issues by default, survives refactors (rename a CSS class and tests still pass), and produces tests that actually prove the UI works.

## When to Use

- Testing React/Vue/Svelte components
- Want tests that survive refactoring (no CSS selectors or internal state checks)
- Need to verify accessibility (ARIA roles, labels)
- Testing user interactions (clicks, typing, form submission)
- Integration testing of component behavior (not snapshot testing)

## Instructions

### Setup

```bash
# React: @testing-library/dom is a required peer dependency of @testing-library/react 16
npm install -D @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
# For Vitest (use jsdom instead of happy-dom if you prefer):
npm install -D vitest happy-dom
```

Other frameworks use their own package with the same queries: `@testing-library/vue`, `@testing-library/svelte`, `@testing-library/angular`.

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
  },
});
```

```typescript
// tests/setup.ts — Global test setup
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest has no global afterEach unless `globals: true`, so RTL's automatic
// cleanup does not run. Without this, DOM from earlier tests piles up and
// queries fail with "Found multiple elements".
afterEach(() => cleanup());
```

Alternatively set `test: { globals: true }` in the config (and `"types": ["vitest/globals"]` in tsconfig); then cleanup is automatic and `describe`/`it`/`vi` need no imports. Otherwise import them from `"vitest"` in every test file. With Jest, import `@testing-library/jest-dom` in `setupFilesAfterEnv` instead.

### Query Priority

Testing Library has a priority order for queries — use the highest priority that works:

```typescript
// Priority 1: Accessible roles (best — tests accessibility too)
screen.getByRole("button", { name: "Submit" });
screen.getByRole("textbox", { name: "Email" });
screen.getByRole("heading", { level: 1 });

// Priority 2: Label text (forms)
screen.getByLabelText("Email address");

// Priority 3: Placeholder text
screen.getByPlaceholderText("Search...");

// Priority 4: Text content
screen.getByText("Welcome back!");

// Priority 5: Display value
screen.getByDisplayValue("kai@northwind.dev");

// Priority 6: Alt text (images)
screen.getByAltText("Company logo");

// Last resort: test IDs (avoid if possible)
screen.getByTestId("complex-widget");
```

Query variants: `getBy*` throws if nothing matches (use for things that must be there), `queryBy*` returns `null` (use for `expect(...).not.toBeInTheDocument()`), `findBy*` returns a promise that waits for the element to appear. Add `All` (`getAllByRole`) when several matches are expected.

### Testing Component Behavior

```tsx
// LoginForm.test.tsx — Test a login form from the user's perspective
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  it("submits the form with email and password", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<LoginForm onSubmit={onSubmit} />);

    // Find elements by their accessible role/label
    await user.type(screen.getByLabelText("Email"), "kai@northwind.dev");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: "kai@northwind.dev",
      password: "secret123",
    });
  });

  it("shows validation error for invalid email", async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email address");
  });

  it("disables submit while loading", async () => {
    render(<LoginForm onSubmit={() => new Promise(() => {})} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "kai@northwind.dev");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });
});
```

### Async Testing

```tsx
// UserProfile.test.tsx — Testing async data fetching
import { it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen } from "@testing-library/react";
import { server } from "./mocks/server"; // msw `setupServer(...)`; call server.listen() in beforeAll in your setup file
import { UserProfile } from "./UserProfile";

it("loads and displays user data", async () => {
  render(<UserProfile userId="123" />);

  // Loading state
  expect(screen.getByText("Loading...")).toBeInTheDocument();

  // findBy* waits (default 1000 ms) for the element to appear
  expect(await screen.findByRole("heading")).toHaveTextContent("Kai Chen");

  expect(screen.getByText("kai@northwind.dev")).toBeInTheDocument();
});

it("shows error state on failure", async () => {
  // Mock API failure
  server.use(http.get("/api/users/123", () => HttpResponse.error()));

  render(<UserProfile userId="123" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load");
});
```

Use `waitFor(() => expect(...))` when the assertion is not about an element appearing, for example a mock being called. Keep one assertion in the callback and no side effects, because it is retried.

## Examples

### Example 1: Test a complex form with validation

**User prompt:** "Write tests for a two-step registration form with validation."

```tsx
it("blocks step 2 until the email is valid, then registers", async () => {
  const onRegister = vi.fn();
  const user = userEvent.setup();
  render(<RegistrationForm onRegister={onRegister} />);

  await user.type(screen.getByLabelText("Email"), "nina@");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email");
  expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();

  await user.type(screen.getByLabelText("Email"), "nina.fischer.dev");   // continues typing
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.type(await screen.findByLabelText("Company"), "Fischer GmbH");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(onRegister).toHaveBeenCalledOnce();
});
```

Result: Vitest reports the test passing; if the validation message is removed from the component, it fails at the first `getByRole("alert")`.

### Example 2: Test an accessible data table

**User prompt:** "Test a sortable data table — verify sorting works."

```tsx
it("sorts rows by price when the column header is clicked", async () => {
  const user = userEvent.setup();
  render(<ProductTable products={products} />);

  await user.click(screen.getByRole("columnheader", { name: /price/i }));

  const rows = screen.getAllByRole("row").slice(1); // skip the header row
  expect(within(rows[0]).getByRole("cell", { name: "Desk lamp" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /price/i })).toHaveAttribute("aria-sort", "ascending");
});
```

`within` is imported from `@testing-library/react`. Asserting `aria-sort` proves the header is accessible, not just that the order changed.

## Guidelines

- **Query by role first** — `getByRole` tests accessibility for free
- **`userEvent` over `fireEvent`** — simulates real user behavior (focus, type, blur)
- **`userEvent.setup()` at test start** — creates a user instance for the test
- **`findBy*` for async** — wait for elements to appear after data fetching; `waitFor` for other retried assertions
- **Avoid `getByTestId`** — if you need it, the component might have accessibility issues
- **Await every `user.*` call** — `userEvent` v14 is async; a missing `await` gives flaky, half-finished interactions
- **`screen` is global** — no need to destructure render result
- **`toBeInTheDocument()` from jest-dom** — readable assertions
- **Don't test implementation** — state values, effect triggers, re-render counts
- **Test behavior, not structure** — "user sees error" not "error div has class active"
