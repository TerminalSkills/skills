---
name: tailwindcss
description: >-
  Tailwind CSS is a utility-first CSS framework: you style pages with small
  classes in the markup and ship only the CSS you use. Covers Tailwind v4
  (CSS-first config with @theme, @import "tailwindcss", Vite and PostCSS
  plugins), responsive layouts, dark mode, custom animations, and the v3 to
  v4 renames. Use when someone asks to "style with Tailwind", "set up Tailwind
  v4", "upgrade Tailwind to v4", "add dark mode", or "fix Tailwind classes
  that stopped working".
license: Apache-2.0
compatibility: "Tailwind CSS 4.x; Node.js 20+ for the CLI and upgrade tool. Browsers: Safari 16.4+, Chrome 111+, Firefox 128+."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/tailwindlabs/tailwindcss
  tags: "tailwindcss, css, utility-first, responsive, dark-mode"
---
# Tailwind CSS — Utility-First CSS Framework

## Overview

Tailwind CSS builds designs from single-purpose utility classes (`flex`, `p-4`, `text-sm`) written directly in HTML or JSX. The compiler scans your source files, generates only the classes it finds, and reads design tokens (colors, fonts, radii, breakpoints) from CSS variables declared in `@theme`. Since v4 there is no `tailwind.config.js` by default and no `content` list: configuration lives in your CSS file and class detection is automatic.

## Instructions

### Install (v4)

```bash
# Vite (recommended for Vite, SvelteKit, Astro, etc.)
npm install tailwindcss @tailwindcss/vite
# PostCSS (Next.js and others)
npm install tailwindcss @tailwindcss/postcss
# Standalone build with no bundler
npm install tailwindcss @tailwindcss/cli
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({ plugins: [tailwindcss()] });
```

```js
// postcss.config.mjs — PostCSS users (no postcss-import or autoprefixer needed)
export default { plugins: { "@tailwindcss/postcss": {} } };
```

```css
/* src/app.css — replaces the three v3 @tailwind directives */
@import "tailwindcss";
```

For the CLI: `npx @tailwindcss/cli -i src/app.css -o dist/app.css --watch`. To move a v3 project, run `npx @tailwindcss/upgrade` on a new branch and review the diff.

### Layout and Responsive

```tsx
// Responsive card grid with flexbox/grid
function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-4">
      {products.map((product) => (
        <div key={product.id}
          className="group bg-white rounded-2xl shadow-xs border border-gray-100
                     hover:shadow-lg hover:border-gray-200 transition-all duration-300
                     overflow-hidden">
          {/* Image with aspect ratio */}
          <div className="aspect-[4/3] overflow-hidden">
            <img src={product.image} alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          </div>

          {/* Content */}
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
              <span className="text-lg font-bold text-emerald-600">${product.price}</span>
            </div>
            <p className="text-sm text-gray-500 line-clamp-2">{product.description}</p>
            <div className="flex gap-2 pt-2">
              {product.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Dark Mode and Custom Theme

```css
/* globals.css — Tailwind v4 */
@import "tailwindcss";

@theme {
  --color-brand-50: #eff6ff;
  --color-brand-500: #3b82f6;
  --color-brand-600: #2563eb;
  --color-brand-700: #1d4ed8;

  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
}
```

Theme variable names decide which utilities exist: `--color-brand-500` gives `bg-brand-500` and `text-brand-500`, `--font-sans` sets `font-sans`, `--breakpoint-3xl` adds a `3xl:` variant. The v3 names `--font-family-*` are not recognized.

By default `dark:` follows `prefers-color-scheme`. To switch with a class (for a theme toggle), override the variant once in your CSS:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

```tsx
// Dark mode — add the dark: prefix
function DashboardCard({ title, value, trend }: CardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      <p className={`text-sm mt-2 ${trend > 0 ? "text-emerald-600" : "text-red-500"}`}>
        {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
      </p>
    </div>
  );
}
```

### Animations

```tsx
// 4 built-in animations
<div className="animate-spin">...</div>        // loading spinner
<div className="animate-ping">...</div>         // notification dot
<div className="animate-pulse">...</div>        // skeleton placeholder
<div className="animate-bounce">...</div>       // scroll indicator

