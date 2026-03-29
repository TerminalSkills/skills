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
  version: 1.0.0
  category: ai-tools
  tags:
    - claude-code
    - memory
    - context
    - session
    - persistence
    - compression
    - agent-memory
  use-cases:
    - "Give Claude Code persistent memory across coding sessions"
    - "Automatically capture and compress session history for future reference"
    - "Build AI workflows that remember project decisions and past work"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# claude-mem

Persistent memory compression system for Claude Code. Automatically captures what happens in each session, compresses it with AI, and injects relevant context into future sessions. No manual context management needed.

GitHub: [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)

## How It Works

```
Session 1: You work on auth module
  ↓ claude-mem captures decisions, code changes, context
  ↓ AI compresses session into key facts + decisions
  ↓ Stored in .claude-mem/

Session 2: You return to the project
  ↓ claude-mem injects relevant compressed context
  ↓ Claude knows what happened before — no re-explanation needed
```

### The Compression Pipeline

1. **Capture** — hooks into Claude Code session, records interactions
2. **Compress** — AI summarizes session into structured memory (decisions, code changes, learnings)
3. **Store** — compressed memories saved to `.claude-mem/` directory
4. **Retrieve** — on new session, relevant memories injected into context
5. **Search** — MCP tools let you search through past memories

## Installation

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

## Usage

### Automatic Mode (Recommended)

Once hooks are configured, everything is automatic:

1. Start a Claude Code session — relevant memories are injected
2. Work normally — claude-mem captures in the background
3. End session — memories are compressed and stored
4. Next session — context from previous work is available

### Manual Commands

```bash
# Capture current session
claude-mem capture

# Inject memories into current context
claude-mem inject

# Search through memories
claude-mem search "authentication flow"

# List all memories
claude-mem list

# Show memory stats
claude-mem stats

# Compress old memories (reduce storage)
claude-mem compress
```

### MCP Search Tools

claude-mem provides MCP tools for searching memories within Claude Code:

```bash
# In Claude Code, use natural language
"What did we decide about the database schema last week?"
"Show me the auth implementation decisions"
```

The MCP server exposes:

- `memory_search` — semantic search across all memories
- `memory_list` — list recent memories with summaries
- `memory_get` — retrieve a specific memory by ID

## Configuration

### `.claude-mem/config.json`

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
    "includeDecisions": true,
    "includeLearnings": true
  },
  "inject": {
    "maxMemories": 10,
    "relevanceThreshold": 0.7,
    "strategy": "semantic"
  },
  "storage": {
    "maxMemories": 1000,
    "compressAfterDays": 30,
    "pruneAfterDays": 90
  }
}
```

### Compression Strategies

| Strategy | Description | Best For |
|----------|-------------|----------|
| `smart` | AI picks what's important | General use |
| `full` | Captures everything | Critical projects |
| `minimal` | Only decisions and errors | Large teams, cost control |
| `custom` | Your own compression prompt | Domain-specific needs |

### Injection Strategies

| Strategy | Description |
|----------|-------------|
| `semantic` | Injects memories most relevant to current task |
| `recent` | Injects most recent memories first |
| `all` | Injects all memories (use with small projects) |

## Memory Structure

Each compressed memory contains:

```json
{
  "id": "mem_20260329_auth",
  "timestamp": "2026-03-29T10:00:00Z",
  "summary": "Implemented JWT auth with refresh tokens",
  "decisions": [
    "Use RS256 for JWT signing",
    "Refresh tokens expire after 7 days",
    "Store refresh tokens in Redis"
  ],
  "codeChanges": [
    "Created src/auth/jwt.ts",
    "Added middleware to src/middleware/auth.ts"
  ],
  "learnings": [
    "bcrypt rounds=12 is sufficient for our scale"
  ],
  "tags": ["auth", "jwt", "security"]
}
```

## Tips

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
