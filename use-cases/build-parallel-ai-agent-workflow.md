---
title: "Build Parallel AI Agent Workflow with Git Worktrees"
description: "Run multiple AI coding agents in parallel using git worktrees to compress a 2-week sprint into 2 days"
skills: [worktrunk, github-actions]
difficulty: advanced
time_estimate: "4 hours"
tags: [ai-agents, git-worktrees, parallel-development, productivity, sprint, automation]
---

# Build Parallel AI Agent Workflow with Git Worktrees

## The Problem

Your team has a 2-week sprint backlog with 15 independent tasks. Sequential AI coding — one task at a time — still takes days. You need parallelism.

## The Solution

Use git worktrees to create isolated working directories, assign one AI agent per worktree, and run them all simultaneously. Each agent works on its own branch without conflicts.

## Persona

**Elena, Engineering Lead** — manages a team shipping a SaaS platform. She has a backlog of 15 features and bug fixes. Instead of waiting 2 weeks, she wants to parallelize across 5 AI agents and merge everything in 2 days.

## Step 1: Set Up Git Worktrees

Create 5 parallel worktrees from your main branch:

```bash
# From your main repo
cd ~/project

# Create worktrees for parallel branches
git worktree add ../project-wt1 -b agent/feature-auth
git worktree add ../project-wt2 -b agent/feature-dashboard
git worktree add ../project-wt3 -b agent/fix-api-pagination
git worktree add ../project-wt4 -b agent/feature-notifications
git worktree add ../project-wt5 -b agent/refactor-db-queries
```

Each worktree is a full working copy with its own branch — no stepping on each other.

## Step 2: Define the Shared Backlog

Create a `backlog.json` that agents consume:

```json
{
  "tasks": [
    {"id": "wt1", "branch": "agent/feature-auth", "prompt": "Implement OAuth2 login with Google and GitHub providers. Add to /api/auth/. Write tests.", "status": "pending"},
    {"id": "wt2", "branch": "agent/feature-dashboard", "prompt": "Build analytics dashboard page at /dashboard with charts for DAU, revenue, churn. Use recharts.", "status": "pending"},
    {"id": "wt3", "branch": "agent/fix-api-pagination", "prompt": "Fix cursor-based pagination in /api/users and /api/orders. Add pagination tests.", "status": "pending"},
    {"id": "wt4", "branch": "agent/feature-notifications", "prompt": "Add in-app notification system with WebSocket delivery. Bell icon in navbar.", "status": "pending"},
    {"id": "wt5", "branch": "agent/refactor-db-queries", "prompt": "Optimize N+1 queries in orders and users endpoints. Add database indexes.", "status": "pending"}
  ]
}
```

## Step 3: Launch Agents in Parallel

Run one agent per worktree using your preferred AI coding tool:

```bash
#!/bin/bash
# launch-agents.sh — starts 5 agents in parallel

WORKTREES=("../project-wt1" "../project-wt2" "../project-wt3" "../project-wt4" "../project-wt5")
TASKS=("Implement OAuth2 login..." "Build analytics dashboard..." "Fix cursor-based pagination..." "Add notification system..." "Optimize N+1 queries...")

for i in "${!WORKTREES[@]}"; do
  echo "🚀 Launching agent $((i+1)) in ${WORKTREES[$i]}"
  cd "${WORKTREES[$i]}"
  # Launch agent in background (adjust for your tool)
  claude-code --task "${TASKS[$i]}" --auto-approve &
  PIDS+=($!)
  cd -
done

echo "⏳ Waiting for all agents to complete..."
for pid in "${PIDS[@]}"; do
  wait "$pid"
done
echo "✅ All agents finished"
```

## Step 4: Review and Merge

Once agents complete, review each branch:

```bash
# Check what each agent produced
for wt in ../project-wt{1..5}; do
  echo "=== $(basename $wt) ==="
  cd "$wt"
  git diff main --stat
  cd -
done

# Run tests on each branch
for wt in ../project-wt{1..5}; do
  cd "$wt" && npm test && cd -
done

# Merge to main one by one
git checkout main
for branch in agent/feature-auth agent/feature-dashboard agent/fix-api-pagination agent/feature-notifications agent/refactor-db-queries; do
  git merge "$branch" --no-ff -m "Merge $branch"
done
```

## Step 5: Track Metrics

Compare parallel vs sequential:

```bash
# Time tracking
echo "Sequential estimate: 10 days (2 days × 5 tasks)"
echo "Parallel actual: $(cat /tmp/agent-timer.log | tail -1)"
echo "Speedup: ~5x"

# Quality check
npm test                    # All tests pass?
npm run lint                # Code quality?
git log --oneline -20       # Clean history?
```

## Conflict Resolution Strategy

When agents touch overlapping files:

1. **Merge the least-conflicting branches first** — pure additions before refactors
2. **Use `git mergetool`** for conflicts — AI agents can also resolve these
3. **Run full test suite after each merge** — catch integration issues early

## GitHub Actions Integration

Automate PR creation and CI for each agent branch:

```yaml
# .github/workflows/agent-pr.yml
name: Agent Branch CI
on:
  push:
    branches: ['agent/**']
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
      - run: gh pr create --fill --base main || true
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Results

| Metric | Sequential | Parallel (5 agents) |
|--------|-----------|---------------------|
| Wall time | 10 days | 1.5 days |
| Total agent-hours | 40h | 40h |
| Merge conflicts | 0 | 3 (resolved in 30min) |
| Tests passing | 100% | 100% |

## Key Takeaways

- **Worktrees are essential** — branches alone cause filesystem conflicts
- **Independent tasks parallelize best** — avoid tasks that touch the same files
- **Merge order matters** — additive changes first, refactors last
- **CI per branch** catches issues before merge
- **5 agents is a sweet spot** — beyond that, merge conflicts outweigh speed gains
