---
name: squad-agents
description: >-
  Build AI agent teams that collaborate on projects using Squad framework. Use when:
  orchestrating multiple specialized agents, building collaborative AI workflows,
  delegating complex tasks across agent teams.
license: MIT
compatibility: "Node.js 18+, GitHub Copilot"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [agents, multi-agent, orchestration, collaboration, squad]
---

# Squad Agents

## Overview

Squad gives you an AI development team through GitHub Copilot. Describe what you're building and get a team of specialists — frontend, backend, tester, lead — that live in your repo as files. Each team member runs in its own context, reads only its own knowledge, writes back what it learned, and persists across sessions.

## Instructions

### Installation

```bash
npm install -g @bradygaster/squad-cli
```

### Initialize in Your Project

```bash
cd your-project
git init  # if not already a repo
squad init
```

This creates `.squad/team.md` in your project root.

### Authenticate GitHub

```bash
gh auth login
gh auth status  # verify: "Logged in to github.com"
```

### Launch with Copilot

```bash
copilot --agent squad --yolo
```

Then describe your project to generate the team:

```
I'm starting a new project. Set up the team.
Here's what I'm building: a recipe sharing app with React and Node.
```

### Core Commands

| Command | Description |
|---------|-------------|
| `squad init` | Scaffold Squad in the current directory |
| `squad upgrade` | Update Squad-owned files; never touches team state |
| `squad status` | Show active squad and status |
| `squad triage` | Watch issues and auto-triage to team members |
| `squad doctor` | Diagnose setup issues |
| `squad nap` | Compress, prune, archive context |
| `squad export` | Export squad to portable JSON snapshot |
| `squad import <file>` | Import squad from export file |

### Inter-Agent Communication

Agents communicate through shared files in `.squad/`:

```
.squad/
├── team.md           # Team composition and roles
├── decisions/        # Shared decision log (architecture records)
├── context/          # Per-member private context
└── handoffs/         # Task handoff documents
```

Decision records capture architectural choices. Handoffs pass work between agents with structured context (endpoints, schemas, notes).

### Context Hygiene

```bash
squad nap           # Standard compression
squad nap --deep    # Aggressive pruning
squad nap --dry-run # Preview what would change
```

## Examples

### Example 1: Full-Stack Web App Team

A developer initializes Squad for a recipe-sharing application:

```bash
cd ~/projects/recipe-app
npm init -y && git init
npm install -g @bradygaster/squad-cli
squad init
copilot --agent squad --yolo
```

Prompt: "Build a recipe sharing app with React frontend and Express API. I need auth, CRUD for recipes, and image uploads."

Squad creates 4 team members:
- **Chef** (Lead) — architecture decisions, task breakdown, coordinates others
- **Plater** (Frontend) — React components, routing, styling with Tailwind
- **Saucier** (Backend) — Express routes, PostgreSQL models, auth with JWT
- **Taster** (Tester) — Jest unit tests, Playwright E2E tests, edge cases

Chef breaks the project into GitHub issues and assigns them. Saucier builds the API endpoints and writes a handoff: `POST /api/recipes` accepts `{title, ingredients[], steps[], image}` with Bearer auth. Plater picks up the handoff and builds the recipe form. Taster writes tests against both.

### Example 2: Research and Documentation Team

A team lead uses Squad for a technical research project:

```bash
cd ~/projects/llm-benchmark-report
git init && squad init
copilot --agent squad --yolo
```

Prompt: "Research and write a comprehensive report on LLM inference optimization techniques. Cover quantization, KV-cache, speculative decoding, and batching strategies."

Squad creates:
- **Scout** (Researcher) — gathers papers, benchmarks, and implementations
- **Analyst** — processes benchmark data, creates comparison tables
- **Scribe** (Writer) — produces the report with proper citations
- **Editor** (Reviewer) — fact-checks claims, ensures consistency

Scout logs a decision record: "Focus on open-weight models (Llama 3, Mistral) for reproducible benchmarks." Analyst creates comparison tables showing throughput vs. latency tradeoffs. Scribe drafts each section. Editor reviews for accuracy and flags unsupported claims. The final report lives in `docs/report.md` with all sources cited.

## Guidelines

- Start small with 2-3 team members and add specialists as the project grows
- Give each agent a well-defined scope to avoid overlapping work
- Use the `decisions/` directory for architectural choices to prevent conflicts
- Enable auto-triage with `squad triage --interval 5` to keep work flowing
- Run `squad export` regularly to create snapshots for backup and sharing
- Use `squad nap` periodically to keep context fresh and within limits
- Run `squad doctor` if GitHub integration or agent communication breaks
- See [GitHub Repository](https://github.com/bradygaster/squad) for full documentation
