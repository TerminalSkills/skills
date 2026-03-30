---
name: clone-website
description: >-
  Clone any website as a pixel-perfect Next.js app using AI agents — automated reconnaissance,
  design token extraction, component spec generation, parallel building, and visual QA.
  Use when: reverse-engineering a website design, rebuilding a site in modern tech stack,
  creating pixel-perfect clones for redesign projects.
license: MIT
compatibility: "Node.js 20+, Claude Code with Chrome MCP"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: [website-cloning, design-to-code, reverse-engineering, pixel-perfect, next-js]
---

# Clone Website

## Overview

Reverse-engineer and rebuild **$ARGUMENTS** as a pixel-perfect Next.js clone. This skill uses Chrome MCP for automated reconnaissance, extracts exact CSS values and design tokens, generates component specs, dispatches parallel builder agents in git worktrees, and runs visual QA. Extraction and construction happen in parallel — each section gets a detailed spec file before any builder is dispatched.

## Instructions

### Pre-Flight

1. **Chrome MCP is required.** Test it immediately — this skill cannot work without browser automation.
2. Read `TARGET.md` for URL and scope. If the URL doesn't match `$ARGUMENTS`, update it.
3. Verify the base project builds: `npm run build`. Next.js + shadcn/ui + Tailwind v4 scaffold must be in place.
4. Create output directories: `docs/research/`, `docs/research/components/`, `docs/design-references/`, `scripts/`.

### Guiding Principles

- **Completeness over speed** — every builder must receive exact CSS values, screenshots, downloaded assets, and real text content. If a builder has to guess, extraction failed.
- **Small tasks, perfect results** — if a builder prompt exceeds ~150 lines, break the section into smaller sub-components.
- **Real content, real assets** — extract actual text, images, videos, SVGs. Check for layered assets (background + foreground + overlay).
- **Foundation first** — global CSS tokens, TypeScript types, and fonts must exist before any component building.
- **Extract appearance AND behavior** — capture hover states, scroll triggers, transitions, animation timings. Not just static CSS.
- **Identify interaction model first** — scroll-driven vs click-driven vs time-driven. Getting this wrong means a complete rewrite.
- **Extract every state** — click each tab, scroll past each threshold, capture before/after CSS for all states.
- **Spec files are the source of truth** — every component gets a spec in `docs/research/components/` before dispatch.
- **Build must always compile** — `npx tsc --noEmit` after each builder, `npm run build` after each merge.

### Phase 1: Reconnaissance

Navigate to the target URL with Chrome MCP.

1. **Screenshots** — full-page at desktop (1440px) and mobile (390px), saved to `docs/design-references/`.
2. **Global extraction** — fonts (families, weights, styles), colors (full palette from computed styles), favicons/meta, global UI patterns (custom scrollbars, scroll-snap, smooth scroll libraries like Lenis).
3. **Interaction sweep** — scroll slowly top-to-bottom observing header changes, scroll animations, auto-switching tabs. Then click every interactive element. Then hover over buttons/cards/links. Test at 1440px, 768px, 390px. Save findings to `docs/research/BEHAVIORS.md`.
4. **Page topology** — map every section top-to-bottom with working names, layout type, z-index layers, interaction model. Save to `docs/research/PAGE_TOPOLOGY.md`.

### Phase 2: Foundation Build

Do this yourself (not delegated), since it touches many files:

1. Update fonts in `layout.tsx`, colors/tokens in `globals.css`
2. Create TypeScript interfaces in `src/types/`
3. Extract SVG icons to `src/components/icons.tsx`
4. Download all assets to `public/` using a script via Chrome MCP to enumerate images, videos, background-images, then batch-download
5. Verify: `npm run build` passes

### Phase 3: Component Specification & Dispatch

For each section in your page topology:

1. **Extract** — screenshot the section, extract computed CSS via `getComputedStyle()` for every element (use a recursive walker script in Chrome MCP), extract multi-state styles by triggering state changes, extract verbatim text content, identify all assets.
2. **Write spec file** — create `docs/research/components/<name>.spec.md` covering: target file path, interaction model, DOM structure, exact computed styles, states/behaviors with triggers and transitions, per-state content, assets, responsive behavior at desktop/tablet/mobile.
3. **Dispatch builders** — simple sections get one agent, complex sections (3+ sub-components) get split. Each builder receives the full spec inline, screenshot path, shared component imports, target file path, and must run `npx tsc --noEmit`.
4. **Merge** — merge worktree branches, resolve conflicts, verify `npm run build` after each merge.

Continue the extract-spec-dispatch-merge cycle until all sections are built.

### Phase 4: Page Assembly

Wire all sections together in `src/app/page.tsx`:
- Import all section components in visual order
- Implement page-level layout (scroll containers, sticky positioning, z-index layers)
- Connect page-level behaviors (scroll snap, smooth scroll, intersection observers)
- Verify: `npm run build` passes

### Phase 5: Visual QA

1. Screenshot original and clone side-by-side at 1440px and 390px
2. Compare section-by-section — fix discrepancies by re-checking specs and re-extracting if needed
3. Test all interactions: scroll, click every button/tab, hover over interactive elements
4. Only declare complete after this QA pass

## Examples

### Example 1: Clone Linear.app Homepage

```
User: /clone-website https://linear.app
```

The skill navigates to linear.app, takes full-page screenshots at 1440px and 390px, extracts the dark color palette (#0A0A0B background, #5E6AD2 accent), Inter font stack, and smooth scroll behavior. It maps 6 sections (nav, hero, features grid, social proof, CTA, footer), builds the foundation with exact design tokens, then dispatches parallel builders — one per section in separate worktrees. After merging, visual QA catches a 2px padding difference in the feature cards and auto-corrects it.

### Example 2: Clone Stripe Pricing Page

```
User: /clone-website https://stripe.com/pricing
```

The skill identifies the pricing page's complex interaction model: tabbed pricing tiers (click-driven), a sticky comparison table header (scroll-driven), and expandable feature rows (click-driven accordions). It extracts all 3 pricing tier states by clicking each tab, captures the sticky header's before/after scroll styles, and documents each accordion's open/close transitions. The comparison table gets split into sub-components (header, row group, expandable row) with separate specs and builders.

## Guidelines

- **Respect copyright** — clone for inspiration and learning, not to steal brands. Always customize before going live.
- **Don't build click-based tabs when the original is scroll-driven (or vice versa).** Scroll first, then click to determine the interaction model.
- **Don't extract only the default state.** Click every tab, scroll past every threshold, capture all states.
- **Don't miss layered images.** Check every container's DOM tree for multiple `<img>` elements and positioned overlays.
- **Don't approximate CSS.** "Looks like `text-lg`" is wrong if computed value differs. Extract exact values.
- **Don't skip responsive extraction.** Always test at 1440px, 768px, and 390px during extraction.
- **Don't dispatch builders without a spec file.** The spec forces exhaustive extraction and creates an auditable artifact.
- **Complex animations** (WebGL, Three.js, Lottie) may need simplification or manual recreation.
- **Check for smooth scroll libraries** (Lenis, Locomotive Scroll) — default browser scrolling feels noticeably different.
