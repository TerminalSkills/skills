---
title: "Build an AI Design System with Impeccable"
description: "Build a consistent design system where AI generates React components that follow strict design tokens and rules"
skills: [impeccable-design, shadcn-ui, storybook]
difficulty: intermediate
time_estimate: "4 hours"
tags: [design-system, components, react, tailwind, storybook, design-tokens, visual-regression]
---

# Build an AI Design System with Impeccable

## The Problem

Every time AI generates a component, it picks random spacing, inconsistent colors, and different border radiuses. Your app looks like 5 different designers worked on it — and none of them talked to each other.

## The Solution

Define strict design tokens and rules using Impeccable's design language. AI generates components that follow your system every time — consistent spacing, typography, colors, and patterns.

## Persona

**Lena, Design Engineer** — building a component library for a fintech startup. 40 components needed. She defines the rules once, then AI generates components that follow them perfectly. Every new component looks like it belongs.

## Step 1: Define Design Tokens

Create your single source of truth:

```typescript
// design-tokens.ts
export const tokens = {
  // Spacing: 4px grid
  spacing: {
    xs: '4px',    // 0.25rem
    sm: '8px',    // 0.5rem
    md: '16px',   // 1rem
    lg: '24px',   // 1.5rem
    xl: '32px',   // 2rem
    '2xl': '48px', // 3rem
    '3xl': '64px', // 4rem
  },

  // Typography scale
  typography: {
    'display-lg': { size: '36px', weight: 600, lineHeight: 1.2, tracking: '-0.02em' },
    'display-sm': { size: '30px', weight: 600, lineHeight: 1.2, tracking: '-0.01em' },
    'heading':    { size: '24px', weight: 600, lineHeight: 1.3 },
    'subheading': { size: '18px', weight: 500, lineHeight: 1.4 },
    'body':       { size: '16px', weight: 400, lineHeight: 1.5 },
    'body-sm':    { size: '14px', weight: 400, lineHeight: 1.5 },
    'caption':    { size: '12px', weight: 400, lineHeight: 1.4 },
  },

  // Color palette
  colors: {
    primary:   { 50: '#EEF2FF', 100: '#E0E7FF', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA' },
    neutral:   { 50: '#F9FAFB', 100: '#F3F4F6', 200: '#E5E7EB', 500: '#6B7280', 700: '#374151', 900: '#111827' },
    success:   { 50: '#F0FDF4', 500: '#22C55E', 700: '#15803D' },
    warning:   { 50: '#FFFBEB', 500: '#F59E0B', 700: '#B45309' },
    error:     { 50: '#FEF2F2', 500: '#EF4444', 700: '#B91C1C' },
  },

  // Border radius
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  // Shadows
  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px -1px rgba(0,0,0,0.1)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.1)',
  },
} as const;
```

## Step 2: Define Impeccable Design Rules

Create constraints that every component must follow:

```yaml
# impeccable-rules.yaml
rules:
  spacing:
    - "All spacing must use 4px grid values from tokens"
    - "Component internal padding: md (16px) minimum"
    - "Between sibling elements: sm (8px) or md (16px)"
    - "Section spacing: xl (32px) or 2xl (48px)"
    - "Never use arbitrary values like 13px or 22px"

  typography:
    - "Use only defined type scale — no custom font sizes"
    - "Body text: body (16px) or body-sm (14px)"
    - "Page titles: display-lg or display-sm"
    - "Card/section titles: heading or subheading"
    - "Max line length: 65 characters for body text"

  colors:
    - "Interactive elements: primary-600 default, primary-700 hover"
    - "Text: neutral-900 primary, neutral-500 secondary"
    - "Backgrounds: white or neutral-50"
    - "Borders: neutral-200"
    - "Status colors only for status indicators — never decorative"

  components:
    - "Buttons: height 40px (md) or 36px (sm), radius-md"
    - "Cards: radius-lg, shadow-sm, border neutral-200"
    - "Inputs: height 40px, radius-md, border neutral-200"
    - "All interactive elements must have hover and focus states"
    - "Focus ring: 2px primary-500 with 2px offset"

  layout:
    - "Max content width: 1280px"
    - "Page padding: lg (24px) mobile, 2xl (48px) desktop"
    - "Grid: 12-column with md (16px) gap"
```

