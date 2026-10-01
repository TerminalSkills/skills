---
name: ui-ux-pro-max
description: >-
  UI UX Pro Max is an open-source design-intelligence pack for AI coding
  agents: a local, searchable database of UI styles, color palettes, font
  pairings, chart types and UX guidelines, plus a generator that turns a
  product description into a design system. Use when a user asks to install
  or use UI UX Pro Max, generate a design system, pick a style, palette or
  typography, improve UX, redesign an interface, review UI patterns, improve
  user flows, design forms, build navigation, or make an interface more
  intuitive and polished.
license: Apache-2.0
compatibility: "The pack's search script needs Python 3 (standard library only); its installer runs with Node.js via npx. The design method itself has no requirements."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
  tags: ["ui", "ux", "design-system", "user-experience", "interaction-design"]
  use-cases:
    - "Review and improve existing UI/UX with actionable recommendations"
    - "Design intuitive user flows for complex workflows"
    - "Create comprehensive design systems with reusable component patterns"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# UI/UX Pro Max

## Overview

UI UX Pro Max is an open-source (MIT) skill pack by NextLevelBuilder that gives a coding agent design data it can query offline: 79 searchable UI styles, 192 product types with matching palettes, 74 font pairings, 25 chart types, 119 UX guidelines and rules for 22 stacks (counts as of v2.15.0), plus a generator that combines them into one design system for a product. This skill covers installing and querying the pack, and a compact design method — interaction design, user flows, component patterns, accessibility, and micro-interactions — that applies whether or not the pack is installed.

## Instructions

### Use the UI UX Pro Max pack when it is available

Check for an existing install before proposing one. The installer copies seven skills (`ui-ux-pro-max`, `design`, `design-system`, `ui-styling`, `brand`, `banner-design`, `slides` — about 170 files, 5 MB) into the project, so ask the user first.

```bash
# Already installed? (project, universal, or home directory)
ls .claude/skills/ui-ux-pro-max/scripts/search.py .agents/skills/ui-ux-pro-max/scripts/search.py \
   ~/.claude/skills/ui-ux-pro-max/scripts/search.py 2>/dev/null
python3 --version

# Install into the current project (the npm package is ui-ux-pro-max-cli; its command is uipro)
npx ui-ux-pro-max-cli init --ai claude       # .claude/skills/   also: cursor, gemini, copilot, windsurf, opencode, all
npx ui-ux-pro-max-cli init --ai codex        # .agents/skills/   (same target as --ai universal)
npx ui-ux-pro-max-cli init --ai claude --global   # ~/.claude/skills/ for every project
```

In Claude Code the pack is also a plugin: `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill`, then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`.

Generate a design system first, then look up details. Point `SEARCH` at wherever the pack was installed:

```bash
SEARCH=.claude/skills/ui-ux-pro-max/scripts/search.py

# One recommendation: landing pattern, style, palette, typography, effects, anti-patterns, checklist
python3 $SEARCH "veterinary clinic appointment booking" --design-system -p "Pawline Vet" -f markdown

# Save it for later sessions: design-system/pawline-vet/MASTER.md plus pages/booking.md
# (files that already exist are left untouched; add --force to overwrite MASTER.md)
python3 $SEARCH "veterinary clinic appointment booking" --design-system --persist -p "Pawline Vet" --page booking --output-dir .

