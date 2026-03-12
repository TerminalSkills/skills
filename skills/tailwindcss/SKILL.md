---
name: tailwindcss
category: Frontend Development
tags: [css, utility-first, styling, responsive, design-system, performance]
version: 1.0.0
author: terminal-skills
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
// Built-in animations + custom
function LoadingPulse() {
  return (
    <div className="flex gap-2">
      <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
      <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
      <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
    </div>
  );
}

// Slide in on mount
function SlideIn({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in slide-in-from-bottom-4 fade-in duration-500">
      {children}
    </div>
  );
}
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
