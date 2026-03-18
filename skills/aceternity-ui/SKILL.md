---
name: aceternity-ui
description: >-
  Add premium animated UI components built with Framer Motion and Tailwind CSS using
  Aceternity UI. Use when: adding animated effects (3D cards, glowing backgrounds,
  spotlight effects, moving borders), building visually stunning UIs, creating
  impressive hero sections and feature showcases in React/Next.js.
license: Apache-2.0
compatibility: "Requires React 18+, Tailwind CSS 3+, Framer Motion 10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["aceternity-ui", "react", "framer-motion", "animations", "tailwind"]
  use-cases:
    - "Create a 3D tilt card effect for a product or pricing showcase"
    - "Add a spotlight effect that follows the cursor on a hero section"
    - "Build an animated background with moving beams or grid patterns"
    - "Add a glowing moving border to highlight key elements"
    - "Create a wavy animated background for section dividers"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Aceternity UI

## Overview

Aceternity UI is a **copy-paste** component library — not an npm package. You copy the component code directly into your project, giving you full ownership and customization power. Components are built with Framer Motion and Tailwind CSS.

**Key traits:**
- Copy-paste approach (no runtime dependency)
- Framer Motion for physics-based animations
- Tailwind CSS for styling
- Next.js / React compatible
- TypeScript source included

## Setup

### Install dependencies

```bash
npm install framer-motion clsx tailwind-merge
```

### Add the `cn` utility

```ts
// lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Configure Tailwind

```js
// tailwind.config.ts — add animations
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      animation: {
        spotlight: "spotlight 2s ease .75s 1 forwards",
        shimmer: "shimmer 2s linear infinite",
        "move-to-right": "move-to-right 2s linear infinite",
      },
      keyframes: {
        spotlight: {
          "0%": { opacity: "0", transform: "translate(-72%, -62%) scale(0.5)" },
          "100%": { opacity: "1", transform: "translate(-50%, -40%) scale(1)" },
        },
        shimmer: {
          from: { backgroundPosition: "0 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
    },
  },
};
```

## Top 5 Components with Code

### 1. 3D Card Effect — tilt on hover

```tsx
// components/ui/3d-card.tsx
"use client";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const CardContainer = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - left - width / 2) / 25;
    const y = (e.clientY - top - height / 2) / 25;
    setRotateX(-y);
    setRotateY(x);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { setRotateX(0); setRotateY(0); }}
      className={cn("group/card perspective-1000", className)}
      style={{ perspective: "1000px" }}
    >
      <motion.div
        animate={{ rotateX, rotateY }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {children}
      </motion.div>
    </div>
  );
};

export const CardBody = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("h-96 w-96 rounded-xl border border-white/10 bg-gray-900 p-6", className)}>
    {children}
  </div>
);

// Usage
export function PricingCard() {
  return (
    <CardContainer>
      <CardBody className="flex flex-col justify-between p-8">
        <h3 className="text-2xl font-bold text-white">Pro Plan</h3>
        <p className="text-4xl font-bold text-white">$29<span className="text-lg text-gray-400">/mo</span></p>
        <button className="rounded-lg bg-white px-6 py-3 font-semibold text-black">Get Started</button>
      </CardBody>
    </CardContainer>
  );
}
```

### 2. Background Beams — animated gradient beams

```tsx
// components/ui/background-beams.tsx
"use client";
import { cn } from "@/lib/utils";

export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      <svg
        className="absolute h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="beam1" cx="50%" cy="0%" r="50%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="beam2" cx="20%" cy="50%" r="40%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#beam1)" />
        <rect width="100%" height="100%" fill="url(#beam2)" />
        {/* Animated lines */}
        {[...Array(6)].map((_, i) => (
          <line
            key={i}
            x1={`${(i + 1) * 15}%`}
            y1="0%"
            x2={`${(i + 1) * 15 + 10}%`}
            y2="100%"
            stroke={`hsl(${240 + i * 20}, 70%, 60%)`}
            strokeWidth="1"
            strokeOpacity="0.15"
          />
        ))}
      </svg>
    </div>
  );
}

