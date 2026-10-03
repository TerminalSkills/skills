---
name: motion
description: >-
  Motion (formerly Framer Motion) is an animation library for React that
  animates components through declarative props. Use when adding fade-ins,
  hover and tap effects, exit animations with AnimatePresence, layout and shared-element
  transitions, scroll-linked or scroll-triggered effects, staggered lists, or
  when migrating from framer-motion to the motion package.
license: Apache-2.0
compatibility: "React 18.2+ (React 19 supported); npm package motion"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - animation
    - react
    - motion
    - transitions
    - gestures
  repository: https://github.com/motiondivision/motion
---

# Motion (formerly Framer Motion) — Animation for React

## Overview

Motion is the production animation library for React (previously published as `framer-motion`). Animations are declared as props on `motion.*` components: `initial`, `animate`, `exit`, `whileHover`, `whileTap`, `whileInView`, `layout`, `layoutId` and `variants`. Springs are the default for physical values, and transform and opacity animations run on the GPU. Version 14.0.0 was published on 2026-10-02; 12.x and 13.x code keeps working for the APIs shown here, but check the changelog if you relied on internal framer-motion APIs.

## Instructions

### Install and import

```bash
npm install motion
```

```tsx
import { motion, AnimatePresence } from "motion/react";
```

- The old package `framer-motion` still exists, but new code should use `motion` and import from `motion/react`. Migrating means swapping the dependency and changing `from "framer-motion"` to `from "motion/react"`.
- Requires React 18.2 or newer.
- **Next.js App Router**: components using `motion` need `"use client"` at the top of the file, or import `import * as motion from "motion/react-client"` so they can render inside server components.
- **Bundle size**: the `motion` component is about 34 kB; use `LazyMotion` with the `m` component (`import * as m from "motion/react-m"`) and `domAnimation` (+15 kB: animations, variants, exits, gestures) or `domMax` (+25 kB: adds drag and layout animations).
- Outside React, `import { animate, scroll } from "motion"` provides the same engine for plain DOM; inside components, `useAnimate` returns a scope and an `animate` function for imperative sequences.

### Accessibility

Wrap the app in `<MotionConfig reducedMotion="user">` so transform and layout animations are disabled for people whose OS asks for reduced motion (opacity and colour animations are kept). `useReducedMotion()` returns the boolean for custom handling, for example setting a parallax `y` to 0.

### Patterns

#### Basic Animations

```tsx
import { motion, AnimatePresence } from "motion/react";

// Animate on mount
function FadeIn({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}     // Starting state
      animate={{ opacity: 1, y: 0 }}       // Target state
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Hover and tap interactions
function InteractiveCard({ title }: { title: string }) {
  return (
    <motion.div
      className="card"
      whileHover={{ scale: 1.05, boxShadow: "0 10px 30px rgba(0,0,0,0.12)" }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <h3>{title}</h3>
    </motion.div>
  );
}

// Exit animations
function NotificationList({ notifications }: { notifications: Notification[] }) {
  return (
    <AnimatePresence>
      {notifications.map((n) => (
        <motion.div
          key={n.id}
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -100, height: 0 }}  // Animate out!
          transition={{ type: "spring", damping: 25 }}
        >
          {n.message}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
```

#### Layout Animations

```tsx
// Automatic layout animation
function ExpandableCard({ isExpanded, onClick, children }: Props) {
  return (
    <motion.div
      layout                               // Animate ANY layout change
      onClick={onClick}
      style={{
        width: isExpanded ? 400 : 200,
        height: isExpanded ? 300 : 100,
      }}
      transition={{ layout: { type: "spring", stiffness: 200 } }}
    >
      <motion.h3 layout="position">{/* Only animate position, not size */}</motion.h3>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Shared layout animation (element moves between components)
function TabLayout({ activeTab }: { activeTab: string }) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => setActive(tab.id)}>
          {tab.label}
          {activeTab === tab.id && (
            <motion.div
              layoutId="activeTab"         // Same layoutId = shared animation
              className="underline"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
```

#### Scroll Animations

```tsx
import { motion, useScroll, useTransform } from "motion/react";

function ParallaxHero() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, -150]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  return (
    <motion.div style={{ y, opacity }} className="hero">
      <h1>Welcome</h1>
    </motion.div>
  );
}

// Scroll-triggered entrance
function ScrollReveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}  // Animate when in viewport
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.div>
  );
}
```

#### Staggered Children

```tsx
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

function StaggeredList({ items }: { items: { id: string; name: string }[] }) {
  return (
    <motion.ul variants={container} initial="hidden" animate="show">
      {items.map((i) => (
        <motion.li key={i.id} variants={item}>
          {i.name}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

## Examples

### Example 1: Animated notification stack

**User request:** "Make toast notifications slide in from the right and slide out when dismissed, without the list jumping."

Use the exit-animation pattern above and add `mode="popLayout"` to `AnimatePresence` so exiting items leave the layout flow, plus `layout` on each item so siblings glide into the gap:

```tsx
<AnimatePresence mode="popLayout">
  {toasts.map((t) => (
    <motion.div key={t.id} layout
      initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }}>
      {t.message}
    </motion.div>
  ))}
</AnimatePresence>
```

Result: new toasts slide in, dismissed ones slide out, remaining toasts move up smoothly. Keys must be stable ids, never array indexes.

### Example 2: Scroll progress bar and reveal-on-scroll sections

**User request:** "Add a reading-progress bar at the top and fade in each section as it scrolls into view."

```tsx
import { motion, useScroll, useSpring } from "motion/react";

export function ProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return <motion.div style={{ scaleX, transformOrigin: "0 0" }} className="fixed inset-x-0 top-0 h-1 bg-emerald-500" />;
}
```

Wrap each section in the `ScrollReveal` component above (`whileInView`, `viewport={{ once: true }}`). Result: a bar that fills as the page scrolls and sections that fade up once.

## Guidelines

1. **`layout` prop**: add it to an element and size or position changes animate automatically. Use `layout="position"` on text children to avoid stretching, and `layout` on children of a resized parent to fix scale distortion. Scrollable ancestors need `layoutScroll`; fixed ancestors need `layoutRoot`. Wrap components that do not re-render together in `LayoutGroup`.
2. **AnimatePresence**: it must wrap the conditional, not be wrapped by it; direct children need unique, stable `key`s. Modes: `sync` (default), `wait` (enter after exit finishes), `popLayout`. `initial={false}` skips the first-render animation.
3. **Springs**: `type: "spring"` with `stiffness` (speed) and `damping` (bounce); a `duration`/`bounce` pair is easier to tune by feel.
4. **Scroll**: `whileInView` for entrance effects (with `viewport={{ once: true }}`), `useScroll` plus `useTransform` for scroll-linked effects. Prefer these over scroll listeners with `setState`.
5. **Shared layout**: the same `layoutId` on two elements animates between them (tab underlines, card-to-modal); make `layoutId`s unique per group.
6. **Gestures**: `whileHover`, `whileTap`, `whileDrag`, `whileFocus`; hover effects do not fire on touch.
7. **Performance**: animate `transform` and `opacity`; animating `width`, `height` or `top` forces layout, so use `layout` instead. Avoid re-rendering the parent per frame; use motion values (`useMotionValue`, `useTransform`) which update without renders.
8. **Do not use** for simple one-off hover colours (CSS transitions are lighter) or for server-only components without the client import noted above.
