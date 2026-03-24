---
title: Build a Design-to-Code Pipeline with AI
slug: build-design-to-code-pipeline-with-ai
description: Use Google Stitch and stitch-mcp to generate UI designs from descriptions and convert them to production React components.
skills:
  - stitch-mcp
  - impeccable-design
category: design
tags:
  - design-to-code
  - ui
  - react
  - stitch
  - frontend
---

# Build a Design-to-Code Pipeline with AI

## The Problem

You need 10 new pages this week. You have no designer. Hiring a freelancer takes time you do not have. Writing HTML/CSS from scratch for every screen is slow and the results look generic.

## The Solution

Use Google Stitch to generate UI designs from natural language descriptions, then use stitch-mcp to hand those designs off to your coding agent. The agent receives the exact HTML/CSS from each screen and converts it to production React components with proper routing, responsive breakpoints, and shared components.

## Step-by-Step Walkthrough

### Step 1: Set Up Stitch MCP

```bash
npx @_davideast/stitch-mcp init
```

The wizard handles Google Cloud authentication and MCP client configuration. Add the MCP server to your agent config:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["@_davideast/stitch-mcp", "proxy"]
    }
  }
}
```

### Step 2: Design Screens in Google Stitch

Open stitch.google.com and describe each screen you need:
- "A SaaS landing page with hero section, 3 feature cards, pricing table, and footer"
- "An analytics dashboard with sidebar nav, 4 metric cards, a line chart, and a data table"
- "A settings page with tabbed navigation for profile, billing, and team management"

Stitch generates complete HTML/CSS screens from each description.

### Step 3: Preview and Iterate

```bash
npx @_davideast/stitch-mcp serve -p proj_8x7kq2m
# Open localhost:3000 to review all screens
```

Iterate on the designs in Stitch until they match your vision.

### Step 4: Hand Off to Coding Agent

With the MCP proxy running, prompt your coding agent:

```
Using the Stitch designs from project proj_8x7kq2m, create production
React components with Tailwind CSS. Map screens:
- landing -> /
- dashboard -> /dashboard
- settings -> /settings

Extract shared components: Navbar, Sidebar, Footer, MetricCard.
Add responsive breakpoints and semantic HTML.
```

The agent calls `build_site` via MCP, receives the design HTML, and generates a complete Next.js app matching the designs.

### Step 5: Polish with Impeccable

Run Impeccable commands on the generated code to fix common AI design issues:

```
/audit dashboard     # Check accessibility and responsive behavior
/normalize dashboard # Align spacing and colors with design tokens
/polish dashboard    # Add loading states and transitions
```

## Real-World Example

Anya, co-founder of a project management startup, needs a landing page, dashboard, pricing page, and 7 more screens by Friday. She describes each screen in Google Stitch and gets polished HTML/CSS designs in minutes. She previews them with `stitch-mcp serve`, tweaks the pricing page layout in Stitch, then prompts Claude Code: "Convert these 10 Stitch screens to Next.js with Tailwind. Extract Navbar, Footer, and Sidebar as shared components." Claude Code calls `build_site` via MCP, receives all the design HTML, and generates `app/page.tsx`, `app/dashboard/page.tsx`, `app/pricing/page.tsx`, plus 7 more routes with shared components. She runs `/audit` and `/polish` on each page. By Thursday, all 10 pages are live — responsive, accessible, and matching the original designs.

## Related Skills

- [stitch-mcp](/skills/stitch-mcp) — CLI for importing Google Stitch designs via MCP
- [impeccable-design](/skills/impeccable-design) — Design language for polishing AI-generated UI
