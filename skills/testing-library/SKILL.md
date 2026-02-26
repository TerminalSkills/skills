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
compatibility: "React, Vue, Svelte, Angular, Preact. Vitest/Jest."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
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
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
# For Vitest:
npm install -D @testing-library/react vitest happy-dom
```

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
```

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
screen.getByDisplayValue("user@example.com");

// Priority 6: Alt text (images)
screen.getByAltText("Company logo");

// Last resort: test IDs (avoid if possible)
screen.getByTestId("complex-widget");
```

### Testing Component Behavior

```tsx
// LoginForm.test.tsx — Test a login form from the user's perspective
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  it("submits the form with email and password", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<LoginForm onSubmit={onSubmit} />);

    // Find elements by their accessible role/label
    await user.type(screen.getByLabelText("Email"), "kai@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: "kai@example.com",
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

    await user.type(screen.getByLabelText("Email"), "kai@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });
});
```

### Async Testing

```tsx
// UserProfile.test.tsx — Testing async data fetching
import { render, screen, waitFor } from "@testing-library/react";
import { UserProfile } from "./UserProfile";

it("loads and displays user data", async () => {
  render(<UserProfile userId="123" />);

  // Loading state
  expect(screen.getByText("Loading...")).toBeInTheDocument();

  // Wait for data to load
  await waitFor(() => {
    expect(screen.getByRole("heading")).toHaveTextContent("Kai Chen");
  });

  expect(screen.getByText("kai@example.com")).toBeInTheDocument();
});

it("shows error state on failure", async () => {
  // Mock API failure
  server.use(http.get("/api/users/123", () => HttpResponse.error()));

  render(<UserProfile userId="123" />);

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load");
  });
});
```

## Examples

### Example 1: Test a complex form with validation

**User prompt:** "Write tests for a multi-step registration form with validation."

The agent will write tests that fill each step from the user's perspective, verify validation errors appear on invalid input, and confirm successful submission.

### Example 2: Test an accessible data table

**User prompt:** "Test a sortable data table — verify sorting, filtering, and pagination work."

The agent will query table headers by role, click to sort, verify row order changes, type into filter input, and navigate pages.

## Guidelines

- **Query by role first** — `getByRole` tests accessibility for free
- **`userEvent` over `fireEvent`** — simulates real user behavior (focus, type, blur)
- **`userEvent.setup()` at test start** — creates a user instance for the test
- **`waitFor` for async** — wait for elements to appear after data fetching
- **Avoid `getByTestId`** — if you need it, the component might have accessibility issues
- **`screen` is global** — no need to destructure render result
- **`toBeInTheDocument()` from jest-dom** — readable assertions
- **Don't test implementation** — state values, effect triggers, re-render counts
- **Test behavior, not structure** — "user sees error" not "error div has class active"
