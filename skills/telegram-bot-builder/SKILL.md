---
name: telegram-bot-builder
description: >-
  Builds Telegram bots using the Bot API (grammy/telegraf/python-telegram-bot).
  Use when the user wants to create a Telegram bot, handle commands, build
  inline keyboards, process callbacks, send media, build conversational flows,
  handle payments, or create mini apps. Trigger words: telegram bot, telegram
  integration, telegram commands, inline keyboard, telegram webhook, telegram
  polling, telegram mini app, telegram payments, BotFather, grammy, telegraf.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+. Requires a Telegram bot token from @BotFather."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["telegram", "bot", "messaging", "chatbot"]
---

# Telegram Bot Builder

## Overview

Builds production-ready Telegram bots covering the full Bot API surface: commands, inline keyboards, callback queries, conversations with state machines, media handling, group management, payments, and Mini Apps. Supports both long polling (development) and webhooks (production).

## Instructions

### 1. Bot Creation

1. Message @BotFather on Telegram
2. Send `/newbot`, choose name and username
3. Save the bot token (format: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
4. Configure with `/setcommands`, `/setdescription`, `/setabouttext`

### 2. Project Scaffolding

Recommended frameworks by language:

**Node.js — grammY (recommended):**
```bash
npm init -y && npm install grammy dotenv
```

**Node.js — Telegraf:**
```bash
npm install telegraf dotenv
```

**Python — python-telegram-bot:**
```bash
pip install python-telegram-bot python-dotenv
```

Standard project structure:
```
telegram-bot/
├── bot.js                # Entry point, bot initialization
├── handlers/
│   ├── commands.js       # /start, /help, custom commands
│   ├── callbacks.js      # Inline keyboard callback handlers
│   ├── conversations.js  # Multi-step conversation flows
│   └── middleware.js      # Auth, logging, rate limiting
├── keyboards/            # Inline and reply keyboard builders
├── services/             # Business logic
├── .env                  # BOT_TOKEN, WEBHOOK_URL, ADMIN_ID
└── package.json
```

### 3. Core Patterns (grammY)

**Basic command handler:**
```javascript
bot.command('start', async (ctx) => {
  await ctx.reply('Welcome!', {
    reply_markup: {
      inline_keyboard: [[
        { text: '📊 Dashboard', callback_data: 'dashboard' },
        { text: '⚙️ Settings', callback_data: 'settings' }
      ]]
    }
  });
});
```

**Callback query handler:**
```javascript
bot.callbackQuery('dashboard', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('Here is your dashboard...', {
    reply_markup: backButton
  });
});
```

**Conversation with sessions:**
```javascript
bot.use(session({ initial: () => ({ step: 'idle' }) }));
bot.use(conversations());
bot.use(createConversation('onboarding', onboardingFlow));

async function onboardingFlow(conversation, ctx) {
  await ctx.reply('What is your name?');
  const name = await conversation.wait();
  await ctx.reply('What is your email?');
  const email = await conversation.wait();
  await ctx.reply(`Thanks ${name.message.text}! Registered with ${email.message.text}`);
}
```

**Middleware for auth:**
```javascript
function adminOnly(ctx, next) {
  if (ctx.from?.id !== Number(process.env.ADMIN_ID)) {
    return ctx.reply('⛔ Not authorized');
  }
  return next();
}
bot.command('admin', adminOnly, handleAdmin);
```

### 4. Keyboard Types

**Inline Keyboard** (attached to message):
- Callback buttons (`callback_data`) — triggers callbackQuery handler
- URL buttons (`url`) — opens a link
- Web App buttons (`web_app`) — opens a Mini App
- Switch Inline buttons (`switch_inline_query`) — triggers inline mode

**Reply Keyboard** (replaces phone keyboard):
- Custom keyboard with predefined responses
- `one_time_keyboard: true` to auto-hide after selection
- `resize_keyboard: true` for compact display

**Remove Keyboard:**
```javascript
{ reply_markup: { remove_keyboard: true } }
```

### 5. Polling vs Webhooks

**Long Polling** (development):
```javascript
bot.start(); // Calls getUpdates in a loop
```
- No public URL needed
- Slightly higher latency
- Good for development and low-traffic bots

**Webhooks** (production):
```javascript
// With express
const app = express();
app.use(express.json());
app.use(`/bot${token}`, webhookCallback(bot, 'express'));
app.listen(3000);

// Set webhook
await bot.api.setWebhook(`https://yourdomain.com/bot${token}`);
```
- Requires HTTPS public URL
- Lower latency, better for high traffic
- Self-signed certificates supported with `certificate` parameter

### 6. Media Handling

```javascript
// Send photo
await ctx.replyWithPhoto(new InputFile('./image.png'), { caption: 'Check this out' });

// Send document
await ctx.replyWithDocument(new InputFile(buffer, 'report.pdf'));

// Handle received photos
bot.on('message:photo', async (ctx) => {
  const file = await ctx.getFile();
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
});
```

### 7. Bot API Limits

- **Messages**: 30 messages/sec globally, 1 message/sec per chat in groups
- **Inline results**: 50 results per query
- **File upload**: 50 MB max (20 MB for photos)
- **File download**: 20 MB via getFile
- **Message length**: 4096 characters
- **Caption length**: 1024 characters
- **Inline keyboard**: 100 buttons per message
- **Webhook**: 40M updates/hour

### 8. Deployment

- **Simple**: Railway, Render, Fly.io (webhook mode)
- **Serverless**: Vercel/AWS Lambda with webhook adapter
- **VPS**: systemd service with auto-restart
- **Docker**: Lightweight Node.js container with health checks

## Examples

### Example 1: Task Management Bot

**Input:** "Build a Telegram bot for my team to manage tasks. Users should be able to create tasks, assign them, set deadlines, and get reminders."

**Output:** A grammY bot with:
- `/newtask` command opening a conversation flow (title → description → assignee → deadline)
- Inline keyboard for task status updates (To Do → In Progress → Done)
- Daily reminder messages for overdue tasks using node-cron
- `/mytasks` showing personal task list with inline navigation
- SQLite database for persistence via better-sqlite3

### Example 2: Content Publishing Bot

**Input:** "Create a Telegram bot that lets me draft posts, preview them, schedule them to a channel, and track engagement."

**Output:** A grammY bot with:
- Multi-step drafting flow with text, photos, and formatting preview
- Schedule picker with inline calendar keyboard
- Auto-publishing to target channel via `bot.api.sendMessage(channelId, ...)`
- Engagement tracking by checking message views via `getChat` and forwarded counts
- `/drafts` command listing scheduled posts with edit/delete options

## Guidelines

- Always handle errors in callbacks — unhandled errors kill the bot process
- Use `ctx.answerCallbackQuery()` to dismiss the loading indicator on buttons
- Store bot token in env vars, never hardcode
- Use `parse_mode: 'HTML'` or `'MarkdownV2'` for rich text (MarkdownV2 requires escaping special chars)
- Implement graceful shutdown: `bot.stop()` on SIGINT/SIGTERM
- For groups: handle `my_chat_member` updates to track when bot is added/removed
- Set commands list via `bot.api.setMyCommands()` for autocomplete
- Use `ctx.chatAction = 'typing'` for long operations
- Rate limit user interactions to prevent abuse
- For conversations: always handle the case where the user sends an unexpected message type
