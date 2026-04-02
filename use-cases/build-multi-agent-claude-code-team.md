---
title: "Build a Multi-Agent Claude Code Team"
slug: build-multi-agent-claude-code-team
description: "Run 5 Claude Code agents in parallel — each owning a different part of the codebase — to ship a full-stack SaaS MVP in 2 days instead of 2 weeks."
skills:
  - oh-my-claudecode
  - worktrunk
category: development
tags:
  - multi-agent
  - claude-code
  - orchestration
  - parallel
  - productivity
---

# Build a Multi-Agent Claude Code Team

## The Situation

Raj is a solo founder building a full-stack SaaS — a project management tool with React frontend, Node.js API, PostgreSQL database, and Kubernetes deployment. He's got a 2-week sprint backlog but needs to ship in 2 days for a demo with investors.

Instead of coding everything sequentially, Raj uses **oh-my-claudecode** to run 5 Claude Code agents in parallel — each owning a different part of the codebase — coordinating like a real dev team.

## Skills Used

- [oh-my-claudecode](/skills/oh-my-claudecode) — Multi-agent orchestration
- [worktrunk](/skills/worktrunk) — Git workflow management

## The Team

| Agent | Role | Owns | Branch |
|-------|------|------|--------|
| Architect | System design, API contracts | `docs/`, `openapi/` | `feat/architecture` |
| Frontend | React UI, components | `src/client/` | `feat/frontend` |
| Backend | API, business logic | `src/server/` | `feat/backend` |
| QA | Tests, coverage | `tests/` | `feat/tests` |
| DevOps | Docker, CI/CD, deploy | `infra/`, `.github/` | `feat/devops` |

## Step 1: Define the Team and Plan

Raj starts with a deep interview to clarify requirements:

```bash
/deep-interview "Project management SaaS — boards, tasks, real-time updates, team collaboration. Ship MVP in 2 days."
```

The interview surfaces hidden assumptions: auth strategy, real-time tech (WebSocket vs SSE), multi-tenancy model, deployment target.

Then he kicks off the Architect agent:

```bash
/team 1:executor "Create system architecture: API contracts (OpenAPI), database schema, component tree, deployment diagram. Output to docs/architecture/"
```

**Output:** The Architect generates:
- `docs/architecture/api-contracts.yaml` — full OpenAPI spec
- `docs/architecture/database-schema.sql` — PostgreSQL schema
- `docs/architecture/component-tree.md` — React component hierarchy
- `docs/architecture/deployment.md` — K8s deployment plan

## Step 2: Parallel Execution — Frontend + Backend + QA

With the architecture in place, Raj spawns 3 agents in parallel:

```bash
# Frontend agent builds React UI from component tree
omc team 1:claude "Implement React frontend from docs/architecture/component-tree.md. Use TypeScript, Tailwind CSS, React Query. Output to src/client/"

# Backend agent builds API from OpenAPI spec
omc team 1:claude "Implement Node.js API from docs/architecture/api-contracts.yaml. Use Express, Prisma ORM, PostgreSQL. Output to src/server/"

# QA agent writes tests against specs (before code is done)
omc team 1:claude "Write comprehensive tests from docs/architecture/. Unit tests for API endpoints, integration tests for auth flow, E2E tests for critical paths. Output to tests/"
```

All three agents work simultaneously. They share the architecture docs as their contract — Frontend builds to the API spec, Backend implements it, QA tests against it.

### Context Sharing

The agents don't need to talk to each other directly. They coordinate through:

1. **Shared specs** — the architecture docs are the contract
2. **Git branches** — each agent commits to its own branch
3. **Team state** — `.omc/team-state.json` tracks progress

```bash
# Monitor progress
omc team status
```

Output:

```
Agent     Status     Progress  Branch
─────────────────────────────────────
frontend  executing  67%       feat/frontend
backend   executing  54%       feat/backend
qa        executing  82%       feat/tests
```

## Step 3: QA Writes Tests While Code Is Being Written

This is the key insight: QA doesn't wait for code. It writes tests against the specs:

```python
# tests/api/test_tasks.py (written by QA agent from OpenAPI spec)
def test_create_task():
    response = client.post("/api/tasks", json={
        "title": "Ship MVP",
        "board_id": board.id,
        "assignee_id": user.id
    })
    assert response.status_code == 201
    assert response.json()["title"] == "Ship MVP"

def test_create_task_unauthorized():
    response = client.post("/api/tasks", json={"title": "Test"})
    assert response.status_code == 401
```

When Backend finishes, the tests are already waiting. Failures surface immediately.

## Step 4: Merge and Resolve Conflicts

Once all agents complete, merge branches:

```bash
# OMC handles merge automatically in team-verify stage
# If conflicts arise, a resolver agent analyzes both changes

git checkout main
git merge feat/frontend
git merge feat/backend  # Potential conflicts with shared types
git merge feat/tests
```

### Conflict Example

Both Frontend and Backend defined `Task` type differently:

```typescript
// Frontend's version (src/client/types.ts)
interface Task { id: string; title: string; status: 'todo' | 'doing' | 'done'; }

// Backend's version (src/server/types.ts)
interface Task { id: string; title: string; status: string; assignee_id: string; }
```

OMC's resolver agent merges them into a shared type:

```typescript
// src/shared/types.ts
interface Task {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  assignee_id: string;
}
```

## Step 5: DevOps — Deploy to Staging

With code merged, the DevOps agent handles infrastructure:

```bash
omc team 1:claude "Create Docker setup, GitHub Actions CI/CD, and Kubernetes manifests. Deploy to staging. Output to infra/ and .github/workflows/"
```

The DevOps agent generates:
- `Dockerfile` + `docker-compose.yml` for local dev
- `.github/workflows/ci.yml` — lint, test, build
- `.github/workflows/deploy.yml` — deploy to K8s on merge
- `infra/k8s/` — deployment, service, ingress manifests

## Step 6: Integration Tests and Fix Loop

The verify stage runs all tests against the merged codebase:

```bash
# OMC runs team-verify automatically
# If tests fail → team-fix loop kicks in

# Fix loop: identify failing tests → assign fix to appropriate agent → re-verify
# Max 3 fix loops before requesting human intervention
```

## Results

| Metric | Traditional | With OMC Team |
|--------|-------------|---------------|
| Time to MVP | 2 weeks | 1 day |
| Parallel agents | 1 (you) | 5 |
| Tests written | After code | During code |
| Merge conflicts | Manual | Auto-resolved |
| Deploy pipeline | Day 14 | Hour 3 |

### What Raj Shipped

- React frontend with 12 components, auth, real-time updates
- REST API with 24 endpoints, JWT auth, WebSocket notifications
- 87 tests (unit + integration + E2E) with 91% coverage
- Docker + K8s deployment with CI/CD pipeline
- Running on staging, ready for investor demo

### Key Takeaways

1. **Specs first** — the Architect creates contracts that other agents build against
2. **Parallel by default** — Frontend, Backend, and QA work simultaneously
3. **Tests during, not after** — QA writes tests from specs while code is being written
4. **Auto-merge** — OMC handles branch merging and conflict resolution
5. **Fix loop** — verify → fix → verify catches issues without human intervention
