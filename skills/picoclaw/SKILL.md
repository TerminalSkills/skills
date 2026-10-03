---
name: picoclaw
description: >-
  Set up, configure, and manage PicoClaw — an ultra-lightweight personal AI
  assistant built in Go. Use when the user mentions "picoclaw," "pico claw,"
  "lightweight AI assistant," or wants to deploy a personal AI agent on
  low-resource hardware (Raspberry Pi, RISC-V boards). Covers installation,
  LLM provider configuration, messaging gateway setup (Telegram, Discord,
  Slack, LINE, DingTalk), scheduled tasks, heartbeat, workspace layout,
  security sandbox, and Docker deployment.
license: Apache-2.0
compatibility: "Prebuilt binary for Linux, macOS, Windows or Android; building from source needs Go 1.25+. Docker optional."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags: ["picoclaw", "ai-assistant", "chatbot", "telegram-bot", "iot"]
  repository: "https://github.com/sipeed/picoclaw"
---

# PicoClaw

## Overview

PicoClaw is an open-source (MIT) personal AI assistant from Sipeed, written in Go. It ships as a single binary that runs on small boards (Raspberry Pi, RISC-V, MIPS, even Android) with roughly 10-20 MB of RAM. It talks to 30+ LLM providers through a `model_list` in `~/.picoclaw/config.json`, and bridges chats from Telegram, Discord, Slack, WhatsApp, Matrix, LINE and other channels through a gateway. It also supports MCP servers, installable skills, cron jobs and a heartbeat file. Current release at the time of writing: v0.3.1 (July 2026). The project is pre-1.0 and its config format has changed several times, so check `picoclaw version` and the docs at docs.picoclaw.io when something here does not match.

## Instructions

### 1. Install PicoClaw

