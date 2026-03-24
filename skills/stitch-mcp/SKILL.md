---
name: stitch-mcp
description: >-
  Import AI-generated UI designs from Google Stitch into your development workflow via MCP.
  Use when: converting Stitch designs to code, integrating AI design tools with coding agents,
  building UI from AI-generated prototypes.
license: MIT
compatibility: "Node.js 18+, Claude Code"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: [stitch, google, design-to-code, mcp, ui, prototyping]
  use-cases:
    - "Import a Google Stitch design and generate production React components"
    - "Bridge AI design tools with AI coding agents for full stack delivery"
    - "Convert AI prototypes to pixel-perfect implementations"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Stitch MCP

## Overview

Stitch MCP is a CLI for moving AI-generated UI designs from Google's Stitch platform into your development workflow. Stitch creates HTML/CSS designs through AI — stitch-mcp fetches those designs, serves them locally, builds deployable sites from them, and exposes them to coding agents via the Model Context Protocol (MCP).

The workflow: **Design in Stitch → Preview locally → Hand off to coding agent → Ship production code.**

## Prerequisites

- Node.js 18+
- Google Cloud account with Stitch access
- `gcloud` CLI installed
- An MCP-compatible client (Claude Code, VS Code, Cursor, Gemini CLI, Codex, OpenCode)

## Quick Start

### 1. Initialize (one-time setup)

```bash
npx @_davideast/stitch-mcp init
```

This guided wizard handles:
- Google Cloud authentication
- Stitch API access configuration
- MCP client configuration for your IDE

### 2. Preview designs locally

```bash
npx @_davideast/stitch-mcp serve -p <project-id>
```

Serves all project screens on a local Vite dev server for preview.

### 3. Build a site from designs

```bash
npx @_davideast/stitch-mcp site -p <project-id>
```

Maps Stitch screens to routes and generates a deployable Astro project.

## MCP Integration

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

**Supported clients:** VS Code, Cursor, Claude Code, Gemini CLI, Codex, OpenCode.

### Virtual Tools (for AI Agents)

The MCP proxy exposes high-level tools that combine multiple API calls:

| Tool | Description |
|------|-------------|
| `build_site` | Build a site from a project by mapping screens to routes. Returns design HTML for each page. |
| `get_screen_code` | Retrieve a screen and download its HTML code content. |
| `get_screen_image` | Retrieve a screen and download its screenshot as base64. |

#### build_site Schema

```json
{
  "projectId": "string (required)",
  "routes": [
    {
      "screenId": "string (required)",
      "route": "string (required, e.g. '/' or '/about')"
    }
  ]
}
```

#### Example: Build site via CLI

```bash
npx @_davideast/stitch-mcp tool build_site -d '{
  "projectId": "123456",
  "routes": [
    { "screenId": "abc", "route": "/" },
    { "screenId": "def", "route": "/about" }
  ]
}'
```

## Exploring Designs

Browse your design data before handing off to agents:

```bash
# Browse all projects
npx @_davideast/stitch-mcp view --projects

# Inspect a specific screen
npx @_davideast/stitch-mcp view --project <project-id> --screen <screen-id>

# List available MCP tools
npx @_davideast/stitch-mcp tool

# See a tool's schema
npx @_davideast/stitch-mcp tool <toolName> -s
```

**Interactive browser controls:** `c` copies value, `s` previews HTML in browser, `o` opens in Stitch, `q` quits, arrow keys to navigate.

## CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Set up auth, gcloud, and MCP client config |
| `doctor` | Verify configuration health |
| `logout` | Revoke credentials |
| `serve -p <id>` | Preview project screens locally |
| `screens -p <id>` | Browse screens in terminal |
| `view` | Interactive resource browser |
| `site -p <id>` | Generate Astro project from screens |
| `snapshot` | Save screen state to file |
| `tool [name]` | Invoke MCP tools from CLI |
| `proxy` | Run MCP proxy for agents |

## Design-to-Code Workflow

### Step 1: Design in Google Stitch

Create your UI designs in Stitch. Each screen becomes a self-contained HTML/CSS artifact.

### Step 2: Preview and iterate

```bash
npx @_davideast/stitch-mcp serve -p <project-id>
# Open localhost to review all screens
```

### Step 3: Hand off to coding agent

With MCP configured, your coding agent can:
- Fetch screen HTML and images directly
- Build complete sites from screen routes
- Use design context when generating production components

### Step 4: Generate production code

Ask your agent:
```
Using the Stitch designs from project <id>, create production React
components with Tailwind CSS. Map the home screen to / and the about
screen to /about.
```

The agent calls `build_site` via MCP, receives the design HTML, and generates production code that matches the design.

## Tips

- Run `doctor` after setup to verify everything works
- Use `snapshot` to save screen state for offline work
- Preview designs with `serve` before handing to agents for faster iteration
- Combine with other MCP tools for full-stack workflows

## Resources

- [GitHub Repository](https://github.com/davideast/stitch-mcp)
- [Google Stitch](https://stitch.google.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
