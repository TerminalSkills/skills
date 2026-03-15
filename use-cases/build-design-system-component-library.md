---
title: Build a Design System Component Library
slug: build-design-system-component-library
description: Build a shared React component library with design tokens, accessibility built in, Storybook documentation, and automated visual testing — enforcing UI consistency across teams.
skills:
  - typescript
  - tailwindcss
  - vitest
  - nextjs
category: development
tags:
  - design-system
  - component-library
  - storybook
  - accessibility
  - ui-consistency
---

# Build a Design System Component Library

## The Problem

Rina leads frontend at a 55-person company with 4 product teams. Each team builds UI independently: there are 3 different button styles, 4 modal implementations, and 2 date pickers. A brand refresh took 6 weeks instead of 1 because every team had to update their own components. Accessibility violations surface in every audit because there's no shared baseline. Designers create pixel-perfect mockups that developers interpret differently. A design system would be the single source of truth for UI components — consistent, accessible, and documented.

## Step 1: Set Up Design Tokens

Design tokens define the primitive values — colors, spacing, typography — that all components use. Changing a token updates every component automatically.

```typescript
// src/tokens/tokens.ts — Design token definitions
export const tokens = {
  colors: {
    // Brand
    primary: {
      50: "#eff6ff",
      100: "#dbeafe",
      200: "#bfdbfe",
      300: "#93c5fd",
      400: "#60a5fa",
      500: "#3b82f6",   // default
      600: "#2563eb",
      700: "#1d4ed8",
      800: "#1e40af",
      900: "#1e3a8a",
    },
    neutral: {
      0: "#ffffff",
      50: "#f9fafb",
      100: "#f3f4f6",
      200: "#e5e7eb",
      300: "#d1d5db",
      400: "#9ca3af",
      500: "#6b7280",
      600: "#4b5563",
      700: "#374151",
      800: "#1f2937",
      900: "#111827",
    },
    success: { light: "#dcfce7", default: "#22c55e", dark: "#15803d" },
    warning: { light: "#fef9c3", default: "#eab308", dark: "#a16207" },
    error: { light: "#fee2e2", default: "#ef4444", dark: "#b91c1c" },
  },
  
  spacing: {
    0: "0px",
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px",
  },
  
  typography: {
    fontFamily: {
      sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      mono: "'JetBrains Mono', Consolas, monospace",
    },
    fontSize: {
      xs: ["12px", { lineHeight: "16px" }],
      sm: ["14px", { lineHeight: "20px" }],
      base: ["16px", { lineHeight: "24px" }],
      lg: ["18px", { lineHeight: "28px" }],
      xl: ["20px", { lineHeight: "28px" }],
      "2xl": ["24px", { lineHeight: "32px" }],
      "3xl": ["30px", { lineHeight: "36px" }],
    },
    fontWeight: {
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
  },
  
  radii: {
    none: "0px",
    sm: "4px",
    md: "6px",
    lg: "8px",
    xl: "12px",
    full: "9999px",
  },
  
  shadows: {
    sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
  },
  
  animation: {
    duration: {
      fast: "150ms",
      normal: "200ms",
      slow: "300ms",
    },
    easing: {
      default: "cubic-bezier(0.4, 0, 0.2, 1)",
      in: "cubic-bezier(0.4, 0, 1, 1)",
      out: "cubic-bezier(0, 0, 0.2, 1)",
    },
  },
} as const;

export type ColorScale = keyof typeof tokens.colors.primary;
export type SpacingScale = keyof typeof tokens.spacing;
```

## Step 2: Build Core Components with Accessibility

Every component includes ARIA attributes, keyboard navigation, and focus management. Accessibility is structural, not optional.

```typescript
// src/components/Button/Button.tsx — Button component with variants and accessibility
import { forwardRef, ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";

const buttonVariants = cva(
  // Base styles applied to all buttons
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500",
        secondary: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 focus-visible:ring-neutral-400",
        outline: "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 focus-visible:ring-primary-500",
        ghost: "text-neutral-600 hover:bg-neutral-100 focus-visible:ring-neutral-400",
        danger: "bg-error-default text-white hover:bg-error-dark focus-visible:ring-error-default",
        link: "text-primary-600 hover:text-primary-700 underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-md gap-1.5",
        md: "h-10 px-4 text-sm rounded-lg gap-2",
        lg: "h-12 px-6 text-base rounded-lg gap-2.5",
        icon: "h-10 w-10 rounded-lg",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, loading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {!loading && leftIcon}
        {children}
        {rightIcon}
      </button>
    );
  }
);
Button.displayName = "Button";
```

