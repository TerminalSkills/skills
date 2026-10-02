---
name: openclaw
description: >-
  Deploy and manage OpenClaw, a self-hosted gateway bridging messaging platforms
  to AI coding agents. Use when a user asks to set up OpenClaw, connect WhatsApp
  or Telegram or Discord to an AI agent, configure multi-agent routing, schedule
  cron jobs in OpenClaw, set up webhooks, manage OpenClaw channels, pair a
  messaging account, configure heartbeats, spawn sub-agents, or troubleshoot
  OpenClaw gateway issues. Covers installation, channel setup, agent
  configuration, cron scheduling, webhooks, and sub-agents.
license: Apache-2.0
compatibility: "Node.js 24.16+ or 26.1+ (Node 26 recommended). Install: npm install -g openclaw@latest"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/openclaw/openclaw
  category: automation
  tags: ["openclaw", "messaging", "ai-agents", "gateway", "self-hosted"]
---

# OpenClaw

## Overview

Manage OpenClaw, an open-source self-hosted gateway that connects messaging platforms (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Microsoft Teams and more) to AI agents. Covers installation, channels, multi-agent routing, scheduled automations (cron), inbound webhooks and sub-agents. Configuration is JSON5 at `~/.openclaw/openclaw.json` and is validated strictly: an unknown key or wrong type stops the Gateway from starting. Checked against openclaw 2026.9.7 (npm, 2026-09-30) and docs.openclaw.ai.

## Instructions

When a user asks for help with OpenClaw, determine which task they need. Config keys change between releases; when unsure, run `openclaw config schema` or `openclaw docs <topic>` instead of guessing a key.

### Task A: Install and onboard

```bash
node --version                                   # needs 24.16+ or 26.1+
npm install -g openclaw@latest --allow-scripts=openclaw   # npm 12 / 11.16+; on older npm omit the flag
openclaw onboard --install-daemon                # wizard: model access, workspace, Gateway service
openclaw gateway status                          # should show the Gateway on port 18789
openclaw dashboard                               # opens the Control UI (http://127.0.0.1:18789/)
```

The project also publishes an install script and a Docker/Nix path (see docs.openclaw.ai/install); prefer npm so the package comes from the registry. `openclaw gateway install` installs the background service (LaunchAgent, systemd user unit or Windows scheduled task); `openclaw gateway` runs it in the foreground. Onboarding reuses an existing Claude Code or Codex CLI login or a provider API key.

### Task B: Configure channels

Each channel lives under `channels.<provider>`. Every channel uses the same DM policy: `dmPolicy` is `pairing` (default; unknown senders get a code), `allowlist`, `open` (requires `allowFrom: ["*"]`) or `disabled`. Groups use `groupPolicy` and default to requiring a mention. Keep tokens out of the file: set the environment variable or use a SecretRef.

**Telegram** (create the bot with @BotFather):
```bash
export TELEGRAM_BOT_TOKEN=...            # default account; or: openclaw channels add --channel telegram --token ...
```
```json5
{ channels: { telegram: { enabled: true, dmPolicy: "pairing", groups: { "*": { requireMention: true } } } } }
```

**WhatsApp** (plugin installs on first use; scan the QR code with the phone):
```bash
openclaw channels login --channel whatsapp
```
```json5
{ channels: { whatsapp: { dmPolicy: "allowlist", allowFrom: ["+15551234567"], groups: { "*": { requireMention: true } } } } }
```

**Discord** (token from the Developer Portal Bot page, read from the environment):
```json5
{ channels: { discord: {
  enabled: true,
  token: { source: "env", provider: "default", id: "DISCORD_BOT_TOKEN" },
  groupPolicy: "allowlist",
  guilds: { "123456789012345678": { requireMention: true, users: ["987654321098765432"] } }
} } }
```

Approve the first DM and verify:
```bash
openclaw pairing list telegram
openclaw pairing approve telegram K7M2QX      # codes expire after 1 hour
openclaw channels status --probe
```

Config edits hot-reload; use `openclaw config validate` before relying on a change, and `openclaw config set <path> <value>` for one-line edits.

### Task C: Set up agents and routing

Agents live in `agents.entries` (the key is the agent id); shared behavior goes in `agents.defaults`. Each agent has its own workspace and session store.

