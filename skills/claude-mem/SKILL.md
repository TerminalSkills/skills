---
name: claude-mem
description: >-
  Automatically capture, compress, and inject context from Claude Code sessions using
  claude-mem. Remembers what Claude did in past sessions and provides relevant context
  in future sessions. Use when: maintaining continuity across Claude Code sessions,
  building agents with persistent project memory, avoiding repeated context setup.
license: AGPL-3.0
compatibility: "Claude Code, Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags:
    - claude-code
    - memory
    - context
    - session
    - persistence
---

# claude-mem

Persistent memory compression system for Claude Code. Automatically captures what happens in each session, compresses it with AI, and injects relevant context into future sessions. No manual context management needed.

GitHub: [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)

## Overview

claude-mem gives Claude Code persistent memory across sessions. It hooks into your session lifecycle, captures decisions and code changes, compresses them with AI, and injects relevant context when you start a new session. No manual context management needed.

## Instructions

### Installation

```bash
# Install globally
npm install -g claude-mem

# Or use npx
npx claude-mem init
```

### Setup in Your Project

```bash
cd your-project
claude-mem init
```

This creates:

```
your-project/
├── .claude-mem/
│   ├── config.json      # Configuration
│   ├── memories/        # Compressed session memories
│   └── index.json       # Memory index for fast search
```

### Configure Claude Code Integration

Add to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "postSession": "claude-mem capture",
    "preSession": "claude-mem inject"
  }
}
```

Or use the automatic setup:

```bash
claude-mem setup-hooks
```

### How It Works

```
Session 1: You work on auth module
  ↓ claude-mem captures decisions, code changes, context
  ↓ AI compresses session into key facts + decisions
  ↓ Stored in .claude-mem/

Session 2: You return to the project
  ↓ claude-mem injects relevant compressed context
  ↓ Claude knows what happened before — no re-explanation needed
```

The compression pipeline:

1. **Capture** — hooks into Claude Code session, records interactions
2. **Compress** — AI summarizes session into structured memory (decisions, code changes, learnings)
3. **Store** — compressed memories saved to `.claude-mem/` directory
4. **Retrieve** — on new session, relevant memories injected into context
5. **Search** — MCP tools let you search through past memories

### Manual Commands

```bash
claude-mem capture       # Capture current session
claude-mem inject        # Inject memories into current context
claude-mem search "authentication flow"  # Search through memories
claude-mem list          # List all memories
claude-mem stats         # Show memory stats
claude-mem compress      # Compress old memories (reduce storage)
```

### MCP Search Tools

claude-mem provides MCP tools for searching memories within Claude Code:

- `memory_search` — semantic search across all memories
- `memory_list` — list recent memories with summaries
- `memory_get` — retrieve a specific memory by ID

### Configuration

```json
{
  "compression": {
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 2000,
    "strategy": "smart"
  },
  "capture": {
    "autoCapture": true,
    "includeCodeChanges": true,
    "includeDecisions": true
  },
  "inject": {
    "maxMemories": 10,
    "relevanceThreshold": 0.7,
    "strategy": "semantic"
  }
}
```

| Compression Strategy | Description | Best For |
|----------|-------------|----------|
| `smart` | AI picks what's important | General use |
| `full` | Captures everything | Critical projects |
| `minimal` | Only decisions and errors | Large teams, cost control |

## Examples

### Example 1: Automatic Session Memory

```bash
# Session 1: Work on auth module
$ claude-mem stats
Memories: 12 | Storage: 45KB | Last capture: 2 hours ago

# Session 2: Return to project — claude-mem auto-injects context
# Claude already knows: "You implemented JWT auth with RS256, refresh tokens in Redis"
```

### Example 2: Searching Past Decisions

```bash
$ claude-mem search "database schema"
[mem_20260329_db] Decided on PostgreSQL with Prisma ORM
  - Normalized schema for users, teams, projects
  - Added composite index on (team_id, created_at)
  - Chose UUID v7 for primary keys

[mem_20260325_api] API routes follow REST conventions
  - /api/v1/teams/:id/projects pattern
```

## Guidelines

- Run `claude-mem stats` periodically to check memory usage
- Use `claude-mem compress` to reduce storage for old memories
- Set `relevanceThreshold` higher (0.8+) if too much context is injected
- For monorepos, initialize claude-mem per package
- Memory files are plain JSON — easy to version control or backup
- Add `.claude-mem/memories/` to `.gitignore` for private projects

## Resources

- [Documentation](https://github.com/thedotmack/claude-mem#documentation)
- [Configuration Guide](https://github.com/thedotmack/claude-mem#configuration)
- [Troubleshooting](https://github.com/thedotmack/claude-mem#troubleshooting)
- [Mentioned in Awesome Claude Code](https://github.com/thedotmack/awesome-claude-code)
