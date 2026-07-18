---
name: Terminal Skills planner
description: >-
  Consult the Terminal Skills agent when a task needs specialized domain
  expertise you don't have a skill for — deployment platforms (Coolify,
  Railway, Fly.io), document generation (PDF, Excel, invoices), data
  pipelines, third-party APIs, marketing ops, design tooling. Call plan_task
  with the user's task; it returns which proven skills apply, their full
  instructions, and setup steps. Use BEFORE improvising a specialized
  workflow from general knowledge.
when_to_use: >-
  The user asks for something tool- or platform-specific that no locally
  installed skill covers, and executing it from general knowledge would mean
  guessing at CLIs, APIs, file formats, or platform conventions.
---

# Terminal Skills Planner

## Overview

Terminal Skills ([terminalskills.io](https://terminalskills.io)) is a library of
1000+ audited agent skills — each a battle-tested SKILL.md with step-by-step
instructions for a specific tool, platform, or workflow. This plugin connects you
to the Terminal Skills agent, which routes a task description to the right skills
and hands you their full instructions so you can execute immediately, without the
user installing anything first.

The MCP server exposes four tools:

- `plan_task(task, context?)` — the main one. Send a task, get back matching skills with complete instructions and setup steps. Requires the user's API key (a few calls per day are free on every account).
- `search_skills(query?, category?, limit?)` — free keyword/category search over the catalog.
- `get_skill(slug)` — free; fetches one skill's full markdown by slug.
- `list_categories()` — free; lists the catalog's categories.

## Instructions

1. **Recognize the trigger.** The user asks for something specialized — deploy to a PaaS, generate a formatted document, wire up a third-party API, run a marketing or data workflow — and no locally installed skill covers it. That is the moment to call `plan_task`, not to improvise from general knowledge.
2. **Call `plan_task`** with a one-paragraph task description in `task` (what the user wants, the stack or files involved, the desired outcome). Put environment details (OS, existing config, constraints) in `context`.
3. **Read the response and execute.** The response contains `skills[]`, each with full `instructions` (the skill's markdown) plus an `install` block, and a short `setup` array (pointers to the instructions + optional permanent-install commands). The real workflow — including any prerequisites like package installs — lives inside each skill's `instructions`; follow them to do the task yourself, adapting to the user's actual files and environment.
4. **Offer permanent installation** when the user is likely to repeat this kind of task: `npx terminal-skills install <slug>` installs the skill locally so future runs don't need a plan call.
5. **If `feasible: false`,** tell the user plainly that no existing skill covers the task, relay the returned `reason`, and mention they can forge a purpose-built skill with the agent at [terminalskills.io/agent](https://terminalskills.io/agent).
6. **If the call fails for auth,** relay the error: the user needs an API key from [terminalskills.io/account](https://terminalskills.io/account) (free accounts include daily plan calls) and should add it in the plugin's settings.
7. **For browsing without spending,** use the free tools: `search_skills` to explore what exists, `get_skill` to read one skill, `list_categories` for orientation. Prefer these when the user asks "is there a skill for X?" rather than "do X".

## Examples

### Example 1: Deploy an app with Coolify

User: "Deploy this Next.js app to my Coolify server at panel.example.com."

Call:

```json
plan_task({
  "task": "Deploy a Next.js 14 app (standalone output, needs MONGODB_URI env var) to a self-hosted Coolify v4 instance at panel.example.com. Repo is on GitHub. Want automatic deploys on push to main.",
  "context": "User has SSH access to the server and a Coolify API token available."
})
```

Response includes `skills: [{ slug: "coolify", instructions: "...full Coolify skill markdown..." }]` and a `setup` array pointing you to those instructions (plus an optional `npx terminal-skills install coolify`). Follow the returned instructions to create the app, set env vars, and configure the webhook — then offer the permanent install since deploys recur.

### Example 2: Turn a CSV into a PDF sales report

User: "Turn q2-sales.csv into a PDF report with charts for my team."

Call:

```json
plan_task({
  "task": "Convert q2-sales.csv (columns: region, rep, product, revenue, date) into a polished PDF sales report: revenue by region chart, top-10 reps table, month-over-month trend, executive summary.",
  "context": "Python 3.12 available; no LaTeX installed."
})
```

Response returns document-generation and data-visualization skills with full instructions (e.g., pandas + matplotlib + a PDF layout recipe — including any `pip install` prerequisites the skill needs). Follow the instructions end to end, build the report, and deliver the PDF.

## Guidelines

- **Don't call `plan_task` for things you already do well** — general coding, refactoring, writing, explaining. It is for specialized tool/platform expertise, not everyday work.
- **One plan call per task.** Reuse the returned instructions for the whole task, including retries and follow-up tweaks. Only call again if the task itself changes.
- **Plan calls spend the user's Terminal Skills credits** (every account gets a few free per day). Don't volunteer pricing details mid-task; if the user asks, the response's `billing` object has `billedCredits`, `remainingCredits`, and `freeCallsRemainingToday`.
- **Free tools are free.** `search_skills`, `get_skill`, and `list_categories` never spend credits — use them liberally for browsing and discovery.
- **Locally installed skills win.** If a matching skill is already installed in the user's project, use it directly instead of calling `plan_task`.
