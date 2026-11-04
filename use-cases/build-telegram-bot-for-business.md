---
title: "Build a Telegram Bot That Runs Your Business Operations"
slug: build-telegram-bot-for-business
description: "Create a Telegram bot that handles customer orders, appointment booking, notifications, and team coordination — turning Telegram into a lightweight business operations platform."
skills: [telegram-bot-builder, coding-agent, data-analysis]
category: automation
tags: [telegram, bot, business-automation, orders, booking, chatbot]
---

# Build a Telegram Bot That Runs Your Business Operations

## The Problem

Marina runs an 8-person service agency. Customer communication is scattered across email, phone calls, and random WhatsApp messages. Appointment bookings happen over the phone — the receptionist juggles a paper calendar and Google Calendar, and double-bookings happen twice a month. Order status inquiries account for 40% of incoming calls, each taking 3-5 minutes to look up in a spreadsheet. The team coordinates through a group chat, but important messages get buried under lunch plans and memes.

The worst part: there is no single system tying customer-facing and internal operations together. A client calls about their order, the receptionist checks a spreadsheet, then messages the team chat to ask for an update, then calls the client back. Three systems, two phone calls, and fifteen minutes for a question that should take five seconds.

Marina considered building a custom web app, but the development cost and adoption friction were too high. Her clients and team already use Telegram daily. The right move is to meet them where they already are.

## The Solution

Using the **telegram-bot-builder** skill for the bot itself (grammY, the conversations plugin, Telegram payments), the **coding-agent** skill to run each build step as a scoped, verifiable task, and the **data-analysis** skill for the weekly numbers, the agent builds an interactive Telegram bot that handles order tracking, appointment booking, team task management, payments, and analytics — all from a single chat interface. Customers interact with the business through a polished conversation flow, and the team manages everything from admin commands in the same app they already use.

## Step-by-Step Walkthrough

### Step 1: Build the Customer-Facing Order Tracker

```text
Build a Telegram bot using grammY (Node.js, ESM) that lets customers check their order
status. When a user sends /start, show a welcome message with two inline
keyboard buttons: "Track Order" and "New Order". For order tracking: ask
for the order number, query the database, and return status with a
progress bar emoji. Include estimated delivery date and a "Notify me on
update" button that subscribes them to push notifications when status
changes. Use SQLite for the database.
```

The bot greets customers with inline keyboard buttons and walks them through a multi-step conversation flow. When a customer taps "Track Order," the bot asks for their order number, looks it up in SQLite, and returns a visual status line:

- **Received:** `[========----------]` 40%
- **In Progress:** `[==============----]` 70%
- **Shipped:** `[==================]` 100%

Each status response includes the estimated delivery date and a "Notify me on update" button. Tapping it stores the customer's chat ID against the order; when the status changes in the database, the bot sends a message. A customer can only see orders linked to their own chat ID, so guessing order numbers shows nothing.

The `@grammyjs/conversations` plugin (v2) manages multi-step flows. Conversation code is replayed on every update, so database writes and API calls inside a conversation are wrapped in `conversation.external(...)`, otherwise they run again on each replay. If a customer sends an invalid order number, the bot explains the expected format and asks again instead of crashing.

Install with `npm install grammy @grammyjs/conversations @grammyjs/auto-retry better-sqlite3`, keep the token from @BotFather in `BOT_TOKEN` (never in the repository), and run with `node --env-file=.env bot.js`. Use long polling (`bot.start()`) while developing. In production switch to a webhook behind a reverse proxy: serve the bot on `127.0.0.1`, call `setWebhook` with a `secret_token`, and pass the same value as `secretToken` to `webhookCallback`, so only Telegram can post updates.

### Step 2: Add Appointment Booking with Calendar

```text
Add a booking flow to the bot. When the user taps "Book Appointment":
1. Show service categories as inline keyboard buttons (Consultation, Follow-up, Review)
2. Show available dates for the next 14 days (skip weekends and fully booked days)
3. Show available time slots for the selected date (30-min intervals, 9am-5pm)
4. Confirm booking with a summary and Confirm/Cancel buttons
5. Send a confirmation message with an .ics calendar attachment
6. Send a reminder 24 hours before the appointment

Handle edge cases: slot taken between selection and confirmation,
cancellation flow, rescheduling.
```

