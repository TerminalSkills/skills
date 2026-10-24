---
title: Migrate a React App from CSS Modules to Tailwind
slug: migrate-css-to-tailwind
description: "Systematically convert a React codebase from CSS Modules to Tailwind CSS — audit existing styles, map custom properties to Tailwind config, convert components incrementally, and remove dead CSS."
skills: [tailwindcss, frontend-design]
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

Use the **tailwindcss** skill (Tailwind CSS v4) to set up Tailwind alongside existing CSS Modules and migrate incrementally — one component at a time. The migration follows four phases: audit existing styles, configure Tailwind with the design system's tokens, convert components starting from leaf components (buttons, badges) up to page layouts, and clean up dead CSS as components are converted.

## Step-by-Step Walkthrough

### Step 1: Audit the Existing Styles

```text
Audit the CSS in our React app. I need to know: how many unique colors, font sizes, 
spacing values, breakpoints, and shadows we use across all CSS Module files. Map 
them to the closest Tailwind defaults so I can write the @theme block.
```

The audit script scans all CSS Module files and extracts every unique design value:

```python
"""audit_styles.py — Extract all design tokens from CSS Module files."""
import json, re, sys
from collections import Counter
from pathlib import Path

def audit_css_directory(css_dir: str) -> dict:
    files = list(Path(css_dir).rglob("*.module.css"))
    colors, font_sizes, spacings = Counter(), Counter(), Counter()
    shadows, radii, breakpoints = Counter(), Counter(), set()

    for css_file in files:
        content = css_file.read_text()
        for m in re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)", content):
            colors[m.lower()] += 1
        for m in re.findall(r"font-size:\s*(\d+(?:\.\d+)?(?:px|rem|em))", content):
            font_sizes[m] += 1
        # Shorthands such as "padding: 6px 12px" hold several values: take them all
        for decl in re.findall(r"(?:margin|padding|gap)(?:-[\w-]+)?:\s*([^;}]+)", content):
            for px in re.findall(r"(?<![\w.])(\d+(?:\.\d+)?)px", decl):
                spacings[px + "px"] += 1
        for m in re.findall(r"@media[^{]*?(?:min|max)-width:\s*(\d+px)", content):
            breakpoints.add(m)
        for m in re.findall(r"box-shadow:\s*([^;}]+)", content):
            shadows[m.strip()] += 1
        for m in re.findall(r"border-radius:\s*(\d+(?:\.\d+)?(?:px|rem|%))", content):
            radii[m] += 1

    return {
        "totals": {"css_files": len(files), "unique_colors": len(colors),
                   "unique_font_sizes": len(font_sizes), "unique_spacings": len(spacings),
                   "unique_radii": len(radii)},
        "colors": dict(colors.most_common()),
        "font_sizes": dict(font_sizes.most_common()),
        "spacings": dict(spacings.most_common()),
        "breakpoints": sorted(breakpoints),
        "shadows": dict(shadows.most_common(10)),
        "border_radii": dict(radii.most_common()),
    }

if __name__ == "__main__":
    print(json.dumps(audit_css_directory(sys.argv[1]), indent=2))
```

Run it with `python3 audit_styles.py src`. A typical result reveals the chaos:

| Token | Count | Issue |
|---|---|---|
| Unique colors | 47 | Design system specifies 12 |
| Font sizes | 11 | Should be 6 (xs through 2xl) |
| Spacing values | 23 | Should follow the 4px scale |
| Border radii | 8 | Should be 3 (sm, md, lg) |

### Step 2: Configure Tailwind with Design Tokens

Tailwind v4 has no `tailwind.config.js` and no `content` list by default. Configuration lives in CSS, in an `@theme` block, and source files are detected automatically. Install the PostCSS plugin (Next.js and most bundlers) or the Vite plugin (`@tailwindcss/vite`):

```text
Based on the style audit, set up Tailwind CSS v4 in the project alongside existing 
CSS Modules. Map our 47 colors to a cleaned-up palette of 12 (with semantic names), 
keep the 4px spacing grid, and keep breakpoints matching our existing media queries.
```

```bash
npm install tailwindcss @tailwindcss/postcss
```

```js
// postcss.config.mjs
export default { plugins: { "@tailwindcss/postcss": {} } };
```

```css
/* src/globals.css — import it once, from your app entry point */
@import "tailwindcss";

@theme {
  /* Drop the default palette so only the design system's colors exist */
  --color-*: initial;

  --color-white: #ffffff;
  --color-black: #1a1a1a;

  /* Brand blue, mapped from the audit's most-used blues (#3a7ff5, #3b82f6, #4285f4) */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;

  /* Neutral grays, consolidated from 15 unique grays */
  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-500: #6b7280;
  --color-gray-700: #374151;
  --color-gray-900: #111827;

  /* Semantic colors */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-error-dark: #dc2626;

  /* Radii: three sizes instead of eight */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  --shadow-card: 0 1px 3px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.06);
  --shadow-dropdown: 0 4px 12px rgb(0 0 0 / 0.12);
}
```