```json5
{
  agents: {
    ownership: "explicit",
    defaults: {
      model: { primary: "anthropic/claude-sonnet-4-6", fallbacks: ["openai/gpt-5.4"] },
      heartbeat: { every: "30m", activeHours: { start: "08:00", end: "22:00", timezone: "America/New_York" } },
      sandbox: { mode: "non-main", scope: "agent" }
    },
    entries: {
      alfred: { workspace: "~/.openclaw/workspace-alfred" },
      support: { workspace: "~/agents/support" }
    }
  },
  bindings: [
    { agentId: "support", match: { channel: "whatsapp", peer: { kind: "group", id: "120363403215116621@g.us" } } },
    { agentId: "alfred", match: { channel: "discord", guildId: "123456789012345678" } },
    { agentId: "alfred", match: { channel: "telegram", accountId: "*" } }
  ]
}
```

Bindings match in a fixed order: exact peer, guild, team, exact account, then channel-wide (`accountId: "*"`). With several agents and no matching binding, the message is not routed, so always add a channel-wide fallback. Manage them from the CLI:

```bash
openclaw agents list --bindings
openclaw agents add work --workspace ~/.openclaw/workspace-work --bind telegram:*
openclaw agents bind --agent work --bind telegram:ops
```

Workspace files the agent reads: `AGENTS.md` (instructions), `SOUL.md` (persona), `IDENTITY.md` (name, emoji), optional `USER.md` and `MEMORY.md`, and `memory/YYYY-MM-DD.md` daily notes. The heartbeat checklist is no longer a `HEARTBEAT.md` file; run `openclaw doctor --fix` after upgrading to migrate an old one.

### Task D: Schedule automations (cron)

Jobs run inside the Gateway and are stored in its state database (`cron.enabled` defaults to on). The command is `openclaw cron` with `openclaw automations` as an alias; mutating commands need the operator admin role and a running Gateway.

```bash
# One-shot reminder in the main session
openclaw cron add --name "Calendar check" --at "20m" \
  --session main --system-event "Next heartbeat: check calendar." --wake now

# Recurring isolated job, schedule first and prompt second, announced on Telegram
openclaw cron create "0 7 * * *" "Summarize overnight updates." \
  --name "Morning brief" --tz "America/Los_Angeles" --session isolated \
  --announce --channel telegram --to "-1001234567890"

openclaw cron list
JOB=5b1e7c42                             # job id from `openclaw cron list`
openclaw cron run "$JOB" --wait           # run now and wait for the result
openclaw cron runs "$JOB" --limit 20      # history
openclaw cron edit "$JOB" --message "Updated prompt"
openclaw cron disable "$JOB"
```

Schedules: `--at` (one-shot: ISO time or `20m`), `--every`, or a 5-field `--cron` expression with `--tz`. Output can also go to `--webhook <url>` (cannot be combined with `--announce/--channel/--to`).

### Task E: Set up webhooks

```json5
{
  hooks: {
    enabled: true,
    token: "a-long-random-token-used-only-for-hooks",   // not the Gateway token
    path: "/hooks",
    allowedAgentIds: ["main"],
    allowRequestSessionKey: false
  }
}
```

All endpoints are `POST` only, authenticated with `Authorization: Bearer <token>` or `x-openclaw-token` (query-string tokens are rejected):
- `/hooks/wake` - queue a system event: `{"text": "Import finished", "mode": "now", "agentId": "main"}`
- `/hooks/agent` - run an agent turn: `{"message": "task", "agentId": "main", "deliver": false}`; add `"waitForCompletion": true` to get the outcome in the response, and an `Idempotency-Key` header to make retries safe
- `/hooks/<name>` - custom paths resolved through `hooks.mappings` (templates like `{{payload.field}}`, `forEach`, optional transforms)

HTTP 200 on `/hooks/agent` means the run was admitted, not that a message was delivered. Check `openclaw logs --follow` for `hook agent run completed`.

### Task F: Use sub-agents

Sub-agents are background runs spawned by an agent (tool `sessions_spawn`) in their own session; results are announced back to the requester. Defaults work without configuration. Tune them under `agents.defaults.subagents`:

```json5
{ agents: { defaults: { subagents: { model: "openai/gpt-5.4", maxSpawnDepth: 2, maxChildrenPerAgent: 5, maxConcurrent: 8, runTimeoutSeconds: 900 } } } }
```

Ask in chat: "Spawn a sub-agent to research the latest Node.js release notes." Inspect from the parent chat with `/subagents list`, `/subagents info <id>`, `/subagents log <id>`.

### Task G: Monitor and troubleshoot

```bash
openclaw gateway status
openclaw logs --follow
openclaw channels status --probe     # channel connectivity
openclaw doctor                      # diagnose; `openclaw doctor --fix` repairs legacy config keys
openclaw triage                      # read-only diagnosis, optionally handed to a coding agent
```

