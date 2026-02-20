---
name: class-variance-authority
description: >-
  Define component variants with CVA. Use when creating variant-based
  components with Tailwind, building design system tokens, or managing
  complex conditional class names in React.
license: Apache-2.0
compatibility: 'Any framework with Tailwind CSS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags: [cva, tailwind, variants, design-system, components]
---

# Class Variance Authority (CVA)

## Overview

CVA creates type-safe component variants with Tailwind. Define base styles, variants (size, color, state), compound variants, and defaults. Works with any framework. Powers the variant system in shadcn/ui.

## Instructions

### Step 1: Define Variants

```typescript
// components/button.tsx — Button with CVA variants
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base styles — always applied
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-blue-600 text-white hover:bg-blue-700',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        outline: 'border border-gray-300 bg-transparent hover:bg-gray-50',
        ghost: 'hover:bg-gray-100',
        link: 'text-blue-600 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    compoundVariants: [
      // Destructive + outline = red border
      { variant: 'outline', className: 'border-2' },
      { variant: 'destructive', size: 'lg', className: 'text-lg font-bold' },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
```

### Step 2: Complex Components

```typescript
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      status: {
        active: 'bg-green-100 text-green-800',
        inactive: 'bg-gray-100 text-gray-600',
        warning: 'bg-yellow-100 text-yellow-800',
        error: 'bg-red-100 text-red-800',
      },
      size: {
        sm: 'text-[10px] px-1.5 py-0',
        md: 'text-xs px-2.5 py-0.5',
        lg: 'text-sm px-3 py-1',
      },
    },
    defaultVariants: { status: 'active', size: 'md' },
  }
)

// Usage
<Badge status="active">Online</Badge>
<Badge status="error" size="sm">Failed</Badge>
```

## Guidelines

- CVA is for defining variants. Use `cn()` (clsx + tailwind-merge) for conditional classes.
- `compoundVariants` for combinations that need special treatment (e.g., destructive + outline).
- `VariantProps<typeof variants>` gives you TypeScript types for free.
- Keep CVA definitions close to their component — one file per component.
- Works with any CSS framework, but shines with Tailwind's utility classes.
