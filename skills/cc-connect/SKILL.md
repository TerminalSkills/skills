---
name: cc-connect
description: >-
  Bridge local AI coding agents (Claude Code, Cursor, Gemini CLI, Codex) to messaging
  platforms (Slack, Telegram, Discord). Use when: controlling AI agents from team chat,
  sending coding tasks via Slack/Telegram, building team-accessible AI workflows.
license: Apache-2.0
compatibility: "Node.js with npm (or Homebrew), plus an authenticated agent CLI"
metadata:
  author: terminal-skills
  repository: "https://github.com/chenhg5/cc-connect"
  version: "2.0.0"
  category: automation
  tags: "ai-agents, messaging, slack, telegram, bridge"
---

# CC-Connect

## Overview

[cc-connect](https://github.com/chenhg5/cc-connect) (npm package `cc-connect`, a Go binary distributed through npm, Homebrew and GitHub releases) relays chat messages to an AI coding agent CLI running on your machine and sends the replies back. Agents: Claude Code, Codex, Cursor Agent, Gemini CLI, Qoder CLI, OpenCode. Platforms: Slack, Telegram, Discord, Feishu, DingTalk, LINE, WeChat Work, QQ and more. Slack, Telegram and Discord need no public IP (Socket Mode, long polling, gateway).

**Architecture:** chat platform <-> cc-connect (on your machine) <-> agent CLI in a project directory.

Configuration is a **TOML** file, `~/.cc-connect/config.toml` (or `./config.toml`, or `--config <path>`). There is no `cc-connect.yaml`, `init` or `start` command.

## Instructions

### Installation

Install and authenticate the agent CLI first; cc-connect exits with `claude CLI not found in PATH` otherwise.

```bash
npm install -g @anthropic-ai/claude-code   # then run `claude` once to sign in
npm install -g cc-connect                  # or: brew install cc-connect
cc-connect --version
```

Upgrade with `npm install -g cc-connect`, `brew upgrade cc-connect` or `cc-connect update` (`--pre` for betas).

### Configuration

The first run of `cc-connect` creates `~/.cc-connect/config.toml` and prints a Web admin URL (default `http://localhost:9820`) where you can add projects and platform tokens; changes hot-reload. `cc-connect config example` prints the full annotated file. By hand, a project is an agent plus one or more platforms:

```toml
[log]
level = "info"

[[projects]]
name = "my-backend"
admin_from = "U0123ABCD"     # may run /dir, /shell, /restart, /upgrade, /cron addexec

[projects.agent]
type = "claudecode"          # also: codex, cursor, gemini, qoder, opencode

[projects.agent.options]
work_dir = "/home/dev/my-backend"
mode = "default"             # default | acceptEdits | plan | auto | bypassPermissions | dontAsk

[[projects.platforms]]
type = "telegram"

[projects.platforms.options]
token = "<bot token from @BotFather>"
allow_from = "198274563"     # comma-separated user IDs; "*" lets everyone in
```

`admin_from` belongs under `[[projects]]`, not under platform options. Send `/whoami` to the bot to learn your user ID. Run several projects by repeating `[[projects]]`; each has its own agent, directory and platforms.

### Platform setup

**Slack** (Socket Mode, full guide: `docs/slack.md` in the repo):
1. Create an app at api.slack.com/apps (From scratch).
2. Bot Token Scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`, `users:read`; add `channels:history` / `groups:history` for plain channel messages.
3. Enable Socket Mode and generate an app-level token with `connections:write` (`xapp-...`).
4. Event Subscriptions: bot events `app_mention`, `message.im` (and `message.channels` for channels).
5. Install to the workspace and copy the Bot User OAuth Token (`xoxb-...`).

```toml
[[projects.platforms]]
type = "slack"

[projects.platforms.options]
bot_token = "xoxb-..."
app_token = "xapp-..."
allow_from = "U0381KDLS,U0492JFMA"   # Slack user IDs
session_scope = "thread"             # "user" (default) | "channel" | "thread"
```

**Telegram:** create a bot with @BotFather and put its token in `token`. Long polling, nothing to expose.

**Discord:** create an application and bot at discord.com/developers, enable the Message Content intent, invite the bot, and follow `docs/discord.md` for the option names.

### Running

```bash
cc-connect                          # foreground, uses the default config path
cc-connect --config ./config.toml   # explicit file
cc-connect daemon install           # run as a systemd/launchd service
cc-connect daemon status
cc-connect daemon logs -f
```

### Chat commands

```
/new [name]  /list  /switch <id>  /current    sessions
/dir [path|reset]                            show or switch work directory (admin)
/mode [yolo|default]                         permission mode
/model, /provider list|switch <name>         model and API provider
/cron add 0 9 * * 1-5 <prompt>               scheduled agent task
/whoami, /status                             your user ID, project status
```

Sessions rotate automatically after 30 idle minutes (`reset_on_idle_mins` on the project; `0` disables); old ones stay available through `/list` and `/switch`. Auto-compaction is `[projects.auto_compress]` with `enabled = true`.

## Examples

### Example 1: Team code review in Slack

```toml
[[projects]]
name = "acme-api"
admin_from = "U0381KDLS"

[projects.agent]
type = "claudecode"

[projects.agent.options]
work_dir = "/home/dev/acme-api"
mode = "plan"                # the agent proposes, nothing runs until approved

[[projects.platforms]]
type = "slack"

[projects.platforms.options]
bot_token = "xoxb-..."
app_token = "xapp-..."
allow_from = "U0381KDLS,U0492JFMA"
session_scope = "thread"     # each Slack thread is its own agent session
```

Invite the bot to the channel (`/invite @cc_connect`) and write `@cc_connect Review the auth module for SQL injection risks`. The answer comes back in the thread.

### Example 2: Daily standup summary in Telegram

Use the Telegram project from the configuration section, then in the chat with the bot:

```
/cron add 0 9 * * 1-5 Summarize yesterday's git commits and open PRs, highlight blockers
```

Every weekday at 09:00 the agent runs in `work_dir` and the summary arrives in that chat. Manage jobs from a shell with `cc-connect cron list`, `cc-connect cron del <id>`. Set `[cron] session_mode = "new_per_run"` so each run starts without the previous run's context.

## Guidelines

- Never leave `allow_from = "*"` on a bot that can run code; list user IDs.
- Prefer `mode = "default"`, `plan` or `dontAsk`; `bypassPermissions` ("yolo") lets any allowed chat user run arbitrary tools on your machine.
- The config file holds bot tokens: keep it out of git and readable only by you (`chmod 600`).
- Start with one platform and one project before adding more.
- Use `session_scope = "thread"` in Slack to keep conversations separate.
- If the bot does not answer, check `cc-connect daemon logs -f` (or the foreground output) for the agent CLI or token error.
- The Web admin listens on port 9820; do not expose it to the internet.
- Full reference: the [repository README](https://github.com/chenhg5/cc-connect) and `config.example.toml`.
