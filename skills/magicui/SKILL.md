---
name: magicui
description: >-
  Add animated React UI components for landing pages and marketing sites with Magic UI.
  Use when: adding animated UI components, building impressive landing pages, creating
  particle effects, text animations, number counters, shimmer buttons, and visual
  effects in React. Tailwind CSS based and shadcn/ui compatible.
license: Apache-2.0
compatibility: "Requires React 18+, Tailwind CSS 3+, Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["magicui", "react", "animations", "ui-components", "tailwind"]
  use-cases:
    - "Add a particle/confetti effect to a landing page hero section"
    - "Create an animated number counter for displaying stats"
    - "Build a shimmer button with gradient animation for CTAs"
    - "Add a scrolling marquee for logos or testimonials"
    - "Create sparkle text for highlighting key phrases"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Magic UI

## Overview

Magic UI is a collection of animated React components built on Tailwind CSS and shadcn/ui. Components are installed via CLI directly into your project — you own the source code and can customize freely.

**Key traits:**
- CLI-based install (no runtime package dependency)
- Tailwind CSS + CSS variables for theming
- shadcn/ui compatible
- TypeScript first

## Setup

### Prerequisites

```bash
# Must have Tailwind CSS configured
npm install tailwindcss @tailwindcss/typography
# Must have shadcn/ui initialized (or manual cn utility)
npx shadcn@latest init
```

### Install a component

```bash
npx magicui-cli add <component-name>
```

This copies the component source into `components/magicui/`.

## Component Catalog & Examples

### 1. AnimatedBeam — connecting lines between elements

```bash
npx magicui-cli add animated-beam
```

```tsx
import { AnimatedBeam } from "@/components/magicui/animated-beam";
import { useRef } from "react";

export function BeamDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative flex h-64 items-center justify-between p-10">
      <div ref={fromRef} className="h-12 w-12 rounded-full bg-blue-500" />
      <div ref={toRef} className="h-12 w-12 rounded-full bg-purple-500" />
      <AnimatedBeam containerRef={containerRef} fromRef={fromRef} toRef={toRef} />
    </div>
  );
}
```

### 2. Marquee — infinite scrolling ticker

```bash
npx magicui-cli add marquee
```

```tsx
import Marquee from "@/components/magicui/marquee";

const logos = ["Vercel", "Stripe", "Linear", "Notion", "Figma"];

export function LogoMarquee() {
  return (
    <Marquee pauseOnHover className="[--duration:20s]">
      {logos.map((name) => (
        <div key={name} className="mx-8 text-xl font-semibold text-muted-foreground">
          {name}
        </div>
      ))}
    </Marquee>
  );
}
```

### 3. ShimmerButton — animated gradient CTA

```bash
npx magicui-cli add shimmer-button
```

```tsx
import { ShimmerButton } from "@/components/magicui/shimmer-button";

export function HeroCTA() {
  return (
    <ShimmerButton
      shimmerColor="#ffffff"
      shimmerSize="0.1em"
      shimmerDuration="2s"
      background="linear-gradient(135deg, #6366f1, #8b5cf6)"
      className="px-8 py-3 text-white font-semibold"
    >
      Get Started Free →
    </ShimmerButton>
  );
}
```

### 4. NumberTicker — animated counting up

```bash
npx magicui-cli add number-ticker
```

```tsx
import NumberTicker from "@/components/magicui/number-ticker";

export function StatsSection() {
  return (
    <div className="grid grid-cols-3 gap-8 text-center">
      <div>
        <NumberTicker value={10000} className="text-5xl font-bold" />
        <p className="text-muted-foreground">Active Users</p>
      </div>
      <div>
        <NumberTicker value={99} className="text-5xl font-bold" />
        <span className="text-5xl font-bold">%</span>
        <p className="text-muted-foreground">Uptime</p>
      </div>
      <div>
        <NumberTicker value={500} className="text-5xl font-bold" />
        <p className="text-muted-foreground">Customers</p>
      </div>
    </div>
  );
}
```

### 5. SparklesText — glittering highlight text

```bash
npx magicui-cli add sparkles-text
```

```tsx
import SparklesText from "@/components/magicui/sparkles-text";

export function HeroHeading() {
  return (
    <h1 className="text-6xl font-bold">
      Build{" "}
      <SparklesText text="faster" colors={{ first: "#6366f1", second: "#ec4899" }} />
      {" "}with AI
    </h1>
  );
}
```

### 6. Ripple — pulsing circle effect

```bash
npx magicui-cli add ripple
```

```tsx
import { Ripple } from "@/components/magicui/ripple";

export function HeroBackground() {
  return (
    <div className="relative flex h-96 items-center justify-center overflow-hidden bg-background">
      <Ripple mainCircleSize={200} numCircles={8} />
      <p className="z-10 text-4xl font-bold">Connect Everything</p>
    </div>
  );
}
```

