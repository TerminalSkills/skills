---
name: obra-superpowers
description: >-
  Adds a complete software development method to a coding agent as a plugin of composable skills: brainstorming, written plans, test-first implementation, subagent execution and code review. Use when a user asks to install Superpowers, make Claude Code plan before coding, enforce TDD and review gates, run work through subagents, or debug why a Superpowers skill did or did not trigger. Covers plugin install for Claude Code and other agents, the workflow stages and opt-outs.
license: Apache-2.0
compatibility: "Claude Code with plugin support (also Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode and others, each installed separately). Git is needed for the worktree skill."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "claude-code, agent-workflow, tdd, code-review, subagents"
  repository: https://github.com/obra/superpowers
---

# Superpowers — a development method that the agent follows by itself

## Overview

Superpowers is a plugin made by Jesse Vincent and Prime Radiant. It is a library of skills plus a bootstrap skill (`using-superpowers`) that makes the agent check for a relevant skill before it acts. The result is a fixed way of working: when you ask for a feature, the agent first asks what you really want, writes a design for approval, turns it into a plan of small tasks, executes the tasks test-first (often with a fresh subagent per task), reviews between tasks, and finishes by offering merge, pull request, keep or discard. You do not call the skills by hand; they trigger from context.

It changes how an agent behaves on every task, so it suits people who want a strict process. It is not a tool to install into a project's dependencies: it lives in the agent's plugin configuration.

## Instructions

### Install (Claude Code)

Installation differs per agent; if you use several, install into each. For Claude Code, from the official marketplace:

```text
/plugin install superpowers@claude-plugins-official
```

Or from the Superpowers marketplace, which also carries related plugins:

```text
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

These are slash commands typed inside Claude Code, not shell commands. Start a new session afterwards. To check the install, say "Let's make a react todo list": a working install starts the `brainstorming` skill and asks questions before writing any code.

### Install (other agents, as the README lists them)

```bash
gemini extensions install https://github.com/obra/superpowers   # Gemini CLI
gemini extensions update superpowers
qwen extensions install obra/superpowers                        # Qwen Code
devin plugins install obra/superpowers                          # Devin CLI
copilot plugin marketplace add obra/superpowers-marketplace     # GitHub Copilot CLI
copilot plugin install superpowers@superpowers-marketplace
pi install git:github.com/obra/superpowers                      # Pi
```

Codex (app and CLI), Cursor (`/add-plugin superpowers`), Kimi Code and Grok Build use their own plugin marketplaces; OpenCode has its own install instructions in the repository's `docs/README.opencode.md`. Updating depends on the agent and is often automatic.

### The workflow it enforces

1. `brainstorming`: questions first, then a design shown in short sections. Small changes are agreed in chat; larger ones become a written design document.
2. `using-git-worktrees`: after the design is approved, work moves to an isolated branch and worktree, project setup is run and a clean test baseline is checked.
3. `writing-plans`: tasks of two to five minutes each, with exact file paths, complete code and verification steps.
4. `subagent-driven-development` or `executing-plans`: either a fresh subagent per task with a review after each (most thorough), or inline execution with one review of the whole branch at the end (cheapest).
5. `test-driven-development`: red, green, refactor. A failing test is written and seen to fail before the code; code written before its test is removed.
6. `requesting-code-review` and `receiving-code-review`: review against the plan by severity; critical issues stop progress.
7. `finishing-a-development-branch`: tests are verified, then the choice is merge, pull request, keep or discard, and the worktree is cleaned up.

Supporting skills: `systematic-debugging` (four-phase root-cause process), `verification-before-completion` (evidence before claiming done), `dispatching-parallel-agents`, `writing-skills` (how to author and test a new skill) and `diagnosing-superpowers`.

### When a session misbehaves

Ask: "figure out what went wrong with superpowers in this session". The `diagnosing-superpowers` skill reads the session transcript, reports what happened with line-level evidence, and can package a scrubbed bundle for a bug report. Name an earlier session by its id to examine it.

### Telemetry

By default the brainstorming skill's optional visual companion loads a logo from the vendor's website, which reveals the Superpowers version (no project, prompt or agent details). Opt out by setting `SUPERPOWERS_DISABLE_TELEMETRY` to any true value; Claude Code's `DISABLE_TELEMETRY` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` are honored too.

```bash
export SUPERPOWERS_DISABLE_TELEMETRY=1
```

## Examples

### Example 1: install and verify in Claude Code

Request: "Set up Superpowers so Claude Code plans before it codes."

Inside Claude Code the user types:

```text
/plugin install superpowers@claude-plugins-official
```

then opens a fresh session and says "Add a CSV export button to the invoices page". Expected: no code yet. The agent asks what the export should contain and who uses it, offers the design in short sections, and waits for approval. If it starts coding immediately, the plugin did not load: check the plugin list and restart the session.

### Example 2: a feature through the whole pipeline

Request: "Add rate limiting to the login endpoint of our Express API."

What the agent does, stage by stage: asks which limit (for example 5 attempts per minute per IP) and where state lives; writes the agreed design to the repository; creates a branch in a new worktree and runs `npm test` for a green baseline; writes a plan with tasks like "failing test for the sixth attempt returns 429" and "middleware in `src/middleware/rateLimit.js`"; for each task writes the test, shows it failing, writes the minimum code, shows it passing and commits; a reviewer subagent checks each task against the plan; finally it reports the test results and asks whether to merge, open a pull request, keep the branch or discard it.

## Guidelines

- The method is mandatory by design: skills fire before the agent answers. For a one-line fix this can feel heavy; tell the agent plainly to skip brainstorming for a trivial change, or do not install the plugin for that project.
- Subagent-driven development spends more tokens than inline execution. Choose `executing-plans` when cost matters.
- Install is per agent. A plugin added to Claude Code does nothing in Codex or Gemini CLI.
- Plugins run with the agent's permissions and add instructions to every session. Install only from the marketplaces and repository listed above, and review `hooks/` and `skills/` before trusting a fork.
- Contributions of new skills are generally not accepted upstream, and agent-written pull requests for issues filed by someone else are refused; report problems in the existing issue.
- It does not replace project-specific conventions: keep those in the repository's `CLAUDE.md` or `AGENTS.md`.