# Targeted lookups (-n sets the number of results, default 3; --json returns untruncated fields)
python3 $SEARCH "form validation error message" --domain ux -n 2
python3 $SEARCH "form validation" --stack nextjs
python3 $SEARCH "skeleton loading" --domain ux --json
```

`--domain` accepts `style`, `color`, `chart`, `landing`, `product`, `ux`, `typography`, `icons`, `gsap`, `react`, `web`, `google-fonts`. `--stack` accepts `react`, `nextjs`, `vue`, `nuxtjs`, `nuxt-ui`, `svelte`, `astro`, `angular`, `laravel`, `html-tailwind`, `shadcn`, `threejs`, `swiftui`, `jetpack-compose`, `react-native`, `flutter`, `javafx`, `wpf`, `winui`, `avalonia`, `uno`, `uwp`. When a persisted design system exists, read `MASTER.md` before writing UI code; a file in `pages/` overrides it for that page.

### Design method

When a user asks for UI/UX guidance or implementation, follow these steps:

### Step 1: Understand the design context

| Aspect | What to Identify |
|--------|-----------------|
| Users | Who are they? Technical? Non-technical? Frequency of use? |
| Task | What is the user trying to accomplish? |
| Context | Desktop, mobile, or both? Time-pressured or exploratory? |
| Complexity | How many steps? How much data? How many options? |
| Existing patterns | What conventions does the product already follow? |

### Step 2: Apply core UX principles

**Progressive disclosure:** Show only what is needed at each step. Hide complexity behind expandable sections, tooltips, or advanced settings.

**Feedback loops:** Every user action must produce visible feedback within 100ms. Clicks, submissions, errors, success — all need clear responses.

**Error prevention over error handling:** Disable invalid options, validate inline, use smart defaults. It is cheaper to prevent mistakes than to recover from them.

**Recognition over recall:** Users should see their options, not remember them. Use dropdowns instead of free text when options are known. Show recent items and suggestions.

**Consistency:** Same action, same pattern, everywhere. If clicking a row opens a detail panel on one page, it should do the same on every page.

### Step 3: Design the interaction patterns

**Navigation patterns:**
```
Top nav:        Best for < 7 primary sections, public sites
Sidebar nav:    Best for apps with deep hierarchy, frequent switching
Bottom tabs:    Best for mobile, 3-5 primary destinations
Breadcrumbs:    Best for deep hierarchies where users need to backtrack
Command palette: Best for power users, keyboard-driven apps
```

**Form patterns:**
```
Single column:  Best for most forms (faster completion)
Multi-column:   Only for related short fields (city/state/zip)
Stepped wizard: Best for 7+ fields or complex flows
Inline editing: Best for settings and profile pages
```

**Data display patterns:**
```
Table:          Best for comparing items with many attributes
Card grid:      Best for visual items or browsing
List:           Best for sequential or prioritized items
Detail panel:   Best for master-detail workflows
Dashboard:      Best for monitoring metrics at a glance
```

### Step 4: Implement with polish

**Loading states:**
- Skeleton screens over spinners (less jarring, feels faster)
- Show progress bars for operations over 3 seconds
- Optimistic UI for common actions (show success immediately, rollback on failure)

**Empty states:**
- Never show a blank screen. Explain what will appear here and how to get started
- Include an illustration or icon to soften the empty feeling
- Provide a primary action button ("Create your first project")

**Transitions and animation:**
```
Duration:   150-300ms for UI transitions (faster feels snappy)
Easing:     ease-out for entrances, ease-in for exits
Motion:     Fade + slight translate (8-16px) for appearing elements
Hover:      Scale 1.02-1.05 for cards, color shift for buttons
Focus:      Visible ring (2px offset) for keyboard navigation
```

**Micro-interactions that matter:**
- Button press: subtle scale down (0.97) on active
- Toggle switch: smooth slide with color transition
- Checkbox: checkmark draws in with a slight bounce
- Form submit: button shows loading state, then success checkmark
- Delete: item slides out, undo toast appears

### Step 5: Validate the design

- **5-second test:** Can a new user identify the page purpose in 5 seconds?
- **Squint test:** When you blur your eyes, does the visual hierarchy still work?
- **Tab test:** Can you navigate the entire flow with keyboard only?
- **Error test:** What happens when things go wrong? Empty data? Long text? Slow network?

## Examples

### Example 1: Generate and persist a design system with the pack

**User request:** "We're building a booking site for Pawline Vet, a veterinary clinic. Pick a look for it and keep it consistent across pages."

```bash
SEARCH=.claude/skills/ui-ux-pro-max/scripts/search.py
python3 $SEARCH "veterinary clinic appointment booking" --design-system --persist -p "Pawline Vet" --page booking --output-dir .
```

**Result:** the script prints the recommendation and, on the first run, writes two files. The key values it returned:

```markdown
Category:    Veterinary Clinic
Pattern:     Trust & Authority + Conversion (Hero > Proof > Solution overview > Clear CTA path)
Style:       Claymorphism — light mode supported, dark mode conditional
Colors:      Primary #0D9488, Secondary #14B8A6, Accent/CTA #EA580C, Background #F0FDFA, Foreground #134E4A
Typography:  Varela Round (headings) / Nunito Sans (body), with the Google Fonts import
Checklist:   contrast 4.5:1, visible focus states, prefers-reduced-motion, responsive at 375/768/1024/1440px

