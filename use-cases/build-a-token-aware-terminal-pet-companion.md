---
title: "Build a Token-Aware Terminal Pet Companion"
slug: build-a-token-aware-terminal-pet-companion
description: "Design a subtle CLI pet that reacts to real token usage, stays quiet during low activity, and can optionally expand into a desktop companion."
skills: [cuddy-terminal-pet]
category: development
tags: [terminal, cli, ai-agents, token-tracking, productivity]
---

# Build a Token-Aware Terminal Pet Companion

## The Problem

Teams want a memorable `/PET` or mascot-style companion in their coding assistant, but most versions become noise fast. They animate all the time, cover prompts, or require platform-specific UI work before the core workflow is even useful. Without a plan for token sources, fallback behavior, hide states, and progression, the pet becomes a gimmick instead of a product.

## The Solution

Use the **cuddy-terminal-pet** skill to design the workflow in the right order: start with a static terminal card, define token-aware thresholds, add progression and rarity, and only then layer optional desktop behavior. The result is a companion that feels alive during real work without constantly interrupting the terminal.

```bash
curl -sL https://raw.githubusercontent.com/terminal-skills/skills/main/skills/cuddy-terminal-pet/SKILL.md -o .codex/skills/cuddy-terminal-pet.md
```

## Step-by-Step Walkthrough

### 1. Define the surfaces and guardrails

```text
Help me design a /PET companion for our terminal assistant. It should stay
calm during low activity, track token usage, and avoid covering important UI.
```

The first output should lock the product contract: supported shells, static CLI fallback, persistence path, token sources, hide or fold behavior, and what happens when logs are missing. This keeps the first version grounded in terminal usage instead of drifting into pure animation work.

### 2. Set motion thresholds based on real activity

```text
Define token thresholds so the pet stays idle most of the time and only reacts
when usage velocity is high enough to feel meaningful.
```

The skill should return a simple ruleset:

- idle by default
- only animate when recent token velocity crosses a rarity-tier threshold
- combine that velocity with pressure from hunger, energy, mood, or cleanliness
- fall back to static output if token logs are unavailable

That keeps the pet subtle for normal work and expressive only during active sessions.

### 3. Build the smallest working version

```text
Give me the smallest useful implementation plan for a token-aware terminal pet.
```

The plan should prioritize:

1. local JSON state
2. static CLI rendering
3. `feed`, `play`, `clean`, `info`, and `hide` commands
4. optional desktop companion only after the CLI path works

At this stage, the skill should also define how the pet recovers if the desktop surface fails to launch.

### 4. Prepare it for release

```text
Package this pet workflow for GitHub release and a public skill listing.
```

The output should include:

- one install command
- screenshots to capture
- release bundle contents
- the public-facing catalog copy

This turns a fun prototype into something another user can actually install and try.

## Real-World Example

Lin is building a Codex-based internal assistant for a six-person tools team. The team wants something playful to encourage adoption, but they do not want a noisy overlay that distracts from code reviews and shell work.

She uses **cuddy-terminal-pet** to design a `/PET` command around real token usage. The first version ships as a static CLI card with a local state file, a fold state, and a few care actions. One week later, after the team confirms that the thresholds feel calm, she adds an optional desktop companion for Windows users.

The result is a mascot the team actually keeps enabled: low activity stays quiet, high-activity sessions feel rewarded, and the workflow is packaged cleanly enough to share with other teams.

## Related Skills

- [cuddy-terminal-pet](../skills/cuddy-terminal-pet/) -- Design the pet contract, progression rules, install flow, and listing copy
