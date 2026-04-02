---
name: oh-my-codex
description: >-
  Extend OpenAI Codex with hooks, agent teams, HUDs, and more using oh-my-codex (OmX).
  Use when: orchestrating multiple Codex agents, adding monitoring to Codex sessions,
  building team-based AI development with Codex.
license: MIT
compatibility: "OpenAI Codex, Node.js 20+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags:
    - codex
    - openai
    - multi-agent
    - hooks
    - hud
    - orchestration
    - teams
  use-cases:
    - "Run multiple Codex agents in parallel with team coordination"
    - "Add real-time monitoring HUD to Codex coding sessions"
    - "Set up hooks for pre/post processing of Codex commands"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# oh-my-codex (OmX)

A workflow layer for [OpenAI Codex CLI](https://github.com/openai/codex) that adds structured workflows, agent teams, skills, and runtime state management. OmX keeps Codex as the execution engine while making sessions stronger and more organized.

**Repository:** [Yeachan-Heo/oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex)
**Website:** [oh-my-codex](https://yeachan-heo.github.io/oh-my-codex-website/)

## What OmX Adds to Codex

OmX is **not** a Codex replacement — it's a workflow layer on top:

- **Canonical skills** — `$deep-interview`, `$ralplan`, `$team`, `$ralph` for structured workflows
- **Agent teams** — coordinated parallel execution via tmux/psmux sessions
- **Project state** — plans, logs, memory, and mode tracking in `.omx/`
- **Scoped guidance** — per-project `AGENTS.md` for consistent behavior
- **Stronger defaults** — better prompts and workflows out of the box

## Installation

### Prerequisites

- **Node.js 20+**
- **OpenAI Codex CLI**: `npm install -g @openai/codex`
- **Codex auth configured** (API key set)
- **tmux** (macOS/Linux) or **psmux** (Windows) — for team mode

### Setup

```bash
# Install globally
npm install -g oh-my-codex

# Initialize project
omx setup

# Launch with recommended settings
omx --madmax --high
```

The `--madmax` flag enables maximum capability mode. `--high` sets reasoning effort to high.

## Core Skills

OmX provides four canonical skills that form a structured workflow:

### $deep-interview — Clarify Intent

Use when the request or boundaries are still vague. Deep-interview asks clarifying questions to nail down scope, constraints, and non-goals before any code is written.

```text
$deep-interview "clarify the authentication change"
```

**When to use:**
- Ambiguous requirements
- Multiple possible implementations
- Need to understand constraints and edge cases
- Want to avoid rework from misunderstanding

### $ralplan — Plan and Approve

Turns clarified scope into an architecture and implementation plan. Reviews tradeoffs, identifies risks, and produces a concrete action plan.

```text
$ralplan "approve the auth plan and review tradeoffs"
```

**Output includes:**
- Implementation steps with dependencies
- Tradeoff analysis
- Risk assessment
- Estimated effort

### $ralph — Persistent Completion Loop

A single-owner completion loop that keeps pushing toward done. Ralph verifies each step, handles errors, and persists until the approved plan is fully implemented.

```text
$ralph "carry the approved plan to completion"
```

**Best for:**
- Sequential tasks with dependencies
- Tasks needing careful verification at each step
- When you want one agent to own the entire flow

### $team — Coordinated Parallel Execution

Spawns multiple Codex agents in parallel tmux/psmux sessions with role coordination. Each agent gets a specific role and portion of the work.

```text
$team 3:executor "execute the approved plan in parallel"
```

**Best for:**
- Large tasks that can be parallelized
- Independent modules or features
- When speed matters more than sequential verification

## Recommended Workflow

The canonical OmX flow follows four phases:

```
1. Clarify   →  $deep-interview "what exactly do we need?"
2. Plan      →  $ralplan "create and approve the implementation plan"
3. Execute   →  $team (parallel) or $ralph (sequential)
4. Verify    →  Built into $ralph loop / manual review
```

### Example: Adding Auth to a Web App

```text
# Phase 1: Understand the requirements
$deep-interview "we need user authentication — clarify what kind, OAuth vs email/password, session management approach"

# Phase 2: Create the plan
$ralplan "design auth system with JWT tokens, OAuth2 Google login, and email/password fallback"

# Phase 3a: Sequential execution (one agent)
$ralph "implement the approved auth plan"

# Phase 3b: OR parallel execution (multiple agents)
$team 3:executor "implement auth — agent 1: OAuth flow, agent 2: email/password, agent 3: session management"
```

## Project State (.omx/ Directory)

OmX maintains state in `.omx/` at your project root:

```
.omx/
├── plans/          # Approved implementation plans
├── logs/           # Session logs and execution history
├── memory/         # Persistent memory across sessions
└── mode.json       # Current mode and runtime state
```

This state persists across sessions, so you can:
- Resume interrupted work
- Review past decisions
- Track what was planned vs. what was executed

## Agent Teams Deep Dive

### How Teams Work

1. OmX splits the task into subtasks based on the approved plan
2. Each subtask is assigned to a Codex agent in its own tmux pane
3. Agents execute in parallel with shared project context
4. OmX coordinates handoffs when tasks have dependencies

### Team Roles

```text
# Default: executor role (does the work)
$team 3:executor "implement the API endpoints"

# Mixed roles
$team 2:executor,1:reviewer "implement and review the auth module"
```

### Requirements by Platform

| Platform | Team Runtime |
|----------|-------------|
| macOS | tmux (install via `brew install tmux`) |
| Linux | tmux (install via package manager) |
| Windows | psmux (PowerShell multiplexer) |

## Comparison with Similar Tools

| Feature | oh-my-codex | oh-my-claudecode | Aider | Raw Codex |
|---------|------------|------------------|-------|-----------|
| Agent teams | ✅ Parallel tmux | ❌ | ❌ | ❌ |
| Structured workflow | ✅ 4-phase | ✅ Hooks | ❌ | ❌ |
| Plan approval | ✅ $ralplan | ❌ | ❌ | ❌ |
| Persistent state | ✅ .omx/ | ❌ | ✅ .aider | ❌ |
| Deep clarification | ✅ $deep-interview | ❌ | ❌ | ❌ |
| Completion loops | ✅ $ralph | ❌ | ❌ | ❌ |
| Model support | OpenAI only | Claude only | Multi-model | OpenAI only |
| Skills system | ✅ Built-in | ❌ | ❌ | ❌ |

## Configuration

### AGENTS.md Integration

OmX reads project-level `AGENTS.md` for per-project guidance:

```markdown
# AGENTS.md
## Project: my-saas-app
- Use TypeScript strict mode
- All APIs need OpenAPI specs
- Tests required for business logic
- Deploy target: AWS Lambda
```

### Mode Flags

```bash
omx --madmax --high    # Maximum capability, high reasoning
omx --high             # High reasoning, standard capability
omx                    # Default settings
```

## Tips for Effective Use

1. **Always clarify first** — `$deep-interview` saves hours of rework
2. **Review plans before execution** — `$ralplan` output should be explicitly approved
3. **Use $team for independent work** — don't parallelize tightly coupled tasks
4. **Use $ralph for sequential flows** — database migrations, API changes with dependencies
5. **Check .omx/logs/** — review what happened if something goes wrong
6. **Keep AGENTS.md updated** — project conventions guide all agents consistently

## Resources

- [GitHub Repository](https://github.com/Yeachan-Heo/oh-my-codex)
- [Getting Started Guide](https://github.com/Yeachan-Heo/oh-my-codex/blob/main/docs/getting-started.html)
- [Agent Teams Docs](https://github.com/Yeachan-Heo/oh-my-codex/blob/main/docs/agents.html)
- [Skills Reference](https://github.com/Yeachan-Heo/oh-my-codex/blob/main/docs/skills.html)
- [Discord Community](https://discord.gg/PUwSMR9XNk)
- [npm Package](https://www.npmjs.com/package/oh-my-codex)