### 7. Confetti — celebration burst

```bash
npx magicui-cli add confetti
```

```tsx
import { useConfetti } from "@/components/magicui/confetti";

export function SuccessButton() {
  const { fire } = useConfetti();

  return (
    <button
      onClick={() => fire({ particleCount: 100, spread: 70, origin: { y: 0.6 } })}
      className="rounded-lg bg-green-500 px-6 py-3 text-white font-semibold"
    >
      🎉 Complete Purchase
    </button>
  );
}
```

### 8. Meteors — falling meteor streaks background

```bash
npx magicui-cli add meteors
```

```tsx
import { Meteors } from "@/components/magicui/meteors";

export function HeroCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-background p-8">
      <Meteors number={20} />
      <h2 className="relative z-10 text-3xl font-bold">Your Product Name</h2>
      <p className="relative z-10 mt-2 text-muted-foreground">Tagline goes here</p>
    </div>
  );
}
```

### 9. BlurIn — text fade-in with blur

```bash
npx magicui-cli add blur-in
```

```tsx
import BlurIn from "@/components/magicui/blur-in";

export function AnimatedHero() {
  return (
    <BlurIn
      word="The Future of Development"
      className="text-5xl font-bold tracking-tight"
      duration={1.2}
    />
  );
}
```

### 10. Globe — 3D interactive globe

```bash
npx magicui-cli add globe
```

```tsx
import Globe from "@/components/magicui/globe";

export function GlobalSection() {
  return (
    <div className="flex flex-col items-center">
      <h2 className="text-3xl font-bold">Available Worldwide</h2>
      <Globe className="h-[500px] w-[500px]" />
    </div>
  );
}
```

## Full Landing Page Pattern

```tsx
// app/page.tsx — typical hero section with Magic UI components
import BlurIn from "@/components/magicui/blur-in";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { Ripple } from "@/components/magicui/ripple";
import Marquee from "@/components/magicui/marquee";
import NumberTicker from "@/components/magicui/number-ticker";

export default function LandingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative flex h-screen flex-col items-center justify-center text-center">
        <Ripple mainCircleSize={300} numCircles={6} />
        <BlurIn word="Ship Faster Than Ever" className="z-10 text-6xl font-bold" />
        <p className="z-10 mt-4 text-xl text-muted-foreground">
          The platform that gets you from idea to production
        </p>
        <ShimmerButton className="z-10 mt-8">Start for free</ShimmerButton>
      </section>

      {/* Social proof logos */}
      <section className="py-12">
        <Marquee className="[--duration:30s]">
          {["Company A", "Company B", "Company C", "Company D", "Company E"].map((name) => (
            <span key={name} className="mx-12 text-lg text-muted-foreground">{name}</span>
          ))}
        </Marquee>
      </section>

      {/* Stats */}
      <section className="py-20 text-center">
        <div className="grid grid-cols-3 gap-12">
          <div><NumberTicker value={50000} className="text-4xl font-bold" /><p>Users</p></div>
          <div><NumberTicker value={99} className="text-4xl font-bold" /><span>%</span><p>Uptime</p></div>
          <div><NumberTicker value={200} className="text-4xl font-bold" /><span>+</span><p>Countries</p></div>
        </div>
      </section>
    </main>
  );
}
```

## Available Components (full list)

```bash
# Run to see all available components
npx magicui-cli list
```

Popular ones: `animated-beam`, `animated-gradient-text`, `animated-grid-pattern`, `animated-list`,
`animated-shiny-text`, `aurora-text`, `blur-in`, `blur-fade`, `border-beam`,
`confetti`, `cool-mode`, `dock`, `dot-pattern`, `file-tree`, `flip-text`,
`globe`, `grid-pattern`, `hyper-text`, `interactive-hover-button`, `letter-pullup`,
`magic-card`, `marquee`, `meteors`, `morphing-text`, `neon-gradient-card`,
`number-ticker`, `orbiting-circles`, `particles`, `pointer`, `pulsating-button`,
`rainbow-button`, `retro-grid`, `ripple`, `safari`, `scroll-based-velocity`,
`shimmer-button`, `shine-border`, `shiny-button`, `sparkles-text`,
`spinning-text`, `terminal`, `text-reveal`, `ticker`, `typing-animation`,
`vanish-input`, `wavy-text`, `word-fade-in`, `word-pull-up`, `word-rotate`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `cn` not found | Install `clsx` + `tailwind-merge` and add `lib/utils.ts` |
| Animation not working | Check `tailwind.config.ts` has `darkMode: "class"` and CSS vars defined |
| Component not found | Run `npx magicui-cli@latest add <name>` (use `@latest`) |
| Peer dep warnings | Magic UI needs React 18+ and Tailwind 3+ |