**Prebuilt binary (simplest).** Download `picoclaw_Linux_x86_64.tar.gz` (or the arm64, riscv64, macOS or Windows archive) from the [GitHub Releases](https://github.com/sipeed/picoclaw/releases) page together with `picoclaw_<version>_checksums.txt`, and verify before extracting:

```bash
grep Linux_x86_64 picoclaw_0.3.1_checksums.txt | sha256sum -c
tar xzf picoclaw_Linux_x86_64.tar.gz     # gives picoclaw and picoclaw-launcher
```

The archive contains `picoclaw` (CLI and gateway) and `picoclaw-launcher` (browser UI). The official download page is picoclaw.io; other `picoclaw` domains are not affiliated.

**From source** (Go 1.25+, Node 22+ and pnpm only needed for the web launcher):

```bash
git clone https://github.com/sipeed/picoclaw.git
cd picoclaw
make deps
make build      # core binary in build/
make install    # installs to ~/.local/bin
```

**Docker Compose** (the compose file lives in `docker/`, data in `docker/data/`):

```bash
git clone https://github.com/sipeed/picoclaw.git && cd picoclaw
docker compose -f docker/docker-compose.yml --profile launcher up   # first run writes docker/data/config.json, then exits
docker compose -f docker/docker-compose.yml --profile gateway up -d # long-running bot
docker compose -f docker/docker-compose.yml run --rm picoclaw-agent -m "Hello"
```

Profiles: `launcher` (web console on port 18800), `gateway` (bot only), `agent` (one-shot).

### 2. Initial setup

```bash
picoclaw onboard    # creates ~/.picoclaw/config.json, ~/.picoclaw/.security.yml and the workspace
picoclaw status     # shows config path, active model and which providers have keys
```

Alternatively run `picoclaw-launcher` and open http://localhost:18800 (add `-public` to listen on all interfaces). On first visit it asks you to create a dashboard password.

### 3. Configure an LLM provider

Models are declared in `model_list`; `agents.defaults.model_name` picks the default by its `model_name`. The older `providers` block was removed in the v2 config format (old files are migrated automatically).

```json
{
  "agents": { "defaults": { "model_name": "claude-sonnet-4.6", "max_tool_iterations": 20 } },
  "model_list": [
    { "model_name": "claude-sonnet-4.6", "provider": "anthropic", "model": "claude-sonnet-4-6",
      "api_base": "https://api.anthropic.com/v1" }
  ]
}
```

Keep secrets out of `config.json`: `onboard` creates `~/.picoclaw/.security.yml`, whose entries are mapped onto the config by name and override it. Keys must be arrays. Run `chmod 600` on it and never commit it.

```yaml
model_list:
  claude-sonnet-4.6:0:        # model_name plus ":0" for the first entry with that name
    api_keys:
      - "sk-ant-api03-REPLACE-WITH-YOUR-KEY"
```

Providers use the `protocol/model` form in the README (`openai/`, `anthropic/`, `gemini/`, `openrouter/`, `deepseek/`, `groq/`, `zhipu/`, `ollama/`, `vllm/`, `bedrock/`, `azure/`, ...). For a local model: `{ "model_name": "local-llama", "model": "ollama/llama3.1:8b", "api_base": "http://localhost:11434/v1" }` (no key). Switch the default later with `picoclaw model`.

### 4. Chat with the agent

```bash
picoclaw agent -m "Summarize the Go 1.25 release notes"   # single query
picoclaw agent                                              # interactive mode
```

### 5. Set up a messaging gateway

Channels live under `channel_list`. Each has `enabled`, `type` and an `allow_from` list of user IDs (an empty list lets everyone in). Put the bot token in `.security.yml`:

```json
{
  "channel_list": {
    "telegram": { "enabled": true, "type": "telegram", "allow_from": ["198234567"] }
  }
}
```

```yaml
channel_list:
  telegram:
    settings:
      token: "7654321:AAF-REPLACE-WITH-BOTFATHER-TOKEN"
```

Create the Telegram bot with `@BotFather` and read your user ID from `@userinfobot`. Discord needs a bot from discord.com/developers/applications with MESSAGE CONTENT INTENT enabled; Slack uses Socket Mode with `bot_token` (`xoxb-`) and `app_token` (`xapp-`). Per-channel guides are in `docs/channels/<name>/README.md`. Start the gateway:

```bash
picoclaw gateway
```

The gateway listens on `127.0.0.1:18790` by default (`PICOCLAW_GATEWAY_HOST=0.0.0.0` inside Docker). In chat, `/list skills`, `/list mcp` and `/use <skill> <message>` work as slash commands.

### 6. Web search

`tools.web` is enabled by default and Sogou search is on out of the box. Others: `duckduckgo`, `brave`, `tavily`, `kagi`, `perplexity`, `searxng`, `gemini`, `glm_search`, `baidu_search`. Enable one and put its key in `.security.yml` under `web.<engine>.api_keys`:

```json
{ "tools": { "web": { "brave": { "enabled": true, "max_results": 5 }, "duckduckgo": { "enabled": true, "max_results": 5 } } } }
```

### 7. Skills and MCP servers

```bash
picoclaw skills search "web scraping"
picoclaw skills install web-scraper
picoclaw skills list
picoclaw mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /home/pi/notes
picoclaw mcp list
picoclaw mcp test filesystem
```

`picoclaw mcp` only edits `tools.mcp.servers` in the config; it does not run the server. Set `"tools": { "mcp": { "enabled": true } }`. Skills load from `~/.picoclaw/workspace/skills`, `~/.picoclaw/skills` and the built-in set.

### 8. Scheduled tasks and heartbeat

**Heartbeat** reads `~/.picoclaw/workspace/HEARTBEAT.md` every `interval` minutes (default 30, minimum 5) and runs the tasks in it:

```json
{ "heartbeat": { "enabled": true, "interval": 60 } }
```

```markdown
## Quick Tasks
- Report current system uptime

## Long Tasks (use spawn for async)
- Search the web for security advisories and summarize
```

**Cron jobs** from the CLI are recurring only (`--every <seconds>` or `--cron "<expr>"`); one-time reminders are created by asking the agent ("remind me in 10 minutes"):

```bash
picoclaw cron add --name "Daily summary" --message "Summarize today's logs" --cron "0 18 * * *"
picoclaw cron add --name "Ping" --message "heartbeat" --every 300
picoclaw cron list
picoclaw cron disable a5c92bf87ec3b086
picoclaw cron remove a5c92bf87ec3b086
```

### 9. Workspace and security

The workspace (`~/.picoclaw/workspace/`) holds `sessions/`, `memory/` (MEMORY.md), `state/`, `cron/`, `skills/` and the markdown files `AGENT.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `HEARTBEAT.md`. Edits to `AGENT.md`, `SOUL.md`, `USER.md` and `MEMORY.md` are picked up without a restart. `PICOCLAW_HOME` moves the whole data directory and `PICOCLAW_CONFIG` points at another config file.

`agents.defaults.restrict_to_workspace` is `true` by default: file tools and `exec` stay inside the workspace, and subagents and heartbeat tasks inherit this. Even with it off, `exec` blocks patterns such as `rm -rf`, `mkfs`, `dd if=`, `shutdown` and fork bombs (`tools.exec.enable_deny_patterns`). Extra read or write paths go in `tools.allow_read_paths` / `tools.allow_write_paths`.

## Examples

### Example 1: Deploy PicoClaw as a Telegram bot on a Raspberry Pi

**User request:** "Set up PicoClaw on my Raspberry Pi as a Telegram bot using Claude"

1. On the Pi (64-bit OS), download and verify the release, then initialise:

```bash
cd ~ && mkdir picoclaw-bin && cd picoclaw-bin
curl -LO https://github.com/sipeed/picoclaw/releases/download/v0.3.1/picoclaw_Linux_arm64.tar.gz
curl -LO https://github.com/sipeed/picoclaw/releases/download/v0.3.1/picoclaw_0.3.1_checksums.txt
grep Linux_arm64 picoclaw_0.3.1_checksums.txt | sha256sum -c
tar xzf picoclaw_Linux_arm64.tar.gz && ./picoclaw onboard
```

2. In `~/.picoclaw/config.json` set `agents.defaults.model_name` to `claude-sonnet-4.6`, make sure that entry is in `model_list`, and enable Telegram with `"allow_from": ["198234567"]` under `channel_list.telegram`.
3. In `~/.picoclaw/.security.yml` add the Anthropic key under `model_list.claude-sonnet-4.6:0.api_keys` and the BotFather token under `channel_list.telegram.settings.token`, then `chmod 600 ~/.picoclaw/.security.yml`.
4. Check and start:

```bash
./picoclaw status     # Model: claude-sonnet-4.6, Anthropic API: ✓
./picoclaw gateway
```

Result: the bot answers messages from user 198234567 in Telegram; other users are ignored.

### Example 2: Run PicoClaw with Docker Compose and Discord

**User request:** "Run PicoClaw in Docker with Discord and send me a summary every evening"

```bash
git clone https://github.com/sipeed/picoclaw.git && cd picoclaw
docker compose -f docker/docker-compose.yml --profile launcher up   # generates docker/data/config.json
```

Edit `docker/data/config.json` (enable `channel_list.discord` with `"allow_from": ["987654321012345678"]`, add a model), put the keys in `docker/data/.security.yml`, then:

```bash
docker compose -f docker/docker-compose.yml --profile gateway up -d
docker compose -f docker/docker-compose.yml logs -f picoclaw-gateway
```

Then, in a Discord direct message from the allowed user, ask: "Every day at 18:00 summarize today's activity and send it to me". The agent creates the job with its `cron` tool; check it in the launcher or with `picoclaw cron list` against the same data directory.

Result: the gateway restarts with the container and the job is stored in the workspace under `cron/`.

## Guidelines

- Always set `allow_from` to specific user IDs; an empty list lets anyone who finds the bot talk to an agent that can run commands.
- Only one gateway can use a bot token at a time; a second one causes Telegram "terminated by other getUpdates request" conflicts.
- PicoClaw is pre-1.0 and the project itself warns against production use with sensitive data. Recent builds can use 10-20 MB of RAM, not the 10 MB in older claims.
- Do not copy config snippets from older blog posts: `providers`, top-level `channels` and `model` fields written as `anthropic/claude-sonnet-4-5-...` belong to older formats. Use the files `picoclaw onboard` generates as the reference, and `picoclaw update` to upgrade the binary (`picoclaw migrate` imports data from OpenClaw-style projects).
- Command cron jobs can run shell commands. Leave `tools.cron.command_allowed_remotes` empty so chat users cannot schedule them, and never set it to `"*"`.
- Groq-configured Whisper transcription turns voice messages from channels into text automatically.
- Environment variables override config values with the `PICOCLAW_<SECTION>_<KEY>` pattern, for example `PICOCLAW_HEARTBEAT_INTERVAL=60` or `PICOCLAW_LOG_LEVEL=info`.
- Disabling `restrict_to_workspace` gives the agent access to your whole filesystem; do that only in a throwaway container.
