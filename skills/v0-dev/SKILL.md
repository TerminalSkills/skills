---
name: v0-dev
description: >-
  Generate UI components with v0.dev, the AI-powered UI generator by Vercel. Use when a user asks to prototype React components, generate shadcn/ui layouts, create landing pages, or scaffold UI from natural language prompts.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["ai-ui", "code-generation", "react", "shadcn-ui", "prototyping"]
---
# v0 — AI-Powered UI Generation

## Overview

You are an expert in v0 by Vercel, the AI tool that generates React components and full-page UIs from natural language descriptions. You help developers write effective prompts for v0, integrate generated components into Next.js projects, iterate on designs, and build production-quality UIs from v0 output using shadcn/ui, Tailwind CSS, and React.

## Instructions

### Effective Prompts

```markdown
## What Makes a Good v0 Prompt

### ✅ Good: Specific, visual, with data examples
"A pricing page with 3 tiers: Starter ($9/mo — 5 projects, 1 user),
Pro ($29/mo — unlimited projects, 5 users, priority support, MOST POPULAR badge),
Enterprise (custom pricing — SSO, audit logs, dedicated support, 'Contact Sales' button).
Each tier is a card with a feature checklist. Use shadcn/ui, make the Pro tier
visually prominent with a border and badge."

### ❌ Bad: Vague, no visual details
"Make me a pricing page"

## Prompt Patterns That Work

### 1. Dashboard with real data
"An analytics dashboard showing: DAU chart (line, last 30 days, current 12.4K),
revenue chart (bar, monthly, $45K this month), conversion funnel (signup→trial→paid,
percentages), and a table of top 10 pages by traffic. Dark theme, minimal."

### 2. Form with validation states
"A multi-step checkout form: Step 1 — shipping address (name, address, city,
state, zip with autocomplete). Step 2 — payment (card number, expiry, CVV
with Stripe-style formatting). Step 3 — review order with item list and totals.
Show a progress bar at top. Include error states and loading states."

### 3. Data table with actions
"A user management table with columns: name (with avatar), email, role
(admin/member/viewer as colored badge), status (active/suspended), last login
(relative time). Include: search bar, role filter dropdown, bulk select checkboxes,
and a row action menu (edit/suspend/delete). Pagination at bottom."
```

### Integration Workflow

```bash
# v0 generates shadcn/ui components — they drop right into Next.js projects

# 1. Set up your project with shadcn
npx create-next-app@latest my-app --typescript --tailwind --app
cd my-app
npx shadcn@latest init

# 2. Install components v0 uses
npx shadcn@latest add card table badge button input select avatar
npx shadcn@latest add sheet dialog dropdown-menu tabs

# 3. Copy v0 output into your project
# v0 provides "Add to Codebase" button that generates npx command
# Or manually copy component code into src/components/

# 4. Customize the generated code
# v0 output is standard React + shadcn/ui + Tailwind
# No lock-in, no proprietary components, no runtime dependency
```

### Iteration

```markdown
## Iterating on v0 Output

v0 supports conversation-style iteration:

1. Generate initial component: "A user profile card with avatar, name, bio, stats"
2. Refine: "Make the avatar larger, add an edit button, and add social links"
3. Add variants: "Create a compact version of this card for use in a sidebar"
4. Add interactivity: "Make the bio editable inline with a pencil icon toggle"
5. Responsive: "Make it stack vertically on mobile with the avatar centered"

Each iteration builds on the previous — v0 remembers context within a conversation.
```

### What v0 Generates Well vs What It Doesn't

```markdown
## v0 Strengths
- Landing pages, marketing sites
- Dashboard layouts, admin panels
- Forms (multi-step, with validation UI)
- Data tables with filters and pagination
- Card layouts, grid systems
- Navigation (sidebar, header, breadcrumbs)
- Modal dialogs, slide-overs, popovers

## v0 Limitations (handle in your code)
- No real API calls (generates mock data)
- No authentication logic
- No database integration
- Complex state management (use React context or Zustand)
- Custom animations (add Framer Motion manually)
- Server Components vs Client Components (review "use client" placement)
```

## Examples

**Example 1: User asks to set up v0-dev**

User: "Help me set up v0-dev for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure v0-dev
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with v0-dev**

User: "Create a dashboard using v0-dev"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Be specific with data** — Include actual numbers, labels, and content in prompts; "12,450 users" generates better UI than "user count"
2. **Reference shadcn components** — Mention "shadcn/ui" in prompts; v0 generates cleaner code when explicitly targeting the component library
3. **One component at a time** — Generate individual components, then assemble in Cursor; complex full-page prompts produce worse results
4. **Iterate, don't start over** — Use the conversation to refine; v0 maintains context and each iteration improves on the previous
5. **Review "use client"** — v0 may add `"use client"` unnecessarily; remove it from components that don't use state or effects
6. **Add your design tokens** — After generating, update colors and spacing to match your brand; v0 uses shadcn defaults
7. **Mock data → real data** — v0 generates realistic mock data; replace with API calls once the UI is finalized
8. **No vendor lock-in** — v0 output is standard React code; you own it completely, no runtime dependency on v0