design-system/pawline-vet/MASTER.md          # colors as CSS variables, typography, spacing, component specs
design-system/pawline-vet/pages/booking.md   # overrides for the booking page only
```

The suggested call to action was "Contact Sales / Get Quote", which does not fit a clinic — replace it with "Book an appointment" in `MASTER.md` before building, then implement the pages from those files.

### Example 2: Improve a settings page UX

**User request:** "Our settings page is confusing, help me redesign it"

**Analysis and output:**
```markdown
## Current Issues
1. All settings on one long page — overwhelming
2. No grouping — unrelated settings mixed together
3. Save button only at the bottom — easy to miss
4. No indication of which settings were changed

## Recommended Design

### Structure
- Group settings into logical sections with a left sidebar:
  - General, Notifications, Security, Billing, Integrations
- Each section loads as its own panel on the right

### Interaction
- Auto-save with a subtle "Saved" toast (no save button needed)
- Or: floating save banner that appears only when changes are detected
- Show changed fields with a subtle highlight
- Add "Reset to default" per field, not per page

### Component Pattern
[Sidebar] → [Section Header + Description] → [Setting Group]

Each setting:
  Label (bold) + Description (gray, smaller)
  Input/Toggle/Select aligned to the right
  Divider between settings
```

### Example 3: Design system component audit

**User request:** "Help me create consistent button styles for our app"

**Output:**
```markdown
## Button System

### Hierarchy (use exactly these 4 variants)
| Variant | Use Case | Example |
|---------|----------|---------|
| Primary | Main CTA, 1 per screen | "Save", "Submit", "Create" |
| Secondary | Supporting actions | "Cancel", "Back", "Export" |
| Ghost | Tertiary actions | "Learn more", "View all" |
| Destructive | Irreversible actions | "Delete", "Remove" |

### Sizes
| Size | Height | Padding | Font | Use Case |
|------|--------|---------|------|----------|
| sm | 32px | 12px 16px | 13px | Tables, dense UI |
| md | 40px | 12px 20px | 14px | Default, forms |
| lg | 48px | 14px 24px | 16px | Hero CTAs, landing |

### States (every button needs all of these)
- Default → Hover (darken 10%) → Active (darken 15%, scale 0.98)
- Focus (visible ring, 2px offset)
- Disabled (50% opacity, no pointer events)
- Loading (spinner replaces text, same width to prevent layout shift)

### Rules
- Max 1 primary button per visible area
- Destructive buttons require a confirmation step
- Icon-only buttons need a tooltip and aria-label
- Button text: verb + noun ("Create project" not just "Create")
```

## Guidelines

- Design for the 80% case. Optimize the common path. Edge cases go behind menus and advanced options.
- Every screen should have one obvious next action. If users hesitate, the design has failed.
- White space is not wasted space. Cramming more elements in does not make the interface more useful.
- Copy is part of UX. "Something went wrong" is bad. "We couldn't save your changes. Check your connection and try again." is good.
- Test with real data. A card that looks great with 3 words breaks with 30. Design for the worst case.
- Performance is UX. A beautiful interface that takes 4 seconds to respond feels broken.
- Accessibility is UX for everyone. Keyboard navigation, screen readers, color contrast, and motion preferences all matter.
- When in doubt, look at what works. Study interfaces people already use and love. Do not reinvent patterns without good reason.
- Treat the pack's design system as a starting point. It ranks rows by keyword match, so check the matched category and adjust anything that does not suit the product; re-run with a more specific query if the category is wrong.
- Use the current npm package `ui-ux-pro-max-cli`. The older `uipro-cli` package stopped at 2.2.3 (January 2026) and ships stale data.
- If `.claude/skills/ui-ux-pro-max/` already exists — for example this skill was installed under that name — `init --ai claude` reports success but writes nothing. Install with `--ai universal`, use the Claude Code plugin, or pass `--force`, which replaces the existing `SKILL.md` with the pack's own.
- `uipro versions` queries the GitHub API and fails with a rate-limit error once the unauthenticated quota is used up; `init` installs from the npm package and does not need it. `uipro uninstall` asks for confirmation, so let the user run it.
- Do not install Python or other software to make the pack work; if `python3` is missing, tell the user and continue with the design method.
