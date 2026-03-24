---
name: cc-connect
description: >-
  Bridge local AI coding agents (Claude Code, Cursor, Gemini CLI, Codex) to messaging
  platforms (Slack, Telegram, Discord). Use when: controlling AI agents from team chat,
  sending coding tasks via Slack/Telegram, building team-accessible AI workflows.
license: MIT
compatibility: "Node.js 18+ or Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: [ai-agents, messaging, slack, telegram, bridge]
---

# CC-Connect

## Overview

CC-Connect bridges AI coding agents running on your local machine to the messaging platforms your team already uses. Code review, research, automation, data analysis — anything an AI agent can do, now accessible from your phone, tablet, or any device with a chat app.

**Architecture:** Your local AI agent <-> CC-Connect bridge <-> Messaging platform (Slack/Telegram/Discord/etc.)

Send a message in Slack, CC-Connect routes it to your local Claude Code instance, the agent does the work, and the response comes back to your chat.

## Instructions

### Installation

```bash
npm install -g cc-connect
```

### Configuration

Create a `cc-connect.yaml` in your project:

```yaml
agent:
  type: claude-code  # or: codex, gemini, cursor
  workdir: /path/to/your/project

platform:
  type: telegram  # or: slack, discord, feishu, dingtalk
  token: "your-bot-token"
```

### Platform Setup

**Telegram:** Create a bot via @BotFather, get the bot token, and add it to your config.

**Slack:** Create a Slack App at api.slack.com/apps, enable Socket Mode and Event Subscriptions, add Bot Token Scopes (`chat:write`, `app_mentions:read`, `messages.im`), and install to your workspace.

**Discord:** Create an application at discord.com/developers, create a bot, enable Message Content Intent, and invite the bot to your server.

### Starting the Bridge

```bash
cc-connect init    # Interactive wizard for platform credentials
cc-connect start   # Start routing messages
```

### Session Management

```yaml
session:
  timeout: 30m
  max_concurrent: 3
  continue: true
  auto_compress: true
```

### Multi-Agent Routing

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
```

### Access Control

```yaml
access:
  allowed_users: ["U123", "U456"]
  allowed_channels: ["C789"]
  admin_users: ["U123"]
```

## Examples

### Example 1: Team Code Review via Slack

A team sets up CC-Connect to allow engineers to request code reviews from Slack:

```yaml
# cc-connect.yaml
agent:
  type: claude-code
  workdir: /home/dev/acme-api

platform:
  type: slack
  app_token: "xapp-1-A07QX4R..."
  bot_token: "xoxb-8234567890-..."
  channels: ["#code-review"]

session:
  timeout: 10m
  auto_compress: true

access:
  allowed_channels: ["#code-review"]
  allowed_users: ["U0381KDLS", "U0492JFMA"]
```

In Slack `#code-review`, an engineer types: `@agent Review the auth module for SQL injection risks`. Claude Code analyzes the code and responds in the thread with findings.

### Example 2: Scheduled Daily Reports via Telegram

A solo developer configures CC-Connect with cron jobs for automated daily standup reports:

```yaml
agent:
  type: claude-code
  workdir: /home/dev/saas-app

platform:
  type: telegram
  token: "7284619035:AAF-kLm9xPqR..."
  allowed_users: ["198274563"]

cron:
  - schedule: "0 9 * * 1-5"
    command: "Summarize yesterday's git commits and open PRs, highlight blockers"
    platform: telegram
    timeout: 5m
    fresh_session: true
```

Every weekday at 9am, the agent generates a summary of recent activity and sends it to the developer's Telegram chat.

## Guidelines

- Start with one messaging platform and get it working before expanding to others
- Always set `allowed_users` in production to restrict access
- Use threads in Slack/Discord to keep conversations organized
- Set `session.timeout` to prevent runaway agent sessions consuming resources
- Enable `auto_compress` for long conversations to prevent context overflow
- Use `fresh_session: true` for cron jobs to avoid inherited context from previous runs
- Verify your setup with `cc-connect status` if messages are not routing
- See the [GitHub Repository](https://github.com/chenhg5/cc-connect) for full documentation
