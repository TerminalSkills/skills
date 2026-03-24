---
title: Bridge AI Coding Agents to Team Chat
slug: bridge-ai-coding-to-team-chat
description: Connect AI coding agents to Slack or Telegram so your whole team can send coding tasks from chat.
skills:
  - cc-connect
  - slack-bot-builder
category: automation
tags:
  - ai-agents
  - slack
  - telegram
  - team-chat
  - bridge
---

# Bridge AI Coding Agents to Team Chat

## The Problem

Your AI coding agent lives in a terminal on one developer's laptop. The rest of the team lives in Slack. Every time someone needs AI help with code, they ping the one person who knows the CLI. Knowledge bottlenecks form, the agent sits idle most of the day, and non-technical team members cannot access it at all.

## The Solution

Use CC-Connect to bridge your local AI coding agent to Slack or Telegram. Anyone on the team can send a message in a dedicated channel, and the agent processes the request and replies in the thread. No terminal access required.

## Step-by-Step Walkthrough

### Step 1: Install and Configure CC-Connect

```bash
npm install -g cc-connect
cc-connect init
```

The init wizard walks through platform selection and credentials. For Slack, you need a Slack App with Socket Mode enabled and bot token scopes (`chat:write`, `app_mentions:read`, `messages.im`).

### Step 2: Create the Configuration

```yaml
# cc-connect.yaml
agent:
  type: claude-code
  workdir: /home/dev/acme-api

platform:
  type: slack
  app_token: "xapp-1-A07QX4R..."
  bot_token: "xoxb-8234567890-..."
  channels: ["#ai-agent"]

session:
  timeout: 10m
  auto_compress: true

access:
  allowed_channels: ["#ai-agent"]
  allowed_users: ["U0381KDLS", "U0492JFMA", "U0593KGNB"]
```

### Step 3: Start the Bridge

```bash
cc-connect start
```

The bridge connects your local Claude Code instance to Slack. Messages in `#ai-agent` are routed to the agent, and responses appear in the thread.

### Step 4: Set Up Access Controls

Restrict who can use the agent and add scheduled tasks:

```yaml
cron:
  - schedule: "0 9 * * 1-5"
    command: "Summarize open PRs and highlight any that have been waiting more than 2 days"
    platform: slack
    channel: "#ai-agent"
    timeout: 5m
    fresh_session: true
```

## Real-World Example

Marcus, a senior developer at a 12-person startup, sets up CC-Connect bridging Claude Code to the team's `#ai-agent` Slack channel. On Monday morning, a product manager types: `@agent What are the open PRs for the billing module? Any security concerns?`. Claude Code scans the repo, finds 3 open PRs, and replies in the thread with a summary and one flagged SQL injection risk in PR #87. The PM forwards the thread to the author without ever opening a terminal. By week two, the team sends 15-20 requests per day through the channel — code reviews, test generation, and documentation drafts — and Marcus is no longer the bottleneck.

## Related Skills

- [cc-connect](/skills/cc-connect) — The bridge tool connecting agents to messaging platforms
- [slack-bot-builder](/skills/slack-bot-builder) — Build custom Slack bots and integrations
