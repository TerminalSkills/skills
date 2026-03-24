---
title: "Build a Design-to-Code Pipeline with AI"
description: "Build a full design→code pipeline where AI generates UI designs from descriptions, then converts them to production React components"
skills: [stitch-mcp, impeccable-design, image-compare]
difficulty: intermediate
time_estimate: "3 hours"
tags: [design, ui, react, figma, ai-design, components, frontend, pipeline]
---

# Build a Design-to-Code Pipeline with AI

## The Problem

You need 10 new pages this week. You have no designer. Hiring a freelancer takes time you don't have. You need a pipeline: describe what you want → get production code.

## The Solution

Use AI to generate UI designs from natural language descriptions, then convert those designs into clean React components. Validate visually, iterate, ship.

## Persona

**Anya, Startup Co-founder** — building a project management SaaS. Needs landing page, dashboard, settings, pricing, and 6 more pages. No designer on the team. Ships 10 pages/week using this pipeline.

## The Pipeline

```
Describe UI → AI generates design → Import to code agent → Generate components → Visual compare → Ship
```

## Step 1: Describe the UI in Natural Language

Write clear descriptions of what you need:

```markdown
<!-- designs/dashboard.md -->
# Dashboard Page

## Layout
- Top nav with logo (left), search bar (center), user avatar + dropdown (right)
- Left sidebar: navigation with icons — Dashboard, Projects, Team, Settings
- Main area: 4 stat cards in a row (Total Projects, Active Tasks, Team Members, Hours This Week)
- Below cards: two columns — Activity Feed (left, 60%) and Upcoming Deadlines (right, 40%)

## Style
- Clean, modern, lots of whitespace
- Primary color: indigo-600
- Cards with subtle shadow, rounded corners (8px)
- Inter font family
```

## Step 2: Generate Design with Google Stitch

Use stitch-mcp to generate a visual design:

```bash
# Generate design via Stitch MCP
claude-code --task "
Use stitch-mcp to generate a UI design for the dashboard described in designs/dashboard.md.
Generate a high-fidelity mockup. Export as PNG to designs/output/dashboard.png.
Also generate designs for:
- designs/landing.md → designs/output/landing.png
- designs/pricing.md → designs/output/pricing.png
"
```

Or use screenshot-based approach with an existing reference:

```bash
# If you have a reference site, screenshot it
screenshot-tool https://reference-app.com/dashboard \
  --output designs/reference/dashboard.png

# Use as input for code generation
```

## Step 3: AI Generates React Components

Feed the design to your coding agent:

```bash
claude-code --task "
Look at the design in designs/output/dashboard.png.
Generate a React component with Tailwind CSS that matches this design exactly.

Requirements:
- Use TypeScript
- Use Tailwind CSS for styling
- Break into sub-components: StatCard, ActivityFeed, DeadlineList, Sidebar, TopNav
- Make it responsive (mobile-first)
- Use shadcn/ui for base components where applicable
- Put components in src/components/dashboard/

Generate these files:
- src/components/dashboard/DashboardPage.tsx
- src/components/dashboard/StatCard.tsx
- src/components/dashboard/ActivityFeed.tsx
- src/components/dashboard/DeadlineList.tsx
- src/components/dashboard/Sidebar.tsx
- src/components/dashboard/TopNav.tsx
"
```

## Step 4: Visual Comparison

Compare the generated UI against the design:

```bash
# Build and screenshot the generated component
npm run dev &
screenshot-tool http://localhost:3000/dashboard \
  --output designs/compare/dashboard-actual.png

# Compare with original design
claude-code --task "
Compare these two images:
1. designs/output/dashboard.png (the design)
2. designs/compare/dashboard-actual.png (the implementation)

List every visual difference:
- Layout mismatches
- Color differences
- Spacing issues
- Missing elements
- Typography differences

Rate the match: percentage score and list of fixes needed.
"
```

Example output:

```
Match score: 87%

Differences found:
1. Stat cards: shadow too heavy — use shadow-sm instead of shadow-md
2. Sidebar: icons are 20px, should be 18px
3. Activity feed: missing avatar thumbnails next to entries
4. Top nav: search bar should be 400px wide, currently 300px
5. Spacing: gap between stat cards should be 24px, currently 16px
```

## Step 5: Iterate Until Perfect

Feed the differences back to the agent:

```bash
claude-code --task "
Fix these visual differences in the dashboard components:
1. StatCard: change shadow-md to shadow-sm
2. Sidebar icons: change w-5 h-5 to w-[18px] h-[18px]
3. ActivityFeed: add 32px avatar thumbnails next to each entry
4. TopNav: set search bar width to w-[400px]
5. Dashboard grid: change gap-4 to gap-6
"
```

Re-compare. Repeat until match score > 95%.

## Batch Processing: 10 Pages in a Day

```bash
#!/bin/bash
# generate-all-pages.sh

PAGES=("landing" "dashboard" "pricing" "settings" "team" "projects" "billing" "profile" "onboarding" "help")

for page in "${PAGES[@]}"; do
  echo "🎨 Generating design for: $page"
  # Step 1: Generate design
  claude-code --task "Use stitch-mcp to generate UI for designs/${page}.md. Export to designs/output/${page}.png"

  echo "💻 Generating code for: $page"
  # Step 2: Generate code
  claude-code --task "Convert designs/output/${page}.png to React+Tailwind in src/pages/${page}/"

  echo "📸 Comparing: $page"
  # Step 3: Screenshot and compare
  screenshot-tool "http://localhost:3000/${page}" --output "designs/compare/${page}-actual.png"
done

echo "✅ All ${#PAGES[@]} pages generated"
```

## Project Structure

```
project/
├── designs/
│   ├── dashboard.md          # Natural language descriptions
│   ├── landing.md
│   ├── output/               # AI-generated design images
│   │   ├── dashboard.png
│   │   └── landing.png
│   └── compare/              # Implementation screenshots
│       ├── dashboard-actual.png
│       └── landing-actual.png
├── src/
│   ├── components/           # Shared components
│   │   └── ui/               # shadcn/ui base
│   └── pages/
│       ├── dashboard/
│       │   ├── DashboardPage.tsx
│       │   ├── StatCard.tsx
│       │   └── ActivityFeed.tsx
│       └── landing/
│           └── LandingPage.tsx
```

## Key Takeaways

- **Detailed descriptions = better output** — be specific about layout, colors, spacing
- **Visual comparison is the feedback loop** — don't just eyeball it, measure it
- **Iterate fast** — first pass gets 80%, two more rounds reach 95%+
- **Component decomposition matters** — smaller components = easier fixes
- **Batch process** — once the pipeline works, crank through pages
- **Keep designs as source of truth** — re-generate code if designs change
