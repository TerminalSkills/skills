---
name: claude-mem
description: >-
  Add persistent memory to Claude Code that survives across sessions. Use when:
  maintaining continuity across Claude Code sessions, building agents with
  persistent project memory, avoiding repeated context setup. Covers claude-mem
  (AI-compressed session logs) and Claude Subconscious (Letta-based background agent).
license: Apache-2.0
compatibility: "Claude Code, Node.js 18+"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: productivity
  tags: ["claude-code", "memory", "persistence", "context", "session"]
---

# Claude Code Persistent Memory

## Overview

Claude Code forgets everything between sessions. Two open-source tools solve this by automatically capturing context and injecting it into future sessions:

- **claude-mem** — captures session activity, compresses it with AI, injects relevant memories on next session. Lightweight, local-first.
- **Claude Subconscious** — a background Letta agent that watches sessions, builds up memory over time, and whispers guidance back. Cloud or self-hosted.

Both eliminate the need to re-explain context when returning to a project.

## Instructions

### Option A: claude-mem (Local AI Compression)

**GitHub:** [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)

#### Setup

```bash
npm install -g claude-mem
cd your-project
claude-mem init
claude-mem setup-hooks
```

This creates `.claude-mem/` with config, compressed memories, and an index. Hooks auto-capture after each session and auto-inject before the next.

#### How It Works

1. **Capture** — hooks into Claude Code session, records interactions
2. **Compress** — AI summarizes session into structured memory (decisions, code changes, learnings)
3. **Store** — compressed memories saved to `.claude-mem/` directory
4. **Retrieve** — on new session, relevant memories injected into context

#### Commands

```bash
claude-mem capture                     # Capture current session
claude-mem inject                      # Inject memories into context
claude-mem search "auth flow"          # Semantic search through memories
claude-mem list                        # List all memories
claude-mem stats                       # Show memory stats
claude-mem compress                    # Reduce storage for old memories
```

#### Configuration

```json
{
  "compression": {
    "model": "claude-sonnet-4-20250514",
    "strategy": "smart"
  },
  "inject": {
    "maxMemories": 10,
    "relevanceThreshold": 0.7,
    "strategy": "semantic"
  }
}
```

Strategies: `smart` (AI picks what's important), `full` (captures everything), `minimal` (only decisions and errors).

### Option B: Claude Subconscious (Letta Background Agent)

**GitHub:** [letta-ai/claude-subconscious](https://github.com/letta-ai/claude-subconscious)

#### Setup

```bash
/plugin marketplace add letta-ai/claude-subconscious
/plugin install claude-subconscious@claude-subconscious
export LETTA_API_KEY="your-api-key"
```

Get your API key from [app.letta.com](https://app.letta.com). Or self-host:

```bash
pip install letta
letta server --port 8283
export LETTA_BASE_URL="http://localhost:8283"
```

#### Modes

| Mode | Behavior | Token Cost |
|------|----------|------------|
| `whisper` (default) | Short guidance before each prompt | Low |
| `full` | Full memory blocks + message history | Higher |
| `off` | Disabled | None |

### Which to Choose

| | claude-mem | Claude Subconscious |
|---|-----------|-------------------|
| Storage | Local files (.claude-mem/) | Letta cloud or self-hosted |
| Cost | Uses your Claude API for compression | Requires Letta API key (free tier) |
| Latency | Near-zero (local) | ~1-2s per whisper |
| Memory style | Compressed session summaries | Continuous learning agent |
| Best for | Local-first, privacy-sensitive | Rich cross-session context |

## Examples

### Example 1: Session Continuity with claude-mem

```bash
# Session 1: Work on auth module
$ claude-mem stats
Memories: 12 | Storage: 45KB | Last capture: 2 hours ago

# Session 2: Return to project — auto-injected context
# Claude already knows: "You implemented JWT auth with RS256, refresh tokens in Redis"
```

### Example 2: Architecture Recall with Subconscious

After discussing a REST-to-GraphQL migration, you start a new session:

```
[subconscious] Last session you decided to switch from REST to GraphQL for the
user service. Migration is 60% done — resolvers for User and Project are complete,
Order and Payment still need conversion. You preferred code-first schema with TypeGraphQL.
```

## Guidelines

- **Pair with CLAUDE.md** — use CLAUDE.md for static project context, persistent memory for dynamic decisions
- **One tool per project** — don't run both claude-mem and Subconscious simultaneously
- For claude-mem: set `relevanceThreshold` higher (0.8+) if too much context is injected
- For Subconscious: `whisper` mode gives 90% of the value at lower token cost
- Add `.claude-mem/memories/` to `.gitignore` for private projects
- Memory quality depends on session length — short sessions produce less useful memories
