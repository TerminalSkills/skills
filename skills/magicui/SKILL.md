---
name: magicui
description: >-
  Adds animated React components (marquee, number ticker, shimmer button, confetti, globe, animated beam) to landing pages with Magic UI, a copy-the-source library built on Tailwind CSS and shadcn/ui. Use when asked to add animated UI components, build an impressive landing page hero, create particle or meteor backgrounds, text animations, number counters, shimmer buttons, or other visual effects in React.
license: Apache-2.0
compatibility: "React 18 or 19, Tailwind CSS (v4 recommended), a shadcn/ui project (components.json), Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: ["magicui", "react", "animations", "ui-components", "tailwind"]
  repository: https://github.com/magicuidesign/magicui
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

Magic UI is a collection of animated React components for landing pages, built on Tailwind CSS and the `motion` animation library. It is distributed as a shadcn registry: one command copies a component's source into your project, so you own the code and can edit it freely. There is no runtime package to depend on.

Key traits:

- Installed with the shadcn CLI through the `@magicui` registry namespace
- Components are copied to `components/ui/` (the path set by the `ui` alias in `components.json`)
- Named exports (`import { Marquee } from "@/components/ui/marquee"`), TypeScript first
- Animation keyframes live in your global CSS; the CLI adds them for you

The old `magicui-cli` npm package was last published in July 2024 and is no longer maintained. Do not use it; the commands below replace it.

## Instructions

### Prerequisites

The project needs shadcn/ui initialised (a `components.json` file) and Tailwind CSS:

```bash
npx shadcn@latest init
```

The `@magicui` namespace is known to the shadcn CLI, so no registry entry has to be added to `components.json`.

### Install components

```bash
npx shadcn@latest add @magicui/marquee
npx shadcn@latest add @magicui/number-ticker @magicui/shimmer-button   # several at once
npx shadcn@latest view @magicui/globe                                  # inspect source and dependencies first
```

The CLI installs the component's dependencies (for example `motion`, `canvas-confetti`, `cobe`) and writes any `@theme inline` keyframes into your CSS file. To list what exists, read https://magicui.design/llms.txt or browse https://magicui.design/docs/components.

### Component usage

Imports come from `@/components/ui/<name>` and are named exports. Props below are from the current documentation.

**Marquee** — infinite ticker (`reverse`, `pauseOnHover`, `vertical`, `repeat`, default 4). Set speed with the CSS variables `--duration` and `--gap`:

```tsx
import { Marquee } from "@/components/ui/marquee";

<Marquee pauseOnHover className="[--duration:20s]">
  {["Vercel", "Stripe", "Linear", "Notion", "Figma"].map((name) => (
    <span key={name} className="mx-8 text-xl font-semibold text-muted-foreground">{name}</span>
  ))}
</Marquee>
```

**NumberTicker** — counts when it scrolls into view (`value`, `startValue`, `direction`, `delay`, `decimalPlaces`):

```tsx
import { NumberTicker } from "@/components/ui/number-ticker";

<NumberTicker value={10000} className="text-5xl font-bold" />
<NumberTicker value={99.9} decimalPlaces={1} className="text-5xl font-bold" />
```

**ShimmerButton** — props `shimmerColor`, `shimmerSize` (default `0.05em`), `shimmerDuration` (default `3s`), `borderRadius`, `background`:

```tsx
import { ShimmerButton } from "@/components/ui/shimmer-button";

<ShimmerButton shimmerColor="#ffffff" background="linear-gradient(135deg, #6366f1, #8b5cf6)" className="px-8 py-3">
  Start free trial
</ShimmerButton>
```

**SparklesText** — the text is passed as children, not a `text` prop (`sparklesCount`, `colors={{ first, second }}`):

```tsx
import { SparklesText } from "@/components/ui/sparkles-text";

<h1 className="text-6xl font-bold">Build <SparklesText colors={{ first: "#6366f1", second: "#ec4899" }}>faster</SparklesText> with AI</h1>
```

