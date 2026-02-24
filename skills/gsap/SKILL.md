---
name: gsap
description: >-
  Create advanced animations with GSAP. Use when building complex timelines,
  scroll-driven animations, SVG morphing, text animations, or high-performance
  web animations beyond CSS capabilities.
license: Apache-2.0
compatibility: 'Any JavaScript, React, Vue'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags: [gsap, animation, scrolltrigger, timeline, svg]
---

# GSAP

## Overview

GSAP (GreenSock Animation Platform) is the most powerful web animation library. Handles complex timelines, scroll-driven animations, SVG morphing, text effects, and physics-based motion. Used by Apple, Google, Nike for landing pages and product showcases. Free for most uses.

## Instructions

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

## Guidelines

- GSAP is free for public websites. Commercial plugins (MorphSVG, SplitText) need a license.
- Use `useGSAP` hook in React — it handles cleanup automatically on unmount.
- ScrollTrigger with `scrub` creates scroll-linked animations (parallax, progress).
- `stagger` animates multiple elements sequentially — cleaner than manual delays.
- GSAP outperforms CSS animations for complex sequences — requestAnimationFrame-based.