// Usage
export function HeroSection() {
  return (
    <div className="relative flex h-screen flex-col items-center justify-center bg-black">
      <BackgroundBeams />
      <h1 className="relative z-10 text-6xl font-bold text-white">
        Build the Future
      </h1>
      <p className="relative z-10 mt-4 text-xl text-gray-400">
        The platform for modern teams
      </p>
    </div>
  );
}
```

### 3. Spotlight — cursor-following light effect

```tsx
// components/ui/spotlight.tsx
"use client";
import { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Spotlight({ className }: { className?: string }) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const { left, top } = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - left, y: e.clientY - top });
  }, []);

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={cn("relative overflow-hidden", className)}
    >
      <motion.div
        animate={{ opacity }}
        transition={{ duration: 0.3 }}
        className="pointer-events-none absolute -inset-px rounded-xl"
        style={{
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(99, 102, 241, 0.15), transparent 40%)`,
        }}
      />
    </div>
  );
}

// Usage on a card
export function SpotlightCard({ title, desc }: { title: string; desc: string }) {
  return (
    <Spotlight className="rounded-xl border border-white/10 bg-gray-900 p-8">
      <h3 className="text-xl font-bold text-white">{title}</h3>
      <p className="mt-2 text-gray-400">{desc}</p>
    </Spotlight>
  );
}
```

### 4. Moving Border — animated gradient border

```tsx
// components/ui/moving-border.tsx
"use client";
import { useRef } from "react";
import { motion, useAnimationFrame, useMotionTemplate, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

export function MovingBorder({
  children,
  duration = 2000,
  className,
}: {
  children: React.ReactNode;
  duration?: number;
  className?: string;
}) {
  const pathRef = useRef<SVGRectElement>(null);
  const progress = useMotionValue(0);

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength();
    if (length) {
      const pxPerMs = length / duration;
      progress.set((time * pxPerMs) % length);
    }
  });

  const x = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).x ?? 0);
  const y = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).y ?? 0);
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <div className={cn("relative", className)}>
      <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <rect
          fill="none"
          width="100%"
          height="100%"
          rx="16"
          ry="16"
          ref={pathRef as React.RefObject<SVGRectElement>}
        />
        <motion.circle cx="0" cy="0" r="6" fill="#6366f1" style={{ transform }} />
      </svg>
      <div className="relative rounded-2xl border border-white/10 bg-gray-900 p-px">
        <div className="rounded-2xl bg-gray-950 p-6">{children}</div>
      </div>
    </div>
  );
}

// Usage
export function FeatureCard() {
  return (
    <MovingBorder duration={3000} className="w-72">
      <h3 className="text-xl font-bold text-white">Feature Name</h3>
      <p className="mt-2 text-gray-400">Description of the feature goes here.</p>
    </MovingBorder>
  );
}
```

### 5. Wavy Background — animated wave effect

```tsx
// components/ui/wavy-background.tsx
"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { createNoise3D } from "simplex-noise";

export function WavyBackground({
  children,
  className,
  backgroundFill = "#0f0f0f",
  colors = ["#38bdf8", "#818cf8", "#c084fc"],
  speed = 0.001,
}: {
  children?: React.ReactNode;
  className?: string;
  backgroundFill?: string;
  colors?: string[];
  speed?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const noise = createNoise3D();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let frame = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.fillStyle = backgroundFill;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      colors.forEach((color, i) => {
        ctx.beginPath();
        ctx.lineWidth = 40;
        ctx.strokeStyle = color;
        for (let x = 0; x <= canvas.width; x += 5) {
          const y = noise(x / 800, i * 0.3, frame * speed) * 100 + canvas.height / 2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      frame++;
      requestAnimationFrame(draw);
    };
    draw();

    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// Usage
export function WavyHero() {
  return (
    <WavyBackground className="h-screen" colors={["#6366f1", "#8b5cf6", "#ec4899"]}>
      <h1 className="text-6xl font-bold text-white text-center">
        Ship with Confidence
      </h1>
    </WavyBackground>
  );
}
```

## Installation Helper

```bash
# Install all common deps at once
npm install framer-motion clsx tailwind-merge simplex-noise

# For TypeScript types
npm install -D @types/simplex-noise
```

## Component Reference

| Component | Effect | Use for |
|-----------|--------|---------|
| 3D Card | Tilt on hover | Pricing, features |
| Background Beams | Gradient beam lines | Hero backgrounds |
| Spotlight | Cursor-following glow | Cards, panels |
| Moving Border | Animated border dot | CTAs, feature cards |
| Wavy Background | Canvas wave animation | Section backgrounds |
| Glowing Stars | Star particles | Dark hero sections |
| Evervault Card | Scrambling text on hover | Security/tech themes |
| Lamp | Cone of light from top | Hero sections |
| Macbook Scroll | Device reveal on scroll | Product showcases |
| Infinite Moving Cards | Scrolling testimonials | Social proof |

## Tips

- All components are dark-mode first — wrap in `dark` class or set `darkMode: 'class'` in Tailwind
- For performance, lazy-load canvas-heavy components with `next/dynamic` and `ssr: false`
- Framer Motion adds ~30KB to bundle — consider `LazyMotion` for code splitting
- Copy from [ui.aceternity.com](https://ui.aceternity.com) for the latest component versions
