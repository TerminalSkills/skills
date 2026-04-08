---
name: design-md
description: >-
  Use DESIGN.md files to give AI agents a complete design system in plain text. Drop a
  DESIGN.md into your project root and any AI coding agent generates consistent, pixel-perfect
  UI matching that design. Use when: building UI with AI agents, maintaining design consistency
  across AI-generated components, recreating the look of existing websites.
license: MIT
compatibility: "Any AI coding agent, Google Stitch"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["design-system", "ui", "ai-design"]
---

# DESIGN.md

## Overview

DESIGN.md is a plain-text design system document that AI agents read to generate consistent UI. Introduced by Google Stitch, it captures colors, typography, components, spacing, and design philosophy in markdown — the format LLMs read best.

Think of it as AGENTS.md for design: `AGENTS.md` tells agents how to build, `DESIGN.md` tells agents how things should look.

## Instructions

### Using a DESIGN.md

1. Copy a `DESIGN.md` into your project root
2. Tell your AI agent: "Build a landing page following DESIGN.md"
3. The agent reads colors, typography, components, and layout rules
4. Generated UI matches the design system consistently

### Structure of a DESIGN.md

Every DESIGN.md follows this structure:

```markdown
# DESIGN.md

## Visual Theme & Atmosphere
Mood, density, design philosophy (e.g., "dark cinematic", "clean editorial")

## Color Palette & Roles
| Name | Hex | Role |
|------|-----|------|
| Primary | #6366f1 | Interactive elements, CTAs |
| Background | #0a0a0b | Page background |
| Surface | #18181b | Cards, elevated content |
| Text Primary | #fafafa | Main content |
| Accent | #f97316 | Highlights, alerts |

## Typography Rules
Font families, size hierarchy (h1-h6, body, caption), weights, line heights

## Component Stylings
Buttons (primary, secondary, ghost), cards, inputs, navigation — with hover/active states

## Layout Principles
Spacing scale (4px base), max-width, grid columns, whitespace philosophy

## Depth & Elevation
Shadow system, border treatments, surface hierarchy

## Do's and Don'ts
Design guardrails: what to do and what to avoid

## Responsive Behavior
Breakpoints, touch targets, mobile adaptations
```

### Finding Pre-Made DESIGN.md Files

The [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) collection has 58+ ready-to-use files extracted from real websites:

- **AI**: Claude, Cohere, ElevenLabs, Mistral, Ollama, Replicate, RunwayML
- **Dev Tools**: GitHub, Vercel, Supabase, Railway, Linear, Cursor
- **SaaS**: Stripe, Notion, Figma, Slack, Cal.com
- **Marketing**: Tailwind, shadcn/ui, Framer

### Creating Your Own DESIGN.md

Inspect the target website and extract:

1. **Colors**: Use browser DevTools → Computed styles → capture all colors used
2. **Typography**: Font families from CSS, size scale from headings
3. **Spacing**: Measure padding/margins, identify the base unit (usually 4px or 8px)
4. **Components**: Screenshot buttons, cards, inputs in all states
5. **Layout**: Note max-width, grid columns, responsive breakpoints

Write it all in markdown following the structure above.

## Examples

**Example 1: Build a SaaS landing page**

Drop Linear's `DESIGN.md` into your project:

```bash
curl -O https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/linear/DESIGN.md
```

Then tell the agent:
```
Build a landing page for a project management tool following DESIGN.md.
Include: hero with gradient, feature grid, pricing table, CTA section.
```

Result: The agent generates UI with Linear's exact color palette, typography, spacing, and component styles.

**Example 2: Consistent component library**

With DESIGN.md in place, every component the agent generates follows the same system:
```
Create a notification dropdown component following DESIGN.md.
```

The agent uses the correct surface color, border radius, shadow level, and typography from the design system — no manual correction needed.

## Guidelines

- Place `DESIGN.md` in project root alongside `AGENTS.md` and `CLAUDE.md`
- One DESIGN.md per project — it defines the entire visual language
- Update it when your design evolves (it's version-controlled markdown)
- For dark/light themes, include both color sets in the palette section
- Test with a simple component first to verify the agent reads it correctly
- Combine with `impeccable-design` skill for additional design quality rules