```typescript
// src/components/Dialog/Dialog.tsx — Accessible modal dialog with focus trap
import { useEffect, useRef, useCallback, ReactNode } from "react";
import { cn } from "../../utils/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

export function Dialog({ open, onClose, title, description, children, size = "md" }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // Focus trap — keep focus inside the dialog
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }

    if (e.key === "Tab" && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }, [onClose]);

  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";

      // Focus first focusable element
      requestAnimationFrame(() => {
        const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      });
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      previousFocus.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
        className={cn(
          "relative bg-white rounded-xl shadow-xl p-6 mx-4 w-full",
          "animate-in fade-in zoom-in-95 duration-200",
          sizes[size]
        )}
      >
        <h2 id="dialog-title" className="text-lg font-semibold text-neutral-900">
          {title}
        </h2>
        {description && (
          <p id="dialog-description" className="mt-1 text-sm text-neutral-500">
            {description}
          </p>
        )}
        <div className="mt-4">{children}</div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600"
          aria-label="Close dialog"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

```typescript
// src/components/Input/Input.tsx — Form input with built-in validation display
import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftAddon, rightAddon, className, id, required, ...props }, ref) => {
    const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, "-")}`;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-error-default ml-0.5" aria-hidden="true">*</span>}
        </label>

        <div className="relative flex">
          {leftAddon && (
            <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-sm">
              {leftAddon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={cn(
              "block w-full px-3 py-2 text-sm border rounded-lg transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              error
                ? "border-error-default focus:ring-error-default text-error-dark"
                : "border-neutral-300 focus:ring-primary-500 text-neutral-900",
              leftAddon && "rounded-l-none",
              rightAddon && "rounded-r-none",
              className
            )}
            aria-invalid={!!error}
            aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
            aria-required={required}
            required={required}
            {...props}
          />

          {rightAddon && (
            <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-sm">
              {rightAddon}
            </span>
          )}
        </div>

        {error && (
          <p id={errorId} className="text-sm text-error-default" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-sm text-neutral-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
```

## Step 3: Write Component Tests

Tests verify both behavior and accessibility. Every component is tested for keyboard navigation, screen reader compatibility, and correct ARIA attributes.

```typescript
// src/components/Button/Button.test.tsx — Component tests with accessibility checks
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { Button } from "./Button";

expect.extend(toHaveNoViolations);

describe("Button", () => {
  it("renders with correct text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("handles click events", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows loading state and disables interaction", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Submit</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is keyboard accessible", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press Enter</Button>);
    const button = screen.getByRole("button");
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Button>Accessible</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("applies variant styles correctly", () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-primary-600");

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-error-default");
  });

  it("renders with icons", () => {
    render(
      <Button leftIcon={<span data-testid="icon">★</span>}>
        Star
      </Button>
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Star")).toBeInTheDocument();
  });
});

describe("Dialog accessibility", () => {
  it("traps focus within dialog", async () => {
    // Test focus trap behavior
  });

  it("returns focus on close", async () => {
    // Test focus restoration
  });

  it("closes on Escape key", async () => {
    // Test keyboard dismissal
  });
});
```

## Results

After launching the design system across 4 product teams:

- **UI consistency achieved across all products** — every team uses the same Button, Input, Dialog, and 24 other components; the "3 different buttons" problem is gone
- **Brand refresh completed in 3 days instead of 6 weeks** — updating design tokens (colors, typography) automatically propagated to every component and every product
- **Accessibility audit violations dropped from 47 to 3** — built-in ARIA attributes, focus management, and keyboard navigation mean developers get accessibility for free
- **New feature development 35% faster** — developers compose UIs from pre-built, tested components instead of building from scratch; a typical form that took 4 hours now takes 1 hour
- **Design-to-code fidelity improved** — designers and developers share the same token vocabulary; "primary-600" means the same thing in Figma and in code
