---
name: impeccable
description: >-
  Impeccable is a design skill pack for AI coding agents: one /impeccable skill with 24 commands
  (init, audit, critique, polish, typeset, layout and more) plus a CLI that scans HTML, CSS, JSX
  and live URLs for 61 deterministic anti-patterns of AI-generated UI. Use when a user says
  "my AI-generated UI looks generic", "install impeccable", "run /impeccable audit", "polish
  this page before launch", "stop the purple gradients and Inter everywhere", or wants a design
  lint for UI files in CI or as an agent hook in Claude Code, Cursor, Codex, GitHub Copilot or
  Grok Build.
license: Apache-2.0
compatibility: "Node.js 22.18+ for the npx CLI/installer (the engine is a self-contained binary); Claude Code, Cursor, Codex CLI, Gemini CLI, GitHub Copilot, OpenCode and other skill-aware agents"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["frontend-design", "ui-audit", "design-lint", "ai-agents", "accessibility"]
  repository: https://github.com/pbakaus/impeccable
---
# Impeccable — design vocabulary and anti-pattern detector for AI coding agents

## Overview

Impeccable, by Paul Bakaus, grew out of Anthropic's `frontend-design` skill. It installs a single
`impeccable` skill into your coding agent. You drive it with `/impeccable <command> <target>`,
using 24 commands such as `init`, `audit`, `critique`, `polish`, `typeset`, `layout`, `harden`
and `distill`. `init` records durable product facts (audience, purpose, constraints, voice) in
`PRODUCT.md`, and `document` captures an existing visual system in `DESIGN.md`, so later commands
work from the same context.

The pack also contains a standalone detector engine. It runs 61 deterministic rules with no LLM
and no API key: side-tab accent borders, purple/blue gradients, nested cards, gray text on colored
backgrounds, low contrast, flat type hierarchy, skipped headings, overused fonts and more. You can
run it three ways: from the terminal (`npx impeccable detect`), in CI, or as an agent hook that
checks each UI file edit.

## Instructions

### Install into the agent

Run the installer from the project root. It detects your agent folders, asks which providers to
install and whether to install per project or globally, and adds the provider's hook manifest:

```bash
npx impeccable install
```

For non-interactive setups, pass the choices as flags:

```bash
npx impeccable install --providers=claude,cursor,codex --scope=project -y
npx impeccable install --providers=claude --scope=project --no-hooks -y   # skill only, no edit hook
```

Reload the agent afterwards. For Claude Code, a project install writes
`.claude/skills/impeccable/`, four helper subagents in `.claude/agents/`, and a `PostToolUse` +
`Stop` hook in `.claude/settings.local.json`. Other install routes:

```bash
npx impeccable check     # are installed skills out of date?
npx impeccable update    # refresh skills and hook manifests
```

- Claude Code plugin: `/plugin marketplace add pbakaus/impeccable`, then install it from `/plugin`.
- VS Code + Copilot: `code --install-extension renaissance-geek.impeccable` (skill only, no hook).
- Codex: after install or update, open `/hooks` and approve the project hook. Codex runs the skill
  as `$impeccable` or through `/skills`, not as `/prompts:`.

### Set up design context once

Inside the agent chat (not the terminal):

```text
/impeccable init
```

`init` inspects the project, asks only about gaps, writes `PRODUCT.md`, configures live mode where
applicable, and may ask you to choose a build path: `comp` (generate a comp first, then build to
match it) or `code` (build straight in code). The answer is saved as `buildPath` in
`.impeccable/config.json`. For an existing codebase, also run:

```text
/impeccable document
```

This generates a root `DESIGN.md` from the tokens and components already in the code.

### Steer design work with commands

Every command runs through the one skill and takes an optional target in plain words:

```text
/impeccable shape onboarding checklist   # plan UX/UI before any code
/impeccable build the pricing page       # ordinary new work, no subcommand needed
/impeccable critique landing             # UX review: hierarchy, clarity, resonance
/impeccable audit the header             # a11y, performance, responsive checks
/impeccable typeset blog post template   # font choice, hierarchy, sizing
/impeccable layout settings              # spacing and visual rhythm
/impeccable harden checkout              # errors, i18n, text overflow, edge cases
/impeccable polish settings              # final pass before shipping
```

Tone commands adjust intensity: `bolder`, `quieter`, `distill`, `colorize`, `animate`, `delight`,
`overdrive`. `adapt` handles other devices, `optimize` performance, `clarify` UX copy, `onboard`
empty states and first-run flows, and `extract` moves reusable components and tokens into the
design system. `/impeccable live` and `/impeccable generate` iterate on element variants in a
local browser session. Type `/impeccable` alone for the full list, or free-form:
`/impeccable redo this hero section`. Older docs mention `craft`; in current skill versions it
is a deprecated alias for a plain new-work request, so skip it.

Pin commands you use often:

```text
/impeccable pin audit
```

This creates a standalone `/audit` shortcut.

### Run the detector from the terminal or CI

```bash
npx impeccable detect src/                       # directory: HTML statically, CSS/JSX/TSX by pattern
npx impeccable detect --json src/ > impeccable-report.json
npx impeccable detect --quiet src/               # print only the findings count
npx impeccable detect --scope type src/          # only typography rules (type, layout)
npx impeccable detect --viewport 390x844 http://localhost:3000/pricing
```

Human-readable findings go to **stderr**, so redirect with `2> findings.txt`. `--json` goes to
stdout. Exit codes: `0` means no primary findings, `2` means findings, and `1` means a target
could not be scanned. URL scans render the page in an installed Chrome, Chromium or Edge. A GitHub
Actions step:

