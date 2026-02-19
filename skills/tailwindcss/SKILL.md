---
name: tailwindcss
category: development
version: 1.0.0
description: >-
  Build UIs with Tailwind CSS — utility classes, responsive design, dark mode,
  custom configuration, component patterns, animations, plugins, and design
  system setup. Use when tasks involve styling web applications, configuring
  design tokens, building responsive layouts, or migrating from other CSS
  approaches.
author: terminal-skills
tags: [tailwindcss, css, frontend, responsive, design-system, styling]
---

# Tailwind CSS

Utility-first CSS framework for building custom designs without writing CSS files. Design tokens enforced through configuration.

## Setup

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

```css
/* globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

## Core Utilities

### Layout

```html
<!-- Flexbox -->
<div class="flex items-center justify-between gap-4">
  <div class="flex-1">Grows to fill</div>
  <div class="flex-shrink-0">Fixed width</div>
</div>

<!-- Grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <div>Card 1</div>
  <div>Card 2</div>
  <div>Card 3</div>
</div>

<!-- Container -->
<div class="container mx-auto px-4 max-w-5xl">Centered content</div>

<!-- Position -->
<div class="relative">
  <div class="absolute top-0 right-0">Badge</div>
</div>
```

### Typography

```html
<h1 class="text-3xl font-bold text-gray-900">Heading</h1>
<p class="text-base text-gray-600 leading-relaxed">Body text</p>
<span class="text-sm text-gray-400 uppercase tracking-wide">Label</span>
<a class="text-blue-600 hover:text-blue-800 underline">Link</a>

<!-- Truncate -->
<p class="truncate">Long text gets ellipsis...</p>
<p class="line-clamp-3">Multi-line truncate at 3 lines</p>
```

### Spacing

```html
<!-- Padding: p-{size} | px-{size} | py-{size} | pt/pr/pb/pl -->
<div class="p-4">16px all sides</div>
<div class="px-6 py-3">24px horizontal, 12px vertical</div>

<!-- Margin: m-{size} | mx-auto for centering -->
<div class="mt-8 mb-4">Top 32px, bottom 16px</div>
<div class="mx-auto w-96">Centered block</div>

<!-- Gap (flex/grid children) -->
<div class="flex gap-4">Consistent 16px gaps</div>
```

### Colors and Backgrounds

```html
<div class="bg-white text-gray-900">Light theme</div>
<div class="bg-gray-900 text-white">Dark theme</div>
<div class="bg-blue-500 text-white">Brand color</div>
<div class="bg-gradient-to-r from-blue-500 to-purple-600 text-white">Gradient</div>

<!-- Opacity -->
<div class="bg-black/50">50% opacity black overlay</div>
```

### Borders and Shadows

```html
<div class="border border-gray-200 rounded-lg">Card</div>
<div class="border-2 border-blue-500 rounded-full">Highlighted</div>
<div class="shadow-sm">Subtle shadow</div>
<div class="shadow-lg">Elevated card</div>
<div class="ring-2 ring-blue-500 ring-offset-2">Focus ring</div>
```

## Responsive Design

Mobile-first breakpoints: `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px), `2xl:` (1536px).

```html
<!-- Stack on mobile, 2 columns on tablet, 3 on desktop -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div>Card</div>
</div>

<!-- Hide on mobile, show on desktop -->
<nav class="hidden lg:flex">Desktop nav</nav>
<button class="lg:hidden">Mobile menu</button>

<!-- Responsive text -->
<h1 class="text-2xl md:text-3xl lg:text-4xl">Scales up</h1>

<!-- Responsive padding -->
<section class="px-4 md:px-8 lg:px-16">Content</section>
```

## Dark Mode

```typescript
// tailwind.config.ts
export default {
  darkMode: 'class',  // Toggle via .dark class on <html>
  // or: darkMode: 'media'  // Follow OS preference
};
```

```html
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <h2 class="text-gray-800 dark:text-gray-200">Adapts to theme</h2>
  <button class="bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-500">
    Action
  </button>
</div>
```

## States

