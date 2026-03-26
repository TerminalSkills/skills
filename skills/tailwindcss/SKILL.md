---
name: tailwindcss
description: >-
  You are an expert in Tailwind CSS v4, the utility-first CSS framework. You
  help developers build custom designs directly in HTML/JSX with utility
  classes for layout, spacing, typography, colors, animations, and responsive
  design — without writing custom CSS, producing smaller bundles via automatic
  tree-shaking, and maintaining consistency through a design token system.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Frontend Development
  tags:
    - css
    - utility-first
    - styling
    - responsive
    - design-system
    - performance
---

# Tailwind CSS — Utility-First CSS Framework

You are an expert in Tailwind CSS v4, the utility-first CSS framework. You help developers build custom designs directly in HTML/JSX with utility classes for layout, spacing, typography, colors, animations, and responsive design — without writing custom CSS, producing smaller bundles via automatic tree-shaking, and maintaining consistency through a design token system.

## Core Capabilities

### Layout and Responsive

```tsx
// Responsive card grid with flexbox/grid
function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-4">
      {products.map((product) => (
        <div key={product.id}
          className="group bg-white rounded-2xl shadow-sm border border-gray-100
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

  --font-family-sans: "Inter", system-ui, sans-serif;
  --font-family-mono: "JetBrains Mono", monospace;

  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
}
```

```tsx
// Dark mode — just add dark: prefix
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

**tailwindcss-animate plugin** (powers shadcn/ui dialog/dropdown animations):

```bash
npm install tailwindcss-animate
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
<div className="h-4 w-48 rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer" />
```

## Installation

```bash
npm install tailwindcss @tailwindcss/vite
# Add to vite.config.ts: plugins: [tailwindcss()]
# Import in CSS: @import "tailwindcss";
```

## Best Practices

1. **Utility-first** — Build designs with utilities; extract components (React/Vue) not CSS classes
2. **Responsive prefixes** — `sm:`, `md:`, `lg:`, `xl:`, `2xl:` — mobile-first breakpoints
3. **Dark mode** — `dark:` prefix for dark variants; toggle via class or system preference
4. **Group/peer** — `group-hover:` for parent-triggered styles; `peer-invalid:` for sibling-based
5. **Arbitrary values** — `w-[137px]`, `text-[#1a2b3c]`, `grid-cols-[1fr_2fr]` for one-off values
6. **@theme** — Define design tokens in CSS; Tailwind v4 reads tokens directly, no JS config
7. **Tree-shaking** — Only classes you use ship to production; typical CSS < 10KB gzipped
8. **cn() helper** — Use `clsx` + `tailwind-merge` for conditional classes: `cn("base", condition && "extra")`
9. **Animations** — Use CSS animations for simple effects (fade, slide, spin). Prefer `duration-300` for most transitions. Use `motion-reduce:animate-none` for reduced motion.
10. **tailwindcss-animate** — Install for entrance/exit animations (`animate-in`, `animate-out`). Use `fill-mode-backwards` to prevent flash during delays.