## Step 3: Generate Components with AI

Feed the tokens and rules to the AI:

```bash
claude-code --task "
Read design-tokens.ts and impeccable-rules.yaml.
These are STRICT constraints — never deviate.

Generate a Button component:
- Variants: primary, secondary, outline, ghost, destructive
- Sizes: sm (36px), md (40px), lg (48px)
- States: default, hover, active, disabled, loading
- Include icon support (left and right)
- Use shadcn/ui as base, override with our tokens
- TypeScript + Tailwind CSS
- Write to src/components/ui/Button.tsx
"
```

Example output:

```tsx
// src/components/ui/Button.tsx
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const variants = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
  secondary: 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
  outline: 'border border-neutral-200 text-neutral-700 hover:bg-neutral-50',
  ghost: 'text-neutral-700 hover:bg-neutral-100',
  destructive: 'bg-error-500 text-white hover:bg-error-700',
};

const sizes = {
  sm: 'h-9 px-3 text-body-sm rounded-md',   // 36px
  md: 'h-10 px-4 text-body-sm rounded-md',   // 40px
  lg: 'h-12 px-6 text-body rounded-md',      // 48px
};

export function Button({ variant = 'primary', size = 'md', loading, icon, iconRight, children, className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  );
}
```

## Step 4: Visual Regression Testing

Compare generated components against reference designs:

```bash
# Generate Storybook stories automatically
claude-code --task "
Create Storybook stories for src/components/ui/Button.tsx.
Show all variants, sizes, states, and combinations.
Write to src/components/ui/Button.stories.tsx.
"

# Screenshot stories for regression comparison
npx storycap --serverCmd 'npx storybook dev -p 6006' \
  --outDir screenshots/current

# Compare against reference screenshots
npx reg-cli \
  screenshots/current \
  screenshots/reference \
  screenshots/diff \
  --report screenshots/report.html
```

## Step 5: Batch Generate the Full Library

```bash
#!/bin/bash
# generate-library.sh

COMPONENTS=(
  "Button:variants=primary,secondary,outline,ghost,destructive;sizes=sm,md,lg"
  "Input:types=text,email,password,search;states=default,error,disabled"
  "Select:variants=default,multi;sizes=sm,md"
  "Card:variants=default,outlined,elevated"
  "Badge:variants=default,success,warning,error;sizes=sm,md"
  "Avatar:sizes=sm,md,lg,xl;shapes=circle,rounded"
  "Modal:sizes=sm,md,lg,fullscreen"
  "Table:features=sort,filter,pagination"
  "Tabs:variants=default,pills,underline"
  "Toast:variants=info,success,warning,error"
)

for spec in "${COMPONENTS[@]}"; do
  NAME="${spec%%:*}"
  DETAILS="${spec#*:}"
  echo "🧩 Generating: $NAME"

  claude-code --task "
  Read design-tokens.ts and impeccable-rules.yaml (strict constraints).
  Generate component: $NAME with $DETAILS.
  Output: src/components/ui/${NAME}.tsx and src/components/ui/${NAME}.stories.tsx
  Follow all Impeccable rules. Use shadcn/ui as base.
  "
done

echo "✅ Generated ${#COMPONENTS[@]} components"
```

## Step 6: Storybook Documentation

Auto-generate docs for the full library:

```bash
claude-code --task "
Generate a Storybook introduction page at .storybook/Introduction.mdx that:
- Lists all components in the library
- Shows the design token reference (colors, spacing, typography)
- Documents the Impeccable rules
- Provides copy-paste examples for each component

Also create a Tokens story at src/stories/Tokens.stories.tsx showing
visual swatches for all colors, spacing scale, and typography scale.
"

# Launch Storybook
npx storybook dev -p 6006
```

## Key Takeaways

- **Tokens are the law** — every value comes from the token system, no exceptions
- **Rules prevent drift** — without Impeccable constraints, AI invents new patterns
- **Generate + validate loop** — always compare output against rules visually
- **Storybook is your QA** — if it looks wrong in Storybook, catch it before production
- **Batch generation works** — once rules are solid, generate 10 components/hour
- **Update tokens, regenerate** — changing primary color from indigo to blue? Update once, regenerate all
