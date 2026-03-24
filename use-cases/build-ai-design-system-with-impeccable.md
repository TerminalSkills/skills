---
title: Build an AI Design System with Impeccable
slug: build-ai-design-system-with-impeccable
description: Use Impeccable to enforce consistent design tokens and rules so AI-generated React components always match your design system.
skills:
  - impeccable-design
  - shadcn-ui
category: design
tags:
  - design-system
  - components
  - react
  - tailwind
  - design-tokens
---

# Build an AI Design System with Impeccable

## The Problem

Every time AI generates a UI component, it picks random spacing, inconsistent colors, and different border radiuses. Your app looks like 5 different designers worked on it — and none of them talked to each other. AI defaults to Inter font, purple gradients, and cards nested inside cards.

## The Solution

Define strict design tokens and rules using Impeccable's design language. Run `/teach-impeccable` once to set the context, then use steering commands like `/normalize` and `/typeset` to enforce consistency. Every new component follows the same spacing scale, typography hierarchy, and color palette.

## Step-by-Step Walkthrough

### Step 1: Install Impeccable

```bash
# For Claude Code
cp -r dist/claude-code/.claude your-project/

# Or download from impeccable.style
```

### Step 2: Set Design Context

Run `/teach-impeccable` in your AI agent. This one-time setup gathers your project's design preferences — brand colors, preferred fonts, spacing scale, and component patterns.

### Step 3: Define Design Tokens

```css
/* tokens.css */
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --color-primary: oklch(0.65 0.15 250);
  --color-surface: oklch(0.98 0.005 250);
  --color-text: oklch(0.15 0.02 250);
  --color-text-muted: oklch(0.45 0.02 250);

  --font-heading: 'DM Sans', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

### Step 4: Generate Components with Steering

Ask AI to generate a component, then refine with Impeccable commands:

```
"Build a data table component for displaying invoice line items"

/audit data-table       # Check for design issues
/normalize data-table   # Align with your design tokens
/typeset data-table     # Fix typography hierarchy
/polish data-table      # Final pass — loading states, focus rings
```

### Step 5: Validate Consistency

Run `/critique` on each new component to verify it follows the system. The critique checks spacing scale adherence, color token usage, typography consistency, and anti-pattern violations.

## Real-World Example

Lena, a design engineer at a fintech startup, needs 40 components for a new dashboard. She installs Impeccable, runs `/teach-impeccable` with the brand's navy-and-teal palette, and defines design tokens with a 4px/8px spacing scale. She asks Claude Code to generate a MetricCard component. The initial output uses Inter font and pure gray borders. She runs `/audit MetricCard` — it flags 3 issues. She runs `/normalize /typeset /polish MetricCard` and gets a component with DM Sans headings, tinted-navy borders, and proper 8px padding rhythm. She repeats this for DataTable, StatusBadge, and LineChart. After 40 components, every one uses the same tokens, spacing, and typography — they look like they were designed by the same person.

## Related Skills

- [impeccable-design](/skills/impeccable-design) — The design language and steering commands
- [shadcn-ui](/skills/shadcn-ui) — Component library that pairs well with design tokens