Each variable name decides which utilities exist: `--color-primary-500` gives `bg-primary-500` and `text-primary-500`, `--radius-md` gives `rounded-md`, `--shadow-card` gives `shadow-card`. Two things need no configuration:

- **Spacing** is already a 4px grid: `p-1` is 4px, `p-4` is 16px, `p-6` is 24px, and `px-1.5` is 6px. An off-grid value such as 5px or 15px has to be rounded to the nearest step in the component it appears in; that is the point of the migration.
- **Breakpoints** default to `sm` 640px, `md` 768px, `lg` 1024px and `xl` 1280px. Only if the audit shows different media queries, add `--breakpoint-md: 56rem;` style overrides to `@theme`.

With `--color-*: initial` a stray `bg-blue-500` generates no CSS, so a leftover default color shows up as a missing style instead of silently passing review.

**Coexistence caveat.** Tailwind v4 places its utilities in a CSS cascade layer, and CSS Module rules are not in a layer, so an unlayered CSS Module rule beats a Tailwind utility on the same element regardless of specificity. Do not put both a module class and a conflicting utility on one element: convert the whole component, then delete its module. Tailwind's preflight also resets default element styles app-wide, so check pages that rely on browser defaults (headings, lists, buttons) after adding it.

### Step 3: Convert Components Incrementally

Start from leaf components (smallest, most reused) and work up to page layouts. Each component is a self-contained migration:

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
/* components/Button/Button.module.css */
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

After (Tailwind). Class names must appear in full in the source for Tailwind to find them, so keep them in lookup objects rather than building them with string interpolation:

```tsx
// components/Button/Button.tsx — AFTER (no CSS file needed)
import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary: 'bg-primary-500 text-white hover:bg-primary-600',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  danger: 'bg-error text-white hover:bg-error-dark',
} as const;

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

The font sizes shift slightly (13px becomes `text-xs`, 12px; 16px stays `text-base`) because the design system has fewer sizes than the old CSS; that is a design decision to confirm with whoever owns the design system, not a bug. Delete `Button.module.css` once nothing imports it.

### Step 4: Handle Complex Components

Some styles do not map cleanly to utilities, such as selectors that target markup you do not control (rendered Markdown, CMS output). Use `@apply` inside `@layer components` in the global stylesheet:

```css
@layer components {
  .prose-content h2 { @apply mt-8 mb-4 text-2xl font-bold text-gray-900; }
  .prose-content p  { @apply mb-4 text-base leading-relaxed text-gray-700; }
  .prose-content a  { @apply text-primary-500 underline hover:text-primary-700; }
}
```

In a CSS Module, `@apply` does not see your theme unless the file starts with `@reference "../../globals.css";` (adjust the path). Prefer utilities in the markup and keep `@apply` for cases like the above.

For a mechanical first pass over a codebase that already uses Tailwind v3, `npx @tailwindcss/upgrade` converts config and renamed utilities; it does not convert CSS Modules to utilities, so that work stays manual.

### Step 5: Remove Dead CSS

A CSS Module file that no source file imports is dead. Check for the file name in the source, not the component name:

```bash
find src -name '*.module.css' | while read -r css; do
  grep -rqF "$(basename "$css")" src --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    || echo "unused: $css"
done
```

This finds whole files with no importer. It cannot find unused classes inside a file that is still imported; those disappear when the component is converted. Track progress with:

```bash
echo "CSS Modules remaining: $(find src -name '*.module.css' | wc -l)"
echo "Components: $(find src -name '*.tsx' | wc -l)"
```

## Real-World Example

A four-person frontend team starts the migration on a Monday. Phase 1 (setup + config) takes half a day. They convert 8 leaf components (Button, Badge, Avatar, Input, Select, Checkbox, Toggle, Tooltip) in the first week — each taking 15-30 minutes.

By week two, they've established a rhythm: one developer converts 2-3 components per day alongside feature work. The CSS Module files count drops from 85 to 60. New components are written in Tailwind exclusively.

At the end of the first month, 65 of 85 CSS files are deleted. Total CSS dropped from 12,000 lines to 3,200 — and 2,800 of those remaining lines are in the 20 most complex components still awaiting conversion. The design inconsistency issue vanished: every component now draws on the same 12 colors, the theme's font sizes, and the 4px spacing scale, because the `@theme` block is the only source of colors.

The team finishes the last 20 components in month two. Final CSS: 0 Module files. The entire visual layer lives in component markup with constrained design tokens. New developer onboarding no longer includes "here's how our CSS conventions work" — it's "use Tailwind classes from the config."

## Related Skills

- [tailwindcss](../skills/tailwindcss/) -- Tailwind configuration, responsive design, animations, and plugins
- [frontend-design](../skills/frontend-design/) -- General frontend design patterns and component architecture
