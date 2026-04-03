---
name: cuddy-terminal-pet
description: >-
  Helps an AI agent design, scaffold, package, and launch a token-aware terminal
  pet companion with optional desktop behavior, rarity rules, progression, and
  install flows. Use when users ask for a slash-command mascot, CLI buddy,
  hidden pet easter egg, token tracking reactions, GitHub release packaging, or
  skill catalog listing copy for a terminal assistant.
license: MIT
compatibility: "Core workflow is cross-platform. Optional floating desktop companion is best on Windows with Python 3.10+ and Node.js 20+."
metadata:
  author: i798454439
  version: "0.1.0"
  category: development
  tags: ["terminal", "cli", "pet", "packaging", "distribution"]
---

# Cuddy Terminal Pet

## Overview

Create a non-blocking terminal companion that reacts to real usage instead of becoming constant noise. Keep the core behavior cross-platform first, then layer optional desktop visuals, rarity, progression, and distribution assets when the environment supports them.

## Instructions

1. Define the target surfaces before implementation: static CLI card, optional floating desktop companion, supported shells, persistence path, token sources, and fallback behavior when local usage logs are missing.
2. Freeze the pet contract: species or atlas, rarity tiers, limited-supply rules, progression model, action set, hide or fold behavior, and how token velocity changes motion, mood, or color.
3. Implement the smallest working path first: local state storage, static terminal render, basic commands such as `feed`, `play`, `clean`, `info`, and a recovery path if the desktop surface cannot launch.
4. Package for GitHub release with a portable installer, plugin or command entrypoint, runtime assets, smoke-test scripts, screenshots, and one short install command that a user can copy without editing paths.
5. Rewrite the listing copy for public catalogs in third-person language, lead with the user outcome, remove vendor-locked assumptions, and mention optional platform-specific enhancements only after the core value is clear.
6. Validate with concrete artifacts: run smoke tests, preview the static CLI view, verify the install steps on a clean path, and confirm that unsupported environments fall back to the text-only pet instead of failing hard.

## Examples

### Example 1: Plan a token-aware CLI pet

**User request:** "Add a /PET-style companion to our terminal assistant that reacts to token use but stays subtle."

**Actions taken:**
- Split the design into a cross-platform static CLI card and an optional desktop companion.
- Define thresholds based on token velocity, not only daily totals, so the pet stays idle during low activity.
- Propose persistence, rarity, progression, and hide or fold behavior that do not interrupt core CLI work.

**Output:**
```text
Core pet contract
- Surface: static terminal card first, optional desktop companion second
- Commands: /PET, /PET status, /PET feed, /PET play, /PET clean, /PET hide
- Trigger model: animate only after token velocity exceeds the rarity tier threshold
- Persistence: local JSON state with progression, wallet, title, and last active source
- Fallback: if usage logs are unavailable, keep the pet static and allow manual token input
```

### Example 2: Package Cuddy for release and listing

**User request:** "Prepare a GitHub release zip and a Terminal Skills submission for Cuddy."

**Actions taken:**
- Assemble the plugin, canonical skill, adapters, installer, and smoke scripts into one portable bundle.
- Generate a store-friendly `SKILL.md` with metadata, examples, and guidelines that match Terminal Skills requirements.
- Produce release notes that point users to the one-command install flow and the optional desktop companion.

**Output:**
```text
Artifacts
- dist/cuddy-pet-v0.1.0.zip
- dist/cuddy-pet-v0.1.0/README.md
- publish/terminal-skills/cuddy-pet/SKILL.md

Release steps
1. Upload the zip to GitHub Releases.
2. Post a short install snippet that ends with /PET.
3. Fork terminalskills/skills, add SKILL.md, and open a PR.
4. Attach one desktop screenshot and one folded-mode screenshot.
```

## Guidelines

- Keep the core pet useful even when animation, color, or floating windows are unavailable.
- Tie pet motion to token velocity and state pressure; low activity should stay calm.
- Treat rarity and limited supply as long-term retention hooks, not the first thing users see.
- If a platform lacks readable local usage logs, fall back to manual token input and explain the limitation clearly.
- If the pet risks covering prompts, logs, or editor content, prefer a folded or text-only view by default.
