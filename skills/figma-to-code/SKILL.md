---
name: figma-to-code
description: >-
  Converts Figma designs into production-ready frontend code. Use when someone
  shares a Figma URL, design screenshot, or exported design tokens and needs
  React/Vue/HTML components, responsive layouts, or design system code. Trigger
  words: Figma, design to code, mockup, wireframe, UI implementation, pixel
  perfect, design handoff, component from design.
license: Apache-2.0
compatibility: "Figma URLs need the Figma MCP server (OAuth sign-in) or a personal access token with the file_content:read scope; also works from screenshots or exported design specs"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: ["figma", "frontend", "design-to-code", "react", "css"]
---

# Figma to Code

## Overview

This skill converts Figma designs into production-ready frontend components. It extracts layout structure, spacing, typography, colors, and interactive states from designs and generates clean, responsive code using the team's existing tech stack and design system.

## Instructions

### Getting Design Information

There are three ways to receive design input:

1. **Figma URL** — A link such as `https://www.figma.com/design/Kp7dRw2xLm9QeTz4uVn8Ys/Billing-Dashboard?node-id=1289-4127` carries the file key (`Kp7dRw2xLm9QeTz4uVn8Ys`) and the node id (`1289-4127`, written `1289:4127` in the API). Read it one of two ways:

   **Figma MCP server (preferred; only clients in Figma's MCP catalog, such as Claude Code, Codex, Cursor and VS Code, can connect).** Add the server once, authorize it in the browser (in Claude Code: run `/mcp`, select `figma`, then **Authenticate**), then pass the link to its tools:
   ```bash
   claude mcp add --transport http figma https://mcp.figma.com/mcp   # Claude Code
   codex mcp add figma --url https://mcp.figma.com/mcp               # Codex CLI
   ```
   - `get_design_context` — layout, styles, and reference code for the node (React + Tailwind unless the prompt names another stack)
   - `get_variable_defs` — the variables and styles the node uses, for design tokens
   - `get_screenshot` — an image of the node to check the result against
   - `get_metadata` — a sparse XML outline, for frames too large to fetch whole

   **Figma REST API.** Use a personal access token (Figma Settings → Security) with the `file_content:read` scope, kept in `FIGMA_TOKEN`:
   ```bash
   curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
     "https://api.figma.com/v1/files/Kp7dRw2xLm9QeTz4uVn8Ys/nodes?ids=1289:4127" \
     | jq '.nodes["1289:4127"].document'

   # Export icons and illustrations as SVG (returns temporary download URLs)
   curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
     "https://api.figma.com/v1/images/Kp7dRw2xLm9QeTz4uVn8Ys?ids=1301:88,1301:92&format=svg"
   ```
   Parse the node JSON for layout (`layoutMode`, `itemSpacing`, `paddingLeft`, `absoluteBoundingBox`), styles (`fills`, `effects`, `cornerRadius`, text `style.fontFamily` / `fontSize` / `fontWeight` / `lineHeightPx`), and component structure (`children`, `componentId`).

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
    ComponentName.module.css # Styles (omit when styling with Tailwind classes)
    index.ts                # Re-export
```

## Examples

### Example 1: Pricing Card from Figma Screenshot

**User provides:** Screenshot of a pricing card with three tiers

**Agent output:**
```tsx
// components/PricingCard/PricingCard.tsx
import { CheckIcon } from "../icons/CheckIcon";
import styles from "./PricingCard.module.css";

interface PricingCardProps {
  name: string;
  price: number;
  period: "monthly" | "yearly";
  features: string[];
  ctaLabel: string;
  highlighted?: boolean;
  onSelect: () => void;
}

export function PricingCard({ name, price, period, features, ctaLabel, highlighted, onSelect }: PricingCardProps) {
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
        {ctaLabel}
      </button>
    </article>
  );
}
```

### Example 2: Dashboard Layout from Figma URL

**User provides:** "Build this dashboard in React: https://www.figma.com/design/Kp7dRw2xLm9QeTz4uVn8Ys/Billing-Dashboard?node-id=1289-4127" — a frame with sidebar navigation, stats cards, and a data table

**Agent fetches the frame** (or calls `get_design_context` and `get_variable_defs` with the same link when the Figma MCP server is connected):
```bash
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/Kp7dRw2xLm9QeTz4uVn8Ys/nodes?ids=1289:4127" > dashboard.json
```

**Agent extracts from the response:**
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
- The remote Figma MCP server needs a link to a frame or layer; "my current selection" only works with the desktop server. Tool calls are metered by plan and seat: a Starter plan gets up to 20 per month, a Dev or Full seat on Professional 200 per day
- The REST file, node, and image endpoints are rate-limited the same way (Dev and Full seats: 10-20 requests per minute depending on plan; View and Collab seats and Starter-plan files: a small monthly allowance). Fetch the frame once, save the JSON, and request all image ids in one call; on HTTP 429 wait for the `Retry-After` seconds
- A node id that does not exist comes back as `null` in the `nodes` map rather than as an error — check before parsing
- Keep the Figma token in an environment variable, give it only the `file_content:read` scope, and never write it into generated code or commits
- Treat generated code as a first pass: compare it with a screenshot of the frame, and when a design exists only as a flattened image inside Figma there is no layout data to extract — treat it as a screenshot