```yaml
- name: Design lint
  run: npx impeccable detect --json src/ > impeccable-report.json
```

### Waive intentional choices

Ignores live under `detector` in `.impeccable/config.json` (shared). Use `--local` to write them
to the gitignored `.impeccable/config.local.json` instead:

```bash
npx impeccable ignores add-value overused-font Inter --reason "Licensed brand font"
npx impeccable ignores add-file "src/legacy/**"
npx impeccable ignores add-rule side-tab
npx impeccable ignores list
```

To waive a finding in one file only, add an inline comment:

```css
.brand-title { font-family: Inter; } /* impeccable-disable-line overused-font */
```

`--no-config` ignores all of this config and inline comments, which is useful for a raw baseline
scan.

## Examples

### Example 1: Lint a pricing page an agent just generated

**Request:** "Claude built our Northwind Freight pricing page and it looks like every other SaaS
template. Tell me exactly what's wrong before I ask for fixes."

```bash
npx impeccable detect src/pricing.html 2> pricing-findings.txt
echo $?          # 2 = findings present
```

**Result** (output from impeccable 4.1.0 on a page with a purple hero gradient, Inter, a 4px
left border on two rounded cards (one nested in the other), and an `h1` followed by an `h4`; the
file-path header and the `→` fix hint under each finding are left out here):

```text
  [side-tab] border-left: 4px + border-radius: 12px
  [side-tab] border-left: 4px + border-radius: 12px
  [low-contrast] 3.7:1 (need 4.5:1) — text #000000 on #7c3aed
  [gray-on-color] text #9ca3af on bg gradient(#7c3aed, #3b82f6)
  [low-contrast] 1.4:1 (need 4.5:1) — text #9ca3af on #3b82f6
  [overused-font] Primary font: inter
  [flat-type-hierarchy] Role sizes: body 16px, h1 16px, h4 16px (largest adjacent step 1.00:1; target 1.25:1)
  [nested-cards] Card inside card (div)
  [skipped-heading] <h1> "Plans for Northwind Freight" followed by <h4> "Starter" (missing h2)
  [ai-color-palette] Purple/violet accent colors detected

10 anti-patterns found.
```

Each finding is followed by a one-line fix hint. In the agent, `/impeccable typeset pricing page` and
`/impeccable polish pricing page` then fix these against `PRODUCT.md` and `DESIGN.md`.

### Example 2: Keep the brand font, gate the rest in CI

**Request:** "Inter is our licensed brand font, so stop flagging it. Fail the build on anything
else in the marketing site."

```bash
npx impeccable ignores add-value overused-font Inter --reason "Licensed brand font"
npx impeccable detect --quiet apps/marketing/src/
```

The ignore is stored in `.impeccable/config.json` (commit it, so teammates and CI share it):

```json
{
  "detector": {
    "ignoreRules": [],
    "ignoreFiles": [],
    "ignoreValues": [
      {
        "rule": "overused-font",
        "value": "inter",
        "createdAt": "2026-09-30T21:34:50.464Z",
        "reason": "Licensed brand font"
      }
    ]
  }
}
```

The same page now reports `9 anti-patterns found.`. The step still exits `2` and fails CI until the
remaining findings are fixed or waived.

### Example 3: Pre-launch review of a settings screen

**Request:** "Before Friday's release, review the account settings screen and tighten it up."

```text
/impeccable critique account settings
/impeccable harden account settings
/impeccable polish account settings
```

`critique` delivers its review in chat and saves it to `.impeccable/critique/`, where `polish`
picks up the priority issues. `harden` adds error states and
overflow handling. `polish` does the final alignment pass. With the Claude Code hook installed,
each edit is re-checked by the detector, and a deeper pass runs when the agent stops.

## Guidelines

- **Commands run in the agent, the CLI runs in the shell.** `/impeccable ...` typed into a
  terminal does nothing. The shell CLI has only `install`, `update`, `check`, `link`, `detect`
  and `ignores`.
- **A clean scan is evidence, not proof.** The detector does not replace looking at the rendered
  page at desktop and mobile widths. Rules run on static HTML/CSS or by pattern matching on
  CSS/JSX/TSX. URL scans cannot read cross-origin CSS without CORS.
- **The brief wins.** If a brand deliberately uses a flagged font or palette, record the
  exception with `ignores add-value` and a reason instead of letting the agent "fix" the brand.
- **Hooks run outside model approval.** In Claude Code, installed hooks fire on Edit/Write and
  Stop even if you deny the model's own commands, and the first run may download the engine into
  `~/.impeccable/bin/`. Review `.claude/settings.local.json` before unattended runs.
- **Live mode is for local checkouts only.** Do not inject it into a deployed site or weaken CSP
  for it. Applying copy edits runs `package.json`'s `impeccable:manual-edit-validate` script with
  your permissions, so read that script first in an unfamiliar repo. For production pages use
  `detect` on the URL instead.
- **Gitignore the working files.** `.impeccable/` collects screenshots, live-mode state and
  caches. Ignore those (the README has a ready-made block between `# impeccable-ignore-start` and
  `# impeccable-ignore-end`). Keep `config.json`, `design.json`, `live/config.json`,
  `surfaces/*.md` and `critique/*.md` tracked.
- **One copy per workspace.** Do not combine the VS Code extension, the Claude Code plugin and
  an `npx` install in the same project. Duplicate skills confuse the agent.
- **When not to use it:** backend-only or non-UI work, native apps without a web surface you can
  scan (the commands still help, but `detect` targets HTML/CSS/JSX), or when you only need a
  token file and no agent guidance. In that case a plain `DESIGN.md` is lighter.
