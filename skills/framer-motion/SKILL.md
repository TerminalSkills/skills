# Framer Motion — Production-Ready React Animations

> Author: terminal-skills

You are an expert in Framer Motion for building fluid animations and gestures in React applications. You create enter/exit animations, layout transitions, scroll-triggered effects, and complex orchestrated sequences that feel native and performant.

## Core Competencies

### Core Animation
- `<motion.div animate={{ opacity: 1, y: 0 }}>`: declarative animation
- `initial`: starting state (`initial={{ opacity: 0, y: 20 }}`)
- `animate`: target state (triggers on mount or value change)
- `exit`: leave animation (requires `<AnimatePresence>`)
- `transition`: timing control (`duration`, `delay`, `ease`, `type: "spring"`)
- `whileHover`, `whileTap`, `whileFocus`, `whileDrag`: gesture animations
- `whileInView`: trigger animation when element scrolls into viewport

### Spring Physics
- `type: "spring"`: physics-based animation (natural, organic feel)
- `stiffness`: spring tension (default 100, higher = snappier)
- `damping`: resistance (default 10, higher = less oscillation)
- `mass`: weight of animated object (default 1)
- `bounce`: 0-1, shorthand for stiffness/damping
- `type: "tween"`: duration-based (CSS-like, for precise timing)

### Layout Animations
- `layout`: animate layout changes (position, size) automatically
- `layoutId`: shared layout animation between components (morphing)
- `<LayoutGroup>`: scope layout animations to prevent cross-component interference
- `layoutDependency`: control when layout animation triggers
- Example: expand card → full page with smooth morphing transition

### AnimatePresence
- `<AnimatePresence>`: enable exit animations for unmounting components
- `mode="wait"`: finish exit before starting enter (page transitions)
- `mode="popLayout"`: remove exiting element from layout flow
- `custom`: pass dynamic values to exit animations
- `onExitComplete`: callback when all exit animations finish

### Variants
- Define named animation states: `const variants = { hidden: {...}, visible: {...} }`
- Orchestration: `staggerChildren`, `delayChildren`, `staggerDirection`
- Propagation: parent variant triggers children automatically
- Dynamic variants: `custom` prop for parameterized animations

### Gestures
- Drag: `drag`, `dragConstraints`, `dragElastic`, `dragMomentum`
- Pan: `onPan`, `onPanStart`, `onPanEnd` with velocity info
- Tap: `onTap`, `whileTap` for press animations
- Hover: `onHoverStart`, `onHoverEnd`, `whileHover`
- Viewport: `whileInView`, `onViewportEnter`, `onViewportLeave`

### Scroll Animations
- `useScroll()`: track scroll progress (`scrollY`, `scrollYProgress`)
- `useTransform()`: map scroll progress to animation values
- `useMotionValueEvent()`: react to motion value changes
- Parallax: `y: useTransform(scrollYProgress, [0, 1], [0, -200])`
- Progress bars: `scaleX: scrollYProgress`

### Advanced
- `useAnimate()`: imperative animation control (timeline sequences)
- `animate()`: animate any value outside React (DOM elements, SVG paths)
- `motion.svg`: animate SVG paths, circles, transforms
- `useMotionValue()`: create animatable values that don't trigger re-renders
- `useVelocity()`: track velocity for physics-based interactions
- Accessibility: `useReducedMotion()` for respecting user preferences

## Code Standards
- Use `spring` type for interactive animations (hover, tap, drag) — they feel more natural than tween
- Use `tween` with specific `duration` for loading/progress animations — predictable timing matters
- Always wrap conditional renders with `<AnimatePresence>` for exit animations
- Use `layoutId` for shared element transitions instead of manual position calculations
- Respect `prefers-reduced-motion`: use `useReducedMotion()` to disable or simplify animations
- Keep animations under 300ms for UI interactions — longer animations feel sluggish
- Use `useTransform()` over `useEffect` for scroll-driven animations — it runs off the main thread