**Ripple** (`mainCircleSize`, `mainCircleOpacity`, `numCircles`) and **Meteors** (`number`, `angle`, `minDuration`, `maxDuration`) are backgrounds: put them in a `relative overflow-hidden` parent and raise your content with `z-10`:

```tsx
import { Ripple } from "@/components/ui/ripple";
import { Meteors } from "@/components/ui/meteors";

<div className="relative flex h-96 items-center justify-center overflow-hidden rounded-2xl border">
  <Ripple mainCircleSize={200} numCircles={8} />
  <Meteors number={20} />
  <p className="z-10 text-4xl font-bold">Connect everything</p>
</div>
```

**Confetti** — a canvas component controlled by a ref, not a hook. Add `manualstart` so it does not fire on mount, then call `fire()`:

```tsx
"use client";
import { useRef } from "react";
import { Confetti, type ConfettiRef } from "@/components/ui/confetti";

export function CheckoutDone() {
  const confettiRef = useRef<ConfettiRef>(null);
  return (
    <div className="relative">
      <Confetti ref={confettiRef} manualstart className="pointer-events-none absolute inset-0 size-full" />
      <button onClick={() => confettiRef.current?.fire({ particleCount: 100, spread: 70 })}>
        Complete purchase
      </button>
    </div>
  );
}
```

**AnimatedBeam** — draws a moving line between two elements; needs three refs (`containerRef`, `fromRef`, `toRef`) and a `relative` container, plus optional `curvature`, `duration`, `reverse`, `gradientStartColor`, `gradientStopColor`:

```tsx
"use client";
import { useRef } from "react";
import { AnimatedBeam } from "@/components/ui/animated-beam";

export function BeamDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} className="relative flex h-64 items-center justify-between p-10">
      <div ref={fromRef} className="size-12 rounded-full bg-blue-500" />
      <div ref={toRef} className="size-12 rounded-full bg-purple-500" />
      <AnimatedBeam containerRef={containerRef} fromRef={fromRef} toRef={toRef} />
    </div>
  );
}
```

**Text effects** — `BlurIn` no longer exists. Use `TextAnimate` (`animation="blurInUp"`, `by="word" | "character" | "line" | "text"`) or `BlurFade` (`delay`, `duration`, `direction`, `inView`):

```tsx
import { TextAnimate } from "@/components/ui/text-animate";
import { BlurFade } from "@/components/ui/blur-fade";

<TextAnimate as="h1" animation="blurInUp" by="word" className="text-5xl font-bold">
  The future of development
</TextAnimate>
<BlurFade delay={0.25} inView><p>Fades in when scrolled into view</p></BlurFade>
```

**Globe** (`config` takes COBE options; the CLI installs `cobe` and `motion`) and **Particles** (`quantity`, `color`, `size`, `staticity`) take only a sized container:

```tsx
import { Globe } from "@/components/ui/globe";

<div className="relative mx-auto size-[500px]"><Globe /></div>
```

### Components that exist today

`animated-beam`, `animated-circular-progress-bar`, `animated-gradient-text`, `animated-grid-pattern`, `animated-list`, `animated-shiny-text`, `animated-theme-toggler`, `aurora-text`, `avatar-circles`, `bento-grid`, `blur-fade`, `border-beam`, `code-comparison`, `confetti`, `cool-mode`, `dock`, `dot-pattern`, `file-tree`, `flickering-grid`, `globe`, `grid-pattern`, `hero-video-dialog`, `highlighter`, `hyper-text`, `icon-cloud`, `interactive-hover-button`, `iphone`, `light-rays`, `magic-card`, `marquee`, `meteors`, `morphing-text`, `neon-gradient-card`, `number-ticker`, `orbiting-circles`, `particles`, `pointer`, `progressive-blur`, `pulsating-button`, `rainbow-button`, `retro-grid`, `ripple`, `safari`, `scroll-based-velocity`, `scroll-progress`, `shimmer-button`, `shine-border`, `shiny-button`, `smooth-cursor`, `sparkles-text`, `spinning-text`, `terminal`, `text-animate`, `text-reveal`, `typing-animation`, `video-text`, `warp-background`, `word-rotate`.

