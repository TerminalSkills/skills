---
name: aceternity-ui
description: >-
  Aceternity UI is a collection of animated React components (3D cards, spotlight,
  background beams, moving borders, wavy backgrounds) built with Tailwind CSS and
  the motion library, installed into your project as source through the shadcn CLI.
  Use when someone asks for "animated hero section", "3D tilt card", "spotlight
  effect", "moving border button", "Aceternity component", or "glowing background"
  in a React or Next.js app.
license: Apache-2.0
compatibility: "React 18+ / Next.js, Tailwind CSS, shadcn CLI (npx shadcn@latest). Most components depend on the motion package; wavy-background needs simplex-noise."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: ["aceternity-ui", "react", "motion", "animations", "tailwind"]
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

Aceternity UI is a copy-paste component library: there is no `aceternity` runtime package. Each component is a source file served from a shadcn-compatible registry at `ui.aceternity.com/registry/<name>.json`; the shadcn CLI writes it into `components/ui/` and installs its dependencies, so you own and edit the code. Free components are installed this way; the site also sells a paid "Pro" set of templates and blocks, which is outside this skill.

Components are built with Tailwind CSS and, for most animation, the `motion` package (the successor of `framer-motion`; imports come from `motion/react`). Registry entries use the `@/lib/utils` `cn` helper, so a shadcn-initialised project is the easiest base.

## Instructions

### 1. Prepare the project

```bash
npx shadcn@latest init          # creates components.json and lib/utils.ts (cn helper)
```

Register the namespace in `components.json` (needs shadcn CLI 3.x):

```json
{
  "registries": {
    "@aceternity": "https://ui.aceternity.com/registry/{name}.json"
  }
}
```

### 2. Add components

```bash
npx shadcn@latest add @aceternity/3d-card
npx shadcn@latest add @aceternity/background-beams @aceternity/spotlight
npx shadcn@latest add https://ui.aceternity.com/registry/moving-border.json   # no namespace needed

npx shadcn@latest search @aceternity -q "card"   # find components
npx shadcn@latest list @aceternity               # list everything
```

In a monorepo add `-c ./apps/web`. `npx shadcn@latest mcp init` lets an AI agent search and install from the registry itself. Always read the installed file: registry code is updated over time, and the file you get is the source of truth for props.

### 3. Component notes (what the registry files export)

| Component | Exports / key props | Extra dependency |
|-----------|--------------------|------------------|
| `3d-card` | `CardContainer`, `CardBody`, `CardItem` (`translateZ`, `rotateX`, `as`) | none |
| `background-beams` | `BackgroundBeams` (absolute, fills parent) | `motion` |
| `spotlight` | `Spotlight` (SVG, props `className`, `fill`) | needs `animate-spotlight` in Tailwind |
| `moving-border` | `Button` (`borderRadius`, `duration`, `as`), `MovingBorder` | `motion` |
| `wavy-background` | `WavyBackground` (`colors`, `backgroundFill`, `blur`, `speed: "slow" \| "fast"`, `waveOpacity`) | `simplex-noise` |
| `glowing-stars`, `lamp` | decorative sections | `motion` |

The `spotlight` component animates through a Tailwind animation you must define. Tailwind v3 (`tailwind.config.ts`):

```ts
extend: {
  animation: { spotlight: "spotlight 2s ease .75s 1 forwards" },
  keyframes: {
    spotlight: {
      "0%": { opacity: "0", transform: "translate(-72%, -62%) scale(0.5)" },
      "100%": { opacity: "1", transform: "translate(-50%, -40%) scale(1)" },
    },
  },
}
```

On Tailwind v4 put the same values in the CSS `@theme` block (`--animate-spotlight` plus an `@keyframes spotlight` rule).

## Examples

### Example 1: Hero with beams and a spotlight

**User prompt:** "Give the landing page a dark hero with animated beams and a spotlight."

```bash
npx shadcn@latest add @aceternity/background-beams @aceternity/spotlight
```

```tsx
// app/page.tsx
import { BackgroundBeams } from "@/components/ui/background-beams";
import { Spotlight } from "@/components/ui/spotlight";

export default function Home() {
  return (
    <section className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-neutral-950">
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="white" />
      <BackgroundBeams />
      <h1 className="relative z-10 text-6xl font-bold text-white">Ship invoices in seconds</h1>
    </section>
  );
}
```

Result: beams animate behind the heading and the spotlight fades in once on load. Keep the text at `z-10` so it stays above the absolute-positioned effects.

### Example 2: Pricing card that tilts on hover

**User prompt:** "Make the Pro plan card tilt in 3D when the mouse moves over it."

```bash
npx shadcn@latest add @aceternity/3d-card
```

```tsx
import { CardContainer, CardBody, CardItem } from "@/components/ui/3d-card";

export function ProPlan() {
  return (
    <CardContainer className="inter-var">
      <CardBody className="h-auto w-80 rounded-xl border border-white/10 bg-neutral-900 p-8">
        <CardItem translateZ="50" className="text-2xl font-bold text-white">Pro plan</CardItem>
        <CardItem translateZ="80" className="mt-4 text-4xl font-bold text-white">$29/mo</CardItem>
        <CardItem translateZ="40" as="button" className="mt-6 rounded-lg bg-white px-6 py-3 font-semibold text-black">
          Get started
        </CardItem>
      </CardBody>
    </CardContainer>
  );
}
```

Result: the card rotates toward the cursor and each `CardItem` floats at its own depth.

## Guidelines

- Install through the CLI instead of retyping component code; hand-copied snippets drift from the registry.
- Components use `"use client"`; import them from client or server components in the Next.js App Router, but never call them from server-only code.
- They are dark-theme designs; check contrast in light mode.
- Canvas and SVG effects (`wavy-background`, beams) cost CPU/GPU. Load them with `next/dynamic` and `ssr: false` below the fold, and respect `prefers-reduced-motion`.
- `wavy-background` sizes its canvas to the window, so it suits full-width sections only.
- Do not stack many effects on one screen; one hero effect plus plain content reads better and scores better on Core Web Vitals.
- Older tutorials import from `framer-motion`; both packages work, but registry files now import from `motion/react`. Do not mix them without need.
- Check the license on the site before reusing Pro blocks commercially.
