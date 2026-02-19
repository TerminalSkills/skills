---
title: Migrate a React App from CSS Modules to Tailwind
slug: migrate-css-to-tailwind
description: "Systematically convert a React codebase from CSS Modules to Tailwind CSS — audit existing styles, map custom properties to Tailwind config, convert components incrementally, and remove dead CSS."
skills: [tailwindcss]
category: development
tags: [tailwindcss, css, react, migration, refactoring, frontend]
---

# Migrate a React App from CSS Modules to Tailwind

## The Problem

A React application with 120 components uses CSS Modules for styling. The codebase has grown over two years and now contains 85 CSS Module files totaling 12,000 lines. The problems have compounded:

Naming inconsistency — some files use BEM (`.card__header--active`), others use camelCase (`.cardHeader`), and newer files use random names. A developer joining the team spends 20 minutes figuring out which class name convention to use for each component, then picks the wrong one.

Dead CSS everywhere — components have been refactored and deleted, but their CSS files remain. Nobody knows which styles are actually used. A rough audit suggests 30-40% of the CSS is dead code, but nobody wants to delete it because "what if something breaks."

Design inconsistency — spacing values range from 4px to 5px to 6px to 8px to 10px to 12px to 14px to 15px to 16px to 20px to 24px. Font sizes include 11px, 12px, 13px, 14px, 15px, and 16px. Colors have 47 unique hex values when the design system specifies 12. Every component is slightly different because each developer eyeballed the values.

The team wants to move to Tailwind CSS for its utility-first approach, constrained design tokens, and the elimination of separate CSS files entirely. But migrating 120 components at once is a non-starter — the app needs to keep shipping features during the migration.

## The Solution

Use the **tailwindcss** skill to set up Tailwind alongside existing CSS Modules and migrate incrementally — one component at a time. The migration follows four phases: audit existing styles, configure Tailwind with the design system's tokens, convert components starting from leaf components (buttons, badges) up to page layouts, and clean up dead CSS as components are converted.

## Step-by-Step Walkthrough

### Step 1: Audit the Existing Styles

```text
Audit the CSS in our React app. I need to know: how many unique colors, font sizes, 
spacing values, breakpoints, and shadows we use across all CSS Module files. Map 
them to the closest Tailwind defaults so I can build the tailwind.config.
```

The audit script scans all CSS files and extracts every unique design value:

```python
"""audit_styles.py — Extract all design tokens from CSS Module files."""
import re, json
from pathlib import Path
from collections import Counter

def audit_css_directory(css_dir: str) -> dict:
    """Scan all CSS files and extract unique design values.

    Args:
        css_dir: Path to the source directory containing CSS files.

    Returns:
        Dict of token categories with counts and values.
    """
    colors = Counter()
    font_sizes = Counter()
    spacings = Counter()
    breakpoints = set()
    shadows = Counter()
    border_radii = Counter()

    for css_file in Path(css_dir).rglob("*.module.css"):
        content = css_file.read_text()

        # Colors (hex, rgb, hsl)
        for match in re.findall(r'#[0-9a-fA-F]{3,8}\b', content):
            colors[match.lower()] += 1
        for match in re.findall(r'rgba?\([^)]+\)', content):
            colors[match] += 1

        # Font sizes
        for match in re.findall(r'font-size:\s*(\d+(?:\.\d+)?(?:px|rem|em))', content):
            font_sizes[match] += 1

        # Spacing (margin, padding, gap)
        for match in re.findall(r'(?:margin|padding|gap)(?:-\w+)?:\s*(\d+(?:\.\d+)?px)', content):
            spacings[match] += 1

        # Media queries
        for match in re.findall(r'@media[^{]+min-width:\s*(\d+px)', content):
            breakpoints.add(match)

        # Box shadows
        for match in re.findall(r'box-shadow:\s*([^;]+)', content):
            shadows[match.strip()] += 1

        # Border radius
        for match in re.findall(r'border-radius:\s*(\d+(?:\.\d+)?(?:px|rem|%))', content):
            border_radii[match] += 1

    return {
        "colors": dict(colors.most_common()),
        "font_sizes": dict(font_sizes.most_common()),
        "spacings": dict(spacings.most_common()),
        "breakpoints": sorted(breakpoints),
        "shadows": dict(shadows.most_common(10)),
        "border_radii": dict(border_radii.most_common()),
        "totals": {
            "unique_colors": len(colors),
            "unique_font_sizes": len(font_sizes),
            "unique_spacings": len(spacings),
            "css_files": len(list(Path(css_dir).rglob("*.module.css"))),
        },
    }

if __name__ == "__main__":
    import sys
    result = audit_css_directory(sys.argv[1])
    print(json.dumps(result, indent=2))
```

