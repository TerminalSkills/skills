---
name: class-variance-authority
description: >-
  Class Variance Authority (CVA) is a small TypeScript library that turns a
  base class string plus named variants into a typed function returning class
  names. Use when building Tailwind components with variants such as size,
  intent or state, writing a shadcn/ui-style Button or Badge, replacing
  conditional className ternaries, or typing component props with VariantProps.
license: Apache-2.0
compatibility: 'Any framework with a className or class attribute; typically Tailwind CSS; TypeScript recommended'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/joe-bell/cva
  tags: [cva, tailwind, variants, design-system, components]
---

# Class Variance Authority (CVA)

## Overview

`class-variance-authority` (0.7.1, the current stable release) exports `cva`, `cx` and the `VariantProps` type. You describe a base string, a set of variants, optional `compoundVariants` and `defaultVariants`; calling the result with props returns one class string. It does no CSS conflict resolution, so it is usually paired with `clsx` and `tailwind-merge` in a `cn()` helper. shadcn/ui builds its components this way. A newer rewrite is published as `cva` (still in beta, `1.0.0-beta.x`); this skill covers `class-variance-authority`.

## Instructions

### Step 1: Install and add the `cn` helper

```bash
npm install class-variance-authority clsx tailwind-merge
```

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Step 2: Define variants

```tsx
// components/button.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      intent: {
        primary: 'bg-blue-600 text-white hover:bg-blue-700',
        danger: 'bg-red-600 text-white hover:bg-red-700',
        ghost: 'hover:bg-gray-100',
      },
      size: { sm: 'h-8 px-3', md: 'h-10 px-4', lg: 'h-12 px-6' },
      fullWidth: { true: 'w-full' },
      loading: { true: 'cursor-wait opacity-70', false: null },
    },
    compoundVariants: [
      { intent: 'danger', size: 'lg', class: 'font-bold uppercase' },
      { intent: ['primary', 'danger'], size: ['sm', 'md'], class: 'shadow-sm' },
    ],
    defaultVariants: { intent: 'primary', size: 'md' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export function Button({ className, intent, size, fullWidth, loading, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ intent, size, fullWidth, loading }), className)}
      {...props}
    />
  )
}
```

How it behaves:

- A variant left `undefined` falls back to `defaultVariants`; passing `null` switches the variant off, default included.
- Keys named `true` or `false` make boolean variants (`fullWidth`, `loading`); pass real booleans.
- `compoundVariants` apply when every listed variant matches; a value may be an array to match several.
- The returned function also accepts `class` or `className`, appended last.
- Base and variant values can be strings, arrays or `null`.

## Examples

### Example 1: "Add a status badge with sizes"

```tsx
const badgeVariants = cva('inline-flex items-center rounded-full font-semibold', {
  variants: {
    status: {
      active: 'bg-green-100 text-green-800',
      paused: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
    },
    size: { sm: 'px-1.5 text-[10px]', md: 'px-2.5 py-0.5 text-xs' },
  },
  defaultVariants: { status: 'active', size: 'md' },
})

<span className={badgeVariants({ status: 'failed', size: 'sm' })}>Deploy failed</span>
```

The call returns `inline-flex items-center rounded-full font-semibold bg-red-100 text-red-800 px-1.5 text-[10px]`. TypeScript rejects `status: 'done'`.

### Example 2: "Let callers override padding on the Button"

```tsx
<Button size="sm" className="px-8">Save</Button>
```

Because `Button` wraps the result in `cn()`, `tailwind-merge` drops `px-3` and keeps `px-8`. Calling `buttonVariants({ size: 'sm', class: 'px-8' })` directly returns both `px-3` and `px-8` in the string, since CVA only concatenates; the browser then picks whichever Tailwind emitted later in the stylesheet.

## Guidelines

- Always wrap CVA output in `cn()` when a component accepts `className`, otherwise overrides are unreliable.
- Use `VariantProps<typeof buttonVariants>` for prop types; wrap the HTML attributes in `Omit<..., 'size'>` (for example `Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & VariantProps<...>`) if a variant name clashes with an HTML attribute, because the HTML `size` attribute on inputs is a number.
- Tailwind scans source text, so write complete class names in the variant maps; building `` `bg-${color}-500` `` at runtime is not detected and ships no CSS.
- Use `tailwind-merge` v3 with Tailwind v4 (v2 targets Tailwind v3).
- Keep one `cva` definition per component and export it, so other elements (a link styled as a button) can reuse the same classes.
- CVA is for variants, not state logic; compute booleans in the component and pass them in.
