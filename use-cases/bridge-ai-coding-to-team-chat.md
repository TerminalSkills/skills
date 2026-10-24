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

Use [cc-connect](https://github.com/chenhg5/cc-connect) to bridge a coding agent running on a machine you control (Claude Code, Codex, Gemini CLI, Cursor and others) to Slack or Telegram. Anyone you allow can message the bot, and the agent replies in the chat. Both platforms connect outbound (Slack Socket Mode, Telegram long polling), so the machine needs no public IP, domain or reverse proxy.

Because the agent can read and change code and run commands on that machine, treat access control as part of the setup, not an afterthought.

## Step-by-Step Walkthrough

### Step 1: Install cc-connect

```bash
npm install -g cc-connect
```

Homebrew (`brew install cc-connect`) and release binaries from the GitHub releases page work too. Claude Code must already be installed and logged in on the same machine.

### Step 2: Create the Slack app

At [api.slack.com/apps](https://api.slack.com/apps) choose Create New App, From scratch, then:

1. OAuth & Permissions, Bot Token Scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`, `users:read`. Add `channels:history` and `groups:history` only if the bot should read channel messages without being mentioned.
2. Socket Mode: enable it and generate an app-level token with the `connections:write` scope (it starts with `xapp-`).
3. Event Subscriptions: enable events (no Request URL is needed in Socket Mode) and subscribe to the bot events `app_mention` and `message.im`.
4. Install App, Install to Workspace, and copy the Bot User OAuth Token (it starts with `xoxb-`).

After changing scopes or events, reinstall the app or the change does not take effect.

### Step 3: Write the configuration

cc-connect reads TOML from `~/.cc-connect/config.toml` (or `cc-connect -config <path>`). The first run creates the file, and `cc-connect web` opens an optional admin UI. Keep the tokens out of the file you commit; paste them in on the machine that runs the bridge.

```toml
[[projects]]
name = "acme-api"
# Privileged commands (/dir, /shell, /restart, /upgrade) are blocked
# unless the user is listed here. Never use "*".
admin_from = "U0381KDLS"

[projects.agent]
type = "claudecode"

[projects.agent.options]
work_dir = "/home/dev/acme-api"
mode = "default"   # every tool call asks for approval; "plan" and "acceptEdits" are stricter or looser

[[projects.platforms]]
type = "slack"

[projects.platforms.options]
bot_token = "xoxb-..."          # from Install App
app_token = "xapp-..."          # from Socket Mode
allow_from = "U0381KDLS,U0492JFMA,U0593KGNB"   # Slack member IDs allowed to talk to the agent
session_scope = "thread"        # one agent session per Slack thread
```

Leaving `allow_from` at its default of `"*"` lets everyone who can reach the bot run your agent on your machine. Members find their ID in their Slack profile, or by sending `/whoami` to the bot.

### Step 4: Start the bridge

```bash
cc-connect
```

You should see `slack: connected` and `platform started` in the log. Invite the bot to the channel with `/invite @cc-connect` and mention it: `@cc-connect which PRs touch the billing module?`. With the default `mode = "default"`, the bot asks in chat before it runs a tool, and you reply `allow` to approve.

### Step 5: Schedule recurring tasks

Scheduled prompts are created from chat with a slash command, in the channel that should receive the result:

```text
/cron add 0 9 * * 1-5 Summarize open PRs and highlight any that have waited more than 2 days
```

Scheduled runs are unattended and time out after 30 minutes by default (`--timeout-mins` on the CLI changes it), so keep scheduled prompts to read-only work such as summaries.

### Step 6: Add team-specific commands with a Bolt app

For fixed, auditable actions that should not go through an agent at all, add a small Slack Bolt app (see the slack-bot-builder skill). This one answers `/prs` with the output of a fixed `gh` command. Create a `/prs` slash command in the app settings and add the `commands` scope; Socket Mode needs no request URL.

```javascript
import { App } from "@slack/bolt";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// The repo is fixed on the server; nothing from the Slack message reaches the command line.
app.command("/prs", async ({ ack, respond }) => {
  await ack();
  const { stdout } = await run("gh", ["pr", "list", "--repo", "acme/acme-api", "--limit", "10"]);
  await respond({ response_type: "in_channel", text: "```" + (stdout || "No open PRs") + "```" });
});

await app.start();
```

Bolt for JavaScript 5 needs Node.js 20 or newer. Use a separate Slack app (or separate tokens) from the one cc-connect uses, because two Socket Mode clients on one app split the events between them.

### Telegram instead of Slack

Create a bot with @BotFather, then replace the platform block:

```toml
[[projects.platforms]]
type = "telegram"

[projects.platforms.options]
token = "123456:..."            # from BotFather
allow_from = "198274563"        # numeric Telegram user IDs
```

## Real-World Example

Marcus, a senior developer at a 12-person startup, runs cc-connect on a dedicated dev box with a checkout of the billing service and `mode = "default"`. Three teammates are listed in `allow_from`. On Monday morning a product manager asks in a thread, `@cc-connect which open PRs touch the billing module, and do any look risky?`. Claude Code reads the repository, lists the PRs and flags a query built by string concatenation in one of them. The PM forwards the thread to the author without opening a terminal. Marcus approves the occasional tool prompt from his phone, and the weekday 9:00 `/cron` summary replaces his own Monday ritual of triaging the PR list.

## Related Skills

- [cc-connect](/skills/cc-connect) — The bridge tool connecting agents to messaging platforms
- [slack-bot-builder](/skills/slack-bot-builder) — Build custom Slack bots and integrations
