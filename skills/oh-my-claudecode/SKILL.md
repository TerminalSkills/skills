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
  version: 1.0.0
  category: ai-tools
  tags:
    - claude-code
    - multi-agent
    - orchestration
    - teams
    - parallel
    - collaboration
  use-cases:
    - "Run a 5-agent Claude Code team: architect, frontend, backend, tester, reviewer"
    - "Coordinate parallel feature development across multiple Claude Code instances"
    - "Build a CI-like pipeline where agents hand off work to each other"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# oh-my-claudecode

Multi-agent orchestration for Claude Code. Run teams of AI agents in parallel — each with a role, shared context, and coordinated workflows. Zero learning curve.

GitHub: [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)

## Installation

### Via Claude Code Plugin Marketplace (recommended)

```bash
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode
```

### Via npm

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

## Core Concepts

### Team Mode — The Primary Orchestration Surface

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

Each agent in a team gets a role that constrains its focus:

| Role | Focus | Example Tasks |
|------|-------|---------------|
| `executor` | General coding | Feature implementation, refactoring |
| `reviewer` | Code review | PR reviews, architecture feedback |
| `tester` | Quality assurance | Test writing, coverage analysis |
| `architect` | System design | API design, database schema |

## Usage Patterns

### 1. Simple Team Execution

Spawn 3 executor agents for a task:

```bash
/team 3:executor "fix all TypeScript errors"
```

### 2. Mixed Team with Different Providers

Use Codex, Gemini, and Claude agents together:

```bash
# Codex agents for code review
omc team 2:codex "review auth module for security issues"

# Gemini agents for UI work
omc team 2:gemini "redesign UI components for accessibility"

# Claude agents for implementation
omc team 1:claude "implement the payment flow"
```

### 3. Tri-Model Advisor with /ccg

Route work to Codex + Gemini, then Claude synthesizes the results:

```bash
/ccg Review this PR — architecture (Codex) and UI components (Gemini)
```

### 4. Autopilot Mode

Let OMC handle everything — from planning to execution:

```bash
autopilot: build a REST API for managing tasks
```

### 5. Deep Interview for Vague Requirements

When you're not sure what to build, use Socratic questioning:

```bash
/deep-interview "I want to build a task management app"
```

The interview clarifies requirements before any code is written.

## Orchestration Patterns

### Parallel Execution

All agents work simultaneously on independent tasks:

```bash
# 5 agents, each fixing different modules
/team 5:executor "fix lint errors in src/"
```

OMC automatically partitions work across agents.

### Sequential Pipeline

Agents hand off work in stages:

```
Architect → Frontend + Backend (parallel) → QA → DevOps
```

The team pipeline handles this automatically — `team-plan` creates the dependency graph, `team-exec` respects ordering.

### Monitor and Control

```bash
# Check status of a running team
omc team status <task-id>

# Shut down a team
omc team shutdown <task-id>
```

## Context Sharing

Agents in a team share context through:

- **Shared filesystem** — all agents see the same project files
- **Team state file** — `.omc/team-state.json` tracks progress
- **Git branches** — each agent works on a feature branch, merged at verify stage

### Conflict Resolution

When multiple agents modify the same file:

1. OMC detects conflicts at merge time
2. A dedicated resolver agent analyzes both changes
3. The resolver picks the best merge or combines changes
4. Human review is requested for unresolvable conflicts

## Configuration

### `~/.omc/config.json`

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

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | Enable native teams | `0` |
| `OMC_MAX_AGENTS` | Max concurrent agents | `10` |
| `OMC_TIMEOUT` | Task timeout (seconds) | `3600` |

## tmux Workers

v4.4.0+ uses tmux panes for Codex and Gemini workers — real terminal sessions, not MCP servers:

```bash
# Workers spawn on-demand and die when task completes
omc team 2:codex "review auth module"
omc team 2:gemini "redesign UI components"
```

Requires `codex` / `gemini` CLIs installed and an active tmux session.

## Tips

- Start with `autopilot:` for well-defined tasks
- Use `/deep-interview` when requirements are fuzzy
- Mix providers: Codex for review, Gemini for UI, Claude for logic
- Keep team size ≤ 5 for most tasks — diminishing returns beyond that
- Use `omc team status` to monitor long-running teams
- The verify → fix loop catches most issues automatically

## Resources

- [Documentation](https://yeachan-heo.github.io/oh-my-claudecode-website)
- [CLI Reference](https://yeachan-heo.github.io/oh-my-claudecode-website/docs.html#cli-reference)
- [Workflows](https://yeachan-heo.github.io/oh-my-claudecode-website/docs.html#workflows)
- [Discord](https://discord.gg/qRJw62Gvh7)
- [Migration Guide](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/MIGRATION.md)
