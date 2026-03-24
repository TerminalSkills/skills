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
  tags: [design-language, ui, ux, ai-design, layout, typography, spacing]
  use-cases:
    - "Get AI to generate professional-quality UI that follows design best practices"
    - "Apply systematic design rules to AI-generated components"
    - "Establish design constraints so AI produces consistent, polished interfaces"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Impeccable Design

## Overview

Impeccable is a design language that makes AI agents dramatically better at frontend design. Every LLM learned from the same generic templates, producing the same predictable mistakes: Inter font, purple gradients, cards nested in cards, gray text on colored backgrounds.

Impeccable fights that bias with an expanded design skill, 20 steering commands, and curated anti-patterns that explicitly tell the AI what NOT to do. It builds on Anthropic's original `frontend-design` skill with deeper expertise and more control.

## Installation

### Claude Code

```bash
# Project-specific
cp -r dist/claude-code/.claude your-project/

# Or global (applies to all projects)
cp -r dist/claude-code/.claude/* ~/.claude/
```

### Cursor

```bash
cp -r dist/cursor/.cursor your-project/
```

> Requires: Cursor Nightly channel + Agent Skills enabled in settings.

### Gemini CLI

```bash
cp -r dist/gemini/.gemini your-project/
```

> Requires: `npm i -g @google/gemini-cli@preview`, then `/settings` → enable Skills.

### OpenCode / Pi / Codex CLI

```bash
# OpenCode
cp -r dist/opencode/.opencode your-project/

# Pi
cp -r dist/pi/.pi your-project/

# Codex CLI
cp -r dist/codex/.codex/* ~/.codex/
```

