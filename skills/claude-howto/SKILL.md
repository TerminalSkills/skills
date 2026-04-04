---
name: claude-howto
description: >-
  Visual, example-driven guide to Claude Code — from basic concepts to advanced agents,
  with copy-paste templates. Use when: learning Claude Code patterns, setting up agent
  workflows, finding ready-to-use templates for common Claude Code tasks.
license: MIT
compatibility: "Claude Code"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - claude-code
    - guide
    - templates
    - agents
    - workflows
    - best-practices
  use-cases:
    - "Learn Claude Code patterns with practical copy-paste examples"
    - "Set up advanced agent workflows with ready-made templates"
    - "Master Claude Code from basics to multi-agent orchestration"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# Claude Code — Visual Guide with Templates

A structured, example-driven guide to mastering Claude Code. Covers every major feature from slash commands to multi-agent orchestration with production-ready templates.

**Source:** [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto)

## Overview

Claude Code is a powerful CLI-based AI coding agent. This skill covers the key patterns and provides copy-paste templates for immediate use in your projects.

## CLAUDE.md — Project Memory

CLAUDE.md is the most important file for Claude Code. It's read automatically at session start and sets project context, conventions, and rules.

### Template: Basic CLAUDE.md

```markdown
# Project: {{PROJECT_NAME}}

## Tech Stack
- Language: {{LANGUAGE}}
- Framework: {{FRAMEWORK}}
- Database: {{DATABASE}}

## Conventions
- Use {{STYLE_GUIDE}} for code style
- All functions must have docstrings
- Tests required for all new features
- Commit messages follow Conventional Commits

## Architecture
- `/src` — application source code
- `/tests` — test files mirror src structure
- `/docs` — documentation

## Commands
- `npm run dev` — start dev server
- `npm test` — run tests
- `npm run lint` — lint and format
```

### Layered CLAUDE.md

Claude Code reads CLAUDE.md at multiple levels:

1. **`~/.claude/CLAUDE.md`** — Global preferences (style, tone, general rules)
2. **`/project/CLAUDE.md`** — Project-specific context (stack, architecture, conventions)
3. **`/project/src/CLAUDE.md`** — Directory-specific rules (module patterns, local conventions)

## Slash Commands

Custom slash commands live in `.claude/commands/` as markdown files. They're reusable prompt templates.

### Template: Code Review Command

```markdown
<!-- .claude/commands/review.md -->
Review the changes in the current branch compared to main.

Focus on:
1. **Correctness** — Logic errors, edge cases, off-by-one
2. **Security** — Input validation, injection risks, auth gaps
3. **Performance** — N+1 queries, unnecessary allocations, missing indexes
4. **Readability** — Naming, complexity, dead code

For each issue found:
- Severity: critical / warning / suggestion
- File and line number
- What's wrong and how to fix it

End with a summary: ship it ✅, minor fixes 🔧, or needs rework 🚫
```

### Template: Generate Tests Command

```markdown
<!-- .claude/commands/test-gen.md -->
Generate comprehensive tests for $ARGUMENTS.

Requirements:
- Unit tests for all public functions
- Edge cases: empty input, null, boundary values, error paths
- Use the project's existing test framework and patterns
- Mock external dependencies
- Each test should have a descriptive name explaining what it verifies
- Aim for >90% branch coverage
```

## Skills

Skills are reusable instruction sets that Claude Code can invoke. They live in `.claude/skills/` or a shared skills directory.

### Skill Structure

```
.claude/skills/
├── code-review/
│   └── SKILL.md
├── refactor/
│   └── SKILL.md
└── deploy/
    └── SKILL.md
```

Each `SKILL.md` has YAML frontmatter (name, description, metadata) and markdown instructions that Claude Code follows when the skill is activated.

## Hooks

Hooks run shell commands at specific points in Claude Code's lifecycle:

- **PreToolUse** — Before a tool is called (validate, gate, modify)
- **PostToolUse** — After a tool completes (lint, format, notify)
- **Notification** — When Claude Code sends a notification
- **Stop** — When Claude Code is about to stop

### Template: Auto-lint Hook

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "write|edit",
        "command": "npx eslint --fix $CLAUDE_FILE_PATH 2>/dev/null || true"
      }
    ]
  }
}
```

### Template: Security Gate Hook

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "bash",
        "command": "echo $CLAUDE_TOOL_INPUT | grep -qE '(rm -rf|sudo|chmod 777)' && echo 'BLOCK: dangerous command' && exit 1 || exit 0"
      }
    ]
  }
}
```

## Subagents & Multi-Agent Patterns

Claude Code can spawn subagents for parallel work. This is powerful for complex tasks.

### Pattern: Divide and Conquer

```
Main Agent
├── Subagent 1: Write implementation
├── Subagent 2: Write tests
└── Subagent 3: Update documentation
```

### Template: Orchestrator Prompt

```markdown
Break this task into independent subtasks and use subagents:

Task: $ARGUMENTS

For each subtask:
1. Clearly define the scope and expected output
2. Spawn a subagent with specific instructions
3. Wait for all subagents to complete
4. Review and integrate their outputs
5. Resolve any conflicts between outputs
```

### Pattern: Specialist Agents

```markdown
You are orchestrating a team of specialist agents:

- **Architect Agent** — Designs the solution, defines interfaces
- **Implementation Agent** — Writes the code following the architect's design
- **Test Agent** — Writes comprehensive tests
- **Review Agent** — Reviews all outputs for quality

Workflow:
1. Architect designs → produces spec
2. Implementation + Test agents work in parallel using the spec
3. Review agent checks everything
4. Iterate if review finds issues
```

## Memory Management

Claude Code has session memory (within a conversation) and persistent memory (CLAUDE.md files).

### Best Practices

- Store decisions and their reasoning in CLAUDE.md
- Use `memory/` directory for session logs and context
- Keep CLAUDE.md concise — Claude reads it every session
- Layer memory: global → project → directory

### Template: Memory Update Command

```markdown
<!-- .claude/commands/remember.md -->
Update the project memory with the following:

1. Read the current CLAUDE.md
2. Add or update the section related to: $ARGUMENTS
3. Keep existing content intact unless explicitly replacing
4. Use concise, scannable formatting
5. Include the date of the update
```

## MCP (Model Context Protocol) Integration

MCP servers extend Claude Code with external tools — databases, APIs, file systems, etc.

### Configuration

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/mydb"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    }
  }
}
```

### Common MCP Servers

| Server | Purpose |
|--------|---------|
| `server-postgres` | Query PostgreSQL databases |
| `server-filesystem` | Read/write files in allowed directories |
| `server-github` | GitHub API (issues, PRs, repos) |
| `server-brave-search` | Web search via Brave API |
| `server-memory` | Persistent key-value memory |

## CLI Tips & Patterns

```bash
# Start with a specific model
claude --model claude-sonnet-4-20250514

# Resume last conversation
claude --continue

# Run a one-shot command (no interactive session)
claude -p "Explain this error: $(cat error.log | tail -20)"

# Pipe input
cat src/app.py | claude -p "Find bugs in this code"

# Use with git
git diff main | claude -p "Review these changes"
```

## Learning Path

| Level | Focus | Time |
|-------|-------|------|
| Beginner | CLAUDE.md, slash commands, basic prompting | 2-3 hours |
| Intermediate | Skills, hooks, MCP, memory patterns | 3-4 hours |
| Advanced | Multi-agent orchestration, custom pipelines | 4-6 hours |

## References

- [Official Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code)
- [claude-howto Repository](https://github.com/luongnv89/claude-howto)
- [MCP Specification](https://modelcontextprotocol.io/)
