---
name: framer-motion
description: >-
  Animate React components with Framer Motion. Use when adding page transitions,
  gesture animations, layout animations, scroll-triggered effects, or building
  interactive UI with spring physics.
license: Apache-2.0
compatibility: 'React 18+, Next.js'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags: [framer-motion, animation, react, transitions, gestures]
---

# Framer Motion

## Overview

Framer Motion is the production animation library for React. Declarative animations via props, spring physics, layout animations, gestures (drag, hover, tap), scroll-triggered effects, and shared layout transitions. Used by Vercel, Linear, Raycast.

## Instructions

### Step 1: Basic Animations

```tsx
import { motion } from 'framer-motion'

// Animate on mount
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, ease: 'easeOut' }}
>
  <h1>Hello</h1>
</motion.div>

// Animate on hover and tap
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
>
  Click me
</motion.button>

// Exit animations (requires AnimatePresence)
import { AnimatePresence } from 'framer-motion'

<AnimatePresence>
  {isVisible && (
    <motion.div
      key="modal"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    />
  )}
</AnimatePresence>
```

### Step 2: Layout Animations

```tsx
// Automatic layout animation — element smoothly moves when layout changes
<motion.div layout>
  {items.map(item => (
    <motion.div key={item.id} layout>
      {item.title}
    </motion.div>
  ))}
</motion.div>

// Shared layout animation — element transitions between two positions
<motion.div layoutId={`card-${id}`}>
  {isExpanded ? <ExpandedCard /> : <CompactCard />}
</motion.div>
```

### Step 3: Scroll Animations

```tsx
import { motion, useScroll, useTransform } from 'framer-motion'

function ParallaxHero() {
  const { scrollYProgress } = useScroll()
  const y = useTransform(scrollYProgress, [0, 1], [0, -200])
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])

  return (
    <motion.div style={{ y, opacity }}>
      <h1>Scroll to reveal</h1>
    </motion.div>
  )
}

// Animate when element enters viewport
function FadeInOnScroll({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.div>
  )
}
```

### Step 4: Staggered Children

```tsx
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

<motion.ul variants={container} initial="hidden" animate="show">
  {items.map(i => (
    <motion.li key={i.id} variants={item}>{i.name}</motion.li>
  ))}
</motion.ul>
```

## Guidelines

- Use `type: 'spring'` for natural-feeling animations — avoid linear easing.
- `layoutId` creates shared element transitions (like iOS hero animations).
- `AnimatePresence` is required for exit animations — wrap conditional renders.
- `whileInView` with `viewport: { once: true }` for scroll-triggered animations.
- Framer Motion adds ~30KB to bundle. For simple animations, consider CSS transitions.
