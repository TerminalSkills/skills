---
title: Build Web Animations with Framer Motion and GSAP
slug: build-web-animations-with-framer-motion-and-gsap
description: >-
  Add polished animations to a React app — page transitions, scroll-triggered
  reveals, staggered lists, drag interactions with Framer Motion, and complex
  timeline animations with GSAP for landing pages.
skills:
  - framer-motion
  - gsap
  - tailwindcss
category: development
tags:
  - animation
  - framer-motion
  - gsap
  - react
  - ui
---

# Build Web Animations with Framer Motion and GSAP

Sam's SaaS landing page feels static and lifeless compared to competitors. Users scroll past content without engaging. He wants animations that guide attention: sections that reveal on scroll, features that stagger in, smooth page transitions, and a hero section with cinematic text animation. Framer Motion handles React component animations declaratively; GSAP handles complex timelines and scroll-driven sequences.

## Step 1: Scroll-Triggered Section Reveals

```tsx
// src/components/AnimatedSection.tsx
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function AnimatedSection({ children, className, delay = 0 }: Props) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

## Step 2: Staggered List Animations

```tsx
// src/components/FeatureGrid.tsx
import { motion } from "framer-motion";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-50px" }}
      className="grid grid-cols-1 md:grid-cols-3 gap-6"
    >
      {features.map((feature) => (
        <motion.div
          key={feature.id}
          variants={item}
          whileHover={{ y: -4, boxShadow: "0 12px 24px rgba(0,0,0,0.1)" }}
          className="bg-white rounded-xl p-6 border"
        >
          <span className="text-3xl">{feature.icon}</span>
          <h3 className="text-lg font-semibold mt-3">{feature.title}</h3>
          <p className="text-gray-600 mt-2">{feature.description}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}
```

## Step 3: Page Transitions with AnimatePresence

```tsx
// src/components/PageTransition.tsx
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

## Step 4: GSAP Hero Timeline Animation

```tsx
// src/components/HeroSection.tsx
import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // Split headline into characters for per-letter animation
      const split = new SplitText(headlineRef.current!, { type: "chars,words" });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from(split.chars, {
        y: 80,
        opacity: 0,
        rotateX: -40,
        stagger: 0.02,
        duration: 0.8,
      })
        .from(".hero-subtitle", { y: 30, opacity: 0, duration: 0.6 }, "-=0.3")
        .from(".hero-cta", { y: 20, opacity: 0, scale: 0.9, duration: 0.5 }, "-=0.2")
        .from(".hero-visual", {
          scale: 0.8, opacity: 0, duration: 1,
          ease: "back.out(1.7)",
        }, "-=0.4");

    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-4xl text-center">
        <h1 ref={headlineRef} className="text-6xl md:text-8xl font-bold tracking-tight">
          Ship faster with AI
        </h1>
        <p className="hero-subtitle text-xl text-gray-600 mt-6 max-w-2xl mx-auto">
          The development platform that turns weeks of work into hours.
        </p>
        <div className="hero-cta mt-8 flex gap-4 justify-center">
          <button className="px-8 py-3 bg-blue-600 text-white rounded-full text-lg font-medium">
            Start Free
          </button>
          <button className="px-8 py-3 border-2 rounded-full text-lg font-medium">
            Watch Demo
          </button>
        </div>
      </div>
    </div>
  );
}
```

## Step 5: GSAP Scroll-Driven Parallax

```tsx
// src/components/ParallaxShowcase.tsx
import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function ParallaxShowcase() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // Pin section and animate cards as user scrolls
      const cards = gsap.utils.toArray<HTMLElement>(".showcase-card");

      gsap.to(cards, {
        xPercent: -100 * (cards.length - 1),
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          pin: true,
          scrub: 1,
          snap: 1 / (cards.length - 1),
          end: () => `+=${sectionRef.current!.offsetWidth}`,
        },
      });

      // Fade in each card's content
      cards.forEach((card) => {
        gsap.from(card.querySelector(".card-content")!, {
          opacity: 0,
          y: 40,
          scrollTrigger: {
            trigger: card,
            containerAnimation: gsap.getById("horizontal-scroll"),
            start: "left center",
            toggleActions: "play none none reverse",
          },
        });
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={sectionRef} className="flex overflow-hidden">
      {["Feature A", "Feature B", "Feature C", "Feature D"].map((title, i) => (
        <div key={i} className="showcase-card min-w-screen h-screen flex items-center justify-center px-20">
          <div className="card-content max-w-lg">
            <h2 className="text-4xl font-bold">{title}</h2>
            <p className="text-gray-600 mt-4">Description of {title.toLowerCase()} with visual demo.</p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Step 6: Animated Number Counter

```tsx
// src/components/StatCounter.tsx
import { motion, useMotionValue, useTransform, animate, useInView } from "framer-motion";
import { useEffect, useRef } from "react";

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => `${Math.round(v).toLocaleString()}${suffix}`);

  useEffect(() => {
    if (isInView) {
      animate(count, value, { duration: 2, ease: "easeOut" });
    }
  }, [isInView, value, count]);

  return <motion.span ref={ref}>{rounded}</motion.span>;
}

export function Stats() {
  return (
    <div className="grid grid-cols-3 gap-8 text-center py-16">
      <div>
        <div className="text-5xl font-bold"><AnimatedNumber value={50000} suffix="+" /></div>
        <p className="text-gray-600 mt-2">Developers</p>
      </div>
      <div>
        <div className="text-5xl font-bold"><AnimatedNumber value={99.9} suffix="%" /></div>
        <p className="text-gray-600 mt-2">Uptime</p>
      </div>
      <div>
        <div className="text-5xl font-bold"><AnimatedNumber value={150} suffix="ms" /></div>
        <p className="text-gray-600 mt-2">Avg Response</p>
      </div>
    </div>
  );
}
```

## Summary

Sam's landing page now feels premium. Sections reveal smoothly on scroll, features stagger in with spring physics, and the hero headline animates character-by-character. Framer Motion handles the React component animations declaratively (variants, `whileInView`, `AnimatePresence`), while GSAP handles the complex stuff: scroll-pinned horizontal showcases, parallax effects, and timeline sequences. The key: animations guide attention to CTAs and key content instead of being decorative. Conversion rate on the landing page increased 23% after adding purposeful animations.
