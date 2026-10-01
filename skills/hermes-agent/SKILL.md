---
name: hermes-agent
description: >-
  Hermes Agent is Nous Research's open-source self-improving AI agent: a terminal and
  messaging-gateway agent that saves memories, writes and patches its own skills from
  experience, and searches its past sessions. Use when a user asks to install or configure
  Hermes Agent, pick its model provider, inspect or gate what it learns (memory, skills,
  background review, curator), embed it in Python, or build a self-improving AI agent or
  adaptive assistant that improves with usage.
license: Apache-2.0
compatibility: "Linux, macOS (Apple Silicon), WSL2, Windows or Docker; Git and uv for a source install; a model with at least 64K context"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/NousResearch/hermes-agent
  tags: [agents, self-improving, hermes, adaptive, learning]
---

# Hermes Agent — Self-Improving AI Agents

## Overview

[Hermes Agent](https://github.com/NousResearch/hermes-agent) (MIT, Nous Research) is a tool-calling agent you run as a CLI/TUI (`hermes`), as a gateway for Telegram, Discord, Slack and other chats, or embed in Python. It works with any provider (Nous Portal, OpenRouter, Anthropic, OpenAI, local OpenAI-compatible endpoints). What sets it apart is a built-in learning loop that **grows with usage** — you configure and supervise it rather than build it.

### Core Concepts

- **Memory layer**: two small files injected into every system prompt — `MEMORY.md` (environment facts, conventions, lessons; 2,200 chars) and `USER.md` (who you are and how you like to work; 1,375 chars). The agent edits them with its `memory` tool.
- **Skills (procedural memory)**: after working out a non-trivial workflow, or after you correct it, the agent saves a `SKILL.md` under `~/.hermes/skills/` with its `skill_manage` tool and patches it when it goes stale.
- **Self-reflection loop**: a background review runs after a turn and decides whether anything is worth saving as memory or as a skill. Periodic nudges remind the agent mid-session.
- **Session search**: every session is stored in SQLite (`~/.hermes/state.db`, FTS5); the agent searches it when you refer to earlier work.
- **Curator**: periodic maintenance that marks unused agent-written skills stale and archives them.
- **Identity**: `~/.hermes/SOUL.md` is the persona at the top of the system prompt; you edit it by hand.

```
User message -> [SOUL.md + MEMORY.md + USER.md + skill index] -> agent turn (tools, skills)
     -> [background review] -> memory tool / skill_manage -> visible from the next session
```

## Instructions

### 1. Install

The project's one-line installer pipes a script into a shell. Prefer one of these:

```bash
# A. Docker (officially supported image; state lives in the mounted directory)
mkdir -p ~/.hermes
docker run -it --rm -v ~/.hermes:/opt/data nousresearch/hermes-agent:v2026.9.24 setup   # first-run wizard
docker run -it --rm -v ~/.hermes:/opt/data nousresearch/hermes-agent:v2026.9.24         # chat

# B. From a release tag with uv (needs Git and uv; Python 3.11–3.13)
git clone --depth 1 --branch v2026.9.24 https://github.com/NousResearch/hermes-agent.git ~/.hermes/hermes-agent
cd ~/.hermes/hermes-agent
uv venv ~/.hermes/venvs/hermes --python 3.12          # keep the venv outside the checkout
VIRTUAL_ENV=~/.hermes/venvs/hermes uv pip install -e .  # must be editable; a plain install is refused
mkdir -p ~/.local/bin && ln -s ~/.hermes/venvs/hermes/bin/hermes ~/.local/bin/hermes   # ~/.local/bin must be on PATH
hermes --version                                      # Hermes Agent v0.21.5 (2026.9.24)
```

On macOS and Windows the Hermes Desktop installer from https://hermes-agent.nousresearch.com/ installs the CLI too. PyPI (`pip install hermes-agent`) and Homebrew builds are listed as unsupported.

### 2. Choose a Provider and Model

```bash
hermes setup                      # full wizard; or `hermes model` for provider + model only
# Non-interactive: secrets go to ~/.hermes/.env, settings to ~/.hermes/config.yaml
hermes config set OPENROUTER_API_KEY "$OPENROUTER_API_KEY"
hermes config set model.provider openrouter
hermes config set model.default anthropic/claude-sonnet-4.6
hermes doctor                     # checks packages, config and credentials
```

### 3. Chat, Resume, Script

```bash
hermes                            # classic CLI; `hermes --tui` for the newer TUI
hermes -c                         # resume the most recent session
hermes chat -q "Summarize what changed in this repo since v2.3.0" -Q    # one query, then exit; prints the answer and a session line
hermes -z "List the failing tests and the likely cause"                 # prints only the final answer; command approvals are bypassed
hermes profile create research --no-skills    # isolated instance: own memory, skills, sessions
hermes -p research                # use it
```

In a session: `/new` starts a fresh session, `/model` switches model, `/skills` browses skills, `/compress` shrinks context, `/usage` shows spend.

### 4. Memory

```bash
cat ~/.hermes/memories/MEMORY.md ~/.hermes/memories/USER.md   # entries are separated by a line with §
hermes journey list               # everything learned: skill names plus ids like memory:profile:1
hermes journey edit memory:profile:1   # fix a wrong entry in $EDITOR (or: hermes journey delete)
```

```yaml
# ~/.hermes/config.yaml
memory:
  memory_enabled: true
  user_profile_enabled: true
  memory_char_limit: 2200
  user_char_limit: 1375
  nudge_interval: 10        # remind the agent to consider saving every N user turns (0 = off)
  write_approval: false     # true = you approve every save
```

Memory is a frozen snapshot taken at session start: something saved now shows up in the *next* session. A fact counts as saved only when the `memory` tool ran — check the file.

### 5. Skills and the Learning Loop

```bash
hermes skills list                # bundled, hub-installed and agent-written skills
hermes skills search kubernetes   # search the registries; then: hermes skills inspect / install
hermes curator status             # usage stats, stale/archived counts
hermes curator run --dry-run      # preview what the curator would archive
hermes curator pin deploy-staging # never auto-archive or rewrite this skill
```

Inside a chat, `/learn` turns material or the workflow you just walked through into a skill:

```
/learn how I just deployed the staging server
/learn https://docs.stripe.com/webhooks
```

```yaml
# ~/.hermes/config.yaml
skills:
  creation_nudge_interval: 15     # every N tool iterations, consider saving a skill (0 = off)
  write_approval: false           # true = stage every skill write for review
auxiliary:
  background_review:
    enabled: true                 # false = no automatic post-turn review
    provider: openrouter          # run the review on a cheaper model than the main one
    model: google/gemini-3-flash-preview
curator:
  enabled: true
  stale_after_days: 14
  archive_after_days: 30
  consolidate: false              # true = LLM pass that merges overlapping skills
```

### 6. Review What It Learns

```bash
hermes config set memory.write_approval true
hermes config set skills.write_approval true
```

With the gates on, every skill write is staged; memory writes prompt inline in the interactive CLI and are staged when they come from the background review, gateways or scripts. Review staged writes in any session (ids are 8 hex characters, shown by `pending`):

```
/memory pending          /memory approve all        /memory reject e6bb2a11
/skills pending          /skills diff 9c41d07a      /skills approve 9c41d07a
```

### 7. Embed in Python

Run with the interpreter of the install (`~/.hermes/venvs/hermes/bin/python triage.py`); the same provider keys and `~/.hermes` state apply.

```python
from run_agent import AIAgent

agent = AIAgent(
    model="anthropic/claude-sonnet-4.6",
    quiet_mode=True,                 # no spinners or banners in your program's output
    disabled_toolsets=["terminal"],  # or enabled_toolsets=["web"] for a locked-down agent
)
print(agent.chat("Draft a reply to the ticket about duplicate invoice emails"))

first = agent.run_conversation("My ticket is INV-2291")          # dict: final_response, messages
second = agent.run_conversation("Which ticket did I mention?", conversation_history=first["messages"])
print(second["final_response"])
```

Pass `skip_memory=True` for stateless batch workers so they do not write to the shared memory files.

## Examples

### Example 1: Agent Learns Code Style Preferences

**User request:** "Hermes keeps writing verbose Python with comments everywhere. Make it remember how I like code."

Tell it once, explicitly, and confirm the write landed:

```
❯ Remember: I want type hints, no inline comments, and short lambda variable names in Python.
❯ /new
```

```bash
$ cat ~/.hermes/memories/USER.md
Prefers concise Python: type hints, no inline comments, single-letter lambda variables.
§
Works on a data pipeline that reads from AWS S3.
```

The next session starts with that block in its system prompt, so "write a function to batch-process S3 objects" comes back in the preferred style without being asked. If the file did not change, the model only *said* it saved — repeat with "use the memory tool to save …" or switch to a model with stronger tool calling.

### Example 2: Agent Remembers Project Context Across Sessions, With Approval

**User request:** "I want Hermes to learn our staging deploy and remember project facts, but nothing gets saved without my OK."

```bash
$ hermes config set memory.write_approval true
✓ Set memory.write_approval = True in /home/dana/.hermes/config.yaml
$ hermes config set skills.write_approval true
✓ Set skills.write_approval = True in /home/dana/.hermes/config.yaml
```

Walk the agent through one deploy, then in the same session:

```
/learn how I just deployed the staging server
/skills pending
/skills approve all
/memory pending
/memory approve all
```

A week later, in a new session, "deploy staging again" loads the saved skill, and "what did we decide about the invoice schema?" is answered from session search. `hermes journey list` shows the skill and the memory entries; `hermes curator pin` protects the skill from archiving.

## Guidelines

- **Create session boundaries**: memory and skills pay off when a session ends. On gateways a chat is one endless session — run `/new` after a finished task.
- **Keep memory small**: the limits are hard; when full, the `memory` tool returns an error and the agent must consolidate. Put long procedures in skills, not memory.
- **One agent per Hermes home**: two processes writing the same `~/.hermes` corrupt each other's memory. Use `hermes profile create` for a second agent.
- **Gate writes when stakes are high**: `write_approval` for memory and skills stops a wrong assumption from becoming permanent; memory entries are also scanned for prompt-injection patterns before they are accepted.
- **Review cost**: the background review replays the conversation; route `auxiliary.background_review` to a cheaper model or disable it on busy hosts.
- **Command approval**: `approvals.mode` is `smart` by default; `--yolo`, `hermes -z` and `approvals.mode: off` remove every prompt — only inside a container or VM. `hermes config set terminal.backend docker` runs the agent's shell commands in a sandbox container.
- **Do not expose it**: the web dashboard and the OpenAI-compatible API server (port 8642) drive an agent with shell access. The dashboard refuses a non-loopback bind without an auth provider and the API server needs `API_SERVER_KEY`; keep both off the public internet.
- **Models**: at least 64K context is required; small local models often claim to have saved something without calling the tool.
- **Not a library on PyPI**: install from the repository, the Docker image or the Desktop installer; update a source install by checking out the next tag and re-running `uv pip install -e .`.
