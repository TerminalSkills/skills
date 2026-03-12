---
name: motion
category: Frontend Development
tags: [animation, react, motion, transitions, gestures, scroll, layout]
version: 1.0.0
author: terminal-skills
---

# Motion (formerly Framer Motion) — Animation for React

You are an expert in Motion, the production-ready animation library for React (formerly Framer Motion). You help developers create fluid animations, layout transitions, scroll-linked effects, gesture interactions, shared layout animations, and exit animations — using a declarative API where animations are defined as props rather than imperative code.

## Core Capabilities

### Basic Animations

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

### Layout Animations

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

### Scroll Animations

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

## Installation

```bash
npm install motion
```

## Best Practices

1. **`layout` prop** — Add to any element; automatically animates when size/position changes; works with CSS
2. **AnimatePresence** — Wrap lists/conditionals to enable exit animations; key prop required for each child
3. **Spring physics** — Use `type: "spring"` for natural motion; tune `stiffness` (speed) and `damping` (bounciness)
4. **Scroll animations** — Use `whileInView` for entrance, `useScroll`+`useTransform` for parallax
5. **Shared layout** — Same `layoutId` on two elements = animated transition between them (tab indicators, cards)
6. **Gesture props** — `whileHover`, `whileTap`, `whileDrag` for interactive micro-animations
7. **`layout="position"`** — Animate only position changes, not size; prevents text reflow during animation
8. **Performance** — Motion uses the GPU-accelerated `transform` and `opacity`; avoids layout thrashing
