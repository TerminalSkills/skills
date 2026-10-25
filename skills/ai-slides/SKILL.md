---
name: ai-slides
description: >-
  Generate complete presentations with AI — from outline to polished slides.
  Use when a user asks to create a presentation, build slides, make a pitch
  deck, generate a slide deck, create a keynote, prepare a talk, build a
  demo presentation, or produce any slide-based content.
license: Apache-2.0
compatibility: "No dependencies for the outline; optional Marp CLI (Node.js) or python-pptx (Python 3.9+) to export files"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: "presentations, slides, pitch-deck, keynote, storytelling"
  use-cases: "Create pitch decks for investors with narrative structure and data, Build internal presentations for team updates and project proposals, Generate conference talk slides with speaker notes"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# AI Slides

## Overview

Generate complete, well-structured presentations from topic descriptions, outlines, or raw content. Handles pitch decks, team updates, conference talks, product demos, and educational presentations. Produces slide content with titles, body text, speaker notes, and layout suggestions optimized for visual clarity and audience engagement.

## Instructions

When a user asks you to create a presentation, follow these steps:

### Step 1: Define the presentation parameters

| Parameter | Options |
|-----------|---------|
| Type | Pitch deck, team update, conference talk, product demo, training, proposal |
| Audience | Investors, executives, engineers, customers, general public |
| Duration | 5 min (~8 slides), 15 min (~15 slides), 30 min (~25 slides) |
| Format | Minimal (text-light), data-heavy (charts/tables), visual (image-driven) |
| Tool | PowerPoint, Google Slides, Keynote, Reveal.js, HTML |

### Step 2: Create the narrative structure

Every presentation needs a story arc:

```
1. HOOK        — Open with a surprising fact, question, or bold statement
2. PROBLEM     — What is broken? Why should the audience care?
3. SOLUTION    — Your answer to the problem
4. EVIDENCE    — Data, demos, case studies that prove it works
5. VISION      — Where this goes next / the bigger picture
6. ASK/CTA     — What you want the audience to do
```

**Pitch deck structure (10-12 slides):**
```
1.  Title slide (company name, tagline, logo)
2.  Problem (the pain point you solve)
3.  Solution (your product/approach)
4.  How it works (3-step explanation or demo)
5.  Market size (TAM/SAM/SOM)
6.  Traction (users, revenue, growth metrics)
7.  Business model (how you make money)
8.  Competition (positioning matrix)
9.  Team (founders and key hires)
10. Financials (projections, key metrics)
11. The ask (funding amount, use of funds)
12. Contact (email, website, next steps)
```

**Team update structure (8-10 slides):**
```
1. Title + date
2. TL;DR / Executive summary
3. Key metrics dashboard
4. Completed this period
5. In progress
6. Blockers and risks
7. Next period plan
8. Discussion / Q&A
```

### Step 3: Write each slide

For every slide, provide:

```markdown
## Slide [N]: [Title]

**Layout:** [Title + bullets / Title + image / Full-bleed image / Data chart / Quote]

**Content:**
- [Headline or key message]
- [Supporting point 1]
- [Supporting point 2]
- [Supporting point 3]

**Speaker Notes:**
[What to say while this slide is showing. 2-4 sentences.]

**Visual Suggestion:**
[What image, chart, or graphic would strengthen this slide]
```

### Step 4: Apply slide design principles

**Text rules:**
- Maximum 6 lines of text per slide
- Maximum 6 words per bullet point
- One idea per slide — if you need more text, add another slide
- Title should communicate the takeaway, not just the topic
  ("Revenue grew 3x" not "Revenue Update")

**Visual rules:**
- Use the full slide area. Do not cram content into a small box.
- Left-align text. Centered text is harder to scan.
- Use high-contrast text on backgrounds (white on dark, dark on light)
- One hero image or chart per slide. Never two competing visuals.
- Consistent margin/padding on every slide

**Data visualization:**
- Bar charts for comparisons
- Line charts for trends over time
- Pie charts almost never (use bar charts instead)
- Big numbers for single key metrics ("3x growth" large and centered)
- Tables only when comparing 3+ items across 3+ attributes

### Step 5: Produce a file when asked

Deliver the outline as Markdown first. If the user wants a file, pick one route:

