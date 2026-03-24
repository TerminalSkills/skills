---
title: "Bridge AI Coding Agents to Team Chat"
description: "Connect AI coding agents to Slack or Telegram so your whole team can send coding tasks from chat"
skills: [cc-connect, slack-bot-builder]
difficulty: intermediate
time_estimate: "3 hours"
tags: [ai-agents, slack, telegram, team-chat, bridge, devops, collaboration]
---

# Bridge AI Coding Agents to Team Chat

## The Problem

Your AI coding agent lives in a terminal. Your team lives in Slack. Every time someone needs AI help, they tap the one person who knows how to use the CLI. You need a bridge.

## The Solution

Connect your AI coding agent to Slack (or Telegram) so anyone on the team can trigger coding tasks with slash commands. The agent works in the background and posts results back to the thread.

## Persona

**Marcus, Senior Developer** — works in a team of 8. Half the team wants AI help but won't touch a terminal. Marcus sets up a Slack bridge so everyone can send `/code fix the login bug` and get results without leaving chat.

## Step 1: Set Up the Bridge

Install and configure cc-connect to link your AI agent to Slack:

```bash
# Install the bridge
npm install -g cc-connect

# Configure Slack integration
cc-connect init --platform slack \
  --token xoxb-your-slack-bot-token \
  --signing-secret your-signing-secret \
  --channel dev-ai-tasks
```

For Telegram:

```bash
cc-connect init --platform telegram \
  --token your-telegram-bot-token \
  --chat-id -100123456789
```

## Step 2: Define Slash Commands

Register commands the team can use:

```yaml
# cc-connect.yaml
commands:
  /code:
    description: "Send a coding task to the AI agent"
    usage: "/code <task description>"
    permissions: [developers, leads]
    example: "/code fix the login bug in auth.ts"

  /review:
    description: "Request AI review of a PR"
    usage: "/review PR #<number>"
    permissions: [developers, leads]
    example: "/review PR #42"

  /test:
    description: "Generate tests for a file or module"
    usage: "/test <file or module>"
    permissions: [developers]
    example: "/test src/services/payment.ts"

  /explain:
    description: "Explain code or error"
    usage: "/explain <code snippet or error>"
    permissions: [everyone]
    example: "/explain why does this query return duplicates"
```

## Step 3: Agent Execution Pipeline

When a command comes in, the bridge:

1. **Validates permissions** — checks who sent it
2. **Creates a thread** — all updates go in-thread to avoid noise
3. **Runs the agent** — in the project repo background
4. **Streams progress** — posts status updates to thread
5. **Delivers result** — final output with diff/PR link

```bash
# Handler script for /code command
#!/bin/bash
# handle-code.sh

USER="$1"
TASK="$2"
THREAD_TS="$3"

# Post "working on it"
cc-connect post --thread "$THREAD_TS" --text "🔧 Working on: $TASK"

# Run agent
cd /path/to/project
RESULT=$(claude-code --task "$TASK" --output-format json 2>&1)

# Create branch and PR
BRANCH="ai/$(echo "$TASK" | tr ' ' '-' | head -c 40)"
git checkout -b "$BRANCH"
git add -A && git commit -m "AI: $TASK"
git push origin "$BRANCH"
PR_URL=$(gh pr create --fill --json url -q '.url')

# Post result to thread
cc-connect post --thread "$THREAD_TS" \
  --text "✅ Done!\n📝 Changes: $(git diff main --stat | tail -1)\n🔗 PR: $PR_URL"
```

## Step 4: Permission Model

Control who can trigger what:

```yaml
# permissions.yaml
roles:
  leads:
    users: [marcus, elena, jin]
    commands: [/code, /review, /test, /explain, /deploy]
    daily_limit: 50

  developers:
    users: [alex, sara, tom, priya]
    commands: [/code, /review, /test, /explain]
    daily_limit: 20

  everyone:
    commands: [/explain]
    daily_limit: 10
```

## Step 5: Audit Trail

Log every command for visibility and debugging:

```bash
# Audit log format (auto-generated)
# audit/2024-01-15.jsonl
{"ts":"2024-01-15T10:30:00Z","user":"sara","cmd":"/code","args":"fix login bug","status":"completed","duration":"45s","pr":"#87"}
{"ts":"2024-01-15T11:15:00Z","user":"alex","cmd":"/review","args":"PR #42","status":"completed","duration":"30s"}
{"ts":"2024-01-15T14:00:00Z","user":"tom","cmd":"/test","args":"payment.ts","status":"failed","error":"file not found"}
```

Query the audit trail:

```bash
# Who's using it most?
cat audit/*.jsonl | jq -r '.user' | sort | uniq -c | sort -rn

# What commands are popular?
cat audit/*.jsonl | jq -r '.cmd' | sort | uniq -c | sort -rn

# Success rate
echo "Success: $(cat audit/*.jsonl | jq -r '.status' | grep completed | wc -l)"
echo "Failed: $(cat audit/*.jsonl | jq -r '.status' | grep failed | wc -l)"
```

## Real-World Flow

```
Sara in Slack:     /code fix the pagination bug on /users endpoint
Bot responds:      🔧 Working on: fix the pagination bug on /users endpoint
Bot (30s later):   📋 Found the issue: offset not reset on filter change
Bot (60s later):   ✅ Done! Changed 2 files, +15/-3 lines
                   🔗 PR: https://github.com/team/app/pull/88
                   🧪 Tests: 42 passing, 0 failing

Marcus in thread:  /review PR #88
Bot responds:      👀 Reviewing PR #88...
Bot (20s later):   ✅ LGTM. Clean fix, tests cover edge cases.
                   💡 Suggestion: add rate limiting to this endpoint too.
```

## Key Takeaways

- **Lower the barrier** — not everyone needs CLI skills to use AI coding
- **Threads keep it clean** — results in-thread, no channel spam
- **Permissions prevent chaos** — interns shouldn't deploy to prod via chat
- **Audit everything** — know who asked for what and when
- **Start with 3 commands** — `/code`, `/review`, `/explain` cover 80% of use cases
- **Rate limits are essential** — prevent accidental API bill explosions
