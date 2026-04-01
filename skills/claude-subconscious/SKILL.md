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
  category: ai-tools
  tags:
    - claude-code
    - memory
    - persistence
    - context
    - subconscious
    - sessions
    - letta
  use-cases:
    - "Give Claude Code memory that persists across terminal sessions"
    - "Build an AI assistant that remembers project decisions and past discussions"
    - "Automatically capture and recall context without manual CLAUDE.md updates"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# Claude Subconscious

Add a persistent memory layer to Claude Code using [Letta](https://letta.com). A background agent watches your sessions, reads your files, builds up memory over time, and whispers guidance back — so Claude never forgets what you've worked on.

> Source: [letta-ai/claude-subconscious](https://github.com/letta-ai/claude-subconscious) (2.5k+ ⭐)

## How It Works

Claude Code forgets everything between sessions. Claude Subconscious is a second agent running underneath — watching, learning, and whispering back:

- **Watches** every Claude Code session transcript
- **Reads your codebase** — explores files with Read, Grep, and Glob while processing transcripts
- **Remembers** across sessions, projects, and time
- **Whispers guidance** — surfaces context, patterns, and reminders before each prompt
- **Never blocks** — runs in the background via the Letta Code SDK

```
┌─────────────┐          ┌──────────────────────────┐
│ Claude Code  │◄────────►│ Letta Agent (background)  │
└─────────────┘          │                           │
       │                 │  Tools: Read, Grep, Glob  │
       │                 │  Memory: persistent        │
       │                 │  Web: search, fetch        │
       │                 └──────────────────────────┘
       │                        │
       │   Session Start        │
       ├───────────────────────►│ New session notification
       │                        │
       │   Before each prompt   │
       │◄───────────────────────┤ Whispers guidance → stdout
       │                        │
       │   After each response  │
       ├───────────────────────►│ Transcript → SDK session (async)
       │                        │  ↳ Reads files, updates memory
```

Using Letta's Conversations feature, a single agent serves multiple Claude Code sessions in parallel with shared memory across all of them.

## What Gets Remembered

The subconscious agent automatically captures:

- **Decisions** — Architecture choices, library selections, trade-offs discussed
- **Patterns** — Code conventions, naming styles, project structure preferences
- **Context** — Who's working on what, project goals, deadlines mentioned
- **Preferences** — Testing approaches, formatting rules, deployment strategies
- **Mistakes** — What failed, why, and what fixed it

Nothing is written to CLAUDE.md — memory lives in the Letta platform and is injected at runtime.

## Installation

### From Claude Code Plugin Marketplace

```bash
/plugin marketplace add letta-ai/claude-subconscious
/plugin install claude-subconscious@claude-subconscious
```

### From Source

```bash
git clone https://github.com/letta-ai/claude-subconscious.git
cd claude-subconscious
npm install

# Enable the plugin
/plugin enable .

# Or enable globally for all projects
/plugin enable --global .
```

### Updating

```bash
/plugin marketplace update
/plugin update claude-subconscious@claude-subconscious
```

## Configuration

### Required: Letta API Key

```bash
export LETTA_API_KEY="your-api-key"
```

Get your API key from [app.letta.com](https://app.letta.com).

### Optional Environment Variables

```bash
# Memory mode: "whisper" (default), "full" (blocks + messages), "off" (disable)
export LETTA_MODE="whisper"

# Pin to a specific agent (auto-created if not set)
export LETTA_AGENT_ID="agent-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Custom Letta server (for self-hosted)
export LETTA_BASE_URL="https://your-letta-server.com"
```

### Mode Comparison

| Mode | Behavior | Token Cost |
|------|----------|------------|
| `whisper` | Agent whispers short guidance before each prompt | Low |
| `full` | Full memory blocks + message history injected | Higher |
| `off` | Plugin disabled, no background processing | None |

## Retrieval: How Memories Surface

At each session start and before each prompt, the agent:

1. Receives the current transcript chunk
2. Searches its memory for relevant past context
3. Optionally reads files in the codebase for current state
4. Composes a "whisper" — a short contextual note injected into stdout

Example whisper:

```
[subconscious] Last session you decided to switch from REST to GraphQL for the
user service. The migration is 60% done — resolvers for User and Project are
complete, Order and Payment still need conversion. You preferred code-first
schema generation with TypeGraphQL.
```

## Letta Platform Integration

Claude Subconscious is built on the [Letta Code SDK](https://docs.letta.com/letta-code/sdk/), which provides:

- **Persistent memory** — Core and archival memory that survives across sessions
- **Tool access** — The background agent can read files, search the web, and run tools
- **Conversations** — Multiple Claude Code sessions share one memory store
- **Self-hosted option** — Run your own Letta server for full data control

### Self-Hosted Setup

```bash
# Run Letta server locally
pip install letta
letta server --port 8283

# Point the plugin to your server
export LETTA_BASE_URL="http://localhost:8283"
```

## Linux: tmpfs Workaround

If plugin installation fails with `EXDEV: cross-device link not permitted`, your `/tmp` is likely on a different filesystem:

```bash
mkdir -p ~/.claude/tmp
export TMPDIR="$HOME/.claude/tmp"
# Add to ~/.bashrc or ~/.zshrc to make permanent
```

## Tips

- **Start fresh per project** — Each project benefits from its own agent (auto-created by default)
- **Check memory** — Visit [app.letta.com](https://app.letta.com) to see what your agent has learned
- **Whisper mode is enough** — `full` mode uses more tokens; `whisper` gives 90% of the value
- **Pair with CLAUDE.md** — Use CLAUDE.md for static project context, subconscious for dynamic memory
- **Multi-developer** — Each developer gets their own agent; team patterns emerge naturally

## Limitations

- Requires a Letta API key (free tier available) or self-hosted Letta server
- Background processing adds slight latency (~1-2s per whisper)
- Memory quality depends on session length — short sessions produce less useful memories
- Currently optimized for Claude Code; other agents supported via Letta Code CLI (`letta`)

## References

- [GitHub: letta-ai/claude-subconscious](https://github.com/letta-ai/claude-subconscious)
- [Letta Code SDK Docs](https://docs.letta.com/letta-code/sdk/)
- [Letta Platform](https://app.letta.com)
- [Letta Code CLI](https://github.com/letta-ai/letta-code)
