---
title: Build a Component Library with Storybook and Testing
slug: build-component-library-with-storybook-and-testing
description: Create a production-ready React component library with Storybook for documentation, Vitest for unit tests, and Cypress for interaction testing — shipping components that are visually documented, fully tested, and accessible by default.
skills:
  - storybook
  - vitest
  - cypress
  - shadcn-ui
category: development
tags:
  - components
  - testing
  - documentation
  - design-system
  - accessibility
---

# Build a Component Library with Storybook and Testing

Mei leads frontend at a 35-person fintech company with three React applications. Each app has its own Button, Modal, and Form components — slightly different designs, inconsistent accessibility, and duplicated bugs. When the design team updates the primary brand color, three teams make the change independently, and one always gets it wrong. She wants a shared component library with live documentation, automated tests, and a review workflow that catches visual regressions before they reach production.

## Step 1 — Set Up the Component Architecture with shadcn/ui as a Base

Starting from shadcn/ui components gives the team accessible, well-structured primitives to customize — instead of building from scratch and missing ARIA attributes.

```typescript
// packages/ui/src/components/button/button.tsx — Button component.
// Based on shadcn/ui Button, customized with company design tokens
// and additional variants for the fintech product.

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  // Base styles — applied to every button regardless of variant
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Fintech-specific: high-emphasis action button for transactions
        action: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs",
        md: "h-10 px-4 py-2",
        lg: "h-12 rounded-md px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, isLoading, loadingText, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            <span>{loadingText || children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

## Step 2 — Write Stories for Every Component State

Each story represents a specific state the component can be in. The Storybook UI becomes the living documentation — designers review it, QA tests against it, and new developers learn the components from it.

```typescript
// packages/ui/src/components/button/button.stories.tsx — Button stories.
// Each export is a story: a specific combination of props and context.
// Play functions add automated interaction testing to visual stories.

import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { Button } from "./button";
import { Mail, ArrowRight, Trash2 } from "lucide-react";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Primary action button with loading state, icon support, and multiple variants. Built on Radix UI Slot for polymorphic rendering.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "destructive", "outline", "ghost", "link", "action"],
      description: "Visual style variant",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "icon"],
    },
    isLoading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: {
    onClick: fn(),  // Track click events in the Actions panel
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    children: "Submit Payment",
    variant: "primary",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button variant="action">Action</Button>
    </div>
  ),
};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Mail /> Send Invoice
      </>
    ),
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    children: "Processing",
    loadingText: "Processing payment...",
  },
  // Play function: verify the button is disabled and shows loading text
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");

    // Button should be disabled when loading
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toHaveTextContent("Processing payment...");
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Unavailable",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");
    await expect(button).toBeDisabled();
  },
};