// Staggered bounce loader
function LoadingPulse() {
  return (
    <div className="flex gap-2">
      <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
      <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
      <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
    </div>
  );
}
```

**Enter/exit animations**: `tailwindcss-animate` is a v3 JavaScript plugin. For v4 use its CSS-only replacement `tw-animate-css` (the one current shadcn/ui setups use):

```bash
npm install -D tw-animate-css
```

```css
/* src/app.css */
@import "tailwindcss";
@import "tw-animate-css";
```

```tsx
// Entrance animations
<div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
  Content fades and slides up
</div>

// Exit animations
<div className="animate-out fade-out slide-out-to-top-4 duration-300">
  Content fades and slides away
</div>

// With delay — fill-mode-backwards prevents flash of final state
<div className="animate-in fade-in delay-200 fill-mode-backwards">
  Appears after 200ms delay
</div>

// Staggered children
{items.map((item, i) => (
  <div
    key={item.id}
    className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards"
    style={{ animationDelay: `${i * 100}ms` }}
  >
    {item.name}
  </div>
))}
```

**Custom keyframes** (Tailwind v4 uses `@theme`, v3 uses `tailwind.config.js`):

```css
/* globals.css — Tailwind v4 custom animation */
@theme {
  --animate-shimmer: shimmer 2s infinite linear;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

```tsx
// Skeleton loading with shimmer
<div className="h-4 w-48 rounded bg-linear-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer" />
```

## Examples

### Example 1: Set up Tailwind v4 in a Vite React app

**User prompt:** "Add Tailwind to my Vite React project and give me a brand blue and Inter font."

```bash
npm install tailwindcss @tailwindcss/vite
```

Add `tailwindcss()` to `plugins` in `vite.config.ts`, then put this in `src/index.css` (imported from `main.tsx`):

```css
@import "tailwindcss";

@theme {
  --color-brand-500: #3b82f6;
  --font-sans: "Inter", system-ui, sans-serif;
}
```

`<button className="bg-brand-500 font-sans text-white px-4 py-2 rounded-lg">Save</button>` now renders blue with Inter. No config file and no `content` globs are needed.

### Example 2: Fix a v3 project that looks different after upgrading

**User prompt:** "After moving to Tailwind 4 my shadows are bigger, focus rings are thin and borders turned black."

After `npx @tailwindcss/upgrade` most renames are applied; check the rest by hand:

- `shadow-sm` -> `shadow-xs`, `shadow` -> `shadow-sm`, same for `rounded`, `blur`, `drop-shadow`
- `ring` is now 1px and `currentColor`: use `ring-3 ring-blue-500` for the old look
- `outline-none` -> `outline-hidden`; `bg-gradient-to-r` -> `bg-linear-to-r`
- default border color is `currentColor`: write `border border-gray-200`
- `flex-shrink-0` -> `shrink-0`; `bg-opacity-50` -> `bg-black/50`

## Guidelines

1. **Utility-first** — Build designs with utilities; extract components (React/Vue) not CSS classes
2. **Responsive prefixes** — `sm:`, `md:`, `lg:`, `xl:`, `2xl:` — mobile-first breakpoints
3. **Dark mode** — `dark:` prefix for dark variants; toggle via class or system preference
4. **Group/peer** — `group-hover:` for parent-triggered styles; `peer-invalid:` for sibling-based
5. **Arbitrary values** — `w-[137px]`, `text-[#1a2b3c]`, `grid-cols-[1fr_2fr]` for one-off values
6. **@theme** — Define design tokens in CSS; v4 reads them directly. Use `@config "./tailwind.config.js"` only to load a legacy JS config
7. **Class detection** — Tailwind scans source files for complete class names, so only used classes ship. Never build names dynamically (`` `bg-${color}-500` ``); write the full string or map values to complete class names
8. **cn() helper** — Use `clsx` + `tailwind-merge` for conditional classes: `cn("base", condition && "extra")`
9. **Animations** — Use CSS animations for simple effects (fade, slide, spin). Prefer `duration-300` for most transitions. Use `motion-reduce:animate-none` for reduced motion.
10. **tw-animate-css** — Import it for entrance/exit animations (`animate-in`, `animate-out`). Use `fill-mode-backwards` to prevent a flash during delays.
11. **Custom utilities** — v4 replaces `@layer utilities { .x {} }` with `@utility x { ... }`; plain `@layer` classes no longer get variants like `hover:`.
12. **Important modifier** — put `!` at the end: `bg-red-500!`.
13. **Old browsers** — v4 needs Safari 16.4+, Chrome 111+, Firefox 128+; stay on v3.4 if you must support older ones.
