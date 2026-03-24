---
title: "Build an AI Agent Team for Project Delivery"
description: "Build a team of specialized AI agents — Architect, Developer, Reviewer, QA, PM — that deliver a full project together"
skills: [squad-agents, langchain, anthropic-sdk]
difficulty: advanced
time_estimate: "6 hours"
tags: [ai-agents, multi-agent, project-management, automation, software-delivery]
---

# Build an AI Agent Team for Project Delivery

## The Problem

You're a solo founder. You have ideas and requirements but no team. Hiring takes months. You need an Architect, Developer, Reviewer, QA engineer, and PM — today.

## The Solution

Build a team of specialized AI agents, each with a defined role and clear handoff protocol. They communicate through shared files and state, with human checkpoints at critical decisions.

## Persona

**Kai, Solo Founder** — building a B2B SaaS for invoice management. Has a 20-page requirements doc. Needs to ship an MVP in 2 weeks. Using an AI agent team to work at 10x speed while maintaining quality.

## The Agent Roles

```yaml
# agent-team.yaml
agents:
  pm:
    role: "Project Manager"
    responsibilities: "Break requirements into tickets, track progress, flag blockers"
    input: "requirements.md"
    output: "tickets/*.md, progress.md"

  architect:
    role: "Software Architect"
    responsibilities: "Design system architecture, define APIs, choose tech stack"
    input: "tickets/design-*.md"
    output: "docs/architecture.md, docs/api-spec.yaml"

  developer:
    role: "Developer"
    responsibilities: "Implement features based on architecture and tickets"
    input: "tickets/impl-*.md, docs/architecture.md"
    output: "src/**, tests/**"

  reviewer:
    role: "Code Reviewer"
    responsibilities: "Review PRs for quality, security, performance"
    input: "git diff on PR branches"
    output: "reviews/*.md"

  qa:
    role: "QA Engineer"
    responsibilities: "Write integration tests, run test suites, report bugs"
    input: "src/**, docs/api-spec.yaml"
    output: "tests/integration/**, bugs/*.md"
```

## Step 1: PM Creates the Backlog

Feed your requirements doc to the PM agent:

```bash
# PM agent breaks requirements into actionable tickets
claude-code --task "
You are a PM agent. Read requirements.md and create individual tickets in tickets/.
Each ticket should have: title, description, acceptance criteria, priority, dependencies.
Name them: tickets/001-setup-project.md, tickets/002-design-api.md, etc.
Create a progress.md tracking file.
" --auto-approve
```

Output: 12 tickets in `tickets/`, a `progress.md` board.

## Step 2: Architect Designs the System

```bash
# Architect agent reads high-priority design tickets
claude-code --task "
You are an Architect agent. Read tickets/002-design-api.md and tickets/003-design-database.md.
Produce:
1. docs/architecture.md — system overview, component diagram (mermaid), tech decisions
2. docs/api-spec.yaml — OpenAPI 3.0 spec for all endpoints
3. docs/database.md — schema with tables, relationships, indexes
Use: Node.js + Express, PostgreSQL, Redis for caching, JWT auth.
" --auto-approve
```

### 🛑 Human Checkpoint: Architecture Review

```bash
# YOU review before proceeding
cat docs/architecture.md
cat docs/api-spec.yaml

# Approve or request changes
echo "APPROVED" > docs/architecture-review.md
# or: echo "CHANGES NEEDED: use GraphQL instead of REST" > docs/architecture-review.md
```

## Step 3: Developer Implements Features

```bash
# Developer agent works through implementation tickets
for ticket in tickets/impl-*.md; do
  BRANCH="feature/$(basename $ticket .md)"
  git checkout -b "$BRANCH" main

  claude-code --task "
  You are a Developer agent. Read $ticket and docs/architecture.md.
  Implement the feature. Follow the API spec in docs/api-spec.yaml.
  Write unit tests for your code. Commit when done.
  " --auto-approve

  git push origin "$BRANCH"
done
```

## Step 4: Reviewer Reviews Each PR

```bash
# Reviewer agent checks each feature branch
for branch in $(git branch -r | grep feature/); do
  PR_DIFF=$(git diff main...$branch)

  claude-code --task "
  You are a Code Reviewer agent. Review this diff:
  $PR_DIFF

  Check for:
  - Security vulnerabilities (SQL injection, XSS, auth bypass)
  - Performance issues (N+1 queries, missing indexes)
  - Code quality (naming, structure, DRY)
  - Test coverage (are edge cases covered?)

  Write review to reviews/$(basename $branch).md with APPROVE or REQUEST_CHANGES.
  " --auto-approve
done
```

## Step 5: QA Writes Integration Tests

```bash
# QA agent writes end-to-end tests
claude-code --task "
You are a QA agent. Read docs/api-spec.yaml and the source code in src/.
Write integration tests in tests/integration/:
- Test every API endpoint with valid and invalid inputs
- Test authentication flows
- Test error handling and edge cases
- Test database constraints

Use Jest + Supertest. Ensure all tests pass before finishing.
" --auto-approve
```

## Inter-Agent Communication

Agents share state through files:

```
project/
├── requirements.md          # Input from human
├── progress.md              # PM updates after each phase
├── tickets/                 # PM → all agents
│   ├── 001-setup-project.md
│   ├── 002-design-api.md
│   └── impl-004-auth.md
├── docs/                    # Architect → Developer
│   ├── architecture.md
│   ├── api-spec.yaml
│   └── database.md
├── reviews/                 # Reviewer feedback
│   └── feature-auth.md
├── bugs/                    # QA → Developer
│   └── bug-001-pagination.md
└── src/                     # Developer output
```

## Step 6: Merge and Ship

### 🛑 Human Checkpoint: Final Review

```bash
# Review all PRs, tests, and reviews
cat progress.md              # PM's status
cat reviews/*.md             # All review outcomes
npm test                     # All tests green?

# Merge approved branches
for branch in $(git branch | grep feature/); do
  git checkout main
  git merge "$branch" --no-ff
done

# Deploy
npm run build && npm run deploy
```

## Example: Full Run Timeline

| Hour | Agent | Task | Output |
|------|-------|------|--------|
| 0-1 | PM | Break requirements into 12 tickets | `tickets/*.md` |
| 1-2 | Architect | Design system + API spec | `docs/` |
| 2 | **Human** | **Review architecture** | Approval |
| 2-5 | Developer | Implement 8 features (parallel worktrees) | `src/` |
| 5-6 | Reviewer | Review all 8 PRs | `reviews/` |
| 6-8 | QA | Integration tests + bug reports | `tests/` |
| 8-9 | Developer | Fix bugs from QA | `src/` |
| 9 | **Human** | **Final review + deploy** | 🚀 Ship |

**Total: 9 hours** vs 2-3 weeks with a human team.

## Key Takeaways

- **Specialize agents** — a focused agent outperforms a generalist
- **File-based communication** is simple and debuggable
- **Human checkpoints** at architecture and pre-deploy prevent costly mistakes
- **PM agent** keeps everything organized — don't skip this role
- **Iterate** — bugs found by QA go back to Developer, just like a real team
