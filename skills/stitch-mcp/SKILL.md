---
name: stitch-mcp
description: >-
  Import AI-generated UI designs from Google Stitch into your development workflow via MCP.
  Use when: converting Stitch designs to code, integrating AI design tools with coding agents,
  building UI from AI-generated prototypes.
license: MIT
compatibility: "Node.js 18+, Claude Code or any MCP client"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: [stitch, google, design-to-code, mcp, ui]
---

# Stitch MCP

## Overview

Stitch MCP is a CLI for moving AI-generated UI designs from Google's Stitch platform into your development workflow. Stitch creates HTML/CSS designs through AI — stitch-mcp fetches those designs, serves them locally, builds deployable sites from them, and exposes them to coding agents via the Model Context Protocol (MCP).

The workflow: Design in Stitch, preview locally, hand off to a coding agent, ship production code.

## Instructions

### Prerequisites

- Node.js 18+
- Google Cloud account with Stitch access
- `gcloud` CLI installed

### Setup

```bash
npx @_davideast/stitch-mcp init
```

This guided wizard handles Google Cloud authentication, Stitch API access, and MCP client configuration.

### Preview Designs Locally

```bash
npx @_davideast/stitch-mcp serve -p <project-id>
```

Serves all project screens on a local Vite dev server.

### Build a Deployable Site

```bash
npx @_davideast/stitch-mcp site -p <project-id>
```

Maps Stitch screens to routes and generates a deployable Astro project.

### MCP Integration

Add to your MCP client config to give coding agents access to Stitch tools:

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

### MCP Tools for AI Agents

| Tool | Description |
|------|-------------|
| `build_site` | Build a site from a project by mapping screens to routes |
| `get_screen_code` | Retrieve a screen's HTML code content |
| `get_screen_image` | Retrieve a screen screenshot as base64 |

### CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Set up auth, gcloud, and MCP client config |
| `doctor` | Verify configuration health |
| `serve -p <id>` | Preview project screens locally |
| `view` | Interactive resource browser |
| `site -p <id>` | Generate Astro project from screens |
| `tool [name]` | Invoke MCP tools from CLI |
| `proxy` | Run MCP proxy for agents |

## Examples

### Example 1: Marketing Site from Stitch Designs

A frontend developer uses Stitch to design a startup marketing site, then hands it off to Claude Code for production React components:

```bash
# Preview the Stitch designs locally
npx @_davideast/stitch-mcp serve -p proj_8x7kq2m

# Verify screens look correct at localhost:3000
# Screens: home (hero + features), pricing (3 tiers), about (team bios)
```

With MCP configured, the developer prompts Claude Code:

```
Using the Stitch designs from project proj_8x7kq2m, create production
React components with Tailwind CSS. Map screens:
- home -> /
- pricing -> /pricing
- about -> /about

Use semantic HTML, add responsive breakpoints, and extract shared
components (Navbar, Footer, CTAButton).
```

Claude Code calls `build_site` via MCP with the route mapping, receives the design HTML for each page, and generates a complete Next.js app with `components/Navbar.tsx`, `components/Footer.tsx`, `app/page.tsx`, `app/pricing/page.tsx`, and `app/about/page.tsx` — all matching the original Stitch designs.

### Example 2: Iterating on a Dashboard Design

A product designer creates dashboard screens in Stitch and uses stitch-mcp to iterate between design and code:

```bash
# Browse available screens
npx @_davideast/stitch-mcp view --projects

# Inspect specific screen details
npx @_davideast/stitch-mcp view --project proj_4n9wf3r --screen scr_analytics

# Build the site to see all screens as routes
npx @_davideast/stitch-mcp tool build_site -d '{
  "projectId": "proj_4n9wf3r",
  "routes": [
    { "screenId": "scr_analytics", "route": "/" },
    { "screenId": "scr_settings", "route": "/settings" },
    { "screenId": "scr_users", "route": "/users" }
  ]
}'
```

The designer then asks their coding agent: "Take the analytics dashboard from Stitch and add interactive Chart.js graphs for the revenue and user metrics. Keep the exact layout from the design but make the data tables sortable."

The agent fetches the screen HTML via `get_screen_code`, preserves the layout structure, and adds client-side interactivity on top of the design.

## Guidelines

- Run `doctor` after setup to verify authentication and configuration
- Use `snapshot` to save screen state for offline work or version control
- Preview designs with `serve` before handing to agents — faster iteration loop
- Stitch MCP works with VS Code, Cursor, Claude Code, Gemini CLI, Codex, and OpenCode
- Use the interactive browser (`view`) to explore projects before building
- Combine with other design skills (impeccable-design, frontend-design) for polished output
- See [GitHub](https://github.com/davideast/stitch-mcp) and [Google Stitch](https://stitch.google.com) for more
