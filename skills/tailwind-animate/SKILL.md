---
name: tailwind-animate
description: >-
  Add animations to Tailwind CSS projects. Use when implementing CSS
  animations with Tailwind, adding entrance effects, building animated
  components, or creating loading spinners and skeleton screens.
license: Apache-2.0
compatibility: 'Tailwind CSS 3+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags: [tailwind, animation, css, transitions, ui]
---

# Tailwind CSS Animations

## Overview

Tailwind CSS includes animation utilities and the tailwindcss-animate plugin adds more. Create entrance animations, loading states, skeleton screens, and micro-interactions entirely with utility classes — no JavaScript needed for simple animations.

## Instructions

### Step 1: Built-in Animations

```tsx
// Tailwind includes 4 animations out of the box
<div className="animate-spin">⟳</div>        // loading spinner
<div className="animate-ping">●</div>         // notification dot
<div className="animate-pulse">Loading...</div> // skeleton placeholder
<div className="animate-bounce">↓</div>       // scroll indicator
```

### Step 2: tailwindcss-animate Plugin

```bash
npm install tailwindcss-animate
```

```javascript
// tailwind.config.js
module.exports = {
  plugins: [require('tailwindcss-animate')],
}
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

// With delay and fill mode
<div className="animate-in fade-in delay-200 fill-mode-backwards">
  Appears after 200ms delay
</div>

// Staggered children (combine with CSS custom properties)
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

### Step 3: Custom Animations

```javascript
// tailwind.config.js — Custom keyframes
module.exports = {
  theme: {
    extend: {
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out',
        shimmer: 'shimmer 2s infinite linear',
      },
    },
  },
}
```

```tsx
// Skeleton loading with shimmer
<div className="h-4 w-48 rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer" />
```

## Guidelines

- Use CSS animations for simple effects (fade, slide, spin) — no JS overhead.
- `tailwindcss-animate` pairs well with shadcn/ui — it powers dialog/dropdown animations.
- `fill-mode-backwards` applies initial state during delay — prevents flash of final state.
- Prefer `duration-300` (300ms) for most UI transitions — feels responsive without rushing.
- Use `prefers-reduced-motion` media query: `motion-reduce:animate-none`.
