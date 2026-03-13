---
name: aider
description: >-
   You are an expert in Aider, the terminal-based AI coding assistant that
  reads your codebase, makes changes across multiple files, and creates proper
  git commits. You help developers use Aider for autonomous code generation,
  refactoring, bug fixing, and test writing — working with any LLM (Claude,
  GPT-4, Gemini, local models) while respecting project conventions and
  maintaining git history.
category: Developer Tools
tags: [ai-coding, terminal, code-generation, pair-programming, autonomous, git]
version: 1.0.0
author: terminal-skills
---

# Aider — AI Pair Programming in Your Terminal

You are an expert in Aider, the terminal-based AI coding assistant that reads your codebase, makes changes across multiple files, and creates proper git commits. You help developers use Aider for autonomous code generation, refactoring, bug fixing, and test writing — working with any LLM (Claude, GPT-4, Gemini, local models) while respecting project conventions and maintaining git history.

## Core Capabilities

### Basic Usage

```bash
# Start Aider in your project
cd my-project
aider

# Or with specific model
aider --model claude-sonnet-4-20250514
aider --model gpt-4o
aider --model deepseek/deepseek-chat      # Budget option

# Add files to context
> /add src/server/routers/users.ts src/server/db/schema.ts

# Ask for changes
> Add a `deleteUser` endpoint that soft-deletes by setting `deletedAt` timestamp.
> Include input validation and update the tests.

# Aider edits the files, runs lint/tests, and commits
```

### Autonomous Mode

```bash
# Non-interactive: pass a message and let Aider work
aider --yes-always --message "Fix the bug where pagination returns duplicate results when sorting by created_at. The issue is in src/server/routers/posts.ts. Add a secondary sort by id."

# Process from a file of tasks
aider --yes-always --message-file tasks.md

# With auto-lint and auto-test
aider --yes-always \
  --auto-lint --lint-cmd "npm run lint:fix" \
  --auto-test --test-cmd "npm test" \
  --message "Add rate limiting middleware to all public API endpoints"
```

### Configuration

```yaml
# .aider.conf.yml — Project-level config (committed to repo)
model: claude-sonnet-4-20250514
edit-format: diff                        # diff, whole, udiff
auto-commits: true
auto-lint: true
lint-cmd: "npm run lint:fix"
auto-test: true
test-cmd: "npm test"
map-tokens: 2048                         # Repo map context budget
read:                                    # Always-included read-only context
  - src/types/index.ts
  - src/lib/db/schema.ts
  - CONVENTIONS.md
```

### Scripting Integration

```python
# Use Aider as a Python library for CI/CD
from aider.coders import Coder
from aider.models import Model
from aider.io import InputOutput

model = Model("claude-sonnet-4-20250514")
io = InputOutput(yes=True)               # Auto-accept changes

coder = Coder.create(
    main_model=model,
    fnames=["src/api/users.ts", "src/api/users.test.ts"],
    io=io,
    auto_commits=True,
    auto_lint=True,
    lint_cmds={"typescript": "npx eslint --fix"},
)

coder.run("Add pagination support to the listUsers endpoint. Use cursor-based pagination with a default page size of 20.")
```

## Installation

```bash
pip install aider-chat
# Set ANTHROPIC_API_KEY or OPENAI_API_KEY
```

## Best Practices

1. **Add only relevant files** — Don't add the whole project; add files Aider needs to edit plus key context files
2. **Read-only context** — Use `--read` for files Aider should understand but not edit (schemas, types, conventions)
3. **Diff format** — Use `edit-format: diff` for large files; `whole` for small files where full rewrites are fine
4. **Auto-lint + auto-test** — Enable both; Aider will fix lint errors and ensure tests pass before committing
5. **Repo map** — Aider builds a map of your codebase for context; increase `map-tokens` for large projects
6. **Git integration** — Aider commits each change; use `git diff` and `git log` to review AI changes
7. **Specific prompts** — "Fix the pagination bug in posts.ts" beats "fix bugs"; be specific about files and behavior
8. **Convention files** — Add CONVENTIONS.md or .cursor/rules as read-only context; Aider follows documented patterns
