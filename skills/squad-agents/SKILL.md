---
name: squad-agents
description: >-
  Build AI agent teams that collaborate on projects using Squad framework. Use when:
  orchestrating multiple specialized agents, building collaborative AI workflows,
  delegating complex tasks across agent teams.
license: MIT
compatibility: "Node.js 18+ or Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: [agents, multi-agent, teams, orchestration, collaboration, squad]
  use-cases:
    - "Build a team of agents that research, code, and review together"
    - "Orchestrate specialized agents for complex project delivery"
    - "Create AI teams with different roles (researcher, developer, reviewer)"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Squad Agents

## Overview

Squad gives you an AI development team through GitHub Copilot. Describe what you're building and get a team of specialists — frontend, backend, tester, lead — that live in your repo as files. Each team member runs in its own context, reads only its own knowledge, writes back what it learned, and persists across sessions.

This skill helps you set up, configure, and orchestrate Squad agent teams for collaborative project delivery.

## Prerequisites

- Node.js 18+ installed
- Git repository initialized
- GitHub CLI (`gh`) authenticated for Issues/PRs integration
- GitHub Copilot access (VS Code or CLI)

## Quick Start

### 1. Install Squad CLI

```bash
npm install -g @bradygaster/squad-cli
```

### 2. Initialize in your project

```bash
cd your-project
git init  # if not already a repo
squad init
```

This creates `.squad/team.md` in your project root.

### 3. Authenticate GitHub (for Issues, PRs, and triage)

```bash
gh auth login
gh auth status  # verify: "Logged in to github.com"
```

### 4. Launch with Copilot

```bash
copilot --agent squad --yolo
```

> The `--yolo` flag auto-approves tool calls. Squad makes many calls per session.

Then describe your project:

```
I'm starting a new project. Set up the team.
Here's what I'm building: a recipe sharing app with React and Node.
```

Squad proposes team members with thematic names. Confirm with `yes` and they're ready.

## Team Composition Patterns

### Standard Web App Team

A typical team for a full-stack web application:

| Role | Responsibility | Context |
|------|---------------|---------|
| **Lead** | Architecture decisions, task delegation | Full codebase overview |
| **Frontend** | UI components, styling, client logic | `src/components/`, `src/pages/` |
| **Backend** | API routes, database, auth | `src/api/`, `src/models/` |
| **Tester** | Test writing, QA, edge cases | `tests/`, `src/**/*.test.*` |
| **DevOps** | CI/CD, deployment, infrastructure | `.github/`, `Dockerfile`, configs |

### Specialized Research Team

For research-heavy projects:

- **Researcher** — gathers information, analyzes papers, summarizes findings
- **Analyst** — processes data, creates visualizations, validates hypotheses
- **Writer** — produces documentation, reports, presentations
- **Reviewer** — quality checks, fact-checking, consistency review

## Core Commands

| Command | Description |
|---------|-------------|
| `squad init` | Scaffold Squad in the current directory (idempotent) |
| `squad upgrade` | Update Squad-owned files; never touches team state |
| `squad status` | Show which squad is active and why |
| `squad triage` | Watch issues and auto-triage to team members |
| `squad copilot` | Add/remove Copilot coding agent |
| `squad doctor` | Diagnose setup issues |
| `squad shell` | Launch interactive shell |
| `squad export` | Export squad to portable JSON snapshot |
| `squad import <file>` | Import squad from export file |
| `squad nap` | Compress, prune, archive context |

## Inter-Agent Communication

Squad agents communicate through shared files in the `.squad/` directory:

```
.squad/
├── team.md           # Team composition and roles
├── decisions/        # Shared decision log
│   ├── 001-auth.md   # Architecture decision records
│   └── 002-db.md
├── context/          # Shared knowledge base
│   ├── lead/         # Lead's private context
│   ├── frontend/     # Frontend's private context
│   └── backend/      # Backend's private context
└── handoffs/         # Task handoff documents
```

### Decision Records

When a team member makes an architectural decision, it writes to `decisions/`:

```markdown
# Decision: Use PostgreSQL for primary database
- **Made by:** Backend
- **Date:** 2024-01-15
- **Context:** Need relational data with complex queries
- **Decision:** PostgreSQL over MongoDB
- **Consequences:** All team members use SQL migrations
```

### Task Handoffs

Agents hand off work through structured documents:

```markdown
# Handoff: API endpoints ready for frontend integration
- **From:** Backend → Frontend
- **Endpoints:** /api/users, /api/recipes, /api/auth
- **Schema:** See `docs/api-schema.json`
- **Notes:** Auth requires Bearer token in headers
```

## Workflow Patterns

### Pattern 1: Parallel Feature Development

```bash
# Lead breaks down the project into tasks
# Each specialist works on their domain simultaneously
squad triage --interval 5  # Auto-assign issues every 5 minutes
```

### Pattern 2: Sequential Review Pipeline

1. **Developer** writes code
2. **Tester** writes and runs tests
3. **Reviewer** checks code quality
4. **Lead** approves and merges

### Pattern 3: Research → Build → Ship

1. **Researcher** gathers requirements and prior art
2. **Developer** implements based on research
3. **DevOps** sets up deployment
4. **Tester** validates everything works

## Advanced: Context Hygiene

Long sessions accumulate context. Use `squad nap` to manage:

```bash
squad nap           # Standard compression
squad nap --deep    # Aggressive pruning
squad nap --dry-run # Preview what would change
```

## Tips

- **Start small**: Begin with 2-3 team members, add specialists as needed
- **Clear roles**: Each agent should have a well-defined scope to avoid overlap
- **Use decisions/**: Shared decision records prevent conflicting choices
- **Regular triage**: Enable auto-triage to keep work flowing
- **Export often**: `squad export` creates snapshots for backup/sharing
- **Context limits**: Use `squad nap` periodically to keep context fresh

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Agents overlap on tasks | Sharpen role definitions in `team.md` |
| Context gets stale | Run `squad nap --deep` |
| GitHub integration fails | Run `squad doctor` to diagnose |
| Team member not responding | Check `squad status` for active members |

## Resources

- [Squad GitHub Repository](https://github.com/bradygaster/squad)
- [CHANGELOG.md](https://github.com/bradygaster/squad/blob/main/CHANGELOG.md) for breaking changes
- Run `squad doctor` for self-diagnosis
