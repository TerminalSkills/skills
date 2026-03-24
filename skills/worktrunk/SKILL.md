---
name: worktrunk
description: >-
  Manage Git worktrees for parallel AI agent workflows with Worktrunk CLI. Use when:
  running multiple AI coding agents simultaneously on different branches, parallelizing
  feature development with AI, managing concurrent git worktrees.
license: MIT
compatibility: "Git 2.20+, any shell"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [git, worktree, parallel, ai-agents, branching]
---

# Worktrunk

## Overview

Worktrunk is a CLI for git worktree management, designed for running AI coding agents in parallel. AI agents like Claude Code and Codex can handle longer tasks without supervision, making it possible to manage 5-10+ agents simultaneously. Git worktrees give each agent its own working directory so they don't step on each other's changes.

The problem: git worktree UX is clunky — starting a new worktree requires typing the branch name three times. Worktrunk makes worktrees as easy as branches with three core commands.

## Instructions

### Installation

```bash
# From crates.io
cargo install worktrunk

# Or download pre-built binary from GitHub releases
# https://github.com/max-sixty/worktrunk/releases
```

### Core Commands

**Switch** — create or move to a worktree:

```bash
wt switch feat              # Switch to existing worktree
wt switch -c feat            # Create new worktree + switch
wt switch -c -x claude feat  # Create + launch Claude Code in it
wt switch -c -x "npm test" feat  # Create + run any command
```

**List** — show all worktrees with status:

```bash
wt list  # Shows branch names, paths, dirty status, ahead/behind
```

**Remove** — clean up worktree and branch:

```bash
wt remove        # Remove current worktree
wt remove feat   # Remove specific worktree
```

### Workflow Automation with Hooks

```toml
# .worktrunk.toml
[hooks]
on_create = "npm install"
pre_merge = "npm test"
post_merge = "git push origin main"
```

### Copy Build Caches

Avoid redundant dependency installs:

```toml
[create]
copy = ["node_modules", ".next", "dist"]
```

### Path Templates

```toml
[paths]
template = "../{repo}.{branch}"  # Default naming pattern
```

## Examples

### Example 1: Parallel Feature Development on a SaaS App

A developer needs to build three independent features for a Node.js SaaS application. They use Worktrunk to run three Claude Code agents in parallel:

```bash
cd ~/projects/saas-app

# Configure hooks for automatic setup
cat > .worktrunk.toml << 'EOF'
[hooks]
on_create = "npm install && npm run build"
pre_merge = "npm test && npm run lint"

[create]
copy = ["node_modules", ".next"]

[paths]
template = "../saas-app.{branch}"
EOF

# Create 3 worktrees, each launching Claude Code with a task
wt switch -c -x "claude --prompt 'Implement Stripe subscription billing with webhooks for plan upgrades/downgrades'" feat/billing
wt switch -c -x "claude --prompt 'Add role-based access control: admin, editor, viewer roles with middleware guards'" feat/rbac
wt switch -c -x "claude --prompt 'Build CSV/JSON export for analytics dashboard with date range filtering'" feat/export

# Monitor progress across all worktrees
wt list
# feat/billing    ../saas-app.feat/billing    [dirty, ahead 3]
# feat/rbac       ../saas-app.feat/rbac       [dirty, ahead 5]
# feat/export     ../saas-app.feat/export     [clean, ahead 2]

# Merge completed features (pre_merge hook runs tests automatically)
wt switch feat/export && wt merge
wt switch feat/rbac && wt merge
wt switch feat/billing && wt merge
```

### Example 2: Bug Fix Sprint with Multiple Agents

A team lead triages 4 bug reports and assigns each to a separate agent working in its own worktree:

```bash
cd ~/projects/api-server

# Spin up one worktree per bug
wt switch -c -x "claude --prompt 'Fix: POST /api/users returns 500 when email contains + character. Add input sanitization and test.'" fix/email-plus
wt switch -c -x "claude --prompt 'Fix: Rate limiter counts OPTIONS preflight requests. Exclude CORS preflight from rate limit middleware.'" fix/rate-limit-cors
wt switch -c -x "claude --prompt 'Fix: Pagination returns duplicate items when records are inserted during traversal. Use cursor-based pagination.'" fix/pagination-dupes
wt switch -c -x "claude --prompt 'Fix: WebSocket connections leak when clients disconnect without close frame. Add heartbeat and cleanup.'" fix/ws-leak

# Check which fixes are done
wt list

# Merge fixes one by one, running tests each time
wt switch fix/email-plus && wt merge
wt switch fix/rate-limit-cors && wt merge
wt switch fix/pagination-dupes && wt merge
wt switch fix/ws-leak && wt merge

# Push all fixes
git push origin main
```

## Guidelines

- Break work into independent, self-contained tasks to avoid merge conflicts
- Branch all worktrees from the same commit to minimize divergence
- Use `on_create` hooks to automatically install dependencies in new worktrees
- Configure `copy` for `node_modules` and build caches to speed up worktree creation
- Use `pre_merge` hooks to run tests before merging each feature
- Merge completed features promptly to keep the base branch fresh
- Clean up worktrees after merging with `wt remove` to keep your workspace tidy
- Run `wt list` regularly to monitor progress across all active agents
- See [worktrunk.dev](https://worktrunk.dev) and [GitHub](https://github.com/max-sixty/worktrunk) for full docs
