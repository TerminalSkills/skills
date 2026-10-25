---
name: gsap
description: >-
  GSAP is a JavaScript animation library for tweens, timelines, scroll-driven
  animation (ScrollTrigger), SVG morphing and text splitting. Use it when building
  complex timelines, scroll-linked animations, SVG morphing, text animations, or
  high-performance web animations beyond CSS capabilities.
license: Apache-2.0
compatibility: 'Any JavaScript, React, Vue'
metadata:
  author: terminal-skills
  repository: https://github.com/greensock/GSAP
  version: 1.1.0
  category: development
  tags: "gsap, animation, scrolltrigger, timeline, svg"
---

# GSAP

## Overview

GSAP (GreenSock Animation Platform) is the most powerful web animation library. Handles complex timelines, scroll-driven animations, SVG morphing, text effects, and physics-based motion. Since Webflow's support, GSAP and all its plugins (ScrollTrigger, SplitText, MorphSVG, DrawSVG, Flip and others) are free for everyone, including commercial use, under the Standard "no charge" license (https://gsap.com/standard-license). Checked against gsap 3.15.0 and @gsap/react 2.1.2 on npm (2026-10-24).

## Instructions

```bash
npm install gsap @gsap/react   # plugins ship inside the gsap package: import from 'gsap/ScrollTrigger', 'gsap/SplitText'
```

### Step 1: Basic Animations

```typescript
import gsap from 'gsap'

// Animate to
gsap.to('.hero-title', { opacity: 1, y: 0, duration: 1, ease: 'power3.out' })

// Animate from
gsap.from('.card', { opacity: 0, y: 50, duration: 0.8, stagger: 0.15 })

// Set immediately
gsap.set('.hidden-element', { opacity: 0, y: 20 })
```

### Step 2: Timelines

```typescript
// Sequenced animations — play in order
const tl = gsap.timeline({ defaults: { duration: 0.6, ease: 'power2.out' } })

tl.from('.logo', { scale: 0, rotation: -180 })
  .from('.nav-link', { opacity: 0, y: -20, stagger: 0.1 }, '-=0.3')  // overlap by 0.3s
  .from('.hero-text', { opacity: 0, x: -50 })
  .from('.cta-button', { opacity: 0, scale: 0.8 }, '<')               // start at same time as previous

// Control
tl.play()
tl.reverse()
tl.pause()
tl.seek(1.5)  // jump to 1.5 seconds
```

### Step 3: ScrollTrigger

```typescript
import { ScrollTrigger } from 'gsap/ScrollTrigger'
gsap.registerPlugin(ScrollTrigger)

// Animate when scrolling into view
gsap.from('.feature-section', {
  scrollTrigger: {
    trigger: '.feature-section',
    start: 'top 80%',        // trigger when top of element hits 80% of viewport
    end: 'bottom 20%',
    toggleActions: 'play none none reverse',  // onEnter, onLeave, onEnterBack, onLeaveBack
  },
  opacity: 0,
  y: 100,
  duration: 1,
})

// Pin section during scroll
gsap.to('.horizontal-section', {
  x: () => -(document.querySelector('.horizontal-section').scrollWidth - window.innerWidth),
  scrollTrigger: {
    trigger: '.horizontal-wrapper',
    pin: true,
    scrub: 1,                // smooth scrubbing (1 second lag)
    end: () => '+=' + document.querySelector('.horizontal-section').scrollWidth,
  },
})
```

### Step 4: React Integration

```tsx
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

function AnimatedSection() {
  const container = useRef(null)

  useGSAP(() => {
    gsap.from('.card', {
      opacity: 0, y: 40, stagger: 0.1, duration: 0.6,
      scrollTrigger: { trigger: container.current, start: 'top 80%' },
    })
  }, { scope: container })

  return (
    <div ref={container}>
      <div className="card">Card 1</div>
      <div className="card">Card 2</div>
      <div className="card">Card 3</div>
    </div>
  )
}
```

### Step 5: Split text, responsive and reduced-motion

`SplitText` (now free) splits text into chars, words and lines. Create it with `SplitText.create`, which can re-split on resize via `autoSplit` and call your animation from `onSplit`. `gsap.matchMedia()` runs setup only when a media query matches and reverts it afterwards, which is the clean way to honor `prefers-reduced-motion`.

```typescript
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
gsap.registerPlugin(SplitText)

const mm = gsap.matchMedia()

mm.add('(prefers-reduced-motion: no-preference)', () => {
  SplitText.create('.hero-title', {
    type: 'words,lines',
    mask: 'lines',              // wrap lines for a reveal effect
    autoSplit: true,            // re-split when fonts load or width changes
    onSplit(self) {
      return gsap.from(self.lines, { yPercent: 100, stagger: 0.08, duration: 0.8, ease: 'power3.out' })
    },
  })
})
```

## Examples

### Example 1: Hero entrance with a timeline

**User request:** "Make the logo, nav links and CTA animate in one after another when the landing page loads."

Use the Step 2 timeline: `gsap.timeline({ defaults: { duration: 0.6, ease: 'power2.out' } })`, `.from('.logo', ...)`, `.from('.nav-link', ..., '-=0.3')` and `.from('.cta-button', ..., '<')`. Each step starts when the previous one ends, minus the `-=0.3` overlap, and `'<'` starts the CTA together with the previous step. Call `tl.restart()` to replay.

### Example 2: Fade-in sections in a React app

**User request:** "In my Next.js page, cards should fade up when they scroll into view."

Add `'use client'` to the component, register the plugins once (`gsap.registerPlugin(useGSAP, ScrollTrigger)`, as in Step 4), use Step 4's `useGSAP` with `scope: container`. Opening the page shows the cards hidden until the section reaches 80% of the viewport, and unmounting reverts the animation.

## Guidelines

- GSAP and every plugin are free, including commercial use; the earlier "Club" paid tiers no longer apply. Read the Standard license for its terms.
- Register each plugin once with `gsap.registerPlugin(...)` before using it; with `useGSAP` register `useGSAP` too.
- Respect reduced motion: wrap animations in `gsap.matchMedia()` as in Step 5.
- Prefer animating `x`, `y`, `scale`, `rotation` and `opacity` (transforms) over layout properties like `width` or `top`.
- In React, create animations inside `useGSAP` and use `contextSafe` for event handlers so cleanup works.
- Use `useGSAP` hook in React — it handles cleanup automatically on unmount.
- ScrollTrigger with `scrub` creates scroll-linked animations (parallax, progress).
- `stagger` animates multiple elements sequentially — cleaner than manual delays.
- Use CSS transitions for simple hover states; reach for GSAP when you need sequencing, scroll linking, or runtime control.
