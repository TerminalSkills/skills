---
name: claude-subconscious
description: >-
  Add persistent subconscious memory to Claude Code that survives across sessions — automatically
  stores decisions, patterns, and context. Use when: maintaining continuity across Claude Code
  sessions, building agents with long-term project memory, avoiding repeated context setup.
license: MIT
compatibility: "Claude Code, Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - claude-code
    - memory
    - persistence
    - context
    - letta
---

# Claude Subconscious

## Overview

Add a persistent memory layer to Claude Code using [Letta](https://letta.com). A background agent watches your sessions, reads your files, builds up memory over time, and whispers guidance back — so Claude never forgets what you've worked on.

> Source: [letta-ai/claude-subconscious](https://github.com/letta-ai/claude-subconscious) (2.5k+ stars)

Claude Code forgets everything between sessions. Claude Subconscious is a second agent running underneath — watching, learning, and whispering back. It uses Letta's Conversations feature so a single agent serves multiple sessions with shared memory.

## Instructions

### 1. Install the plugin

**From Claude Code Plugin Marketplace:**

```bash
/plugin marketplace add letta-ai/claude-subconscious
/plugin install claude-subconscious@claude-subconscious
```

**From source:**

```bash
git clone https://github.com/letta-ai/claude-subconscious.git
cd claude-subconscious
npm install
/plugin enable .
```

### 2. Configure Letta API key

```bash
export LETTA_API_KEY="your-api-key"
```

Get your API key from [app.letta.com](https://app.letta.com).

### 3. Optional configuration

```bash
# Memory mode: "whisper" (default), "full" (blocks + messages), "off" (disable)
export LETTA_MODE="whisper"

# Pin to a specific agent (auto-created if not set)
export LETTA_AGENT_ID="agent-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Custom Letta server (for self-hosted)
export LETTA_BASE_URL="https://your-letta-server.com"
```

| Mode | Behavior | Token Cost |
|------|----------|------------|
| `whisper` | Short guidance before each prompt | Low |
| `full` | Full memory blocks + message history injected | Higher |
| `off` | Plugin disabled | None |

### 4. Self-hosted option

```bash
pip install letta
letta server --port 8283
export LETTA_BASE_URL="http://localhost:8283"
```

## Examples

### Example 1: Architecture decision memory

After discussing a REST-to-GraphQL migration in one session, you start a new session the next day. The subconscious whispers:

```
[subconscious] Last session you decided to switch from REST to GraphQL for the
user service. The migration is 60% done — resolvers for User and Project are
complete, Order and Payment still need conversion. You preferred code-first
schema generation with TypeGraphQL.
```

You can immediately continue the migration without re-explaining context.

### Example 2: Pattern and convention recall

After establishing naming conventions and test patterns across several sessions, you start working on a new module. The subconscious whispers:

```
[subconscious] This project uses barrel exports (index.ts) for all modules.
Tests follow the pattern: describe('[ModuleName]') with 'should' prefixed
test names. You prefer integration tests over unit tests for API routes.
Database fixtures go in tests/fixtures/.
```

The new module code follows established patterns without you having to look up past decisions.

## Guidelines

- **Start fresh per project** — Each project benefits from its own agent (auto-created by default)
- **Whisper mode is enough** — `full` mode uses more tokens; `whisper` gives 90% of the value
- **Pair with CLAUDE.md** — Use CLAUDE.md for static project context, subconscious for dynamic memory
- **Check memory** — Visit [app.letta.com](https://app.letta.com) to see what your agent has learned
- **Linux tmpfs workaround** — If installation fails with `EXDEV: cross-device link not permitted`, set `export TMPDIR="$HOME/.claude/tmp"`
- Requires a Letta API key (free tier available) or self-hosted Letta server
- Background processing adds ~1-2s latency per whisper
- Memory quality depends on session length — short sessions produce less useful memories

## References

- [GitHub: letta-ai/claude-subconscious](https://github.com/letta-ai/claude-subconscious)
- [Letta Code SDK Docs](https://docs.letta.com/letta-code/sdk/)
- [Letta Platform](https://app.letta.com)
