# Onboard New Developers with AI

**Persona:** A team lead onboarding 3 new developers simultaneously onto a complex, fast-moving codebase.
You want to cut onboarding time from weeks to days, make every new hire self-sufficient faster, and
stop being the bottleneck who has to explain the same things over and over.

**Skills used:** `understand-onboard`, `understand-chat`, `understand-explain`

---

## The Problem

You're hiring fast. Three new developers start on Monday. Your codebase is 150k lines of TypeScript,
evolved over 4 years, with undocumented architectural decisions baked in everywhere. Your existing
`README.md` says "run `npm install` and `npm dev`" — and that's it.

Without a structured process, each new hire will spend 2-3 weeks just figuring out where things live
and how they connect. Multiply that by three and you've lost months of productivity, plus burned out
your senior devs.

AI-powered onboarding changes this completely.

---

## Step 1: Build the Knowledge Graph

Before your new hires arrive, generate the codebase knowledge graph:

```
/understand
```

This analyzes your entire project and produces `.understand-anything/knowledge-graph.json` — a
machine-readable map of every file, function, class, and their relationships.

Takes 2-10 minutes depending on codebase size. Do this once; update automatically via CI/CD.

---

## Step 2: Generate the Onboarding Guide

Run the onboarding skill to create a structured guide from the graph:

```
/understand-onboard
```

Claude will generate a comprehensive `docs/ONBOARDING.md` containing:

### What Gets Generated

**Project Overview**
- Tech stack and frameworks
- High-level architecture description
- Key design decisions and patterns

**Architecture Layers**
Each layer explained with purpose and key files:
```
Layer: API Gateway
  Description: HTTP request handling, validation, routing
  Key files:
    - src/api/router.ts — Main router, registers all endpoints
    - src/api/middleware.ts — Auth, rate limiting, logging
    - src/api/validators/ — Zod schemas for request validation
```

**Guided Tour**
Step-by-step walkthrough of the codebase:
```
Step 1: Entry Point — src/app/layout.tsx
  Start here to understand the app shell and global providers

Step 2: Authentication — src/auth/session.ts
  How users log in and sessions are managed

Step 3: Core Data Models — prisma/schema.prisma
  The database schema that everything builds on
...
```

**Complexity Hotspots**
Files new devs should approach carefully:
```
⚠️  HIGH COMPLEXITY
  src/billing/subscription.ts (complexity: 18)
  — Payment state machine with 12 possible transitions
  
⚠️  HIGH COMPLEXITY
  src/sync/conflict-resolver.ts (complexity: 15)
  — CRDT-based conflict resolution for real-time collaboration
```

---

## Step 3: Walk Through Architecture Visually

On day one, walk new hires through the codebase using the dashboard:

```
/understand-dashboard
```

Open `http://localhost:5173` together (screen share or in-person) and:

1. **Show the layer view** — "Here's our 5 architectural layers, each with a clear responsibility"
2. **Click into a feature** — "Let's follow how a user login request flows through the system"
3. **Show dependency clusters** — "These files form our auth module — notice how nothing outside depends on the internals"
4. **Highlight complexity hotspots** — "This orange node is complex — we'll revisit it in week 2"

Visual exploration sticks in memory far better than reading code alone. New hires leave with a
mental model of the whole system, not just the files they've edited.

---

## Step 4: Set Up Self-Service Q&A

Give every new hire a way to answer their own architecture questions:

```
/understand-chat how does the permission system work?
/understand-chat where is email sending handled?
/understand-chat what happens when a user's subscription expires?
/understand-chat which services does the API gateway depend on?
```

The chat skill searches the knowledge graph and answers with:
- Specific file paths and function names
- How components connect to each other
- Which architectural layer is responsible
- Related components they might also need to understand

This alone cuts "can I ask you a quick question?" interruptions by 50%.

---

## Step 5: Deep-Dive on Specific Components

When a new developer needs to work on a specific area, use `/understand-explain`:

```
/understand-explain src/billing/subscription.ts
/understand-explain src/auth/session.ts:createSession
/understand-explain src/api/middleware.ts
```

This gives them:
- **Role in architecture** — which layer, why it exists, what problem it solves
- **Internal structure** — all functions and classes with their summaries
- **External connections** — what it imports, what calls it, what it depends on
- **Data flow** — inputs → processing → outputs with actual code examples
- **Complexity notes** — patterns and idioms worth understanding

Perfect for "I've been assigned this ticket, where do I even start?" moments.

---

## Step 6: Create a Team Wiki from the Docs

Convert the generated onboarding guide into your team wiki:

### Notion / Confluence

```bash
# Export as markdown, import to Notion
cat docs/ONBOARDING.md | pbcopy
# Paste into Notion, format with /ai
```

### GitHub Wiki

```bash
# Copy to GitHub wiki
cp docs/ONBOARDING.md wiki/Home.md
cd wiki && git add . && git commit -m "Update onboarding guide" && git push
```

### Docusaurus / MkDocs

```bash
# Add to your docs site
cp docs/ONBOARDING.md website/docs/onboarding.md
# Add to sidebars.js or mkdocs.yml
```

---

## Step 7: Automate Guide Refresh

Keep the onboarding guide fresh as the codebase evolves:

```yaml
# .github/workflows/onboarding.yml
name: Refresh Onboarding Guide

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'packages/**'

jobs:
  refresh-onboarding:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Regenerate knowledge graph
        run: npx understand-anything analyze
      - name: Generate onboarding guide
        run: npx understand-anything onboard --output docs/ONBOARDING.md
      - name: Open PR with updated guide
        uses: peter-evans/create-pull-request@v6
        with:
          title: "docs: refresh onboarding guide"
          body: "Automatically regenerated from updated codebase"
          branch: "auto/refresh-onboarding"
```

---

## Onboarding Checklist for New Hires

Send this to every new developer on day one:

```markdown
## Your First Week

### Day 1: Get the Big Picture
- [ ] Read `docs/ONBOARDING.md` cover to cover
- [ ] Run `/understand-dashboard` and explore the visual graph for 30 min
- [ ] Ask 5 architecture questions with `/understand-chat`

### Day 2: Explore Your Area
- [ ] Identify the 3 files most relevant to your first ticket
- [ ] Run `/understand-explain <file>` on each
- [ ] Map how your area connects to the rest of the system

### Day 3-5: Write Your First Code
- [ ] Use `/understand-chat` to answer any questions before asking a human
- [ ] Run `/understand-diff` before submitting your first PR
- [ ] Add notes to `docs/ONBOARDING.md` for anything that surprised you
```

---

## Results

Teams using AI-assisted onboarding consistently report:
- **First commit in day 1** instead of day 5
- **Self-sufficient in 1 week** instead of 3-4 weeks
- **80% fewer "can I ask you something?" interruptions** from new hires
- **Higher confidence** — new devs feel prepared, not thrown in the deep end
- **Better retention** — good onboarding signals a mature, supportive engineering culture

---

## Related Skills

- [`understand-onboard`](../skills/understand-onboard/SKILL.md) — Generate the onboarding guide
- [`understand-chat`](../skills/understand-chat/SKILL.md) — Self-service architecture Q&A
- [`understand-explain`](../skills/understand-explain/SKILL.md) — Deep-dive on specific components
- [`understand-dashboard`](../skills/understand-dashboard/SKILL.md) — Visual architecture explorer
- [`understand-diff`](../skills/understand-diff/SKILL.md) — Understand impact of first PRs