```html
<!-- Hover, focus, active -->
<button class="bg-blue-500 hover:bg-blue-600 active:bg-blue-700
               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
  Button
</button>

<!-- Disabled -->
<button class="disabled:opacity-50 disabled:cursor-not-allowed" disabled>
  Disabled
</button>

<!-- Group hover (parent hover affects children) -->
<div class="group cursor-pointer">
  <h3 class="group-hover:text-blue-600">Title</h3>
  <p class="group-hover:text-gray-600">Description</p>
</div>

<!-- First/last child -->
<ul>
  <li class="first:pt-0 last:pb-0 py-3 border-b last:border-0">Item</li>
</ul>
```

## Component Patterns

### Card

```tsx
function Card({ title, description, image }: CardProps) {
  return (
    <div className="bg-white rounded-lg shadow-card overflow-hidden
                    hover:shadow-lg transition-shadow">
      {image && <img src={image} alt="" className="w-full h-48 object-cover" />}
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
```

### Input

```tsx
function Input({ label, error, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <input
        className={`w-full px-3 py-2 border rounded-lg text-sm
          placeholder:text-gray-400
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          ${error ? 'border-red-500' : 'border-gray-300'}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

## Animations

```html
<!-- Built-in -->
<div class="animate-spin">Spinner</div>
<div class="animate-pulse">Skeleton loader</div>
<div class="animate-bounce">Bouncing arrow</div>

<!-- Transitions -->
<div class="transition-all duration-300 ease-in-out hover:scale-105">
  Smooth scale on hover
</div>

<!-- Custom animation in config -->
```

```typescript
// tailwind.config.ts
theme: {
  extend: {
    keyframes: {
      'fade-in': {
        '0%': { opacity: '0', transform: 'translateY(8px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
      },
    },
    animation: {
      'fade-in': 'fade-in 0.3s ease-out',
    },
  },
},
```

## Custom Configuration

```typescript
// tailwind.config.ts — Extended design system
theme: {
  extend: {
    colors: {
      brand: {
        50: '#f0f9ff',
        500: '#0ea5e9',
        900: '#0c4a6e',
      },
    },
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'monospace'],
    },
    spacing: {
      '18': '4.5rem',  // Custom spacing value
    },
    maxWidth: {
      'prose': '65ch',  // Readable line length
    },
  },
},
```

## Plugins

```typescript
// tailwind.config.ts
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import containerQueries from '@tailwindcss/container-queries';

export default {
  plugins: [
    forms,           // Better default form styles
    typography,      // .prose class for rich text
    containerQueries, // @container queries
  ],
};
```

```html
<!-- Typography plugin for rendered markdown/CMS content -->
<article class="prose prose-lg max-w-none">
  <h1>This is styled automatically</h1>
  <p>No utility classes needed for CMS content.</p>
</article>

<!-- Container queries -->
<div class="@container">
  <div class="@md:flex @md:gap-4">Responds to container, not viewport</div>
</div>
```

## Tailwind with clsx/cn

```tsx
// lib/cn.ts — Class name merge utility (avoids conflicts)
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage — later classes override earlier ones correctly
<div className={cn(
  'px-4 py-2 rounded',        // Base
  variant === 'primary' && 'bg-blue-500 text-white',
  variant === 'secondary' && 'bg-gray-100 text-gray-700',
  className,                    // External overrides
)} />
```

## Guidelines

- **Mobile-first** — write base styles for mobile, add `md:`, `lg:` for larger screens
- **Use `cn()` or `clsx`** for conditional classes — string concatenation gets messy fast
- **Constrain the config** — override defaults (not extend) for colors, spacing, and fonts to enforce the design system
- **`@apply` sparingly** — use it for styles that repeat verbatim across many elements (like `.prose` content). If you're writing `@apply` everywhere, you're writing CSS with extra steps.
- **Extract components, not classes** — instead of creating a `.btn-primary` utility, create a `<Button>` component. That's the Tailwind way.
- **Install `tailwind-merge`** — prevents `px-4 px-6` from both applying. `twMerge` picks the last one correctly.
- **Use `group` and `peer` over JS** — many hover/focus states that seem to need JavaScript can be done with `group-hover:` and `peer-checked:`
- **Dark mode from day one** — adding dark mode later means touching every component. Set up `dark:` variants while building.
