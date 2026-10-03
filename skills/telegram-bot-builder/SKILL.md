---
name: telegram-bot-builder
description: >-
  Builds Telegram bots using the Bot API (grammy/telegraf/python-telegram-bot).
  Use when the user wants to create a Telegram bot, handle commands, build
  inline keyboards, process callbacks, send media, build conversational flows,
  handle payments (Telegram Stars), or create Mini Apps. Trigger words: telegram bot, telegram
  integration, telegram commands, inline keyboard, telegram webhook, telegram
  polling, telegram mini app, telegram payments, BotFather, grammy, telegraf.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.10+. Requires a Telegram bot token from @BotFather."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  repository: https://github.com/grammyjs/grammY
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
npm init -y && npm install grammy @grammyjs/conversations
```
Node 20.6+ loads env files natively: `node --env-file=.env bot.js` (no dotenv needed).

**Node.js — Telegraf** (4.16.3 is its latest release; it lags behind newer Bot API features, so prefer grammY for new bots):
```bash
npm install telegraf
```

**Python — python-telegram-bot:**
```bash
pip install python-telegram-bot       # v22, async API, Python 3.10+
```
```python
# bot.py
import os
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Welcome!")

app = Application.builder().token(os.environ["BOT_TOKEN"]).build()
app.add_handler(CommandHandler("start", start))
app.run_polling()
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
├── .env                  # BOT_TOKEN, WEBHOOK_URL, WEBHOOK_SECRET, ADMIN_ID (gitignored)
└── package.json
```

### 3. Core Patterns (grammY)

**Bot setup (ESM, `"type": "module"` in package.json):**
```javascript
import { Bot, InlineKeyboard, InputFile, session, webhookCallback } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';

const bot = new Bot(process.env.BOT_TOKEN);
bot.catch((err) => console.error('Update failed:', err.error));
```

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

**Conversation (conversations plugin v2; no session needed):**
```javascript
async function onboarding(conversation, ctx) {
  await ctx.reply('What is your name?');
  const name = await conversation.waitFor('message:text');
  await ctx.reply('What is your email?');
  const email = await conversation.waitFor('message:text');
  await ctx.reply(`Thanks ${name.message.text}! Registered with ${email.message.text}`);
}

bot.use(conversations());
bot.use(createConversation(onboarding, 'onboarding'));   // function first, name second
bot.command('register', (ctx) => ctx.conversation.enter('onboarding'));
```
Register `conversations()` after any `session()` middleware and before the conversation. Code in a conversation is replayed, so wrap side effects (database writes, API calls) in `conversation.external(...)`.

**Middleware for auth:**
```javascript
function adminOnly(ctx, next) {
  if (ctx.from?.id !== Number(process.env.ADMIN_ID)) {
    return ctx.reply('⛔ Not authorized');
  }
  return next();
}
bot.command('admin', adminOnly, handleAdmin);   // grammY: bot.command(name, ...middleware)
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
import express from 'express';
const app = express();
app.use(express.json());
// A secret header proves the request comes from Telegram; keep the token out of the URL
app.post('/telegram/webhook', webhookCallback(bot, 'express', { secretToken: process.env.WEBHOOK_SECRET }));
app.listen(3000);

await bot.api.setWebhook('https://bots.northwind.dev/telegram/webhook', {
  secret_token: process.env.WEBHOOK_SECRET,
});
```
- Requires a public HTTPS URL on port 443, 80, 88 or 8443, with a valid (non-wildcard) certificate and no redirects
- Answer within about 10 seconds or Telegram re-sends the update; push slow work to a queue
- Webhook and `getUpdates` are mutually exclusive: call `bot.api.deleteWebhook()` before going back to polling

### 6. Media Handling

```javascript
// Send photo
await ctx.replyWithPhoto(new InputFile('./image.png'), { caption: 'Check this out' });

// Send document
await ctx.replyWithDocument(new InputFile(buffer, 'report.pdf'));

// Handle received photos
bot.on('message:photo', async (ctx) => {
  const file = await ctx.getFile();
  const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
});
```

### 7. Bot API Limits

Current Bot API is 10.x (10.3, August 2026); check the changelog at core.telegram.org/bots/api-changelog for new features.

- **Messages**: about 1 per second per chat, 20 per minute in one group, about 30 per second for broadcasts overall (paid broadcasts allow up to 1000/s, charged in Stars). Over the limit gives HTTP 429 with `retry_after`; honor it (grammY: `@grammyjs/auto-retry`)
- **Inline results**: 50 per query
- **File upload**: 50 MB per file through the cloud Bot API (a self-hosted Bot API server raises this)
- **File download**: 20 MB via getFile
- **Message length**: 4096 characters; **caption**: 1024 characters
- **Inline keyboard**: 100 buttons per message
- **Callback data**: 1-64 bytes

### 8. Deployment

- **Simple**: Fly.io, Render, Railway or any container host (webhook mode)
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
- Post links with a per-post tracking parameter (the Bot API does not expose channel view counts to bots)
- `/drafts` command listing scheduled posts with edit/delete options

## Guidelines

- Always register `bot.catch(...)` — unhandled errors in handlers stop the bot
- Use `ctx.answerCallbackQuery()` to dismiss the loading indicator on buttons
- Store the bot token in env vars, never hardcode or log it; revoke a leaked one with `/revoke` in @BotFather
- Payments for digital goods use Telegram Stars (currency `XTR`); answer `pre_checkout_query` within 10 seconds
- Use `parse_mode: 'HTML'` or `'MarkdownV2'` for rich text (MarkdownV2 requires escaping special chars)
- Implement graceful shutdown: `bot.stop()` on SIGINT/SIGTERM
- For groups: handle `my_chat_member` updates to track when bot is added/removed
- Set commands list via `bot.api.setMyCommands()` for autocomplete
- Show progress with `await ctx.replyWithChatAction('typing')` (or the auto-chat-action plugin) for long operations
- Rate limit user interactions to prevent abuse
- For conversations: always handle the case where the user sends an unexpected message type