A typical result reveals the chaos:

| Token | Count | Issue |
|---|---|---|
| Unique colors | 47 | Design system specifies 12 |
| Font sizes | 11 | Should be 6 (xs through 2xl) |
| Spacing values | 23 | Should follow 4px scale |
| Border radii | 8 | Should be 3 (sm, md, lg) |

### Step 2: Configure Tailwind with Design Tokens

The audit maps to a Tailwind config that constrains the design system. Every unique value from the audit gets mapped to the nearest Tailwind-compatible token:

```text
Based on the style audit, set up Tailwind CSS in the project alongside existing 
CSS Modules. Map our 47 colors to a cleaned-up palette of 12 (with semantic names), 
standardize spacing to a 4px grid, and set up responsive breakpoints matching 
our existing media queries.
```

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

```typescript
// tailwind.config.ts — Design system from the audit

import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],

  // Run alongside CSS Modules — no conflicts
  // Tailwind classes don't collide with CSS Module hashed class names
  important: false,

  theme: {
    // Override defaults with the design system
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#1a1a1a',

      // Primary brand colors (mapped from audit's most-used blues)
      primary: {
        50: '#eff6ff',
        100: '#dbeafe',
        200: '#bfdbfe',
        300: '#93c5fd',
        400: '#60a5fa',
        500: '#3b82f6',    // Main brand blue (was #3a7ff5, #3b82f6, #4285f4)
        600: '#2563eb',
        700: '#1d4ed8',
        800: '#1e40af',
        900: '#1e3a8a',
      },

      // Neutral grays (consolidated from 15 unique grays)
      gray: {
        50: '#f9fafb',
        100: '#f3f4f6',
        200: '#e5e7eb',
        300: '#d1d5db',
        400: '#9ca3af',
        500: '#6b7280',
        600: '#4b5563',
        700: '#374151',
        800: '#1f2937',
        900: '#111827',
      },

      // Semantic colors
      success: { light: '#d1fae5', DEFAULT: '#10b981', dark: '#065f46' },
      warning: { light: '#fef3c7', DEFAULT: '#f59e0b', dark: '#92400e' },
      error:   { light: '#fee2e2', DEFAULT: '#ef4444', dark: '#991b1b' },
      info:    { light: '#dbeafe', DEFAULT: '#3b82f6', dark: '#1e40af' },
    },

    // Spacing: 4px grid (replaces the 23 random values from audit)
    spacing: {
      0: '0',
      0.5: '2px',
      1: '4px',
      1.5: '6px',
      2: '8px',
      2.5: '10px',
      3: '12px',
      4: '16px',
      5: '20px',
      6: '24px',
      8: '32px',
      10: '40px',
      12: '48px',
      16: '64px',
      20: '80px',
      24: '96px',
    },

    // Font sizes (6 sizes instead of 11)
    fontSize: {
      xs: ['12px', { lineHeight: '16px' }],
      sm: ['14px', { lineHeight: '20px' }],
      base: ['16px', { lineHeight: '24px' }],
      lg: ['18px', { lineHeight: '28px' }],
      xl: ['20px', { lineHeight: '28px' }],
      '2xl': ['24px', { lineHeight: '32px' }],
      '3xl': ['30px', { lineHeight: '36px' }],
    },

    // Breakpoints (matching existing media queries)
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },

    borderRadius: {
      none: '0',
      sm: '4px',
      DEFAULT: '8px',
      lg: '12px',
      full: '9999px',
    },

    extend: {
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
        dropdown: '0 4px 12px rgba(0, 0, 0, 0.12)',
        modal: '0 20px 60px rgba(0, 0, 0, 0.2)',
      },
    },
  },

  plugins: [],
} satisfies Config;
```

