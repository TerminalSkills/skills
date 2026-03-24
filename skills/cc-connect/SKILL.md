---
name: cc-connect
description: >-
  Bridge local AI coding agents (Claude Code, Cursor, Gemini CLI, Codex) to messaging
  platforms (Slack, Telegram, Discord, Feishu, DingTalk). Use when: controlling AI agents
  from team chat, sending coding tasks via Slack/Telegram, building team-accessible AI workflows.
license: MIT
compatibility: "Node.js 18+ or Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: [ai-agents, messaging, slack, telegram, discord, bridge, team-chat]
  use-cases:
    - "Send coding tasks to Claude Code from a Slack channel"
    - "Control AI coding agents from Telegram for remote development"
    - "Build a team AI assistant accessible from any messaging platform"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# CC-Connect

## Overview

CC-Connect bridges AI coding agents running on your local machine to the messaging platforms your team already uses. Code review, research, automation, data analysis — anything an AI agent can do, now accessible from your phone, tablet, or any device with a chat app.

**Architecture:** Your local AI agent ↔ CC-Connect bridge ↔ Messaging platform (Slack/Telegram/Discord/etc.)

Send a message in Slack, CC-Connect routes it to your local Claude Code instance, the agent does the work, and the response comes back to your chat.

## Supported Platforms

| Platform | Status | Features |
|----------|--------|----------|
| **Telegram** | ✅ Stable | Text, voice replies, file sharing |
| **Slack** | ✅ Stable | Text, threads, file sharing |
| **Discord** | ✅ Stable | Text, @mentions, file sharing |
| **Feishu** | ✅ Stable | Text, reply threading |
| **DingTalk** | ✅ Stable | Text, group chat |
| **LINE** | ✅ Stable | Text, media |
| **WeCom** | ✅ Stable | Enterprise messaging |
| **Weixin** | ✅ Beta | Personal WeChat via ilink |
| **QQ** | ⚠️ Via NapCat | Unofficial bridge |

## Prerequisites

- Node.js 18+ or Go 1.21+
- A running AI coding agent (Claude Code, Codex, Gemini CLI, Cursor)
- API credentials for your messaging platform (bot token, webhook URL, etc.)

## Installation

```bash
# Via npm
npm install -g cc-connect

# Or download binary from GitHub releases
# https://github.com/chenhg5/cc-connect/releases
```

## Quick Start

### 1. Configure your messaging platform

```bash
cc-connect init
```

Follow the interactive wizard to set up your platform credentials.

### 2. Configure your AI agent

```yaml
# cc-connect.yaml
agent:
  type: claude-code  # or: codex, gemini, cursor
  workdir: /path/to/your/project
  
platform:
  type: telegram  # or: slack, discord, feishu, dingtalk, line, wecom
  token: "your-bot-token"
```

### 3. Start the bridge

```bash
cc-connect start
```

Now send messages from your chat app and they'll be routed to your local AI agent.

## Platform Setup

### Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Get your bot token
3. Configure:

```yaml
platform:
  type: telegram
  token: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
  allowed_users: ["your_telegram_id"]  # Optional: restrict access
```

### Slack

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable Socket Mode and Event Subscriptions
3. Add Bot Token Scopes: `chat:write`, `app_mentions:read`, `messages.im`
4. Install to workspace

```yaml
platform:
  type: slack
  app_token: "xapp-..."
  bot_token: "xoxb-..."
  channels: ["#ai-agent"]  # Optional: restrict to channels
```

### Discord

1. Create an application at [discord.com/developers](https://discord.com/developers)
2. Create a bot, get token
3. Enable Message Content Intent
4. Invite bot to your server

```yaml
platform:
  type: discord
  token: "your-discord-bot-token"
  guild_id: "your-server-id"  # Optional
```

## Command Routing

CC-Connect routes messages from chat to your AI agent and returns responses:

```
User (Slack):  "Review the auth module for security issues"
  → CC-Connect → Claude Code → analyzes code → 
Claude Code:   "Found 3 issues: 1. SQL injection in login..."
  → CC-Connect → Slack
User (Slack):  receives the response
```

### Message Handling

- **Direct messages:** Routed immediately to the agent
- **Channel mentions:** `@agent review this PR` triggers the agent
- **Threads:** Responses maintain thread context
- **Files:** Agents can receive and send files through the bridge

### Session Management

```yaml
# cc-connect.yaml
session:
  timeout: 30m          # Auto-close idle sessions
  max_concurrent: 3     # Limit parallel sessions
  continue: true        # Resume previous session context
  auto_compress: true   # Compress context when it gets too large
```

## Advanced Configuration

### Cron Jobs

Schedule recurring tasks via chat:

```yaml
cron:
  - schedule: "0 9 * * 1-5"  # Weekdays at 9am
    command: "Run daily code review on recent PRs"
    platform: slack
    channel: "#engineering"
    timeout: 10m  # Per-job timeout
    fresh_session: true  # Clean session each run
```

### Multi-Agent Setup

Route different commands to different agents:

```yaml
agents:
  code-review:
    type: claude-code
    workdir: /path/to/project
    trigger: "!review"
    
  research:
    type: gemini
    trigger: "!research"
    
  quick-fix:
    type: codex
    workdir: /path/to/project
    trigger: "!fix"
```

### Access Control

Restrict who can use the bridge:

```yaml
access:
  allowed_users: ["U123", "U456"]
  allowed_channels: ["C789"]
  admin_users: ["U123"]  # Can change config via chat
```

## Tips

- **Start with one platform**: Get Telegram or Slack working first, then expand
- **Restrict access**: Always set `allowed_users` in production
- **Use threads**: Keep conversations organized in Slack/Discord threads
- **Set timeouts**: Prevent runaway agent sessions with `session.timeout`
- **Auto-compress**: Enable for long conversations to prevent context overflow
- **Fresh sessions for cron**: Use `fresh_session: true` to avoid inherited context

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot not responding | Check `cc-connect status`, verify token |
| Messages not routing | Verify `allowed_users`/`allowed_channels` config |
| Agent timeout | Increase `session.timeout` or check agent health |
| Context too large | Enable `auto_compress` or start fresh session |
| Platform rate limits | CC-Connect handles rate limiting automatically |

## Resources

- [GitHub Repository](https://github.com/chenhg5/cc-connect)
- [Discord Community](https://discord.gg/kHpwgaM4kq)
- [Telegram Group](https://t.me/+odGNDhCjbjdmMmZl)
- [中文文档](https://github.com/chenhg5/cc-connect/blob/main/README.zh-CN.md)
