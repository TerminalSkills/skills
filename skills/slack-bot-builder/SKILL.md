---
name: slack-bot-builder
description: >-
  Builds Slack bots and integrations using the Slack API (Bolt framework).
  Use when the user wants to create a Slack bot, build slash commands,
  handle Slack events, send messages to channels, build interactive
  modals/blocks, create Slack workflows, or integrate services with Slack.
  Trigger words: slack bot, slack integration, slash command, slack app,
  slack webhook, slack blocks, slack modal, bolt framework, slack events,
  slack notification, slack automation.
license: Apache-2.0
compatibility: "Node.js 20+ (Bolt for JavaScript 5) or Python 3.9+ (slack-bolt). Requires a Slack workspace with admin access to install apps."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/slackapi/bolt-js"
  category: automation
  tags: "slack, bot, messaging, integration"
---

# Slack Bot Builder

## Overview

Builds production-ready Slack bots and integrations using the Bolt framework. Handles app setup, event subscriptions, slash commands, interactive components (buttons, modals, dropdowns), message formatting with Block Kit, and deployment. Covers both simple webhook-based notifications and full conversational bots.

## Instructions

### 1. App Setup

When creating a new Slack bot:

1. Guide the user through https://api.slack.com/apps → Create New App
2. Recommend "From a manifest" for faster setup
3. Generate the app manifest YAML based on required scopes and features
4. Set up the following based on needs:
   - **Bot Token Scopes**: `chat:write`, `commands`, `app_mentions:read`, `channels:history` (for `message.channels`), `im:history` (for `message.im`), `users:read`
   - **Event Subscriptions**: `message.channels`, `app_mention`, `message.im` (in Socket Mode no request URL is needed)
   - **Interactivity**: Enable for buttons, modals, dropdowns
   - **Slash Commands**: Register command names and descriptions

### 2. Project Scaffolding

Use Bolt.js (Node) or Bolt for Python:

```bash
# Node.js (run with: node --env-file=.env app.js)
npm init -y && npm install @slack/bolt
# In CI and production, commit package-lock.json and install with `npm ci`,
# which installs the exact, integrity-checked versions from the lockfile.

# Python
pip install slack-bolt
```

Python equivalent of the Socket Mode setup (tokens from the environment):
```python
import os
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

app = App(token=os.environ["SLACK_BOT_TOKEN"])

@app.command("/deploy")
def deploy(ack, respond, command):
    ack()  # within 3 seconds
    respond(f"Deploying {command['text']} to staging...")

if __name__ == "__main__":
    SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"]).start()
```

Standard project structure:
```
slack-bot/
├── app.js              # Main entry, Bolt app initialization
├── listeners/
│   ├── commands.js     # Slash command handlers
│   ├── events.js       # Event handlers (messages, mentions)
│   ├── actions.js      # Interactive component handlers
│   └── views.js        # Modal submission handlers
├── services/           # Business logic
├── blocks/             # Block Kit message templates
├── .env                # SLACK_BOT_TOKEN (xoxb-), SLACK_SIGNING_SECRET, SLACK_APP_TOKEN (xapp-); gitignored
└── package.json
```

### 3. Core Patterns

**Sending messages:**
```javascript
await client.chat.postMessage({
  channel: channelId,
  blocks: [/* Block Kit blocks */],
  text: "Fallback text for notifications"
});
```

**Slash commands:**
```javascript
app.command('/deploy', async ({ command, ack, respond }) => {
  await ack();
  await respond({
    blocks: buildDeployConfirmation(command.text),
    response_type: 'ephemeral'
  });
});
```

**Interactive modals:**
```javascript
app.action('button_click', async ({ body, ack, client }) => {
  await ack();
  await client.views.open({
    trigger_id: body.trigger_id,
    view: buildModalView()
  });
});
```

**Event handling:**
```javascript
app.event('app_mention', async ({ event, say }) => {
  await say(`Hey <@${event.user}>! How can I help?`);
});
```

### 4. Block Kit Messages

Always use Block Kit for rich messages. Key block types:
- `section` — text with optional accessory (button, image, overflow)
- `actions` — row of interactive elements
- `input` — form fields in modals
- `divider` — visual separator
- `context` — small metadata text
- `header` — bold large text

Use https://app.slack.com/block-kit-builder for visual design.

### 5. Socket Mode vs HTTP

- **Socket Mode** (recommended for internal bots and local development): no public URL needed, uses a WebSocket
  - Create an app-level token (`xapp-`) with the `connections:write` scope and enable Socket Mode in the app settings
  - `const app = new App({ token: process.env.SLACK_BOT_TOKEN, appToken: process.env.SLACK_APP_TOKEN, socketMode: true })`, then `await app.start()`
  - Apps using Socket Mode cannot be published in the Slack Marketplace
- **HTTP mode** (for Marketplace/distributed apps): needs a public HTTPS URL for events, commands and interactivity (a tunnel such as ngrok works for dev)
  - `const app = new App({ token: process.env.SLACK_BOT_TOKEN, signingSecret: process.env.SLACK_SIGNING_SECRET })`
  - `await app.start(3000)`

### 6. Deployment

- **Simple**: Railway, Render, or any Node.js host
- **Production**: Container on ECS/Cloud Run with health checks
- **Serverless**: AWS Lambda with Slack Bolt's `AwsLambdaReceiver`

### 7. Rate Limits

Web API methods sit in tiers: Tier 1 is 1+ requests/min, Tier 2 20+/min, Tier 3 50+/min, Tier 4 100+/min (per method, per workspace and app). `chat.postMessage` is a special case: about 1 message per second per channel, with short bursts tolerated. Since 29 May 2025, new commercially distributed apps that are not Marketplace-approved get a much stricter limit on `conversations.history` and `conversations.replies` (1 request/min); check each method's page for its tier.

On HTTP 429, wait for the number of seconds in the `Retry-After` header before retrying. The Node `WebClient` queues and retries rate-limited calls on its own; in Python add `RateLimitErrorRetryHandler` to the client.

## Examples

### Example 1: Daily Standup Bot

**Input:** "Build a Slack bot that posts daily standup prompts at 9am, collects responses via thread, and summarizes them at 5pm."

**Output:** A Bolt.js app with:
- Cron job (node-cron) posting standup template to #team channel at 9:00
- Thread listener collecting responses, parsing "yesterday/today/blockers" format
- 5pm summary job that aggregates all thread replies into a formatted Block Kit message
- `/standup-skip` slash command to mark days off

### Example 2: Incident Alert Bot

**Input:** "Create a Slack bot that receives PagerDuty webhooks and creates an incident channel with pre-populated runbook links."

**Output:** A Bolt.js app with:
- HTTP endpoint receiving PagerDuty webhook payloads
- Auto-creates `#incident-{date}-{title}` channel (needs `channels:manage` and `pins:write`)
- Posts incident details with severity-colored sidebar
- Pins runbook links based on service name lookup
- Adds on-call responders to channel automatically
- `/incident-resolve` command to archive channel and post timeline

## Guidelines

- Always set `text` fallback alongside `blocks` (for notifications and accessibility)
- Use ephemeral messages (`response_type: 'ephemeral'`) for user-specific responses
- Store tokens in environment variables, never in code
- Implement proper error handling — Slack silently drops unacknowledged interactions after 3 seconds
- Always `await ack()` within 3 seconds for commands and interactions
- Use `app.error()` global handler for uncaught errors
- For long operations, ack immediately, then use `respond()` or `chat.postMessage` later
- Test with Slack's Socket Mode locally before deploying
- Keep Block Kit messages under 50 blocks and 3000 characters per text field
