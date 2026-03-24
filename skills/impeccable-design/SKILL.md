---
name: impeccable-design
description: >-
  Apply the Impeccable design language to improve AI-generated UI/UX quality — spacing,
  typography, color, layout rules that AI agents follow to produce professional designs.
  Use when: improving AI-generated UI quality, establishing design constraints for AI agents,
  creating pixel-perfect layouts with AI assistance.
license: MIT
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: [design-language, ui, ux, typography, layout]
---

# Impeccable Design

## Overview

Impeccable is a design language that makes AI agents dramatically better at frontend design. Every LLM learned from the same generic templates, producing predictable mistakes: Inter font, purple gradients, cards nested in cards, gray text on colored backgrounds.

Impeccable fights that bias with an expanded design skill, 20 steering commands, and curated anti-patterns that explicitly tell the AI what NOT to do. It builds on and complements the existing `frontend-design` skill — while `frontend-design` provides general UI/UX principles, Impeccable adds deeper design-system-level controls, specific anti-pattern enforcement, and a command vocabulary for iterative refinement.

## Instructions

### Installation

```bash
# Claude Code (project-specific)
cp -r dist/claude-code/.claude your-project/

# Claude Code (global)
cp -r dist/claude-code/.claude/* ~/.claude/

# Cursor (requires Nightly channel + Agent Skills enabled)
cp -r dist/cursor/.cursor your-project/

# Gemini CLI
cp -r dist/gemini/.gemini your-project/
```

Or download ready-to-use bundles from [impeccable.style](https://impeccable.style).

### The 7 Design Reference Domains

Impeccable includes reference files covering:

1. **Typography** — Type systems, font pairing (avoid overused Inter/Arial), responsive sizing
2. **Color and Contrast** — OKLCH color space, tinted neutrals (never pure gray), WCAG compliance
3. **Spatial Design** — 4px/8px spacing system, visual hierarchy through whitespace
4. **Motion Design** — Purposeful animation, `ease-out` for entrances, respect `prefers-reduced-motion`
5. **Interaction Design** — Form patterns, focus states, skeleton loading, 44px touch targets
6. **Responsive Design** — Mobile-first, `clamp()`, container queries, content-driven breakpoints
7. **UX Writing** — Actionable labels, helpful errors, progressive disclosure

### Steering Commands

Use these commands in your AI agent to steer design quality:

- `/audit [target]` — Run technical quality checks (a11y, performance, responsive)
- `/critique [target]` — UX design review: hierarchy, clarity, resonance
- `/normalize [target]` — Align with design system standards
- `/typeset [target]` — Fix font choices, hierarchy, sizing
- `/arrange [target]` — Fix layout, spacing, visual rhythm
- `/colorize [target]` — Introduce strategic color
- `/polish [target]` — Final pass before shipping
- `/distill [target]` — Strip to essence, remove complexity
- `/bolder [target]` — Amplify boring designs
- `/quieter [target]` — Tone down overly bold designs

Commands can be chained: `/audit /normalize /polish dashboard`

### Critical Anti-Patterns to Avoid

- Do not default to Inter, Arial, or system fonts for everything
- Do not use gray text on colored backgrounds (use tinted neutrals)
- Do not use pure black or pure gray (always tint with warm/cool undertones)
- Do not wrap everything in cards or nest cards inside cards
- Do not use bounce/elastic easing (feels dated)
- Do not default to purple gradients (the top sign of AI-generated UI)

## Examples

### Example 1: Improving a SaaS Dashboard

A developer has Claude Code generate a dashboard, then applies Impeccable commands to refine it:

```
Developer: "Build an analytics dashboard showing revenue, users, and conversion metrics"
[Claude generates initial dashboard with Inter font, purple gradient header, nested cards]

Developer: "/audit dashboard"
[Returns: 4 issues — generic font, pure gray borders, card-in-card nesting, no responsive breakpoints]

Developer: "/normalize /typeset /arrange dashboard"
[Claude replaces Inter with DM Sans + JetBrains Mono for data, swaps purple gradient for
a teal-900 header with warm-tinted neutrals, flattens card nesting into whitespace-separated
sections, adds container queries for responsive columns]

Developer: "/polish dashboard"
[Adds subtle staggered fade-in for metric cards, refines padding from 16px to 12px/20px rhythm,
adds skeleton loading states, improves focus-visible outlines for keyboard navigation]
```

Final result: a dashboard with distinctive typography, harmonized colors, proper spatial hierarchy, and production-ready interactions.

### Example 2: Fixing a Landing Page

A designer uses Impeccable to fix common AI design problems on a startup landing page:

```
Designer: "/critique landing-page"
[Returns: hero section is generic (big heading + subtitle + CTA + stock image pattern),
color palette is the default blue-to-purple gradient, empty states have no guidance,
CTA button says "Submit" instead of actionable text]

Designer: "/colorize /typeset landing-page"
[Switches from blue-purple gradient to a warm ochre + deep navy palette derived from brand
colors, replaces Arial with Space Grotesk headings + Inter body text, adjusts type scale
to 1.25 modular ratio with proper line heights]

Designer: "/distill landing-page"
[Removes decorative blob shapes, simplifies hero to focus on a single compelling statement
with a product screenshot, reduces 6 feature cards to 3 with more whitespace, shortens
CTA to "Start building free"]
```

## Guidelines

- Run `/teach-impeccable` once per project to set design context and preferences
- Start with `/audit` to understand what needs fixing before making changes
- Chain commands for efficient workflows: `/audit /normalize /polish`
- Use `/critique` when you want design feedback without code changes
- Apply `/distill` when UI feels cluttered — less is more
- Always test with `/adapt` for responsive behavior across breakpoints
- Impeccable complements the `frontend-design` skill — use both for best results
- See [impeccable.style](https://impeccable.style) and [GitHub](https://github.com/pbakaus/impeccable) for bundles and case studies
