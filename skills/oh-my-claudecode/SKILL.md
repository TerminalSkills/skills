---
name: oh-my-claudecode
description: >-
  Orchestrate multi-agent Claude Code teams — assign roles, coordinate parallel tasks,
  share context between agents, and manage team workflows. Use when: running multiple
  Claude Code agents simultaneously, building team-based AI development workflows,
  coordinating complex multi-agent coding projects.
license: MIT
compatibility: "Claude Code, Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - claude-code
    - multi-agent
    - orchestration
    - parallel
    - collaboration
---

# oh-my-claudecode

Multi-agent orchestration for Claude Code. Run teams of AI agents in parallel — each with a role, shared context, and coordinated workflows. Zero learning curve.

GitHub: [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)

## Overview

oh-my-claudecode (OMC) lets you run teams of Claude Code agents in parallel, each with assigned roles. It manages a staged pipeline (plan → PRD → execute → verify → fix) and supports mixing providers (Claude, Codex, Gemini). Agents share context through the filesystem and git branches, with automatic conflict resolution.

## Instructions

### Installation

Via Claude Code Plugin Marketplace (recommended):

```bash
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode
```

Via npm:

```bash
npm i -g oh-my-claude-sisyphus@latest
```

### Initial Setup

Run inside Claude Code:

```bash
/setup
/omc-setup
```

Enable experimental teams in `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Team Pipeline

Team mode runs a staged pipeline for every task:

```
team-plan → team-prd → team-exec → team-verify → team-fix (loop)
```

1. **Plan** — break down the task into sub-tasks and dependencies
2. **PRD** — generate a product requirements document
3. **Execute** — spawn N agents working in parallel
4. **Verify** — validate output against requirements
5. **Fix** — loop back to fix issues until tests pass

### Agent Roles

| Role | Focus | Example Tasks |
|------|-------|---------------|
| `executor` | General coding | Feature implementation, refactoring |
| `reviewer` | Code review | PR reviews, architecture feedback |
| `tester` | Quality assurance | Test writing, coverage analysis |
| `architect` | System design | API design, database schema |

### Context Sharing

Agents in a team share context through:

- **Shared filesystem** — all agents see the same project files
- **Team state file** — `.omc/team-state.json` tracks progress
- **Git branches** — each agent works on a feature branch, merged at verify stage

### Configuration

`~/.omc/config.json`:

```json
{
  "defaultTeamSize": 3,
  "defaultRole": "executor",
  "providers": {
    "claude": { "enabled": true },
    "codex": { "enabled": true, "model": "codex-latest" },
    "gemini": { "enabled": true, "model": "gemini-2.5-pro" }
  },
  "pipeline": {
    "skipPRD": false,
    "autoFix": true,
    "maxFixLoops": 3
  }
}
```

Requires `codex` / `gemini` CLIs installed and an active tmux session for multi-provider workers (v4.4.0+).

## Examples

### Example 1: Team Execution with Mixed Roles

```bash
# Spawn 3 executor agents to fix all TypeScript errors
/team 3:executor "fix all TypeScript errors"

# Use Codex agents for code review
omc team 2:codex "review auth module for security issues"

# Gemini agents for UI work
omc team 2:gemini "redesign UI components for accessibility"
```

### Example 2: Autopilot and Deep Interview

```bash
# Let OMC handle everything — from planning to execution
autopilot: build a REST API for managing tasks

# When requirements are vague, use Socratic questioning first
/deep-interview "I want to build a task management app"
# The interview clarifies requirements before any code is written
```

### Example 3: Tri-Model Advisor

Route work to Codex + Gemini, then Claude synthesizes the results:

```bash
/ccg Review this PR — architecture (Codex) and UI components (Gemini)
```

## Guidelines

- Start with `autopilot:` for well-defined tasks
- Use `/deep-interview` when requirements are fuzzy
- Mix providers: Codex for review, Gemini for UI, Claude for logic
- Keep team size at 5 or fewer for most tasks — diminishing returns beyond that
- Use `omc team status <task-id>` to monitor long-running teams
- The verify-fix loop catches most issues automatically
- When multiple agents modify the same file, OMC detects conflicts at merge time and spawns a resolver agent

## Resources

- [Documentation](https://yeachan-heo.github.io/oh-my-claudecode-website)
- [CLI Reference](https://yeachan-heo.github.io/oh-my-claudecode-website/docs.html#cli-reference)
- [Workflows](https://yeachan-heo.github.io/oh-my-claudecode-website/docs.html#workflows)
- [Discord](https://discord.gg/qRJw62Gvh7)
- [Migration Guide](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/MIGRATION.md)