The booking flow replaces the paper calendar entirely. Customers see a date picker keyboard showing day names and available slot counts — fully booked days are grayed out. Double-booking is prevented by the database, not by the bot's own check: a partial unique index makes a second confirmed booking for the same slot fail, and the bot turns that failure into "that slot was just taken, pick another":

```sql
CREATE UNIQUE INDEX one_booking_per_slot ON bookings(starts_at) WHERE status = 'confirmed';
```

```javascript
function book(chatId, service, startsAt) {
  try {
    return db.prepare('INSERT INTO bookings (chat_id, service, starts_at) VALUES (?, ?, ?)')
      .run(chatId, service, startsAt).lastInsertRowid;
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return null;   // slot taken
    throw e;
  }
}
```

When a booking is confirmed, the bot builds an `.ics` file with the `ics` package (`createEvent({ title, start: [2026, 11, 10, 10, 0], duration: { minutes: 30 } })`) and sends it with `ctx.replyWithDocument(new InputFile(Buffer.from(value), 'appointment.ics'))`. A `node-cron` job (`cron.schedule('*/15 * * * *', ...)`) looks for bookings starting in 24 hours and sends the reminders; store a `reminded` flag so a restart cannot send one twice.

The cancellation and rescheduling flows are just as smooth — tap a button, pick a new slot, done. The freed-up slot immediately becomes available to other customers, eliminating the manual calendar juggling that used to take the receptionist 10 minutes per reschedule.

### Step 3: Build Internal Team Coordination

```text
Create a separate bot (or admin mode in the same bot) for the team:
- /tasks — show today's tasks assigned to each team member
- /assign @person "task description" — create and assign a task
- /daily — post a daily summary: pending tasks, today's appointments,
  new orders, unread customer messages
- /broadcast "message" — send a message to all subscribed customers
  (with confirmation step before sending)

Only allow team members (list of Telegram user IDs in config) to access
admin commands. Log all actions with timestamps.
```

Admin commands are locked behind a middleware that checks Telegram user IDs against a config list (`TEAM_IDS`) — no one outside the team can run them:

```javascript
const TEAM = new Set((process.env.TEAM_IDS ?? '').split(',').map(Number));
const teamOnly = (ctx, next) => (TEAM.has(ctx.from?.id) ? next() : undefined);
bot.command('tasks', teamOnly, handleTasks);   // anyone else gets no reply
```

The `/daily` digest is the real game-changer: every morning, the team gets a single message summarizing pending tasks, today's appointments, new orders, and unread customer messages. No more scrolling through hundreds of chat messages to find what matters.

The `/assign` command creates tasks with deadlines and sends a notification to the assigned team member. Tasks persist in SQLite and show up in the daily digest until completed. It is not Jira, but for an 8-person team, it is exactly enough.

The `/broadcast` command includes a preview and confirmation step before sending, and stays under Telegram's limit of about 30 messages per second for bulk sends (paid broadcasts raise it, but only for large bots). Send in small batches with a short pause, and install `@grammyjs/auto-retry` (`bot.api.config.use(autoRetry())`) so a 429 response with `retry_after` is waited out instead of dropping messages. Only message people who started the bot: Telegram does not let a bot write first. Every admin action gets logged with a timestamp and user ID — useful for accountability and for debugging "who sent that broadcast?"

### Step 4: Implement Payment Collection

```text
Add payments with Telegram's built-in payments and the Stripe provider.
When a customer places a new order through the bot:
1. Show the order summary with itemized pricing
2. Send an invoice with the Pay button (sendInvoice)
3. Answer the pre-checkout query only if the order exists, is unpaid, and the amount matches the database
4. On successful payment, store the payment charge ID, mark the order "paid" and notify the team channel
Also add /pay <order-id> for outstanding orders. Use Stripe test mode until I say go live.
```

Telegram's Payments API with a provider such as Stripe lets customers pay inside the chat for physical goods and services (digital goods use Telegram Stars instead, currency `XTR`). Telegram takes no commission; the provider's own fees apply. Connect Stripe through @BotFather (Bot Settings, Payments): it issues a `provider_token`, and a test-mode token accepts test cards such as `4242 4242 4242 4242` without charging anyone. Live mode gives a token containing `:LIVE:`, which must stay in an environment variable.

