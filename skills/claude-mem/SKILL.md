---
name: claude-mem
description: >-
  Add persistent memory to Claude Code that survives across sessions. Use when:
  maintaining continuity across Claude Code sessions, building agents with
  persistent project memory, avoiding repeated context setup. Covers claude-mem
  (AI-compressed session logs) and Claude Subconscious (Letta-based background agent).
license: Apache-2.0
compatibility: "Claude Code, Node.js 20.12+ (Bun and uv are installed automatically)"
metadata:
  author: terminal-skills
  version: "2.1.0"
  category: productivity
  tags: "claude-code, memory, persistence, context, session"
  repository: https://github.com/thedotmack/claude-mem
---

# Claude Code Persistent Memory

## Overview

Claude Code forgets everything between sessions. Two open-source tools solve this by automatically capturing context and injecting it into future sessions:

- **claude-mem** (v15) — a Claude Code plugin that records what Claude does through lifecycle hooks, compresses it into observations and summaries with an AI model, stores them in a local SQLite database, and injects relevant context into the next session.
- **Claude Subconscious** — a Letta demo app: a background agent that watches sessions and whispers guidance back. Its README says it is a demo, not meant for production; Letta points to Letta Code for that.

Both eliminate the need to re-explain context when returning to a project.

## Instructions

### Option A: claude-mem

**GitHub:** [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) (Apache-2.0). Needs Node.js 20.12+ (the package `engines` field); Bun and uv are installed automatically if missing.

#### Setup

```bash
npx claude-mem install
```

The installer registers the plugin and hooks, puts a `claude-mem` launcher in `~/.local/bin`, and starts the worker. In an interactive shell it also offers a browser sign-in to the hosted observer (30-day trial); to skip any account step, pass a provider explicitly or set `CLAUDE_MEM_ONLINE_OPTIN=false`:

```bash
CLAUDE_MEM_ONLINE_OPTIN=false npx claude-mem install --provider claude
```

Alternative from inside Claude Code: `/plugin marketplace add thedotmack/claude-mem`, then `/plugin install claude-mem`. Restart Claude Code afterwards.

Do not use `npm install -g claude-mem`: the README says that installs only the SDK/library, with no hooks and no worker. The older `claude-mem init` / `setup-hooks` / `capture` / `inject` commands no longer exist.

#### How It Works

1. **Capture** — hooks (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd) run `claude-mem hook claude-code <event>`
2. **Compress** — a local worker service (HTTP, managed by Bun) has an AI model turn tool usage into observations and session summaries
3. **Store** — SQLite with FTS5 plus a Chroma vector index, under `~/.claude-mem/`
4. **Retrieve** — recent relevant observations are injected at session start; Claude can search the rest through MCP tools

#### Commands

```bash
npx claude-mem status               # worker status
npx claude-mem doctor               # diagnose bun, uv, hook launcher, worker
npx claude-mem search "auth flow"   # search observations
npx claude-mem restart              # restart the worker
npx claude-mem repair               # re-run Bun/uv setup
npx claude-mem update               # update to the latest version
npx claude-mem uninstall            # remove plugin, config and launcher
```

The worker serves a local web viewer (`/viewer`) on `127.0.0.1`; the port is `CLAUDE_MEM_WORKER_PORT` (default `37700 + (uid % 100)`). Memories, sessions and settings are browsable there.

#### Search tools (inside a session)

Claude gets three MCP tools for a token-efficient workflow: `search` (compact index with IDs), `timeline` (context around a result), `get_observations` (full detail for chosen IDs; batch them). Ask in plain words, for example "what did we decide about the auth bug?", and the mem-search skill drives them.

#### Configuration

Settings live in `~/.claude-mem/settings.json`, created on first run, as flat `CLAUDE_MEM_*` keys:

```json
{
  "CLAUDE_MEM_PROVIDER": "claude",
  "CLAUDE_MEM_MODEL": "claude-haiku-4-5-20251001",
  "CLAUDE_MEM_MODE": "code",
  "CLAUDE_MEM_LOG_LEVEL": "INFO"
}
```

`CLAUDE_MEM_PROVIDER` in settings.json accepts `claude`, `codex`, `gemini`, `openrouter` or `openai-compatible`; `CLAUDE_MEM_MODEL` applies to the Claude provider; `CLAUDE_MEM_MODE` sets workflow and output language (`code--zh`, `code--ja`, `code--es`); `CLAUDE_MEM_DATA_DIR` moves the data directory (default `~/.claude-mem`). The `CLAUDE_MEM_CONTEXT_*` keys control how much is injected at session start. Restart Claude Code after changing mode.

Wrap content in your prompts that must not be stored in `<private>...</private>` tags: Claude sees it during the session, but it is not saved as an observation.

### Option B: Claude Subconscious (Letta Background Agent)

**GitHub:** [letta-ai/claude-subconscious](https://github.com/letta-ai/claude-subconscious)

#### Setup

```bash
/plugin marketplace add letta-ai/claude-subconscious
/plugin install claude-subconscious@claude-subconscious
export LETTA_API_KEY="your-api-key"
```

Get your API key from [app.letta.com](https://app.letta.com). For a self-hosted Letta server, also set `LETTA_BASE_URL` (default `https://api.letta.com`) to its address, for example `http://localhost:8283`. Mode is chosen with `LETTA_MODE`.

#### Modes

| `LETTA_MODE` | Behavior | Token Cost |
|------|----------|------------|
| `whisper` (default) | Only the agent's messages are injected | Low |
| `full` | Memory blocks plus messages | Higher |
| `off` | Disabled | None |

### Which to Choose

| | claude-mem | Claude Subconscious |
|---|-----------|-------------------|
| Storage | Local SQLite in ~/.claude-mem/ | Letta cloud or self-hosted |
| Cost | A model call per compression (default Claude Haiku 4.5; hosted observer optional) | Requires a Letta API key or your own Letta server |
| Memory style | Compressed session summaries | Continuous learning agent |
| Best for | Searchable local history | Rich cross-session context |

## Examples

### Example 1: Session Continuity with claude-mem

```console
$ npx claude-mem install --provider claude
$ npx claude-mem status
$ npx claude-mem search "refresh token"
```

Restart Claude Code, work on the auth module, end the session. In the next session the start-up context lists recent observations such as "Implemented JWT refresh-token rotation in auth/session.ts", and you can ask "why did we pick Redis for refresh tokens?" to trigger the search tools.

### Example 2: Architecture Recall with Subconscious

After discussing a REST-to-GraphQL migration, you start a new session:

```text
[subconscious] Last session you decided to switch from REST to GraphQL for the
user service. Migration is 60% done — resolvers for User and Project are complete,
Order and Payment still need conversion. You preferred code-first schema with TypeGraphQL.
```

## Guidelines

- **Pair with CLAUDE.md** — use CLAUDE.md for static project context, persistent memory for dynamic decisions
- **One tool per project** — do not run claude-mem and Subconscious together; both inject memory text into Claude's context and would overlap
- claude-mem sends tool inputs and outputs to the configured provider for compression; use `<private>` tags for secrets, and pick a local or own-key provider if code must not reach the hosted observer
- claude-mem collects anonymous telemetry by default; `npx claude-mem telemetry disable` opts out
- If hooks report `Executable not found in $PATH: "claude-mem"`, run `npx claude-mem install`, restart the terminal, then `npx claude-mem doctor`
- Subconscious is a demo app; for production use Letta Code instead
- Memory quality depends on session length; short sessions yield thin memories