Removed or renamed: `blur-in` (use `text-animate` or `blur-fade`), `word-fade-in`, `word-pull-up`, `letter-pullup`, `flip-text`, `wavy-text`, `vanish-input`, `ticker` (use `marquee`).

## Examples

### Example 1: Hero section with a marquee of customer logos

User request: "Make the landing page hero animated: a ripple behind the headline, a shimmer CTA, and a scrolling row of customer names under it."

```bash
npx shadcn@latest add @magicui/ripple @magicui/shimmer-button @magicui/marquee @magicui/text-animate
```

```tsx
// app/page.tsx
import { Ripple } from "@/components/ui/ripple";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Marquee } from "@/components/ui/marquee";
import { TextAnimate } from "@/components/ui/text-animate";

export default function LandingPage() {
  return (
    <main>
      <section className="relative flex h-screen flex-col items-center justify-center overflow-hidden text-center">
        <Ripple mainCircleSize={300} numCircles={6} />
        <TextAnimate as="h1" animation="blurInUp" by="word" className="z-10 text-6xl font-bold">
          Ship faster than ever
        </TextAnimate>
        <p className="z-10 mt-4 text-xl text-muted-foreground">From idea to production in a day</p>
        <ShimmerButton className="z-10 mt-8">Start for free</ShimmerButton>
      </section>
      <Marquee pauseOnHover className="py-12 [--duration:30s]">
        {["Northwind", "Globex", "Initech", "Umbrella", "Hooli"].map((name) => (
          <span key={name} className="mx-12 text-lg text-muted-foreground">{name}</span>
        ))}
      </Marquee>
    </main>
  );
}
```

Result: `components/ui/` gains `ripple.tsx`, `shimmer-button.tsx`, `marquee.tsx`, `text-animate.tsx`; `motion` is added to `package.json`; the headline fades in word by word while the logos scroll and pause on hover.

### Example 2: Stats row that counts up

User request: "Show three stats that count up when the user scrolls to them."

```bash
npx shadcn@latest add @magicui/number-ticker
```

```tsx
import { NumberTicker } from "@/components/ui/number-ticker";

export function StatsSection() {
  return (
    <div className="grid grid-cols-3 gap-8 text-center">
      <div><NumberTicker value={50000} className="text-5xl font-bold" /><p>Active users</p></div>
      <div><NumberTicker value={99.9} decimalPlaces={1} className="text-5xl font-bold" /><span className="text-5xl font-bold">%</span><p>Uptime</p></div>
      <div><NumberTicker value={42} className="text-5xl font-bold" /><span className="text-5xl font-bold">+</span><p>Countries</p></div>
    </div>
  );
}
```

Result: each number counts from 0 to its value once, when it enters the viewport. Number formatting is fixed to `en-US` (50,000).

## Guidelines

- Use `npx shadcn@latest add @magicui/<name>`, never `magicui-cli`, and never copy code from old blog posts: names such as `blur-in` and import styles such as `import Marquee from` (default export) are outdated.
- Components that use hooks, refs or browser APIs are client components. In the Next.js App Router, add `"use client"` to the file that renders them (the copied components already have it).
- `cn` not found: shadcn's `init` creates `lib/utils.ts`; if it is missing, install `clsx` and `tailwind-merge` and add it.
- Animation does nothing: check that the keyframes were added to your global CSS (`@theme inline { --animate-... }` for Tailwind v4, `tailwind.config` `keyframes` for v3) and that the CSS file is imported in the root layout.
- Background effects (Ripple, Meteors, Particles, BorderBeam) are absolutely positioned: give the parent `relative overflow-hidden` and an explicit height.
- Respect users who prefer reduced motion and keep heavy effects (Globe, Particles, Meteors) to one or two per page; they run continuously and cost CPU on phones.
- Because the source is copied into your repo, updates are not automatic: re-run `npx shadcn@latest add @magicui/<name> --overwrite` to pull a newer version, then review the diff against your edits.
- Do not use Magic UI for dense application screens or accessible form controls; it targets marketing pages. For plain buttons, dialogs and inputs use shadcn/ui itself.
