---
name: dev-slides
description: >-
  Create developer-friendly presentations using Slidev. Build Vue-powered
  slides with live code execution, syntax highlighting, and diagrams.
  Use when a user asks to create a presentation, build slides, make a
  tech talk, create a slide deck, or prepare a developer presentation.
license: Apache-2.0
compatibility: "Requires Node.js 22.12+ and npm; playwright-chromium for PDF/PNG/PPTX export"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/slidevjs/slidev
  category: development
  tags: "slides, presentations, slidev, vue, developer-tools"
  use-cases: "Create a technical presentation with live code examples, Build a slide deck for a conference talk or team demo, Generate slides from a topic outline with code samples and diagrams"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Dev Slides

## Overview

Create developer-friendly presentations using Slidev, a markdown-based slide framework powered by Vue. Supports live code execution, syntax highlighting, Mermaid diagrams, LaTeX math, and speaker notes. Ideal for tech talks, team demos, and conference presentations.

## Instructions

When a user asks you to create a presentation or slide deck, follow this process:

### Step 1: Set up the Slidev project

Slidev needs Node.js 22.12 or newer. The npm package is `@slidev/cli` (there is no package called `slidev`), so install it into a project instead of relying on a bare `npx slidev`:

```bash
# Scaffold a project with prompts (creates slides.md, package.json, scripts)
npm init slidev@latest

# Or add it to an existing folder
mkdir api-design-talk && cd api-design-talk
npm init -y
npm i -D @slidev/cli @slidev/theme-seriph
```

Inside the project, `npx slidev` and the `dev` / `build` / `export` scripts all work.

### Step 2: Gather the presentation requirements

Before writing slides, determine:
- **Topic:** What is the presentation about?
- **Audience:** Developers, managers, mixed?
- **Length:** How many slides? (Typical: 10-20 for a talk)
- **Style:** Technical deep-dive, overview, tutorial, demo?
- **Code focus:** Which languages and frameworks?

### Step 3: Write the slides in Markdown

Slidev uses Markdown with YAML frontmatter and `---` separators between slides.

**Basic structure:**

```markdown
---
theme: default
title: "Your Presentation Title"
info: |
  Presentation description
class: text-center
drawings:
  persist: false
transition: slide-left
---

# Your Presentation Title

Subtitle or tagline

---

## Slide Title

- Bullet point one
- Bullet point two
- Bullet point three

---
```

**Code blocks with syntax highlighting:**

```markdown
---

## API Example

\`\`\`typescript {2-3|4-5}{lines:true}
async function fetchUsers() {
  const response = await fetch('/api/users');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data;
}
\`\`\`

---
```

The `{2-3|4-5}` part highlights lines step by step on each click (use `all` or `none` as stages too); the second brace group `{lines:true}` turns on line numbers for this block.

**Mermaid diagrams:**

```markdown
---

## Architecture

\`\`\`mermaid
graph LR
  A[Client] --> B[API Gateway]
  B --> C[Auth Service]
  B --> D[Data Service]
  D --> E[(Database)]
\`\`\`

---
```

**Two-column layouts** need `layout: two-cols` in the slide's frontmatter; `::right::` starts the right column (use `two-cols-header` for a full-width heading row):

```markdown
---
layout: two-cols
---

## Comparison

### Before
- Manual deploys
- No tests
- 2-hour releases

::right::

### After
- CI/CD pipeline
- 95% coverage
- 5-minute releases

---
```

**Speaker notes:**

```markdown
---

## Key Metrics

- 99.9% uptime
- 50ms p99 latency

<!--
Speaker notes go here.
Mention that we achieved this after the migration in Q3.
-->

---
```

### Step 4: Add theme and configuration

The first slide's frontmatter (headmatter) configures the whole deck. Themes are npm packages (`@slidev/theme-seriph`, `@slidev/theme-default`, community themes such as `slidev-theme-*`); Slidev offers to install a missing one on first run.

```yaml
---
theme: seriph
title: REST API Design
author: Dana Whitfield
class: text-center
lineNumbers: true        # line numbers in every code block
transition: slide-left
drawings:
  persist: false
exportFilename: rest-api-design
---
```

Syntax highlighting (Shiki) and UnoCSS are built in, so the old `highlighter: shiki` and `css: unocss` keys are not needed.

### Step 5: Preview and export

```bash
# Dev server with live reload (default port 3030)
npx slidev slides.md --open

# Build as a static SPA into dist/ (add --download to offer a PDF)
npx slidev build slides.md
```

PDF, PPTX and PNG export use Playwright, which is not bundled. Install it once, then export:

```bash
npm i -D playwright-chromium
npx slidev export slides.md --output rest-api-design                    # PDF
npx slidev export slides.md --format png --output rest-api-design-png   # one PNG per slide
npx slidev export slides.md --format pptx-editable                      # PowerPoint with native shapes
```

Add `--with-clicks` to get one page per click step and `--range 1,4-6` to export only some slides. Without Playwright the export command fails with an error from `importPlaywright`. The built-in browser exporter (the Export entry in the dev server's menu, or `/export`) works in Chromium without the CLI.

## Examples

### Example 1: Create a tech talk on API design

**User request:** "Create slides for a talk on REST API best practices"

**Output:** Write `slides.md` with approximately 12-15 slides covering:
1. Title slide with talk info
2. Agenda / outline
3. What makes a good API (principles)
4. Resource naming conventions with examples
5. HTTP methods and status codes (code table)
6. Request/response design with code blocks
7. Pagination patterns with code
8. Error handling with JSON examples
9. Versioning strategies
10. Authentication overview (diagram)
11. Rate limiting
12. Documentation tools
13. Summary and key takeaways

Each slide uses appropriate Slidev features: code blocks for examples, Mermaid for architecture diagrams, two-column layouts for comparisons.

### Example 2: Create an internal team demo

**User request:** "Make slides for demoing our new auth system to the team"

**Output:** Write `slides.md` with 8-10 slides:
1. Title: "New Auth System Demo"
2. Problem statement (what was wrong with the old system)
3. Architecture diagram (Mermaid flowchart)
4. Code walkthrough: login flow with highlighted steps
5. Code walkthrough: token refresh mechanism
6. Before/after metrics comparison (two-column layout)
7. Migration plan timeline
8. Q&A slide

### Example 3: Generate slides from an outline

**User request:** "Turn this outline into slides: Intro to Docker - what it is, images vs containers, Dockerfile basics, docker-compose, best practices"

**Output:** Convert each outline item into 2-3 slides with:
- Explanatory text and bullet points
- Relevant code blocks (Dockerfile syntax, docker-compose.yml)
- A Mermaid diagram showing the image-to-container lifecycle
- A best practices checklist slide

## Guidelines

- Keep each slide focused on one idea. If a slide has more than 5 bullet points, split it.
- Use code blocks liberally for developer audiences. Highlight key lines with the `{lines}` syntax.
- Add Mermaid diagrams for architecture, flows, and relationships instead of describing them in text.
- Use speaker notes for context you want to say but not display.
- Prefer the `seriph` or `default` theme for professional presentations.
- For live demos, use Slidev's Monaco editor: mark a block ```` ```ts {monaco} ```` to make it editable, or ```` {monaco-run} ```` to run it in the browser.
- Always structure slides with a clear narrative: problem, solution, details, summary.
- Export to PDF before sharing to ensure consistent rendering; interactive features (Monaco, click animations) are not preserved in PDF/PPTX, so host the `slidev build` output when they matter. Plain `pptx` exports slides as images; use `pptx-editable` if the recipient must edit text.
- Keep total slide count reasonable: 1-2 minutes per slide is typical pacing.