Add the Tailwind directives to the global CSS:

```css
/* src/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Step 3: Convert Components Incrementally

Start from leaf components (smallest, most reused) and work up to page layouts. Each component is a self-contained migration — the CSS Module and Tailwind coexist during the transition:

```text
Convert the Button component from CSS Modules to Tailwind. Keep the same 
visual appearance. Show the before and after.
```

Before (CSS Module):

```tsx
// components/Button/Button.tsx — BEFORE
import styles from './Button.module.css';

export function Button({ variant = 'primary', size = 'md', children, ...props }) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

```css
/* components/Button/Button.module.css — 45 lines of CSS */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.button:disabled { opacity: 0.5; cursor: not-allowed; }
.primary { background-color: #3b82f6; color: white; }
.primary:hover { background-color: #2563eb; }
.secondary { background-color: #f3f4f6; color: #374151; }
.secondary:hover { background-color: #e5e7eb; }
.danger { background-color: #ef4444; color: white; }
.danger:hover { background-color: #dc2626; }
.sm { padding: 6px 12px; font-size: 13px; }
.md { padding: 8px 16px; font-size: 14px; }
.lg { padding: 12px 24px; font-size: 16px; }
```

After (Tailwind):

```tsx
// components/Button/Button.tsx — AFTER (no CSS file needed)

const variants = {
  primary: 'bg-primary-500 text-white hover:bg-primary-600',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  danger: 'bg-error text-white hover:bg-red-600',
} as const;

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
} as const;

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

Delete `Button.module.css` — that's 45 lines of CSS gone with no separate file to maintain.

### Step 4: Handle Complex Components

Some components have styles that don't map cleanly to Tailwind utilities — complex selectors, animations, or pseudo-element tricks. Use `@apply` as a bridge:

```css
/* For truly complex cases, use @apply in a utility layer */
@layer components {
  .prose-content h2 {
    @apply text-2xl font-bold text-gray-900 mt-8 mb-4;
  }
  .prose-content p {
    @apply text-base text-gray-600 leading-relaxed mb-4;
  }
  .prose-content a {
    @apply text-primary-500 underline hover:text-primary-700;
  }
}
```

### Step 5: Remove Dead CSS

After converting a batch of components, remove the orphaned CSS Module files:

```bash
# Find CSS Module files with no corresponding import
grep -rL "\.module\.css" src/components/ --include="*.tsx" --include="*.ts" | \
  while read component; do
    dir=$(dirname "$component")
    css_file="$dir/$(basename "$component" .tsx).module.css"
    if [ -f "$css_file" ]; then
      echo "Potentially dead: $css_file"
    fi
  done
```

Track migration progress:

```bash
# Count remaining CSS Module files vs total components
echo "CSS Modules remaining: $(find src -name '*.module.css' | wc -l)"
echo "Total components: $(find src -name '*.tsx' | wc -l)"
```

## Real-World Example

A four-person frontend team starts the migration on a Monday. Phase 1 (setup + config) takes half a day. They convert 8 leaf components (Button, Badge, Avatar, Input, Select, Checkbox, Toggle, Tooltip) in the first week — each taking 15-30 minutes.

By week two, they've established a rhythm: one developer converts 2-3 components per day alongside feature work. The CSS Module files count drops from 85 to 60. New components are written in Tailwind exclusively.

At the end of the first month, 65 of 85 CSS files are deleted. Total CSS dropped from 12,000 lines to 3,200 — and 2,800 of those remaining lines are in the 20 most complex components still awaiting conversion. The design inconsistency issue vanished: every component now uses the same 12 colors, 6 font sizes, and 4px spacing grid because Tailwind enforces it.

The team finishes the last 20 components in month two. Final CSS: 0 Module files. The entire visual layer lives in component markup with constrained design tokens. New developer onboarding no longer includes "here's how our CSS conventions work" — it's "use Tailwind classes from the config."

## Related Skills

- [tailwindcss](../skills/tailwindcss/) -- Tailwind configuration, responsive design, animations, and plugins
- [frontend-design](../skills/frontend-design/) -- General frontend design patterns and component architecture