## Examples

### Example 1: Personal Telegram assistant with heartbeats

**User request:** "Set up OpenClaw as a personal assistant on Telegram with periodic check-ins"

```bash
npm install -g openclaw@latest --allow-scripts=openclaw
export TELEGRAM_BOT_TOKEN=...      # from @BotFather
openclaw onboard --install-daemon
```

Config (`~/.openclaw/openclaw.json`):
```json5
{
  agents: { defaults: {
    workspace: "~/.openclaw/workspace",
    heartbeat: { every: "30m", activeHours: { start: "08:00", end: "22:00", timezone: "America/New_York" } }
  } },
  channels: { telegram: { enabled: true, dmPolicy: "pairing" } }
}
```

```bash
openclaw channels status --probe
openclaw pairing list telegram        # after sending the bot a message
openclaw pairing approve telegram K7M2QX
```
Result: the bot answers the approved account, and a check-in turn runs every 30 minutes between 08:00 and 22:00.

### Example 2: Two agents with Discord routing and a standup cron job

**User request:** "Set up two agents - one for code review in Discord, one for a daily standup in Telegram"

```json5
{
  agents: {
    ownership: "explicit",
    entries: {
      reviewer: { workspace: "~/agents/reviewer" },
      standup: { workspace: "~/agents/standup" }
    }
  },
  bindings: [
    { agentId: "reviewer", match: { channel: "discord", guildId: "123456789012345678" } },
    { agentId: "standup", match: { channel: "telegram", accountId: "*" } }
  ],
  channels: {
    discord: { enabled: true, token: { source: "env", provider: "default", id: "DISCORD_BOT_TOKEN" },
      groupPolicy: "allowlist", guilds: { "123456789012345678": { requireMention: true } } },
    telegram: { enabled: true, dmPolicy: "pairing" }
  }
}
```

```bash
openclaw cron create "0 9 * * 1-5" "Compile yesterday's commits and open PRs into a standup summary" \
  --name "Daily standup" --tz "America/New_York" --session isolated --agent standup \
  --announce --channel telegram --to "-1001234567890"
openclaw agents list --bindings
```
Result: `agents list --bindings` shows each agent with its routes, and the standup lands in the Telegram group on weekdays at 09:00.

### Example 3: CI notifications through a webhook

**User request:** "Send me a Telegram message whenever my CI pipeline finishes"

```json5
{
  hooks: {
    enabled: true, token: "a-long-random-token-used-only-for-hooks", path: "/hooks",
    allowedAgentIds: ["main"],
    mappings: [{
      match: { path: "ci-notify" }, action: "agent", agentId: "main",
      messageTemplate: "CI finished for {{repository}}: {{status}}. Write a one-line summary.",
      deliver: true, channel: "telegram", to: "123456789"
    }]
  }
}
```

```yaml
- name: Notify via OpenClaw
  run: |
    curl -fsS -X POST "https://openclaw.acme-labs.dev/hooks/ci-notify" \
      -H "Authorization: Bearer ${{ secrets.OPENCLAW_HOOK_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d '{"repository": "${{ github.repository }}", "status": "${{ job.status }}"}'
```
Result: the call returns `{"ok": true, "runId": ...}` and the agent's summary arrives in Telegram.

## Guidelines

- **Treat inbound messages as untrusted.** Keep `dmPolicy: "pairing"` or `allowlist`; tools run on the host unless sandboxing is enabled (`agents.defaults.sandbox.mode`). Read docs.openclaw.ai/gateway/security before exposing the Gateway beyond loopback.
- Use a separate phone number for a WhatsApp assistant and restrict `allowFrom`.
- Strict config: after any edit run `openclaw config validate`; after upgrading run `openclaw doctor --fix` to migrate renamed keys (older guides use `agents.list`, `agent`, and a `HEARTBEAT.md` file, none of which work any more).
- Set `heartbeat.every: "0m"` to disable recurring check-ins until you trust the setup.
- Use `session.dmScope: "per-channel-peer"` when several people message the same agent.
- Specify `--tz` on cron jobs; without it the Gateway host's timezone applies.
- Use a dedicated hook token, keep hook endpoints behind loopback, a tailnet or an HTTPS proxy, and treat webhook payloads as untrusted data.
- Sub-agents cost tokens of their own: set a cheaper `subagents.model` and a low `maxSpawnDepth` for routine work.
- Back up agent workspaces in a private git repository; they hold the agent's memory.
- Start troubleshooting with `openclaw doctor` and `openclaw logs --follow`.
