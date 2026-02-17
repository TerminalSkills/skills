---
name: figma-to-code
description: >-
  Convert Figma designs into production-ready frontend code. Use when someone
  shares a Figma URL, design screenshot, or exported design tokens and needs
  React/Vue/HTML components, responsive layouts, or design system code. Trigger
  words: Figma, design to code, mockup, wireframe, UI implementation, pixel
  perfect, design handoff, component from design.
license: Apache-2.0
compatibility: "Works with Figma URLs (requires Figma API token), screenshots, or exported design specs"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["figma", "frontend", "design-to-code", "react", "css"]
---

# Figma to Code

## Overview

This skill converts Figma designs into production-ready frontend components. It extracts layout structure, spacing, typography, colors, and interactive states from designs and generates clean, responsive code using the team's existing tech stack and design system.

## Instructions

### Getting Design Information

There are three ways to receive design input:

1. **Figma URL** — Extract via Figma REST API:
   ```bash
   curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
     "https://api.figma.com/v1/files/<file_key>/nodes?ids=<node_id>"
   ```
   Parse the JSON response for layout, styles, and component structure.

2. **Screenshot/Image** — Analyze the image visually to identify:
   - Layout grid (columns, gutters, margins)
   - Component hierarchy (cards, headers, lists, forms)
   - Typography scale (headings, body, captions)
   - Color palette and spacing patterns

3. **Exported Design Tokens** — Parse JSON/CSS design tokens directly.

### Generating Components

1. **Identify the component tree** — Break the design into a hierarchy:
   - Page → Sections → Components → Elements
   - Map each to a React/Vue component or HTML section

2. **Extract design tokens:**
   - Colors: Map to CSS custom properties or theme variables
   - Typography: Font family, size, weight, line-height, letter-spacing
   - Spacing: Padding, margin, gap values — normalize to a spacing scale (4px base)
   - Border radius, shadows, opacity

3. **Generate the code following these rules:**
   - Use semantic HTML (`<nav>`, `<main>`, `<article>`, `<section>`)
   - Use CSS Grid or Flexbox for layout — never absolute positioning for flow content
   - Make it responsive: mobile-first, use `clamp()` for fluid typography
   - Use the team's existing component library if specified (e.g., Tailwind, shadcn/ui, MUI)
   - Extract repeated patterns into reusable components
   - Add proper ARIA attributes for accessibility

4. **Handle responsive breakpoints:**
   - If the design shows multiple viewport sizes, implement all of them
   - If only desktop is shown, create sensible mobile breakpoints:
     - Stack horizontal layouts vertically below 768px
     - Collapse navigation to a hamburger menu
     - Adjust font sizes with `clamp()`

5. **Handle interactive states:**
   - Hover, focus, active, disabled states
   - Loading skeletons where data is dynamic
   - Empty states and error states if visible in the design

### Output Structure

Deliver code as individual files:
```
components/
  ComponentName/
    ComponentName.tsx       # Component code
    ComponentName.module.css # Styles (or .tailwind if using Tailwind)
    index.ts                # Re-export
```

## Examples

### Example 1: Pricing Card from Figma Screenshot

**User provides:** Screenshot of a pricing card with three tiers

**Agent output:**
```tsx
// components/PricingCard/PricingCard.tsx
interface PricingCardProps {
  name: string;
  price: number;
  period: "monthly" | "yearly";
  features: string[];
  highlighted?: boolean;
  onSelect: () => void;
}

export function PricingCard({ name, price, period, features, highlighted, onSelect }: PricingCardProps) {
  return (
    <article className={`${styles.card} ${highlighted ? styles.highlighted : ""}`}>
      <h3 className={styles.planName}>{name}</h3>
      <div className={styles.price}>
        <span className={styles.currency}>$</span>
        <span className={styles.amount}>{price}</span>
        <span className={styles.period}>/{period === "monthly" ? "mo" : "yr"}</span>
      </div>
      <ul className={styles.features} role="list">
        {features.map((feature) => (
          <li key={feature} className={styles.feature}>
            <CheckIcon aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>
      <button className={styles.cta} onClick={onSelect}>
        Get started
      </button>
    </article>
  );
}
```

### Example 2: Dashboard Layout from Figma URL

**User provides:** Figma URL to a dashboard with sidebar navigation, stats cards, and a data table

**Agent extracts from API:**
```
Layout: 240px fixed sidebar + fluid main content
Grid: Stats row (4 columns) + full-width table below
Colors: --bg-primary: #0F172A, --bg-surface: #1E293B, --accent: #3B82F6
Type scale: heading-lg: 24/32 Inter 600, body: 14/20 Inter 400
```

**Agent generates:** Sidebar component, StatsGrid component, DataTable component with responsive collapse behavior, and a shared theme file with extracted design tokens.

## Guidelines

- Always ask which framework/library the team uses before generating code
- Prefer the team's existing design system tokens over hardcoded values
- Don't generate pixel values from designs without normalizing to a consistent scale
- Include alt text placeholders for images and meaningful ARIA labels
- Generate TypeScript interfaces for all component props
- If the design has inconsistent spacing, normalize it and flag the discrepancies
- Test responsive behavior — the design may only show one viewport size
- Never hardcode content strings — make them props or use i18n keys