Or download ready-to-use bundles from [impeccable.style](https://impeccable.style).

## The 7 Design Reference Domains

Impeccable includes comprehensive reference files covering:

### 1. Typography

- Type systems and modular scales
- Font pairing strategies (avoid overused fonts like Inter, Arial)
- OpenType features for professional polish
- Responsive type sizing
- Line heights and measure (line length)

### 2. Color and Contrast

- OKLCH color space for perceptually uniform colors
- Tinted neutrals (never pure gray — always add warmth or coolness)
- Dark mode implementation patterns
- WCAG accessibility compliance
- Semantic color tokens

### 3. Spatial Design

- 4px/8px spacing system as foundation
- Consistent padding and margin scales
- Visual hierarchy through whitespace
- Grid systems and alignment
- Component spacing relationships

### 4. Motion Design

- Purposeful animation (not decorative)
- Easing curves: use `ease-out` for entrances, `ease-in` for exits
- Staggered animations for lists
- `prefers-reduced-motion` respect
- **Never use bounce/elastic easing** — it feels dated

### 5. Interaction Design

- Form patterns and validation
- Focus states and keyboard navigation
- Loading patterns (skeleton screens, not spinners)
- Micro-interactions for feedback
- Touch target sizing (minimum 44px)

### 6. Responsive Design

- Mobile-first approach
- Fluid design with `clamp()` and viewport units
- Container queries for component-level responsiveness
- Breakpoint strategy (content-driven, not device-driven)
- Responsive images and media

### 7. UX Writing

- Clear, actionable button labels
- Helpful error messages (what went wrong + how to fix)
- Empty states that guide users forward
- Progressive disclosure of information
- Consistent terminology

## The 20 Commands

Use these commands in your AI agent to steer design quality:

### Analysis Commands (no edits)

| Command | What it does |
|---------|-------------|
| `/audit [target]` | Run technical quality checks (a11y, performance, responsive) |
| `/critique [target]` | UX design review: hierarchy, clarity, emotional resonance |

### Fix & Normalize

| Command | What it does |
|---------|-------------|
| `/normalize [target]` | Align with design system standards |
| `/typeset [target]` | Fix font choices, hierarchy, sizing |
| `/arrange [target]` | Fix layout, spacing, visual rhythm |
| `/colorize [target]` | Introduce strategic color |

### Polish & Ship

| Command | What it does |
|---------|-------------|
| `/polish [target]` | Final pass before shipping |
| `/distill [target]` | Strip to essence, remove complexity |
| `/optimize [target]` | Performance improvements |
| `/harden [target]` | Error handling, i18n, edge cases |

### Style Adjustments

| Command | What it does |
|---------|-------------|
| `/bolder [target]` | Amplify boring designs |
| `/quieter [target]` | Tone down overly bold designs |
| `/delight [target]` | Add moments of joy and micro-interactions |
| `/animate [target]` | Add purposeful motion |

### Structure & Workflow

| Command | What it does |
|---------|-------------|
| `/extract [target]` | Pull into reusable components |
| `/adapt [target]` | Adapt for different devices |
| `/onboard [target]` | Design onboarding flows |
| `/clarify [target]` | Improve unclear UX copy |
| `/overdrive [target]` | Add technically extraordinary effects |
| `/teach-impeccable` | One-time setup: gather design context, save to config |

### Combining Commands

Commands can be chained for multi-step workflows:

```
/audit /normalize /polish blog        # Full workflow: audit → fix → polish
/critique /harden checkout             # UX review + add error handling
/typeset /arrange /colorize dashboard  # Fix type → layout → color
```

> **Codex CLI** uses different syntax: `/prompts:audit`, `/prompts:polish`, etc.

## Critical Anti-Patterns

These are the most common AI design mistakes. Impeccable explicitly prevents them:

### ❌ DON'T: Overused fonts
- Don't default to Inter, Arial, or system fonts for everything
- **DO:** Choose distinctive fonts that match the project's personality

### ❌ DON'T: Gray text on colored backgrounds
- Low contrast, poor readability
- **DO:** Use tinted neutrals that harmonize with the background color

### ❌ DON'T: Pure black or pure gray
- Feels harsh and lifeless
- **DO:** Always tint blacks/grays with warm or cool undertones

### ❌ DON'T: Cards everywhere
- Don't wrap everything in cards. Don't nest cards inside cards
- **DO:** Use whitespace, borders, or subtle backgrounds for grouping

### ❌ DON'T: Bounce/elastic easing
- Feels dated and unprofessional
- **DO:** Use `ease-out` for entrances, `ease-in-out` for transitions

### ❌ DON'T: Purple gradients as default accent
- The #1 sign of AI-generated UI
- **DO:** Choose a color palette that fits the brand/content

### ❌ DON'T: Generic hero sections
- Same layout: big heading, subtitle, CTA button, stock image
- **DO:** Design hero sections that tell a unique story

## Workflow: Improving AI-Generated UI

### Step 1: Generate initial UI

Ask your agent to build the UI as usual.

### Step 2: Audit

```
/audit
```

Get a report of technical issues: accessibility, performance, responsive problems.

### Step 3: Normalize

```
/normalize
```

Apply design system standards: consistent spacing, proper tokens, aligned components.

### Step 4: Polish

```
/polish
```

Final pass: micro-interactions, refined typography, pixel-perfect alignment.

### Step 5: Review anti-patterns

Manually check for the anti-patterns listed above. If you spot any:

```
/typeset      # If fonts are generic
/colorize     # If colors are the default purple gradient
/arrange      # If layout relies too heavily on cards
```

## Tips

- Run `/teach-impeccable` once per project to set design context
- Start with `/audit` to understand what needs fixing before making changes
- Chain commands for efficient workflows: `/audit /normalize /polish`
- Use `/critique` for design feedback without code changes
- Apply `/distill` when UI feels cluttered — less is more
- Always test with `/adapt` for responsive behavior

## Resources

- [Impeccable Website](https://impeccable.style) — download bundles, case studies
- [GitHub Repository](https://github.com/pbakaus/impeccable)
- [Anthropic frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design) — the foundation Impeccable builds on
- Created by [Paul Bakaus](https://www.paulbakaus.com)
