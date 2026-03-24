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
  tags: [git, worktree, parallel, ai-agents, branching, productivity]
  use-cases:
    - "Run 5 Claude Code agents in parallel, each on a different feature branch"
    - "Manage git worktrees for concurrent AI-assisted development"
    - "Speed up development by parallelizing tasks across AI agents"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Worktrunk

## Overview

Worktrunk is a CLI for git worktree management, designed for running AI coding agents in parallel. AI agents like Claude Code and Codex can handle longer tasks without supervision, making it possible to manage 5-10+ agents simultaneously. Git worktrees give each agent its own working directory so they don't step on each other's changes.

The problem: git worktree UX is clunky. Starting a new worktree requires typing the branch name three times. Worktrunk makes worktrees as easy as branches with three core commands.

## Prerequisites

- Git 2.20+
- Rust toolchain (for installing from crates.io) or pre-built binary
- One or more AI coding agents (Claude Code, Codex, Gemini CLI, Cursor)

## Installation

```bash
# From crates.io
cargo install worktrunk

# Or download pre-built binary from GitHub releases
# https://github.com/max-sixty/worktrunk/releases
```

## Core Commands

Worktrunk's three core commands replace verbose git worktree operations:

### Switch (create or move to a worktree)

```bash
# Switch to existing worktree
wt switch feat

# Create new worktree + switch to it
wt switch -c feat

# Create + immediately launch Claude Code
wt switch -c -x claude feat

# Create + launch any command
wt switch -c -x "npm test" feat
```

**Equivalent plain git:**
```bash
git worktree add -b feat ../repo.feat && cd ../repo.feat && claude
```

### List (show all worktrees with status)

```bash
wt list
```

Shows branch names, paths, dirty status, and ahead/behind counts — much richer than `git worktree list`.

### Remove (clean up worktree + branch)

```bash
wt remove        # Remove current worktree
wt remove feat   # Remove specific worktree
```

**Equivalent plain git:**
```bash
cd ../repo && git worktree remove ../repo.feat && git branch -d feat
```

## Parallel Agent Workflow

### Step 1: Plan your tasks

Break work into independent features that can be developed in parallel:

```
- feat/auth      → Authentication system
- feat/dashboard → Dashboard UI
- feat/api       → REST API endpoints
- feat/tests     → Test suite
- feat/docs      → Documentation
```

### Step 2: Create worktrees and launch agents

```bash
# Create 5 worktrees, each launching Claude Code
wt switch -c -x claude feat/auth
wt switch -c -x claude feat/dashboard
wt switch -c -x claude feat/api
wt switch -c -x claude feat/tests
wt switch -c -x claude feat/docs
```

Each agent gets its own isolated working directory. No conflicts, no stashing, no branch switching.

### Step 3: Monitor progress

```bash
wt list  # See status of all worktrees
```

### Step 4: Merge results

```bash
# Switch to each completed worktree and merge
wt switch feat/auth
wt merge          # Squash, rebase, or merge + clean up

wt switch feat/dashboard
wt merge
# ... repeat for each feature
```

## Workflow Automation with Hooks

Worktrunk supports hooks that run at key lifecycle points:

```toml
# .worktrunk.toml (or worktrunk.toml)

[hooks]
# Run after creating a new worktree
on_create = "npm install"

# Run before merging
pre_merge = "npm test"

# Run after merging
post_merge = "git push origin main"
```

### Common Hook Patterns

**Install dependencies on create:**
```toml
on_create = "npm install && npm run build"
```

**Run tests before merge:**
```toml
pre_merge = "npm test && npm run lint"
```

**Auto-push after merge:**
```toml
post_merge = "git push"
```

## LLM Commit Messages

Worktrunk can generate commit messages from diffs using an LLM:

```bash
wt commit  # Auto-generates commit message from staged changes
```

## Advanced Features

### Interactive Picker

Browse worktrees with live diff and log previews:

```bash
wt switch  # No argument → opens interactive picker
```

### Copy Build Caches

Avoid redundant `node_modules` installs by copying caches from the main worktree:

```bash
# Configure in .worktrunk.toml
[create]
copy = ["node_modules", ".next", "dist"]
```

### Path Templates

Control where worktrees are created:

```toml
# .worktrunk.toml
[paths]
template = "../{repo}.{branch}"  # Default
# Or: "../worktrees/{branch}"
# Or: "/tmp/worktrees/{repo}/{branch}"
```

## Best Practices for Parallel AI Agents

1. **Independent tasks**: Each agent should work on a self-contained feature
2. **Shared base**: All worktrees branch from the same commit to minimize merge conflicts
3. **Hook automation**: Use `on_create` hooks to set up each worktree automatically
4. **Copy caches**: Configure `copy` to avoid redundant dependency installations
5. **Regular merges**: Merge completed features promptly to keep the base fresh
6. **Test before merge**: Use `pre_merge` hooks to validate each feature
7. **Clean up**: Remove worktrees after merging to keep your workspace tidy

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "worktree already exists" | Use `wt switch` (without `-c`) for existing worktrees |
| Merge conflicts | Rebase on latest main: `git rebase main` in the worktree |
| Stale worktrees | `wt list` to find them, `wt remove <name>` to clean up |
| Dependencies missing | Add `on_create = "npm install"` hook |
| Build cache stale | Configure `copy` in `.worktrunk.toml` |

## Example: Full Parallel Development Session

```bash
# Start from main branch
cd my-project

# Plan: 3 features in parallel
wt switch -c -x "claude --prompt 'Implement user auth with JWT'" feat/auth
wt switch -c -x "claude --prompt 'Build dashboard with charts'" feat/dashboard
wt switch -c -x "claude --prompt 'Write API integration tests'" feat/tests

# Check progress
wt list

# Merge completed features
wt switch feat/auth && wt merge
wt switch feat/dashboard && wt merge
wt switch feat/tests && wt merge

# Push everything
git push origin main
```

## Resources

- [Worktrunk Documentation](https://worktrunk.dev)
- [GitHub Repository](https://github.com/max-sixty/worktrunk)
- [Hooks Guide](https://worktrunk.dev/hook/)
- [Merge Workflow](https://worktrunk.dev/merge/)
- [Interactive Picker](https://worktrunk.dev/switch/#interactive-picker)