// Interaction test: verify click handler fires
export const ClickTest: Story = {
  args: {
    children: "Click me",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Click me" });

    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

// Keyboard interaction: Enter and Space should trigger click
export const KeyboardNavigation: Story = {
  args: {
    children: "Keyboard test",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");

    // Tab to focus the button
    await userEvent.tab();
    await expect(button).toHaveFocus();

    // Enter triggers click
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledTimes(1);

    // Space triggers click
    await userEvent.keyboard(" ");
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};
```

## Step 3 — Add Unit Tests with Vitest

Storybook stories test visual states and interactions. Vitest tests cover logic: variant class generation, prop combinations, ref forwarding, and edge cases that don't need a visual canvas.

```typescript
// packages/ui/src/components/button/button.test.tsx — Unit tests.
// These run in milliseconds (no browser needed). They test the component
// logic that Storybook stories don't cover: class generation, ref forwarding,
// prop combinations, and accessibility attributes.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Submit</Button>);
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("applies variant classes correctly", () => {
    const { rerender } = render(<Button variant="primary">Test</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-primary");

    rerender(<Button variant="destructive">Test</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-destructive");

    rerender(<Button variant="action">Test</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-emerald-600");
  });

  it("applies size classes correctly", () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-12");
  });

  it("shows loading spinner and disables button when isLoading", () => {
    render(<Button isLoading loadingText="Saving...">Save</Button>);
    const button = screen.getByRole("button");

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("Saving...");
  });

  it("falls back to children text when loadingText is not provided", () => {
    render(<Button isLoading>Save</Button>);
    expect(screen.getByRole("button")).toHaveTextContent("Save");
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Click</Button>);

    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not fire onClick when loading", async () => {
    const onClick = vi.fn();
    render(<Button isLoading onClick={onClick}>Click</Button>);

    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards ref to the button element", () => {
    const ref = vi.fn();
    render(<Button ref={ref}>Ref test</Button>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });

  it("renders as child component when asChild is true", () => {
    render(
      <Button asChild>
        <a href="/dashboard">Go to dashboard</a>
      </Button>
    );
    // Should render as <a>, not <button>
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("merges custom className with variant classes", () => {
    render(<Button className="mt-4">Custom</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("mt-4");
    expect(button).toHaveClass("bg-primary");  // Default variant still applied
  });
});
```

## Step 4 — Configure CI Pipeline with Visual Regression

```yaml
# .github/workflows/ui-library.yml — CI for the component library.
# Runs unit tests (Vitest), interaction tests (Storybook test-runner),
# and visual regression (Chromatic) on every pull request.

name: UI Library CI
on:
  pull_request:
    paths:
      - "packages/ui/**"
      - ".github/workflows/ui-library.yml"

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      # Unit tests with coverage
      - name: Unit tests
        run: pnpm --filter @repo/ui test -- --coverage --coverage.thresholds.lines=85
        working-directory: packages/ui

      # Build Storybook
      - name: Build Storybook
        run: pnpm --filter @repo/ui build-storybook
        working-directory: packages/ui

      # Run Storybook interaction tests (play functions)
      - name: Interaction tests
        run: |
          npx concurrently -k -s first -n "SB,TEST" \
            "npx http-server packages/ui/storybook-static --port 6006 --silent" \
            "npx wait-on tcp:6006 && pnpm --filter @repo/ui test-storybook"

      # Accessibility audit on every story
      - name: Accessibility check
        run: |
          npx concurrently -k -s first -n "SB,A11Y" \
            "npx http-server packages/ui/storybook-static --port 6006 --silent" \
            "npx wait-on tcp:6006 && pnpm --filter @repo/ui test-storybook -- --tags a11y"

  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }  # Full history for Chromatic baseline comparison
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      # Visual regression with Chromatic
      - name: Visual regression
        uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_TOKEN }}
          workingDir: packages/ui
          exitZeroOnChanges: true    # Don't fail PR — just flag for review
          exitOnceUploaded: true     # Don't wait for review approval
```

## Step 5 — Publish and Consume Across Applications

```json
// packages/ui/package.json — Library package configuration.
{
  "name": "@repo/ui",
  "version": "1.0.0",
  "private": true,
  "exports": {
    "./button": "./src/components/button/button.tsx",
    "./dialog": "./src/components/dialog/dialog.tsx",
    "./form": "./src/components/form/form.tsx",
    "./input": "./src/components/input/input.tsx",
    "./styles.css": "./src/styles/globals.css",
    "./lib/utils": "./src/lib/utils.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "test-storybook": "test-storybook"
  }
}
```

```tsx
// apps/dashboard/src/pages/payments.tsx — Consuming the shared library.
// Import components from @repo/ui — same source, guaranteed consistency.

import { Button } from "@repo/ui/button";
import { Dialog } from "@repo/ui/dialog";
import { Input } from "@repo/ui/input";

export function PaymentPage() {
  return (
    <div>
      <Button variant="action" size="lg">
        New Payment
      </Button>
      {/* All three apps use the same Button — same styles, same accessibility, same behavior */}
    </div>
  );
}
```

## Results

Mei's team built the component library in two weeks and migrated the three apps incrementally over the next month:

- **Design inconsistencies: 47 → 0** — the brand color update that used to require three PRs across three repos is now a single CSS variable change in `@repo/ui`.
- **Accessibility issues: 23 → 2** — the axe-core addon in Storybook caught missing ARIA labels, low contrast ratios, and keyboard navigation gaps that manual testing missed for months.
- **Test coverage: 0% → 92%** across shared components. Vitest unit tests run in 1.2 seconds; Storybook interaction tests catch visual behavior; Chromatic flags pixel-level regressions.
- **Component documentation: nonexistent → complete** — Storybook serves as the single source of truth. Designers review stories directly, new developers learn components by browsing, QA tests against documented states.
- **Duplicated component code: ~8,000 lines removed** across three apps. Each app now imports from `@repo/ui` instead of maintaining its own Button, Modal, and Form.
- **PR review time for UI changes: 45 min → 15 min** — reviewers check the Chromatic visual diff instead of pulling the branch and manually testing every viewport.