```bash
# Marp: Markdown with "---" between slides -> PowerPoint, PDF or HTML (needs Node.js; PDF/PPTX export uses a local Chrome/Edge/Firefox)
npx @marp-team/marp-cli@latest slides.md --pptx
npx @marp-team/marp-cli@latest slides.md --pdf

# python-pptx: build .pptx programmatically (pip install python-pptx)
```

Put speaker notes in Marp as HTML comments (`<!-- note text -->`) under each slide; python-pptx exposes them as `slide.notes_slide.notes_text_frame.text`. Reveal.js (`npm install reveal.js`) suits browser talks. Open the result and check overflow before delivering.

### Step 6: Add transitions and flow

- Each slide should lead naturally to the next
- Use transition phrases in speaker notes ("Building on that...", "So what does this mean?")
- Group related slides into sections with a section divider slide
- End strong — the last slide should be memorable, not "Thank you" with an email address

## Examples

### Example 1: Startup pitch deck

**User request:** "Create a pitch deck for a developer productivity tool"

**Output (abbreviated):**
```markdown
## Slide 1: Title
**Layout:** Centered, minimal
**Content:**
# DevFlow
### Ship 2x faster with AI-powered workflows
**Visual:** Logo + subtle gradient background

---

## Slide 2: The Problem
**Layout:** Title + 3 pain points
**Content:**
# Developers lose 15 hours/week to tooling friction
- Context switching between 8+ tools per task
- Manual setup for every new project
- Tribal knowledge trapped in wikis nobody reads

**Speaker Notes:**
We surveyed 500 developers. The number one complaint was not the code
itself — it was everything around the code. Setup, config, searching
for how to do things.

---

## Slide 3: The Solution
**Layout:** Title + product screenshot
**Content:**
# One command. Zero friction.
DevFlow connects your tools into automated workflows that handle
the boring stuff so you can focus on code.

**Speaker Notes:**
Demo the 3-command setup flow. Show how a new developer goes from
clone to productive in under 5 minutes.

**Visual:** Product screenshot or short GIF of the CLI in action
```

### Example 2: Conference talk slides

**User request:** "Create slides for a 15-minute talk on API design best practices"

**Output structure:**
```markdown
## Slide 1: Title
# APIs Are User Interfaces Too
Dana Whitfield — DevWorld 2026

## Slide 2: Hook
# Your API has more users than your website
"For most developer tools, the API is the first thing a new user touches"

## Slide 3-5: Problem slides
[Common API design mistakes with code examples]

## Slide 6-10: Principles
[One principle per slide with before/after code]

## Slide 11-13: Real examples
[Case studies from well-known APIs]

## Slide 14: Summary
[The 5 rules on one slide as a reference]

## Slide 15: Close
[Memorable closing statement + where to learn more]
```

### Example 3: Team quarterly review

**User request:** "Build slides for our Q4 engineering review"

**Output structure:**
```markdown
## Slide 1: Title
# Q4 Engineering Review
Platform Team — January 2026

## Slide 2: Quarter at a Glance
[4 big metrics: shipped features, uptime, velocity, team size]

## Slide 3: Key Wins
[3 major accomplishments with impact numbers]

## Slide 4-6: Project Deep Dives
[One slide per major project: what, why, result]

## Slide 7: Metrics Dashboard
[Chart showing key trends across the quarter]

## Slide 8: Challenges
[Honest look at what did not go well and lessons learned]

## Slide 9: Q1 Roadmap
[Top 3-5 priorities for next quarter]

## Slide 10: Discussion
[Open questions and topics for group input]
```

## Guidelines

- Slides are a visual aid, not a document. If someone can read the slides and skip the talk, the slides have too much text.
- Design for the back row. Text should be readable from 20 feet away. Minimum 24pt for body text, 36pt for titles.
- The title of every slide should be the key takeaway, not a topic label. "We grew 3x this year" is a title. "Growth" is a label.
- Use progressive reveal when presenting complex ideas. Build up one point at a time rather than showing everything at once.
- Speaker notes are essential. Write them as natural speech, not bullet points.
- End with energy. The last thing the audience hears is what they remember. Make it count.
- Rehearse the timing. A common mistake is having too many slides for the time slot.
- Keep a consistent visual style. Same fonts, colors, and layouts throughout. Inconsistency looks unprofessional.
- When in doubt, cut a slide. Fewer, stronger slides always beat more, weaker ones.