The three handlers that matter:

```javascript
bot.command('pay', async (ctx) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND chat_id = ?')
    .get(ctx.match.trim(), ctx.chat.id);
  if (!order) return ctx.reply('No such order.');
  await ctx.replyWithInvoice('Order ' + order.id, 'Payment for your order', String(order.id), 'USD',   // payload must be a string
    [{ label: 'Order', amount: order.total }],          // amount in the smallest currency unit
    { provider_token: process.env.PAYMENT_PROVIDER_TOKEN });
});

bot.on('pre_checkout_query', async (ctx) => {            // must answer within 10 seconds
  const q = ctx.preCheckoutQuery;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(q.invoice_payload);
  const ok = order && order.status !== 'paid' && order.total === q.total_amount && q.currency === 'USD';
  await ctx.answerPreCheckoutQuery(Boolean(ok), ok ? undefined : 'This order cannot be paid.');
});

bot.on('message:successful_payment', (ctx) => {
  const p = ctx.message.successful_payment;
  db.transaction(() => {
    // charge_id is the primary key, so a redelivered update cannot record (or ship) twice
    const r = db.prepare('INSERT OR IGNORE INTO payments VALUES (?, ?, ?)')
      .run(p.telegram_payment_charge_id, p.invoice_payload, p.total_amount);
    if (r.changes) db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(p.invoice_payload);
  })();
});
```

The amount is always read from the database, never from the chat, and the unique charge ID guards against the same payment being processed twice. The team channel gets a notification with the amount and customer details, and the stored charge IDs let the monthly close match payments to orders without hand work. As the bot owner you are responsible for disputes and chargebacks with the provider.

### Step 5: Generate Weekly Business Analytics

```text
Every Monday at 8am, post a weekly report to the team group:
- Orders: count and revenue
- Bookings: completed vs cancelled vs no-show
- Bot engagement: unique users and most used commands
- Comparison with the previous week (up/down)
Compute everything in SQL and post a plain Telegram message.
```

A `node-cron` job (`cron.schedule('0 8 * * 1', sendReport, { timezone: 'Europe/Berlin' })`) queries SQLite for the past 7 days and the 7 before, calculates week-over-week changes, and posts a report to the team group:

- **Orders:** 127 this week ($18,400 revenue, +12% vs last week)
- **Bookings:** 43 completed, 3 cancelled, 2 no-shows
- **Bot engagement:** 312 unique users, most used command: order tracking

For questions the fixed report does not answer, the **data-analysis** skill works on the same database. Ask the agent to load a read-only copy into pandas and look for patterns:

```python
import sqlite3, pandas as pd

con = sqlite3.connect("file:shop.db?mode=ro", uri=True)
df = pd.read_sql_query("select * from bookings", con, parse_dates=["starts_at"])
print(df.groupby("service")["status"].apply(lambda s: (s == "no_show").mean()))   # no-show rate by service
print(df.set_index("starts_at").resample("W").size())                              # bookings per week
```

Findings such as "Monday 9am slots have the most no-shows" can then become a rule in the bot (for example a second reminder for those slots). The numbers above are the example agency's, not benchmarks.

## Real-World Example

Marina deploys the bot on a Monday. By Wednesday, customers are checking order status themselves — phone calls for "where's my order?" drop noticeably in the first week. The unique index on booking slots means two customers can no longer both get the 10:00 slot; the second one is offered another time.

The daily digest transforms the team's morning routine. Instead of the receptionist spending 30 minutes piecing together the day's schedule from three different sources, everyone opens Telegram and sees exactly what needs to happen today.

Payment collection through Telegram shortens invoice follow-up. Customers who used to ignore email invoices for days now pay within minutes because the payment button is right there in the conversation they are already using.

After 3 months, in Marina's own count, phone call volume is down by about two thirds, no-shows have fallen thanks to the reminders, and the team spends far less time on coordination.

The whole system runs as one Node.js process on a small VPS with a SQLite file, so there are no per-message charges from Telegram; the only fees are the hosting and the payment provider's own. Marina is considering adding a second bot for her partner agency down the street.
