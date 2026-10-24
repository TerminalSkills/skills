---
name: bolt
description: >-
  Bolt (bolt.new, by StackBlitz) is an AI app builder that turns a text prompt into a working
  web or mobile app, with built-in database, hosting and domains. Use when asked to prototype
  an app from a prompt in Bolt, write better Bolt prompts, plan with Plan Mode, spend fewer
  tokens, connect GitHub, Supabase, Stripe or Netlify, publish a Bolt project, or run the
  open-source bolt.diy instead.
license: Apache-2.0
compatibility: "Browser (Chromium-based recommended, Safari has limits); bolt.new account"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - ai-coding
    - full-stack
    - prototyping
    - web-app
    - vibe-coding
---

# Bolt — AI App Builder

## Overview

Bolt is a hosted AI builder: you describe an app in the chat, an agent writes the code, runs it in a live preview and can publish it. It builds JavaScript-based web apps (Node.js backends, any browser-side JS framework), and mobile apps through the Expo integration. Bolt Cloud supplies the built-in database, authentication, file storage, server functions, hosting and custom domains, so a first version needs no other accounts. There is no CLI or API to drive it; work happens in the browser at bolt.new. This skill is about how to use it well. Plans, token amounts and prices change, so read them in the Help Center (support.bolt.new) rather than from memory.

## Instructions

### 1. Plan, then build

- Start in **Plan Mode** (a chat mode that discusses and plans without changing code). It sees your project, can search the web for current docs, and ends with an "Implement this plan" button that switches to Build Mode. Planning costs fewer tokens than building.
- Use the **Enhance prompt** button before the first build: Bolt may ask clarifying questions.
- Name the stack and the data in the first prompt. Bolt only supports JavaScript backends, so a request for a PHP or Python server will not work. For a phone app, include the words `mobile app` so Bolt picks Expo.

### 2. Choose an agent

| Agent | Use for | Plans |
|-------|---------|-------|
| Standard | Small and medium apps, UI changes, clearly defined tasks | All plans, including Free |
| Max | Large codebases, interconnected features, refactoring, open-ended problems | Paid plans |

Bolt Forge (open-source models with extra usage) appears in the same picker when your plan includes it. Switch agents between prompts as the task changes.

### 3. Iterate in small steps

Add one feature per prompt, test it in the preview, and continue. Point to the exact place: use the **Select** tool to click an element in the preview, or tag files in the chat. Fix the base (pages, navigation, consistent design) before adding advanced features.

### 4. Keep tokens under control

Tokens are the unit Bolt bills for; most are spent on reading and syncing the project files, so large projects cost more per message.

- Use buttons rather than prompts where they exist: **Publish**, **Version History**, and direct edits in **Code view** use no tokens.
- Keep prompts specific ("in `Sidebar.tsx`, close the menu when a link is clicked").
- Clear or trim context when a chat gets long, and turn on connectors only while needed.
- Free plan: separate daily and monthly caps that do not roll over; a custom domain is not available.

### 5. Persist, store and publish

- **Database and auth**: ask for them in the prompt ("store tasks in the Bolt database, email sign-in"). Bolt Cloud creates tables, row-level security and server functions, and scans for open permissions. You can connect your own Supabase instead on Pro and Teams plans.
- **Secrets**: keep API keys in the database secrets settings; never paste them in a prompt or commit them into the project.
- **Publish**: Publish menu, then Publish. Free sites go to a `bolt.host` address and show a "Made in Bolt" badge; a free site that exceeds its monthly bandwidth or request limit goes offline until the next month. Custom domains need a paid plan.
- **GitHub**: connect a repository (an individual GitHub account is required) to back up commits and work in branches; edit elsewhere and return to Bolt. Netlify and Stripe have their own integrations.
- **Skills and Knowledge**: *Knowledge* holds project facts sent with every prompt; *Skills* are reusable instructions applied when the prompt matches, or by typing `/$skill-name`. Both reduce repeated explanation. An MCP connector gives the agent live access to external tools.

### 6. Safety check before launch

Click **Publish**, then **Run security audit**: it reviews code and database, fixes what it can and lists the rest as action items (it uses no tokens and is available on paid plans; the database security check is on all plans). Prompting Bolt to audit instead costs tokens. Review the database security settings, test auth with two different accounts, and test payments in Stripe test mode before going live.

### 7. When you want it local: bolt.diy

`bolt.diy` is the community-maintained open-source version (github.com/stackblitz-labs/bolt.diy) where you bring your own model provider keys (OpenAI, Anthropic, Gemini, Ollama and others). It needs Node.js 22.12+ and pnpm:

```console
$ git clone https://github.com/stackblitz-labs/bolt.diy.git
$ cd bolt.diy && pnpm install && pnpm run dev
```

It then serves on http://localhost:5173. It is a separate product from hosted Bolt: no Bolt Cloud, tokens or hosting.

## Examples

### Example 1: "Build me an internal tool to track equipment loans"

Plan Mode first:

```text
Plan an internal web app for tracking equipment loans for a 40-person design studio.
Items, borrowers, due dates, overdue list, admin and staff roles.
Use React, Tailwind and the Bolt database with email sign-in.
```

Review the plan, click Implement, then iterate with one change per prompt:

```text
1. Add a check-out form with item, borrower and due date.
2. Show an overdue list sorted by days late.
3. Only admins can delete items.
```

Result: a running preview with tables for items and loans, sign-in, and role checks that you verify with two test users before publishing.

### Example 2: "My landing page took 40% of my monthly tokens, how do I avoid that?"

Switch to the Standard agent for copy and layout tweaks, batch related small edits into one message, edit text yourself in Code view (free), and restore a bad change with Version History instead of asking Bolt to revert it. Keep the Max agent for the one refactor that needs it.

## Guidelines

- Treat the first output as a prototype: review the code, export it to GitHub and harden it in your own IDE before production.
- Do not put secrets, customer data or private keys into prompts or project files.
- Safari: Code view is read-only and the terminal is missing; use a Chromium browser for development work.
- Code view, visual edits and the database panel are desktop-only.
- Backends in PHP, Python or other languages are not supported.
- Free hosting has hard limits; moving a busy site to a paid plan or another host is a deliberate step.
- Output varies from run to run. Restore a known-good version rather than stacking fixes on a broken state.
